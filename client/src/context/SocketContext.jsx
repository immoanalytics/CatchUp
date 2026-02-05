import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

async function showNotification(title, body) {
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
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/favicon.svg',
        tag: 'catchup-availability'
      });
    } else {
      // Fall back to regular Notification API (desktop)
      new Notification(title, {
        body,
        icon: '/favicon.svg',
        tag: 'catchup-availability'
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
