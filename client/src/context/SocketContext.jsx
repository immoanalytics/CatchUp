import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

// Register service worker early and keep reference
let swRegistration = null;

async function ensureServiceWorker() {
  if (swRegistration && swRegistration.active) {
    return swRegistration;
  }

  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    // Try to get existing registration first
    swRegistration = await navigator.serviceWorker.getRegistration();

    if (!swRegistration) {
      swRegistration = await navigator.serviceWorker.register('/sw.js');
    }

    // Wait for the service worker to be ready
    if (!swRegistration.active) {
      await navigator.serviceWorker.ready;
      swRegistration = await navigator.serviceWorker.getRegistration();
    }

    return swRegistration;
  } catch (err) {
    console.error('Service worker registration failed:', err);
    return null;
  }
}

// Subscribe to push notifications
async function subscribeToPush(token) {
  try {
    const reg = await ensureServiceWorker();
    if (!reg) {
      console.log('No service worker for push');
      return;
    }

    // Check if already subscribed
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      // Get VAPID public key from server
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) {
        console.error('Failed to get VAPID key');
        return;
      }
      const { publicKey } = await vapidRes.json();

      // Convert VAPID key to Uint8Array
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // Subscribe to push
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      console.log('Push subscription created');
    }

    // Send subscription to server
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });

    if (res.ok) {
      console.log('Push subscription saved to server');
    } else {
      console.error('Failed to save push subscription');
    }
  } catch (err) {
    console.error('Push subscription error:', err);
  }
}

// Helper to convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function showNotification(title, body, tag = 'catchup-notification') {
  // Check if notifications are supported and permitted
  if (typeof Notification === 'undefined') {
    console.log('Notifications not supported');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.log('Notification permission not granted');
    return;
  }

  const notificationsEnabled = localStorage.getItem('catchup-notifications') !== 'false';
  if (!notificationsEnabled) {
    console.log('Notifications disabled by user');
    return;
  }

  try {
    const reg = await ensureServiceWorker();

    if (reg && reg.active) {
      // Use service worker notification (works on Android)
      await reg.showNotification(title, {
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag,
        vibrate: [200, 100, 200],
        renotify: true, // Show notification even if same tag exists
        silent: false
      });
      console.log('Notification shown via service worker');
    } else {
      // Fallback to direct notification (may not work on Android)
      new Notification(title, { body, icon: '/favicon.svg', tag });
      console.log('Notification shown directly');
    }
  } catch (err) {
    console.error('Notification error:', err);
    // Try direct notification as last resort
    try {
      new Notification(title, { body, tag });
    } catch (e) {
      console.error('Direct notification also failed:', e);
    }
  }
}

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const s = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    s.on('connect', () => {
      console.log('Socket connected');

      // Subscribe to push notifications when connected
      if (Notification.permission === 'granted') {
        subscribeToPush(token);
      }
    });

    s.on('connect_error', (err) => {
      console.error('Socket error:', err.message);
    });

    s.on('availability:changed', (data) => {
      if (data.isAvailable) {
        const name = data.displayName || data.username || 'A friend';
        showNotification('CatchUp', `${name} is now available!`);
      }
    });

    s.on('ping:received', (data) => {
      const name = data.fromDisplayName || 'Someone';
      showNotification('CatchUp', `${name} wants to chat with you!`, 'catchup-ping');
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [token]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
