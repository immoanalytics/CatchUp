import { useState, useEffect, useCallback } from 'react';
import { Phone, Plus, Check, Clock, Calendar, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useLanguage } from '../context/LanguageContext';
import CallSheet from '../components/CallSheet';

function getTimeSince(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins} min${mins !== 1 ? 's' : ''}`;
  return null; // will use t('justNow')
}

function getTimeRemaining(isoString) {
  if (!isoString) return null;
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0) return 'expiring';
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins} min${mins !== 1 ? 's' : ''}`;
}

const DURATION_KEYS = [
  { key: 'min15', value: 15 },
  { key: 'min30', value: 30 },
  { key: 'hour1', value: 60 },
  { key: 'hours2', value: 120 },
  { key: 'noLimit', value: null },
];

const DAY_MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getActiveSchedule(schedules) {
  if (!schedules || schedules.length === 0) return null;
  const now = new Date();
  const todayName = DAY_NAMES[now.getDay()];
  const nowMins = now.getHours() * 60 + now.getMinutes();

  for (const s of schedules) {
    if (!s.enabled) continue;
    const days = s.days.split(',').map(d => d.trim());
    if (!days.includes(todayName)) continue;
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    if (nowMins >= startMins && nowMins < endMins) {
      return { ...s, status: 'active', endTime: s.endTime };
    }
  }
  return null;
}

function getNextSchedule(schedules) {
  if (!schedules || schedules.length === 0) return null;
  const now = new Date();
  const todayIdx = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  let bestDist = Infinity;

  for (const s of schedules) {
    if (!s.enabled) continue;
    const days = s.days.split(',').map(d => d.trim());
    for (const dayName of days) {
      const dayIdx = DAY_MAP[dayName];
      if (dayIdx === undefined) continue;
      const [sh, sm] = s.startTime.split(':').map(Number);
      const startMins = sh * 60 + sm;
      let dayDiff = dayIdx - todayIdx;
      if (dayDiff < 0) dayDiff += 7;
      if (dayDiff === 0 && startMins <= nowMins) dayDiff = 7;
      const dist = dayDiff * 1440 + (startMins - nowMins);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        best = { ...s, nextDay: dayName };
      }
    }
  }
  return best;
}

export default function Home() {
  const { user, apiFetch } = useAuth();
  const socket = useSocket();
  const { lang, setLanguage, t } = useLanguage();
  const [isAvailable, setIsAvailable] = useState(false);
  const [availableSince, setAvailableSince] = useState(null);
  const [availableUntil, setAvailableUntil] = useState(null);
  const [friends, setFriends] = useState([]);
  const [filter, setFilter] = useState('All');
  const [circles, setCircles] = useState([]);
  const [callContact, setCallContact] = useState(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [, setTick] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [meRes, availRes, circlesRes, schedRes] = await Promise.all([
        apiFetch('/me'),
        apiFetch('/available'),
        apiFetch('/circles'),
        apiFetch('/schedules')
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
      if (schedRes.ok) {
        setSchedules(await schedRes.json());
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
      setAvailableViaApi(false, null);
    } else {
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
    if (socket) {
      socket.emit('availability:set', { isAvailable: available, duration: available ? duration : null });
    }
  }

  const filterNames = [t('all'), ...circles.map(c => c.name)];

  const filteredFriends = filter === t('all')
    ? friends
    : friends.filter(f => f.circles && f.circles.some(c => c.name === filter));

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  function getAvailabilitySubtext() {
    if (!isAvailable) return t('tapToLetFriends');
    const remaining = getTimeRemaining(availableUntil);
    if (remaining === 'expiring') return t('expiring');
    if (remaining) return `${remaining} ${t('left')}`;
    const since = getTimeSince(availableSince);
    if (!since) return `${t('availableFor')} ${t('justNow')}`;
    return `${t('availableFor')} ${since}`;
  }

  function getFriendStatus(friend) {
    const remaining = getTimeRemaining(friend.availableUntil);
    if (remaining === 'expiring') return t('expiring');
    if (remaining) return `${remaining} ${t('left')}`;
    const since = getTimeSince(friend.availableSince);
    if (!since) return `${t('freeFor')} ${t('justNow')}`;
    return `${t('freeFor')} ${since}`;
  }

  return (
    <div className="page-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>{t('appName')}</h1>
        <button
          onClick={() => setLanguage(lang === 'en' ? 'ro' : 'en')}
          style={{
            fontSize: 22,
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            lineHeight: 1
          }}
          title={lang === 'en' ? 'Switch to Romanian' : 'Switch to English'}
        >
          {lang === 'en' ? '🇷🇴' : '🇬🇧'}
        </button>
      </div>

      {/* Availability toggle card */}
      <div
        className={`availability-card ${isAvailable ? 'available' : ''}`}
        onClick={handleAvailabilityCardClick}
      >
        <div className="plus-icon">
          {isAvailable ? <Check size={24} color="white" /> : <Plus size={24} color="var(--text-muted)" />}
        </div>
        <h3>{isAvailable ? t('youreAvailable') : t('imAvailable')}</h3>
        <p>{getAvailabilitySubtext()}</p>
        {isAvailable && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('tapToTurnOff')}</p>
        )}
      </div>

      {/* Scheduled availability indicator */}
      {schedules.length > 0 && (() => {
        const active = getActiveSchedule(schedules);
        const next = !active ? getNextSchedule(schedules) : null;
        if (!active && !next) return null;
        return (
          <div className="schedule-indicator">
            <Calendar size={16} />
            {active ? (
              <span>{t('scheduledUntilToday')} {active.endTime} {t('today')}</span>
            ) : next ? (
              <span>{t('next')} {next.nextDay} {next.startTime} – {next.endTime}</span>
            ) : null}
            <span className="schedule-badge">{t('scheduled')}</span>
          </div>
        );
      })()}

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
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t('availableNow')}</h2>
        <span className="badge">{filteredFriends.length}</span>
      </div>

      {filteredFriends.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 8 }}>{t('noFriendsAvailable')}</p>
          <p style={{ fontSize: 13 }}>{t('friendsWillShowUp')}</p>
        </div>
      )}

      {filteredFriends.map(friend => (
        <div key={friend.id} className="contact-card">
          {friend.photo ? (
            <img src={friend.photo} alt={friend.displayName} className="avatar" style={{ objectFit: 'cover' }} />
          ) : (
            <div className="avatar" style={{ backgroundColor: friend.avatarColor || '#6C63FF' }}>
              {getInitials(friend.displayName)}
            </div>
          )}
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
              <h2 className="modal-title" style={{ marginBottom: 0 }}>{t('howLongFree')}</h2>
              <button onClick={() => setShowDurationPicker(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {DURATION_KEYS.map(opt => (
                <button
                  key={opt.key}
                  className="call-option"
                  style={{ justifyContent: 'space-between' }}
                  onClick={() => setAvailableViaApi(true, opt.value)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div className="call-option-icon" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--accent-green)' }}>
                      <Clock size={20} />
                    </div>
                    <div style={{ fontWeight: 500 }}>{t(opt.key)}</div>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'right' }}>
                    {opt.value
                      ? `${t('until')} ${new Date(Date.now() + opt.value * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                      : t('manualOff')}
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
