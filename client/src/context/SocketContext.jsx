import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

function showNotification(title, body) {
  if (Notification.permission === 'granted') {
    const notificationsEnabled = localStorage.getItem('catchup-notifications') !== 'false';
    if (notificationsEnabled) {
      new Notification(title, {
        body,
        icon: '/favicon.svg',
        tag: 'catchup-availability'
      });
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
