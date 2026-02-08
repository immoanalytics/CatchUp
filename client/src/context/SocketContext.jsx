import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

async function showNotification(title, body, tag = 'catchup-availability') {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return;
  }
  const notificationsEnabled = localStorage.getItem('catchup-notifications') !== 'false';
  if (!notificationsEnabled) {
    return;
  }

  try {
    // Use service worker for notifications (required on Android)
    if ('serviceWorker' in navigator) {
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js');
      }
      if (!reg.active) {
        await navigator.serviceWorker.ready;
        reg = await navigator.serviceWorker.getRegistration();
      }
      await reg.showNotification(title, {
        body,
        icon: '/favicon.svg',
        tag,
        vibrate: [200, 100, 200],
        requireInteraction: tag === 'catchup-ping' // Keep ping notifications until user interacts
      });
    }
  } catch (err) {
    console.error('Notification error:', err);
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
