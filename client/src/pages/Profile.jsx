import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, MessageCircle, Bell, ChevronRight, Plus, Camera, LogOut, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

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

// Subscribe to push notifications
async function subscribeToPush(token) {
  try {
    if (!('serviceWorker' in navigator)) return;

    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) {
      reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      reg = await navigator.serviceWorker.getRegistration();
    }

    // Check if already subscribed
    let subscription = await reg.pushManager.getSubscription();

    if (!subscription) {
      // Get VAPID public key from server
      const vapidRes = await fetch('/api/push/vapid-key');
      if (!vapidRes.ok) return;
      const { publicKey } = await vapidRes.json();

      // Subscribe to push
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    // Send subscription to server
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ subscription })
    });

    console.log('Push subscription saved');
  } catch (err) {
    console.error('Push subscription error:', err);
  }
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Profile() {
  const { user, apiFetch, logout, fetchMe } = useAuth();
  const { t } = useLanguage();
  const [schedules, setSchedules] = useState([]);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('09:15');
  const [pushEnabled, setPushEnabled] = useState(() => {
    return localStorage.getItem('catchup-notifications') !== 'false';
  });
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const fileInputRef = useRef(null);

  function handlePhotoClick() {
    fileInputRef.current?.click();
  }

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxSize = 400;
        let w = img.width;
        let h = img.height;
        if (w > h) { h = (h / w) * maxSize; w = maxSize; }
        else { w = (w / h) * maxSize; h = maxSize; }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

        try {
          const res = await apiFetch('/me/photo', {
            method: 'PUT',
            body: JSON.stringify({ photo: dataUrl })
          });
          if (res.ok) {
            await fetchMe();
          }
        } catch (err) {
          console.error('Failed to upload photo:', err);
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await apiFetch('/schedules');
      if (res.ok) setSchedules(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  async function saveProfile(e) {
    e.preventDefault();
    try {
      await apiFetch('/me', {
        method: 'PUT',
        body: JSON.stringify({
          displayName: editDisplayName,
          phone: editPhone,
          whatsapp: editWhatsapp
        })
      });
      await fetchMe();
      setShowEditProfile(false);
    } catch (err) {
      console.error(err);
    }
  }

  async function addSchedule(e) {
    e.preventDefault();
    if (scheduleDays.length === 0) return;
    try {
      const res = await apiFetch('/schedules', {
        method: 'POST',
        body: JSON.stringify({
          days: scheduleDays.join(','),
          startTime: scheduleStart,
          endTime: scheduleEnd
        })
      });
      if (res.ok) {
        setShowAddSchedule(false);
        setScheduleDays([]);
        setScheduleStart('09:00');
        setScheduleEnd('09:15');
        fetchSchedules();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleSchedule(schedule) {
    try {
      await apiFetch(`/schedules/${schedule.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !schedule.enabled })
      });
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteSchedule(scheduleId) {
    try {
      await apiFetch(`/schedules/${scheduleId}`, { method: 'DELETE' });
      fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  }

  function toggleDay(day) {
    setScheduleDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }

  function formatDays(daysStr) {
    return daysStr.split(',').join(', ');
  }

  async function toggleNotifications() {
    if (!pushEnabled) {
      // Turning on - request permission if needed
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission !== 'granted') {
          return; // Don't enable if permission denied
        }
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
        alert(t('notificationBlocked'));
        return;
      }

      // Subscribe to push notifications
      const token = localStorage.getItem('catchup-token');
      if (token) {
        subscribeToPush(token);
      }
    }
    const newValue = !pushEnabled;
    setPushEnabled(newValue);
    localStorage.setItem('catchup-notifications', newValue ? 'true' : 'false');
  }

  async function sendTestNotification() {
    // Check if Notification API is available
    if (typeof Notification === 'undefined') {
      alert(t('notificationsNotSupported'));
      return;
    }

    // Check permission
    if (Notification.permission !== 'granted') {
      alert(`${t('notificationBlocked')} (${Notification.permission})`);
      return;
    }

    try {
      // Always use service worker for notifications (required on Android/mobile)
      if ('serviceWorker' in navigator) {
        // Register service worker if not already registered
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) {
          reg = await navigator.serviceWorker.register('/sw.js');
        }
        // Wait for active service worker
        if (!reg.active) {
          await navigator.serviceWorker.ready;
          reg = await navigator.serviceWorker.getRegistration();
        }
        await reg.showNotification('CatchUp', {
          body: t('testNotificationBody'),
          icon: '/favicon.svg',
          tag: 'catchup-test',
          vibrate: [200, 100, 200]
        });
        // Show success feedback
        alert(t('testNotificationSent'));
      } else {
        alert(t('notificationsNotSupported'));
      }
    } catch (err) {
      // Show error to user
      alert(`${t('notificationError')}: ${err.message}`);
    }
  }

  function openEditProfile() {
    setEditDisplayName(user.displayName || '');
    setEditPhone(user.phone || '');
    setEditWhatsapp(user.whatsapp || '');
    setShowEditProfile(true);
  }

  return (
    <div className="page-content">
      <h1 className="page-title">{t('profile')}</h1>

      {/* Avatar and name */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {user.photo ? (
            <img
              src={user.photo}
              alt={user.displayName}
              style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
              onClick={handlePhotoClick}
            />
          ) : (
            <div
              className="avatar avatar-large"
              style={{ backgroundColor: user.avatarColor || '#6C63FF', cursor: 'pointer' }}
              onClick={handlePhotoClick}
            >
              {getInitials(user.displayName)}
            </div>
          )}
          <div
            style={{
              position: 'absolute', bottom: -2, right: -2, width: 28, height: 28,
              borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-primary)',
              cursor: 'pointer'
            }}
            onClick={handlePhotoClick}
          >
            <Camera size={14} color="var(--text-muted)" />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePhotoSelect}
        />
        <h2 style={{ fontSize: 20, marginTop: 8 }}>{user.displayName}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }} onClick={openEditProfile}>
          {t('tapToEdit')}
        </p>
      </div>

      {/* Contact Info */}
      <div className="section-header">
        <span className="section-title">{t('contactInfo')}</span>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)' }}
          onClick={openEditProfile}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Phone size={18} color="var(--text-secondary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t('phoneNumber')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.phone || t('notSet')}</div>
          </div>
          <ChevronRight size={18} className="chevron" />
        </div>

        <div
          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', cursor: 'pointer' }}
          onClick={openEditProfile}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={18} color="var(--text-secondary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500 }}>{t('whatsapp')}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.whatsapp || t('notSet')}</div>
          </div>
          <ChevronRight size={18} className="chevron" />
        </div>
      </div>

      {/* Recurring Schedules */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <span className="section-title">{t('recurringSchedules')}</span>
        <button style={{ color: 'var(--accent-blue)', fontSize: 14, fontWeight: 500 }} onClick={() => setShowAddSchedule(true)}>
          {t('add')}
        </button>
      </div>

      {schedules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 14 }}>
          {t('noSchedulesYet')}
        </div>
      )}

      {schedules.map(schedule => (
        <div key={schedule.id} className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{ cursor: 'pointer', flex: 1 }}
            onClick={() => toggleSchedule(schedule)}
            onContextMenu={(e) => { e.preventDefault(); deleteSchedule(schedule.id); }}
          >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{formatDays(schedule.days)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {schedule.startTime} - {schedule.endTime}
            </div>
          </div>
          <div
            className={`toggle ${schedule.enabled ? 'active' : ''}`}
            onClick={() => toggleSchedule(schedule)}
          />
        </div>
      ))}

      {schedules.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          {t('tapToEditLongPress')}
        </p>
      )}

      {/* Preferences */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <span className="section-title">{t('preferences')}</span>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,152,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={18} color="var(--accent-orange)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>{t('pushNotifications')}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {notificationPermission === 'denied' ? t('notificationBlocked') : t('pushDescription')}
          </div>
        </div>
        <div
          className={`toggle ${pushEnabled && notificationPermission === 'granted' ? 'active' : ''}`}
          onClick={toggleNotifications}
        />
      </div>

      {pushEnabled && notificationPermission === 'granted' && (
        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: 8 }}
          onClick={sendTestNotification}
        >
          {t('testNotification')}
        </button>
      )}

      {/* Sign Out */}
      <button
        className="btn btn-danger btn-block"
        style={{ marginTop: 28 }}
        onClick={logout}
      >
        <LogOut size={16} style={{ marginRight: 8 }} />
        {t('signOut')}
      </button>

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div className="modal-overlay" onClick={() => setShowEditProfile(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="modal-title" style={{ marginBottom: 0 }}>{t('editProfile')}</h2>
              <button
                type="button"
                onClick={() => setShowEditProfile(false)}
                style={{ color: 'var(--text-muted)', padding: 4 }}
              >
                <X size={24} />
              </button>
            </div>
            <form onSubmit={saveProfile}>
              <div className="form-group">
                <label className="form-label">{t('displayName')}</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('phoneNumber')}</label>
                <input
                  type="tel"
                  placeholder={t('phonePlaceholder')}
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('whatsappNumber')}</label>
                <input
                  type="tel"
                  placeholder={t('phonePlaceholder')}
                  value={editWhatsapp}
                  onChange={e => setEditWhatsapp(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8, marginBottom: 16, paddingTop: 14, paddingBottom: 14, fontSize: 16, fontWeight: 600 }}>
                {t('saveChanges')}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {showAddSchedule && (
        <div className="modal-overlay" onClick={() => setShowAddSchedule(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{t('addSchedule')}</h2>
            <form onSubmit={addSchedule}>
              <div className="form-group">
                <label className="form-label">{t('days')}</label>
                <div className="day-picker">
                  {DAY_LABELS.map(day => (
                    <button
                      key={day}
                      type="button"
                      className={`day-btn ${scheduleDays.includes(day) ? 'selected' : ''}`}
                      onClick={() => toggleDay(day)}
                    >
                      {day.slice(0, 2)}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('startTime')}</label>
                  <input
                    type="time"
                    value={scheduleStart}
                    onChange={e => setScheduleStart(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('endTime')}</label>
                  <input
                    type="time"
                    value={scheduleEnd}
                    onChange={e => setScheduleEnd(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8, marginBottom: 16 }}>
                {t('addSchedule')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
