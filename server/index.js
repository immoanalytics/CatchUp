const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { initializeDatabase, getDb } = require('./database');
const { JWT_SECRET } = require('./auth');
const routes = require('./routes');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDatabase();

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api', routes);

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

  socket.on('availability:toggle', () => {
    const db = getDb();
    const user = db.prepare('SELECT is_available FROM users WHERE id = ?').get(userId);
    const newStatus = user.is_available ? 0 : 1;
    const now = newStatus ? new Date().toISOString() : null;

    db.prepare('UPDATE users SET is_available = ?, available_since = ? WHERE id = ?')
      .run(newStatus, now, userId);

    const userInfo = db.prepare('SELECT display_name, avatar_color, phone, whatsapp FROM users WHERE id = ?').get(userId);

    // Notify all friends
    notifyFriends(userId, 'availability:changed', {
      userId,
      displayName: userInfo.display_name,
      avatarColor: userInfo.avatar_color,
      phone: userInfo.phone,
      whatsapp: userInfo.whatsapp,
      isAvailable: !!newStatus,
      availableSince: now
    });

    // Confirm to the user
    socket.emit('availability:updated', { isAvailable: !!newStatus, availableSince: now });
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

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`CatchUp server running on port ${PORT}`);
});
