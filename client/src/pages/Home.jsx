import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, Plus, Check, Clock, Calendar, X, Hand } from 'lucide-react';
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

function canPing(lastPingAt) {
  if (!lastPingAt) return true;
  const diff = Date.now() - new Date(lastPingAt).getTime();
  return diff > 5 * 60 * 1000; // 5 minute cooldown
}

function getPingCooldown(lastPingAt) {
  if (!lastPingAt) return null;
  const diff = Date.now() - new Date(lastPingAt).getTime();
  const remaining = 5 * 60 * 1000 - diff;
  if (remaining <= 0) return null;
  const mins = Math.ceil(remaining / 60000);
  return `${mins}m`;
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
  const [filter, setFilter] = useState(null);
  const [circles, setCircles] = useState([]);
  const [callContact, setCallContact] = useState(null);
  const [showDurationPicker, setShowDurationPicker] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [, setTick] = useState(0);
  const [pendingPing, setPendingPing] = useState(null);
  const [pingingSent, setPingsSent] = useState({});
  const [toast, setToast] = useState(null); // i18n key, translated at render
  const toastTimer = useRef(null);

  const showToast = useCallback((messageKey) => {
    setToast(messageKey);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [meRes, friendsRes, circlesRes, schedRes, pingsRes] = await Promise.all([
        apiFetch('/me'),
        apiFetch('/friends/all'),
        apiFetch('/circles'),
        apiFetch('/schedules'),
        apiFetch('/pings')
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        setIsAvailable(me.isAvailable);
        setAvailableSince(me.availableSince);
        setAvailableUntil(me.availableUntil || null);
      }
      if (friendsRes.ok) {
        setFriends(await friendsRes.json());
      }
      if (circlesRes.ok) {
        setCircles(await circlesRes.json());
      }
      if (schedRes.ok) {
        setSchedules(await schedRes.json());
      }
      if (pingsRes.ok) {
        const pings = await pingsRes.json();
        if (pings.length > 0) {
          setPendingPing(pings[0]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh data when the app regains focus (phone unlocked, tab switched back)
  useEffect(() => {
    function handleVisible() {
      if (document.visibilityState === 'visible') fetchData();
    }
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);
    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
    };
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
      setFriends(prev => {
        const existing = prev.find(f => f.id === data.userId);
        if (existing) {
          return prev.map(f => f.id === data.userId ? {
            ...f,
            displayName: data.displayName || f.displayName,
            avatarColor: data.avatarColor || f.avatarColor,
            phone: data.phone || f.phone,
            whatsapp: data.whatsapp || f.whatsapp,
            isAvailable: data.isAvailable,
            availableSince: data.availableSince,
            availableUntil: data.availableUntil || null
          } : f);
        }
        // Friend not in list yet - add them
        return [...prev, {
          id: data.userId,
          displayName: data.displayName,
          avatarColor: data.avatarColor,
          phone: data.phone,
          whatsapp: data.whatsapp,
          isAvailable: data.isAvailable,
          availableSince: data.availableSince,
          availableUntil: data.availableUntil || null,
          circles: []
        }];
      });
    }

    function handlePingReceived(data) {
      setPendingPing(data);
    }

    function handlePingSent(data) {
      setPingsSent(prev => ({ ...prev, [data.toUserId]: new Date().toISOString() }));
      showToast('pingSentToast');
    }

    function handlePingError(data) {
      console.error('Ping error:', data.error);
      showToast('pingFailedToast');
    }

    socket.on('availability:changed', handleAvailabilityChanged);
    socket.on('availability:updated', (data) => {
      setIsAvailable(data.isAvailable);
      setAvailableSince(data.availableSince);
      setAvailableUntil(data.availableUntil || null);
    });
    socket.on('ping:received', handlePingReceived);
    socket.on('ping:sent', handlePingSent);
    socket.on('ping:error', handlePingError);

    return () => {
      socket.off('availability:changed', handleAvailabilityChanged);
      socket.off('availability:updated');
      socket.off('ping:received', handlePingReceived);
      socket.off('ping:sent', handlePingSent);
      socket.off('ping:error', handlePingError);
    };
  }, [socket, showToast]);

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

  function sendPing(friendId) {
    if (!socket) return;
    socket.emit('ping:send', { toUserId: friendId });
    setPingsSent(prev => ({ ...prev, [friendId]: new Date().toISOString() }));
  }

  async function respondToPing(pingId, goAvailable) {
    try {
      await apiFetch(`/pings/${pingId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: goAvailable ? 'responded' : 'dismissed' })
      });
      setPendingPing(null);
      if (goAvailable) {
        setShowDurationPicker(true);
      }
    } catch (err) {
      console.error('Failed to respond to ping:', err);
    }
  }

  // Separate available and offline friends
  const availableFriends = friends.filter(f => {
    // Only show friends who are in at least one circle
    if (!f.circles || f.circles.length === 0) return false;
    if (!f.isAvailable) return false;
    if (!f.availableUntil) return true;
    return new Date(f.availableUntil).getTime() > Date.now();
  });

  const offlineFriends = friends.filter(f => {
    // Only show friends who are in at least one circle
    if (!f.circles || f.circles.length === 0) return false;
    if (!f.isAvailable) return true;
    if (!f.availableUntil) return false;
    return new Date(f.availableUntil).getTime() <= Date.now();
  });

  // Check if own availability has expired client-side
  const effectivelyAvailable = isAvailable && (!availableUntil || new Date(availableUntil).getTime() > Date.now());

  const filteredAvailableFriends = filter === null
    ? availableFriends
    : availableFriends.filter(f => f.circles && f.circles.some(c => c.name === filter));

  const filteredOfflineFriends = filter === null
    ? offlineFriends
    : offlineFriends.filter(f => f.circles && f.circles.some(c => c.name === filter));

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  function getAvailabilitySubtext() {
    if (!effectivelyAvailable) return t('tapToLetFriends');
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
      {(() => {
        const activeSchedule = getActiveSchedule(schedules);
        const isScheduledAvailability = effectivelyAvailable && activeSchedule;
        return (
          <div
            className={`availability-card ${effectivelyAvailable ? 'available' : ''} ${isScheduledAvailability ? 'scheduled' : ''}`}
            onClick={handleAvailabilityCardClick}
          >
            <div className="plus-icon">
              {effectivelyAvailable ? <Check size={24} color="white" /> : <Plus size={24} color="var(--text-muted)" />}
            </div>
            <h3>{effectivelyAvailable ? t('youreAvailable') : t('imAvailable')}</h3>
            <p>{getAvailabilitySubtext()}</p>
            {isScheduledAvailability && (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                <Calendar size={12} /> {t('scheduledAvailability')}
              </p>
            )}
            {effectivelyAvailable && !isScheduledAvailability && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t('tapToTurnOff')}</p>
            )}
          </div>
        );
      })()}

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
        <button
          className={`filter-chip ${filter === null ? 'active' : ''}`}
          onClick={() => setFilter(null)}
        >
          {t('all')}
        </button>
        {circles.map(c => (
          <button
            key={c.id}
            className={`filter-chip ${filter === c.name ? 'active' : ''}`}
            onClick={() => setFilter(c.name)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Available friends section */}
      <div className="section-header">
        <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t('availableNow')}</h2>
        <span className="badge">{filteredAvailableFriends.length}</span>
      </div>

      {filteredAvailableFriends.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 8 }}>{t('noFriendsAvailable')}</p>
          <p style={{ fontSize: 13 }}>{t('friendsWillShowUp')}</p>
        </div>
      )}

      {filteredAvailableFriends.map(friend => (
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

      {/* Offline friends section */}
      {filteredOfflineFriends.length > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>{t('friends')}</h2>
            <span className="badge" style={{ background: 'var(--bg-elevated)' }}>{filteredOfflineFriends.length}</span>
          </div>

          {filteredOfflineFriends.map(friend => {
            const lastPing = pingingSent[friend.id] || friend.lastPingAt;
            const canPingNow = canPing(lastPing);
            const cooldown = getPingCooldown(lastPing);
            return (
              <div key={friend.id} className="contact-card offline">
                {friend.photo ? (
                  <img src={friend.photo} alt={friend.displayName} className="avatar" style={{ objectFit: 'cover', opacity: 0.7 }} />
                ) : (
                  <div className="avatar" style={{ backgroundColor: friend.avatarColor || '#6C63FF', opacity: 0.7 }}>
                    {getInitials(friend.displayName)}
                  </div>
                )}
                <div className="contact-info">
                  <div className="contact-name" style={{ color: 'var(--text-secondary)' }}>{friend.displayName}</div>
                  {friend.circles && friend.circles.length > 0 && (
                    <div className="contact-circles">
                      {friend.circles.map(c => (
                        <span key={c.name} className="chip" style={{ opacity: 0.7 }}>{c.name}</span>
                      ))}
                    </div>
                  )}
                  <div className="contact-status" style={{ color: 'var(--text-muted)' }}>
                    <span className="status-dot offline" />
                    {t('offline')}
                  </div>
                </div>
                <button
                  className={`ping-button ${!canPingNow ? 'disabled' : ''}`}
                  onClick={() => canPingNow && sendPing(friend.id)}
                  disabled={!canPingNow}
                  title={canPingNow ? t('pingFriend') : `${t('waitToPing')} ${cooldown}`}
                >
                  <Hand size={18} />
                  {cooldown && <span className="cooldown">{cooldown}</span>}
                </button>
              </div>
            );
          })}
        </>
      )}

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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
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

      {/* Ping received modal */}
      {pendingPing && (
        <div className="modal-overlay" onClick={() => setPendingPing(null)}>
          <div className="modal-content ping-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="modal-title" style={{ marginBottom: 0 }}>{t('pingReceived')}</h2>
              <button onClick={() => setPendingPing(null)} style={{ color: 'var(--text-muted)' }}>
                <X size={24} />
              </button>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              {pendingPing.fromPhoto ? (
                <img
                  src={pendingPing.fromPhoto}
                  alt={pendingPing.fromDisplayName}
                  className="avatar"
                  style={{ width: 64, height: 64, objectFit: 'cover', margin: '0 auto 16px' }}
                />
              ) : (
                <div
                  className="avatar"
                  style={{
                    width: 64,
                    height: 64,
                    fontSize: 24,
                    backgroundColor: pendingPing.fromAvatarColor || '#6C63FF',
                    margin: '0 auto 16px'
                  }}
                >
                  {getInitials(pendingPing.fromDisplayName)}
                </div>
              )}
              <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
                {pendingPing.fromDisplayName}
              </p>
              <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
                {t('wantsToChat')}
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                  className="btn-secondary"
                  onClick={() => respondToPing(pendingPing.id, false)}
                  style={{ padding: '12px 24px' }}
                >
                  {t('notNow')}
                </button>
                <button
                  className="btn-primary"
                  onClick={() => respondToPing(pendingPing.id, true)}
                  style={{ padding: '12px 24px' }}
                >
                  {t('goAvailable')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast feedback */}
      {toast && <div className="toast">{t(toast)}</div>}
    </div>
  );
}
