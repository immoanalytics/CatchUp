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

const app = express();
const PORT = process.env.PORT || 3001;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Health check for Railway
app.get('/health', (req, res) => res.status(200).send('ok'));

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

    let availableUntil = null;
    if (isAvailable && data.duration) {
      availableUntil = new Date(Date.now() + data.duration * 60000).toISOString();
    }

    db.prepare('UPDATE users SET is_available = ?, available_since = ?, available_until = ? WHERE id = ?')
      .run(isAvailable ? 1 : 0, now, availableUntil, userId);

    const userInfo = db.prepare('SELECT display_name, avatar_color, phone, whatsapp FROM users WHERE id = ?').get(userId);

    // Notify all friends
    notifyFriends(userId, 'availability:changed', {
      userId,
      displayName: userInfo.display_name,
      avatarColor: userInfo.avatar_color,
      phone: userInfo.phone,
      whatsapp: userInfo.whatsapp,
      isAvailable: !!isAvailable,
      availableSince: now,
      availableUntil
    });

    // Confirm to the user
    socket.emit('availability:updated', { isAvailable: !!isAvailable, availableSince: now, availableUntil });
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

function notifyFriends(userId, event, data) {
  const db = getDb();
  const friends = db.prepare(`
    SELECT friend_id FROM friendships WHERE user_id = ?
    UNION
    SELECT user_id FROM friendships WHERE friend_id = ?
  `).all(userId, userId);

  for (const friend of friends) {
    const friendId = friend.friend_id || friend.user_id;
    io.to(`user:${friendId}`).emit(event, data);
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

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

const listenPort = (SSL_KEY && SSL_CERT && fs.existsSync(SSL_KEY)) ? HTTPS_PORT : PORT;
server.listen(listenPort, '0.0.0.0', () => {
  const protocol = server instanceof https.Server ? 'https' : 'http';
  console.log(`CatchUp server running on ${protocol}://0.0.0.0:${listenPort}`);
});
