const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');
const { generateToken, authenticateToken } = require('./auth');
const { VAPID_PUBLIC_KEY } = require('./push');

const router = express.Router();

// ============ AUTH ============

router.post('/auth/register', (req, res) => {
  const { username, displayName, password, phone, whatsapp } = req.body;
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'username, displayName, and password are required' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const colors = ['#6C63FF', '#4CAF50', '#FF9800', '#E91E63', '#00BCD4', '#9C27B0'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];
  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, phone, whatsapp, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, displayName, passwordHash, phone || null, whatsapp || null, avatarColor);

  // Create default circles
  const defaultCircles = [
    { name: 'Close Friends', icon: 'heart', color: '#4CAF50' },
    { name: 'Work Buddies', icon: 'briefcase', color: '#FF9800' },
    { name: 'Family', icon: 'users', color: '#E91E63' }
  ];
  const insertCircle = db.prepare('INSERT INTO circles (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)');
  for (const c of defaultCircles) {
    insertCircle.run(uuidv4(), id, c.name, c.icon, c.color);
  }

  const token = generateToken(id);
  res.json({ token, user: { id, username, displayName, phone, whatsapp, avatarColor } });
});

// Password reset using phone verification
router.post('/auth/reset-password', (req, res) => {
  const { username, phone, newPassword } = req.body;
  if (!username || !phone || !newPassword) {
    return res.status(400).json({ error: 'username, phone, and newPassword are required' });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id, phone FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.phone) {
    return res.status(400).json({ error: 'No phone number on file for this account' });
  }

  // Normalize phone numbers for comparison (strip non-digits)
  const normalize = p => p.replace(/\D/g, '');
  const inputPhone = normalize(phone);
  const userPhone = normalize(user.phone);

  // Match if one ends with the other (handles country codes)
  if (!inputPhone || !userPhone || !(inputPhone.endsWith(userPhone) || userPhone.endsWith(inputPhone))) {
    return res.status(403).json({ error: 'Phone number does not match' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

  res.json({ success: true });
});

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      phone: user.phone,
      whatsapp: user.whatsapp,
      avatarColor: user.avatar_color
    }
  });
});

// ============ USER PROFILE ============

router.get('/me', authenticateToken, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const schedules = db.prepare('SELECT * FROM schedules WHERE user_id = ?').all(req.userId);

  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    phone: user.phone,
    whatsapp: user.whatsapp,
    avatarColor: user.avatar_color,
    photo: user.photo || null,
    isAvailable: !!user.is_available,
    availableSince: user.available_since,
    availableUntil: user.available_until,
    schedules
  });
});

router.put('/me', authenticateToken, (req, res) => {
  const { displayName, phone, whatsapp } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE users SET display_name = COALESCE(?, display_name),
    phone = COALESCE(?, phone), whatsapp = COALESCE(?, whatsapp)
    WHERE id = ?
  `).run(displayName || null, phone || null, whatsapp || null, req.userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    phone: user.phone,
    whatsapp: user.whatsapp,
    avatarColor: user.avatar_color,
    photo: user.photo || null
  });
});

router.put('/me/photo', authenticateToken, (req, res) => {
  const { photo } = req.body;
  if (!photo) return res.status(400).json({ error: 'photo is required' });

  // Validate it's a data URL and not too large (2MB base64 ~= 2.7MB string)
  if (!photo.startsWith('data:image/') || photo.length > 3000000) {
    return res.status(400).json({ error: 'Invalid image or too large (max 2MB)' });
  }

  const db = getDb();
  db.prepare('UPDATE users SET photo = ? WHERE id = ?').run(photo, req.userId);
  res.json({ photo });
});

// ============ AVAILABILITY ============

router.post('/availability/toggle', authenticateToken, (req, res) => {
  const { duration } = req.body; // duration in minutes (optional)
  const db = getDb();
  const user = db.prepare('SELECT is_available FROM users WHERE id = ?').get(req.userId);
  const newStatus = user.is_available ? 0 : 1;
  const now = newStatus ? new Date().toISOString() : null;

  let availableUntil = null;
  if (newStatus && duration) {
    availableUntil = new Date(Date.now() + duration * 60000).toISOString();
  }

  db.prepare('UPDATE users SET is_available = ?, available_since = ?, available_until = ? WHERE id = ?')
    .run(newStatus, now, availableUntil, req.userId);

  res.json({ isAvailable: !!newStatus, availableSince: now, availableUntil });
});

router.post('/availability/set', authenticateToken, (req, res) => {
  const { isAvailable, duration } = req.body; // duration in minutes (optional)
  const db = getDb();
  const now = isAvailable ? new Date().toISOString() : null;

  let availableUntil = null;
  if (isAvailable && duration) {
    availableUntil = new Date(Date.now() + duration * 60000).toISOString();
  }

  db.prepare('UPDATE users SET is_available = ?, available_since = ?, available_until = ? WHERE id = ?')
    .run(isAvailable ? 1 : 0, now, availableUntil, req.userId);

  res.json({ isAvailable: !!isAvailable, availableSince: now, availableUntil });
});

router.get('/available', authenticateToken, (req, res) => {
  const db = getDb();

  // Get all friends who are available
  const availableFriends = db.prepare(`
    SELECT u.id, u.display_name, u.phone, u.whatsapp, u.avatar_color, u.photo,
           u.available_since, u.available_until, u.is_available
    FROM users u
    INNER JOIN friendships f ON (f.friend_id = u.id AND f.user_id = ?)
    WHERE u.is_available = 1
    ORDER BY u.available_since DESC
  `).all(req.userId);

  // For each friend, get which circles they belong to
  const result = availableFriends.map(friend => {
    const circles = db.prepare(`
      SELECT c.name, c.color FROM circles c
      INNER JOIN friend_circles fc ON fc.circle_id = c.id
      INNER JOIN friendships f ON f.id = fc.friendship_id
      WHERE f.user_id = ? AND f.friend_id = ?
    `).all(req.userId, friend.id);

    return {
      id: friend.id,
      displayName: friend.display_name,
      phone: friend.phone,
      whatsapp: friend.whatsapp,
      avatarColor: friend.avatar_color,
      photo: friend.photo || null,
      availableSince: friend.available_since,
      availableUntil: friend.available_until,
      circles: circles.map(c => ({ name: c.name, color: c.color }))
    };
  });

  res.json(result);
});

// ============ CIRCLES ============

router.get('/circles', authenticateToken, (req, res) => {
  const db = getDb();
  const circles = db.prepare('SELECT * FROM circles WHERE user_id = ? ORDER BY created_at').all(req.userId);

  const result = circles.map(circle => {
    const memberCount = db.prepare(`
      SELECT COUNT(*) as count FROM friend_circles fc
      WHERE fc.circle_id = ?
    `).get(circle.id);

    return {
      id: circle.id,
      name: circle.name,
      icon: circle.icon,
      color: circle.color,
      memberCount: memberCount.count
    };
  });

  res.json(result);
});

router.post('/circles', authenticateToken, (req, res) => {
  const { name, icon, color } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO circles (id, user_id, name, icon, color) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.userId, name, icon || 'users', color || '#6C63FF');

  res.json({ id, name, icon: icon || 'users', color: color || '#6C63FF', memberCount: 0 });
});

router.put('/circles/:id', authenticateToken, (req, res) => {
  const { name, icon, color } = req.body;
  const db = getDb();

  const circle = db.prepare('SELECT * FROM circles WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  db.prepare('UPDATE circles SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color) WHERE id = ?')
    .run(name || null, icon || null, color || null, req.params.id);

  res.json({ success: true });
});

router.delete('/circles/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const circle = db.prepare('SELECT * FROM circles WHERE id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!circle) return res.status(404).json({ error: 'Circle not found' });

  db.prepare('DELETE FROM circles WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ FRIENDS ============

router.get('/friends', authenticateToken, (req, res) => {
  const db = getDb();
  const friends = db.prepare(`
    SELECT u.id, u.display_name, u.phone, u.whatsapp, u.avatar_color,
           u.is_available, u.available_since, f.id as friendship_id
    FROM friendships f
    INNER JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ?
    ORDER BY u.display_name
  `).all(req.userId);

  const result = friends.map(friend => {
    const circles = db.prepare(`
      SELECT c.id, c.name, c.color FROM circles c
      INNER JOIN friend_circles fc ON fc.circle_id = c.id
      WHERE fc.friendship_id = ?
    `).all(friend.friendship_id);

    return {
      id: friend.id,
      friendshipId: friend.friendship_id,
      displayName: friend.display_name,
      phone: friend.phone,
      whatsapp: friend.whatsapp,
      avatarColor: friend.avatar_color,
      isAvailable: !!friend.is_available,
      availableSince: friend.available_since,
      circles
    };
  });

  res.json(result);
});

router.post('/friends/add', authenticateToken, (req, res) => {
  const { username, circleIds } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });

  const db = getDb();
  const friend = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!friend) return res.status(404).json({ error: 'User not found' });
  if (friend.id === req.userId) return res.status(400).json({ error: 'Cannot add yourself' });

  const existing = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
    .get(req.userId, friend.id);
  if (existing) return res.status(409).json({ error: 'Already friends' });

  const friendshipId = uuidv4();
  db.prepare('INSERT INTO friendships (id, user_id, friend_id) VALUES (?, ?, ?)')
    .run(friendshipId, req.userId, friend.id);

  // Also create reverse friendship
  const reverseFriendshipId = uuidv4();
  db.prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id) VALUES (?, ?, ?)')
    .run(reverseFriendshipId, friend.id, req.userId);

  // Add to circles if specified
  if (circleIds && circleIds.length > 0) {
    const insertFc = db.prepare('INSERT INTO friend_circles (friendship_id, circle_id) VALUES (?, ?)');
    for (const cid of circleIds) {
      insertFc.run(friendshipId, cid);
    }
  }

  res.json({ success: true, friendshipId });
});

router.delete('/friends/:friendId', authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?')
    .run(req.userId, req.params.friendId);
  db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?')
    .run(req.params.friendId, req.userId);
  res.json({ success: true });
});

// Add/remove friend from circle
router.post('/friends/:friendId/circles', authenticateToken, (req, res) => {
  const { circleId } = req.body;
  const db = getDb();

  const friendship = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
    .get(req.userId, req.params.friendId);
  if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

  db.prepare('INSERT OR IGNORE INTO friend_circles (friendship_id, circle_id) VALUES (?, ?)')
    .run(friendship.id, circleId);

  res.json({ success: true });
});

router.delete('/friends/:friendId/circles/:circleId', authenticateToken, (req, res) => {
  const db = getDb();

  const friendship = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
    .get(req.userId, req.params.friendId);
  if (!friendship) return res.status(404).json({ error: 'Friendship not found' });

  db.prepare('DELETE FROM friend_circles WHERE friendship_id = ? AND circle_id = ?')
    .run(friendship.id, req.params.circleId);

  res.json({ success: true });
});

// Toggle watching status for a friend
router.put('/friends/:friendId/watching', authenticateToken, (req, res) => {
  const db = getDb();
  const { watching } = req.body;

  const result = db.prepare('UPDATE friendships SET watching = ? WHERE user_id = ? AND friend_id = ?')
    .run(watching ? 1 : 0, req.userId, req.params.friendId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Friendship not found' });
  }

  res.json({ success: true, watching: !!watching });
});

// Get circle members
router.get('/circles/:id/members', authenticateToken, (req, res) => {
  const db = getDb();
  const members = db.prepare(`
    SELECT u.id, u.display_name, u.phone, u.whatsapp, u.avatar_color,
           u.is_available, u.available_since, u.available_until, u.photo,
           f.watching
    FROM friend_circles fc
    INNER JOIN friendships f ON f.id = fc.friendship_id
    INNER JOIN users u ON u.id = f.friend_id
    WHERE fc.circle_id = ? AND f.user_id = ?
    ORDER BY u.display_name
  `).all(req.params.id, req.userId);

  res.json(members.map(m => ({
    id: m.id,
    displayName: m.display_name,
    phone: m.phone,
    whatsapp: m.whatsapp,
    avatarColor: m.avatar_color,
    isAvailable: !!m.is_available,
    availableSince: m.available_since,
    availableUntil: m.available_until,
    photo: m.photo,
    watching: m.watching === null ? true : !!m.watching
  })));
});

// ============ SCHEDULES ============

router.get('/schedules', authenticateToken, (req, res) => {
  const db = getDb();
  const schedules = db.prepare('SELECT * FROM schedules WHERE user_id = ?').all(req.userId);
  res.json(schedules.map(s => ({
    id: s.id,
    days: s.days,
    startTime: s.start_time,
    endTime: s.end_time,
    enabled: !!s.enabled
  })));
});

router.post('/schedules', authenticateToken, (req, res) => {
  const { days, startTime, endTime } = req.body;
  if (!days || !startTime || !endTime) {
    return res.status(400).json({ error: 'days, startTime, and endTime are required' });
  }

  const db = getDb();
  const id = uuidv4();
  db.prepare('INSERT INTO schedules (id, user_id, days, start_time, end_time) VALUES (?, ?, ?, ?, ?)')
    .run(id, req.userId, days, startTime, endTime);

  res.json({ id, days, startTime, endTime, enabled: true });
});

router.put('/schedules/:id', authenticateToken, (req, res) => {
  const { days, startTime, endTime, enabled } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE schedules SET days = COALESCE(?, days), start_time = COALESCE(?, start_time),
    end_time = COALESCE(?, end_time), enabled = COALESCE(?, enabled)
    WHERE id = ? AND user_id = ?
  `).run(days || null, startTime || null, endTime || null, enabled !== undefined ? (enabled ? 1 : 0) : null, req.params.id, req.userId);

  res.json({ success: true });
});

router.delete('/schedules/:id', authenticateToken, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM schedules WHERE id = ? AND user_id = ?').run(req.params.id, req.userId);
  res.json({ success: true });
});

// ============ USER SEARCH ============

router.get('/users/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const db = getDb();
  const users = db.prepare(`
    SELECT id, username, display_name, avatar_color, phone, photo FROM users
    WHERE (username LIKE ? OR display_name LIKE ? OR phone LIKE ?) AND id != ?
    LIMIT 20
  `).all(`%${q}%`, `%${q}%`, `%${q}%`, req.userId);

  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    phone: u.phone,
    photo: u.photo
  })));
});

// Look up registered users by phone numbers (for contact book matching)
router.post('/users/lookup', authenticateToken, (req, res) => {
  const { phones } = req.body;
  if (!phones || !Array.isArray(phones) || phones.length === 0) return res.json([]);

  const db = getDb();
  // Normalize: strip all non-digit characters for comparison
  const normalize = p => p.replace(/\D/g, '');
  const allUsers = db.prepare(`
    SELECT id, username, display_name, avatar_color, phone, photo FROM users
    WHERE phone IS NOT NULL AND phone != '' AND id != ?
  `).all(req.userId);

  const normalizedInput = phones.map(normalize).filter(p => p.length >= 6);
  const matches = allUsers.filter(u => {
    const uNorm = normalize(u.phone);
    return normalizedInput.some(p => uNorm.endsWith(p) || p.endsWith(uNorm));
  });

  res.json(matches.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatarColor: u.avatar_color,
    phone: u.phone,
    photo: u.photo
  })));
});

// ============ PINGS ============

// Send a ping to a friend
router.post('/pings', authenticateToken, (req, res) => {
  const { toUserId } = req.body;
  if (!toUserId) return res.status(400).json({ error: 'toUserId is required' });

  const db = getDb();

  // Check they are mutual friends (both have each other as friends)
  const friendship = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
    .get(req.userId, toUserId);
  const reverseFriendship = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?')
    .get(toUserId, req.userId);
  if (!friendship || !reverseFriendship) {
    return res.status(404).json({ error: 'Must be mutual friends to ping' });
  }

  // Check for cooldown (5 minutes between pings to same person)
  const recentPing = db.prepare(`
    SELECT id FROM pings
    WHERE from_user_id = ? AND to_user_id = ?
    AND created_at > datetime('now', '-5 minutes')
  `).get(req.userId, toUserId);
  if (recentPing) {
    return res.status(429).json({ error: 'Please wait before pinging this friend again' });
  }

  const id = uuidv4();
  db.prepare('INSERT INTO pings (id, from_user_id, to_user_id) VALUES (?, ?, ?)')
    .run(id, req.userId, toUserId);

  const sender = db.prepare('SELECT display_name, avatar_color, photo FROM users WHERE id = ?')
    .get(req.userId);

  res.json({
    id,
    toUserId,
    createdAt: new Date().toISOString(),
    sender: {
      id: req.userId,
      displayName: sender.display_name,
      avatarColor: sender.avatar_color,
      photo: sender.photo
    }
  });
});

// Get pending pings received (within last hour)
router.get('/pings', authenticateToken, (req, res) => {
  const db = getDb();
  const pings = db.prepare(`
    SELECT p.id, p.from_user_id, p.created_at, p.status,
           u.display_name, u.avatar_color, u.photo
    FROM pings p
    INNER JOIN users u ON u.id = p.from_user_id
    WHERE p.to_user_id = ? AND p.status = 'pending'
    AND p.created_at > datetime('now', '-1 hour')
    ORDER BY p.created_at DESC
  `).all(req.userId);

  res.json(pings.map(p => ({
    id: p.id,
    fromUserId: p.from_user_id,
    fromDisplayName: p.display_name,
    fromAvatarColor: p.avatar_color,
    fromPhoto: p.photo,
    createdAt: p.created_at,
    status: p.status
  })));
});

// Respond to a ping
router.put('/pings/:id', authenticateToken, (req, res) => {
  const { status } = req.body; // 'responded' or 'dismissed'
  if (!status) return res.status(400).json({ error: 'status is required' });

  const db = getDb();
  const result = db.prepare(`
    UPDATE pings SET status = ?, responded_at = datetime('now')
    WHERE id = ? AND to_user_id = ?
  `).run(status, req.params.id, req.userId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Ping not found' });
  }

  res.json({ success: true });
});

// Get all friends (not just available) for Home screen - only mutual friends
router.get('/friends/all', authenticateToken, (req, res) => {
  const db = getDb();
  // Only get mutual friends (both users have each other as friends)
  const friends = db.prepare(`
    SELECT u.id, u.display_name, u.phone, u.whatsapp, u.avatar_color, u.photo,
           u.is_available, u.available_since, u.available_until
    FROM friendships f1
    INNER JOIN friendships f2 ON f1.friend_id = f2.user_id AND f1.user_id = f2.friend_id
    INNER JOIN users u ON u.id = f1.friend_id
    WHERE f1.user_id = ?
    ORDER BY u.is_available DESC, u.display_name
  `).all(req.userId);

  // Also get last ping time for each friend (to show cooldown)
  const result = friends.map(friend => {
    const lastPing = db.prepare(`
      SELECT created_at FROM pings
      WHERE from_user_id = ? AND to_user_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(req.userId, friend.id);

    const circles = db.prepare(`
      SELECT c.name, c.color FROM circles c
      INNER JOIN friend_circles fc ON fc.circle_id = c.id
      INNER JOIN friendships f ON f.id = fc.friendship_id
      WHERE f.user_id = ? AND f.friend_id = ?
    `).all(req.userId, friend.id);

    return {
      id: friend.id,
      displayName: friend.display_name,
      phone: friend.phone,
      whatsapp: friend.whatsapp,
      avatarColor: friend.avatar_color,
      photo: friend.photo || null,
      isAvailable: !!friend.is_available,
      availableSince: friend.available_since,
      availableUntil: friend.available_until,
      lastPingAt: lastPing ? lastPing.created_at : null,
      circles: circles.map(c => ({ name: c.name, color: c.color }))
    };
  });

  res.json(result);
});

// ============ PUSH NOTIFICATIONS ============

// Get VAPID public key
router.get('/push/vapid-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
router.post('/push/subscribe', authenticateToken, (req, res) => {
  const { subscription } = req.body;
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription' });
  }

  const db = getDb();
  const id = uuidv4();

  // Remove existing subscription with same endpoint (in case user re-subscribes)
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(subscription.endpoint);

  // Add new subscription
  db.prepare(`
    INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, req.userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);

  res.json({ success: true });
});

// Unsubscribe from push notifications
router.post('/push/unsubscribe', authenticateToken, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    return res.status(400).json({ error: 'Endpoint is required' });
  }

  const db = getDb();
  db.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
    .run(req.userId, endpoint);

  res.json({ success: true });
});

module.exports = router;
