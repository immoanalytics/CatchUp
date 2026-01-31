import { useState, useEffect, useCallback } from 'react';
import { Phone, Plus, Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import CallSheet from '../components/CallSheet';

function getTimeSince(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
  return 'just now';
}

export default function Home() {
  const { user, apiFetch } = useAuth();
  const socket = useSocket();
  const [isAvailable, setIsAvailable] = useState(false);
  const [availableSince, setAvailableSince] = useState(null);
  const [friends, setFriends] = useState([]);
  const [filter, setFilter] = useState('All');
  const [circles, setCircles] = useState([]);
  const [callContact, setCallContact] = useState(null);
  const [, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [meRes, availRes, circlesRes] = await Promise.all([
        apiFetch('/me'),
        apiFetch('/available'),
        apiFetch('/circles')
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        setIsAvailable(me.isAvailable);
        setAvailableSince(me.availableSince);
      }
      if (availRes.ok) {
        setFriends(await availRes.json());
      }
      if (circlesRes.ok) {
        setCircles(await circlesRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Update timer every minute
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  // Listen for real-time updates
  useEffect(() => {
    if (!socket) return;

    function handleAvailabilityChanged(data) {
      if (data.isAvailable) {
        setFriends(prev => {
          const existing = prev.find(f => f.id === data.userId);
          if (existing) {
            return prev.map(f => f.id === data.userId ? { ...f, ...data, availableSince: data.availableSince } : f);
          }
          return [...prev, {
            id: data.userId,
            displayName: data.displayName,
            avatarColor: data.avatarColor,
            phone: data.phone,
            whatsapp: data.whatsapp,
            availableSince: data.availableSince,
            circles: []
          }];
        });
      } else {
        setFriends(prev => prev.filter(f => f.id !== data.userId));
      }
    }

    socket.on('availability:changed', handleAvailabilityChanged);
    socket.on('availability:updated', (data) => {
      setIsAvailable(data.isAvailable);
      setAvailableSince(data.availableSince);
    });

    return () => {
      socket.off('availability:changed', handleAvailabilityChanged);
      socket.off('availability:updated');
    };
  }, [socket]);

  async function toggleAvailability() {
    try {
      const res = await apiFetch('/availability/toggle', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setIsAvailable(data.isAvailable);
        setAvailableSince(data.availableSince);
      }
    } catch (err) {
      console.error('Failed to toggle availability:', err);
    }

    // Also emit via socket for real-time broadcast
    if (socket) socket.emit('availability:toggle');
  }

  const filterNames = ['All', ...circles.map(c => c.name)];

  const filteredFriends = filter === 'All'
    ? friends
    : friends.filter(f => f.circles && f.circles.some(c => c.name === filter));

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  return (
    <div className="page-content">
      <h1 className="page-title">CatchUp</h1>

      {/* Availability toggle card */}
      <div
        className={`availability-card ${isAvailable ? 'available' : ''}`}
        onClick={toggleAvailability}
      >
        <div className="plus-icon">
          {isAvailable ? <Check size={24} color="white" /> : <Plus size={24} color="var(--text-muted)" />}
        </div>
        <h3>{isAvailable ? "You're Available" : "I'm Available"}</h3>
        <p>
          {isAvailable
            ? `Available for ${getTimeSince(availableSince)}`
            : 'Tap to let friends know'}
        </p>
      </div>

      {/* Filter chips */}
      <div className="filter-bar">
        {filterNames.map(name => (
          <button
            key={name}
            className={`filter-chip ${filter === name ? 'active' : ''}`}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Available friends section */}
      <div className="section-header">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>Available Now</h2>
        <span className="badge">{filteredFriends.length}</span>
      </div>

      {filteredFriends.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 8 }}>No friends available right now</p>
          <p style={{ fontSize: 13 }}>When your friends mark themselves as available, they'll show up here</p>
        </div>
      )}

      {filteredFriends.map(friend => (
        <div key={friend.id} className="contact-card">
          <div className="avatar" style={{ backgroundColor: friend.avatarColor || '#6C63FF' }}>
            {getInitials(friend.displayName)}
          </div>
          <div className="contact-info">
            <div className="contact-name">{friend.displayName}</div>
            {friend.circles && friend.circles.length > 0 && (
              <div className="contact-circles">
                {friend.circles.map(c => (
                  <span key={c.name} className="chip">{c.name}</span>
                ))}
              </div>
            )}
            <div className="contact-status">
              <span className="status-dot" />
              Free for {getTimeSince(friend.availableSince)}
            </div>
          </div>
          <button className="call-button" onClick={() => setCallContact(friend)}>
            <Phone size={20} />
          </button>
        </div>
      ))}

      {callContact && (
        <CallSheet contact={callContact} onClose={() => setCallContact(null)} />
      )}
    </div>
  );
}
