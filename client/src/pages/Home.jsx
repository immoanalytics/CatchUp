import { useState, useEffect, useCallback } from 'react';
import { Phone, Plus, Check, Clock, X } from 'lucide-react';
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

function getTimeRemaining(isoString) {
  if (!isoString) return null;
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return 'expiring...';
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m left`;
  return `${mins} min${mins !== 1 ? 's' : ''} left`;
}

const DURATION_OPTIONS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: 'No limit', value: null },
];

export default function Home() {
  const { user, apiFetch } = useAuth();
  const socket = useSocket();
  const [isAvailable, setIsAvailable] = useState(false);
  const [availableSince, setAvailableSince] = useState(null);
  const [availableUntil, setAvailableUntil] = useState(null);
  const [friends, setFriends] = useState([]);
  const [filter, setFilter] = useState('All');
  const [circles, setCircles] = useState([]);
  const [callContact, setCallContact] = useState(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
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
        setAvailableUntil(me.availableUntil || null);
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

  // Update timer every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
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
            return prev.map(f => f.id === data.userId ? {
              ...f,
              displayName: data.displayName || f.displayName,
              avatarColor: data.avatarColor || f.avatarColor,
              phone: data.phone || f.phone,
              whatsapp: data.whatsapp || f.whatsapp,
              availableSince: data.availableSince,
              availableUntil: data.availableUntil || null
            } : f);
          }
          return [...prev, {
            id: data.userId,
            displayName: data.displayName,
            avatarColor: data.avatarColor,
            phone: data.phone,
            whatsapp: data.whatsapp,
            availableSince: data.availableSince,
            availableUntil: data.availableUntil || null,
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
      setAvailableUntil(data.availableUntil || null);
    });

    return () => {
      socket.off('availability:changed', handleAvailabilityChanged);
      socket.off('availability:updated');
    };
  }, [socket]);

  function handleAvailabilityCardClick() {
    if (isAvailable) {
      // Turn off availability
      setAvailableViaApi(false, null);
    } else {
      // Show duration picker
      setShowDurationPicker(true);
    }
  }

  async function setAvailableViaApi(available, duration) {
    setShowDurationPicker(false);
    try {
      const body = { isAvailable: available };
      if (available && duration) body.duration = duration;
      const res = await apiFetch('/availability/set', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        setIsAvailable(data.isAvailable);
        setAvailableSince(data.availableSince);
        setAvailableUntil(data.availableUntil || null);
      }
    } catch (err) {
      console.error('Failed to set availability:', err);
    }
    // Broadcast to friends via socket
    if (socket) {
      socket.emit('availability:set', { isAvailable: available, duration: available ? duration : null });
    }
  }

  const filterNames = ['All', ...circles.map(c => c.name)];

  const filteredFriends = filter === 'All'
    ? friends
    : friends.filter(f => f.circles && f.circles.some(c => c.name === filter));

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  function getAvailabilitySubtext() {
    if (!isAvailable) return 'Tap to let friends know';
    const remaining = getTimeRemaining(availableUntil);
    if (remaining) return remaining;
    return `Available for ${getTimeSince(availableSince)}`;
  }

  function getFriendStatus(friend) {
    const remaining = getTimeRemaining(friend.availableUntil);
    if (remaining) return remaining;
    return `Free for ${getTimeSince(friend.availableSince)}`;
  }

  return (
    <div className="page-content">
      <h1 className="page-title">CatchUp</h1>

      {/* Availability toggle card */}
      <div
        className={`availability-card ${isAvailable ? 'available' : ''}`}
        onClick={handleAvailabilityCardClick}
      >
        <div className="plus-icon">
          {isAvailable ? <Check size={24} color="white" /> : <Plus size={24} color="var(--text-muted)" />}
        </div>
        <h3>{isAvailable ? "You're Available" : "I'm Available"}</h3>
        <p>{getAvailabilitySubtext()}</p>
        {isAvailable && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Tap to turn off</p>
        )}
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
              {getFriendStatus(friend)}
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

      {/* Duration picker modal */}
      {showDurationPicker && (
        <div className="modal-overlay" onClick={() => setShowDurationPicker(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="modal-title" style={{ marginBottom: 0 }}>How long are you free?</h2>
              <button onClick={() => setShowDurationPicker(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DURATION_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  className="call-option"
                  onClick={() => setAvailableViaApi(true, opt.value)}
                >
                  <div className="call-option-icon" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--accent-green)' }}>
                    <Clock size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 500 }}>{opt.label}</div>
                    {opt.value && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Until {new Date(Date.now() + opt.value * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {!opt.value && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        Stay available until you turn it off
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
