const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { initializeDatabase, getDb } = require('./database');
const { JWT_SECRET } = require('./auth');
const routes = require('./routes');
const { sendPingNotification, sendAvailabilityNotification } = require('./push');

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Health check for Railway (respond to both GET and HEAD)
app.use('/health', (req, res) => res.status(200).send('ok'));

// API routes
app.use('/api', routes);

// Create server (HTTPS if certs are available, HTTP otherwise)
let server;
const SSL_KEY = process.env.SSL_KEY_PATH;
const SSL_CERT = process.env.SSL_CERT_PATH;

if (SSL_KEY && SSL_CERT && fs.existsSync(SSL_KEY) && fs.existsSync(SSL_CERT)) {
  // HTTPS mode with provided certificates
  const sslOptions = {
    key: fs.readFileSync(SSL_KEY),
    cert: fs.readFileSync(SSL_CERT),
  };
  server = https.createServer(sslOptions, app);

  // Also create HTTP server that redirects to HTTPS
  const httpRedirect = express();
  httpRedirect.all('*', (req, res) => {
    res.redirect(301, `https://${req.hostname}${HTTPS_PORT == 443 ? '' : ':' + HTTPS_PORT}${req.url}`);
  });
  http.createServer(httpRedirect).listen(PORT, () => {
    console.log(`HTTP redirect server on port ${PORT} -> HTTPS`);
  });

  console.log('HTTPS mode: SSL certificates loaded');
} else {
  // HTTP mode (use a reverse proxy like Caddy/nginx for HTTPS in production)
  server = http.createServer(app);
  if (process.env.NODE_ENV === 'production' && !SSL_KEY) {
    console.log('TIP: For HTTPS, either:');
    console.log('  1. Set SSL_KEY_PATH and SSL_CERT_PATH env vars (e.g. from Let\'s Encrypt)');
    console.log('  2. Use a reverse proxy like Caddy (auto-HTTPS) or nginx + certbot');
  }
}

// Socket.IO for real-time availability
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Track connected users
const connectedUsers = new Map(); // userId -> Set<socketId>

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;

  // Track this connection
  if (!connectedUsers.has(userId)) {
    connectedUsers.set(userId, new Set());
  }
  connectedUsers.get(userId).add(socket.id);

  // Join user's own room
  socket.join(`user:${userId}`);

  // Notify friends that user is online
  notifyFriends(userId, 'friend:online', { userId });

  socket.on('availability:set', (data) => {
    const db = getDb();
    const isAvailable = data && data.isAvailable;
    const now = isAvailable ? new Date().toISOString() : null;

    // Clamp duration to 1 minute - 24 hours
    let availableUntil = null;
    const duration = Number(data && data.duration);
    if (isAvailable && Number.isFinite(duration) && duration >= 1) {
      availableUntil = new Date(Date.now() + Math.min(duration, 1440) * 60000).toISOString();
    }

    db.prepare('UPDATE users SET is_available = ?, available_since = ?, available_until = ? WHERE id = ?')
      .run(isAvailable ? 1 : 0, now, availableUntil, userId);

    const userInfo = db.prepare('SELECT display_name, avatar_color, phone, whatsapp FROM users WHERE id = ?').get(userId);

    // Notify friends who are watching (respectWatching = true for availability changes)
    notifyFriends(userId, 'availability:changed', {
      userId,
      displayName: userInfo.display_name,
      avatarColor: userInfo.avatar_color,
      phone: userInfo.phone,
      whatsapp: userInfo.whatsapp,
      isAvailable: !!isAvailable,
      availableSince: now,
      availableUntil
    }, true);

    // Confirm to the user
    socket.emit('availability:updated', { isAvailable: !!isAvailable, availableSince: now, availableUntil });
  });

  socket.on('ping:send', (data) => {
    const db = getDb();
    const { toUserId } = data || {};
    if (!toUserId || typeof toUserId !== 'string') return;

    // Check they are mutual friends (both have each other as friends)
    const friendship = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
      .get(userId, toUserId);
    const reverseFriendship = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
      .get(toUserId, userId);
    if (!friendship || !reverseFriendship) {
      socket.emit('ping:error', { error: 'Must be mutual friends to ping' });
      return;
    }

    // Check for cooldown (5 minutes between pings to same person)
    const recentPing = db.prepare(`
      SELECT id FROM pings
      WHERE from_user_id = ? AND to_user_id = ?
      AND created_at > datetime('now', '-5 minutes')
    `).get(userId, toUserId);
    if (recentPing) {
      socket.emit('ping:error', { error: 'Please wait before pinging again' });
      return;
    }

    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    db.prepare('INSERT INTO pings (id, from_user_id, to_user_id) VALUES (?, ?, ?)')
      .run(id, userId, toUserId);

    const sender = db.prepare('SELECT display_name, avatar_color, photo FROM users WHERE id = ?')
      .get(userId);

    // Notify the recipient via socket
    io.to(`user:${toUserId}`).emit('ping:received', {
      id,
      fromUserId: userId,
      fromDisplayName: sender.display_name,
      fromAvatarColor: sender.avatar_color,
      fromPhoto: sender.photo,
      createdAt: new Date().toISOString()
    });

    // Also send push notification (for when app is closed)
    sendPingNotification(
      { id: userId, displayName: sender.display_name },
      toUserId
    ).catch(err => console.error('Push notification error:', err));

    // Confirm to sender
    socket.emit('ping:sent', { id, toUserId });
  });

  socket.on('disconnect', () => {
    const userSockets = connectedUsers.get(userId);
    if (userSockets) {
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        connectedUsers.delete(userId);
        notifyFriends(userId, 'friend:offline', { userId });
      }
    }
  });
});

function notifyFriends(userId, event, data, respectWatching = false) {
  const db = getDb();

  let friends;
  if (respectWatching) {
    // Only notify friends who are watching this user
    friends = db.prepare(`
      SELECT user_id as recipient_id FROM friendships
      WHERE friend_id = ? AND watching = 1
    `).all(userId);
  } else {
    // Notify all friends
    friends = db.prepare(`
      SELECT friend_id as recipient_id FROM friendships WHERE user_id = ?
      UNION
      SELECT user_id as recipient_id FROM friendships WHERE friend_id = ?
    `).all(userId, userId);
  }

  for (const friend of friends) {
    io.to(`user:${friend.recipient_id}`).emit(event, data);
  }
}

// Auto-expire availability when available_until time passes
setInterval(() => {
  const db = getDb();
  const expired = db.prepare(`
    SELECT id FROM users
    WHERE is_available = 1 AND available_until IS NOT NULL AND available_until < datetime('now')
  `).all();

  for (const user of expired) {
    db.prepare('UPDATE users SET is_available = 0, available_since = NULL, available_until = NULL WHERE id = ?')
      .run(user.id);

    notifyFriends(user.id, 'availability:changed', {
      userId: user.id,
      isAvailable: false,
      availableSince: null,
      availableUntil: null
    });

    io.to(`user:${user.id}`).emit('availability:updated', {
      isAvailable: false,
      availableSince: null,
      availableUntil: null
    });
  }
}, 30000); // Check every 30 seconds

// Schedule checker - auto-enable availability based on schedules
setInterval(() => {
  const db = getDb();
  const now = new Date();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDay = dayNames[now.getDay()];
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

  // Find users with active schedules who are NOT currently available
  const schedules = db.prepare(`
    SELECT s.*, u.id as user_id, u.is_available, u.display_name, u.avatar_color, u.phone, u.whatsapp
    FROM schedules s
    JOIN users u ON u.id = s.user_id
    WHERE s.enabled = 1 AND u.is_available = 0
  `).all();

  for (const schedule of schedules) {
    const days = schedule.days.split(',');
    if (!days.includes(currentDay)) continue;

    // Check if current time is within schedule
    if (currentTime >= schedule.start_time && currentTime < schedule.end_time) {
      // Calculate when this schedule ends (for available_until)
      const endParts = schedule.end_time.split(':');
      const endDate = new Date();
      endDate.setHours(parseInt(endParts[0]), parseInt(endParts[1]), 0, 0);
      const availableUntil = endDate.toISOString();
      const availableSince = now.toISOString();

      // Set user as available
      db.prepare('UPDATE users SET is_available = 1, available_since = ?, available_until = ? WHERE id = ?')
        .run(availableSince, availableUntil, schedule.user_id);

      // Notify friends who are watching (respectWatching = true)
      notifyFriends(schedule.user_id, 'availability:changed', {
        userId: schedule.user_id,
        displayName: schedule.display_name,
        avatarColor: schedule.avatar_color,
        phone: schedule.phone,
        whatsapp: schedule.whatsapp,
        isAvailable: true,
        availableSince,
        availableUntil,
        fromSchedule: true
      }, true);

      // Also notify the user themselves
      io.to(`user:${schedule.user_id}`).emit('availability:updated', {
        isAvailable: true,
        availableSince,
        availableUntil,
        fromSchedule: true
      });

      console.log(`Schedule activated for user ${schedule.display_name}`);
    }
  }
}, 60000); // Check every minute

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'client', 'dist');
  const indexPath = path.join(distPath, 'index.html');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(200).send('CatchUp is running. Frontend build not found.');
    }
  });
}

const listenPort = (SSL_KEY && SSL_CERT && fs.existsSync(SSL_KEY)) ? HTTPS_PORT : PORT;
server.listen(listenPort, '0.0.0.0', () => {
  const protocol = server instanceof https.Server ? 'https' : 'http';
  console.log(`CatchUp server running on ${protocol}://0.0.0.0:${listenPort}`);
});
