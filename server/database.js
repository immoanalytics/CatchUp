const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'catchup.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      phone TEXT,
      whatsapp TEXT,
      avatar_color TEXT DEFAULT '#6C63FF',
      is_available INTEGER DEFAULT 0,
      available_since TEXT,
      available_until TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS circles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT 'users',
      color TEXT DEFAULT '#6C63FF',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS circle_members (
      id TEXT PRIMARY KEY,
      circle_id TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT,
      contact_whatsapp TEXT,
      member_user_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE,
      FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      days TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      circle_id TEXT,
      status TEXT DEFAULT 'accepted',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE SET NULL,
      UNIQUE(user_id, friend_id)
    );

    CREATE TABLE IF NOT EXISTS friend_circles (
      friendship_id TEXT NOT NULL,
      circle_id TEXT NOT NULL,
      PRIMARY KEY (friendship_id, circle_id),
      FOREIGN KEY (friendship_id) REFERENCES friendships(id) ON DELETE CASCADE,
      FOREIGN KEY (circle_id) REFERENCES circles(id) ON DELETE CASCADE
    );
  `);

  // Migrations: add columns that may be missing on older databases
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userColumns.includes('available_until')) {
    db.exec("ALTER TABLE users ADD COLUMN available_until TEXT");
  }
  if (!userColumns.includes('photo')) {
    db.exec("ALTER TABLE users ADD COLUMN photo TEXT");
  }

  return db;
}

module.exports = { getDb, initializeDatabase };
