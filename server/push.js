const webpush = require('web-push');
const { getDb } = require('./database');

// VAPID keys for web push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BMBxIYJLk_NittYqpoVAyO0jfbQJv_jf-XCY9sdtXJx1smoe2LKOhSeQcA45pbVrciccC1-KDqJ4yazI1kNcqpU';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'QqIn51PywaFjrYo7DnBKsHUqEzoxS1xJ2Ri4hDG2-vQ';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@catchup.app';

if (process.env.NODE_ENV === 'production' && (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY)) {
  console.warn('SECURITY WARNING: VAPID keys not set via env. Generate your own with `npx web-push generate-vapid-keys` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.');
}

// Configure web-push
webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Send push notification to a user
async function sendPushToUser(userId, payload) {
  const db = getDb();
  const subscriptions = db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);

  const results = [];
  for (const sub of subscriptions) {
    try {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
      results.push({ success: true, endpoint: sub.endpoint });
    } catch (err) {
      console.error('Push notification failed:', err.statusCode, err.message);

      // Remove invalid subscriptions (410 Gone or 404 Not Found)
      if (err.statusCode === 410 || err.statusCode === 404) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        console.log('Removed invalid subscription:', sub.endpoint);
      }

      results.push({ success: false, endpoint: sub.endpoint, error: err.message });
    }
  }

  return results;
}

// Send ping notification
async function sendPingNotification(fromUser, toUserId) {
  const payload = {
    type: 'ping',
    title: 'CatchUp',
    body: `${fromUser.displayName} wants to chat with you!`,
    data: {
      fromUserId: fromUser.id,
      fromDisplayName: fromUser.displayName,
      url: '/'
    }
  };

  return sendPushToUser(toUserId, payload);
}

// Send availability notification
async function sendAvailabilityNotification(user, toUserId) {
  const payload = {
    type: 'availability',
    title: 'CatchUp',
    body: `${user.displayName} is now available!`,
    data: {
      userId: user.id,
      displayName: user.displayName,
      url: '/'
    }
  };

  return sendPushToUser(toUserId, payload);
}

module.exports = {
  VAPID_PUBLIC_KEY,
  sendPushToUser,
  sendPingNotification,
  sendAvailabilityNotification
};
