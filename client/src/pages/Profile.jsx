import { useState, useEffect, useCallback } from 'react';
import { Phone, MessageCircle, Bell, ChevronRight, Plus, Camera, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Profile() {
  const { user, apiFetch, logout, fetchMe } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showAddSchedule, setShowAddSchedule] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');
  const [scheduleDays, setScheduleDays] = useState([]);
  const [scheduleStart, setScheduleStart] = useState('09:00');
  const [scheduleEnd, setScheduleEnd] = useState('09:15');
  const [pushEnabled, setPushEnabled] = useState(true);

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

  function openEditProfile() {
    setEditDisplayName(user.displayName || '');
    setEditPhone(user.phone || '');
    setEditWhatsapp(user.whatsapp || '');
    setShowEditProfile(true);
  }

  return (
    <div className="page-content">
      <h1 className="page-title">Profile</h1>

      {/* Avatar and name */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          className="avatar avatar-large"
          style={{ backgroundColor: user.avatarColor || '#6C63FF', margin: '0 auto 4px', position: 'relative', cursor: 'pointer' }}
          onClick={openEditProfile}
        >
          {getInitials(user.displayName)}
          <div style={{
            position: 'absolute', bottom: -2, right: -2, width: 28, height: 28,
            borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-primary)'
          }}>
            <Camera size={14} color="var(--text-muted)" />
          </div>
        </div>
        <h2 style={{ fontSize: 20, marginTop: 8 }}>{user.displayName}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer' }} onClick={openEditProfile}>
          Tap to edit
        </p>
      </div>

      {/* Contact Info */}
      <div className="section-header">
        <span className="section-title">Contact Info</span>
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
            <div style={{ fontWeight: 500 }}>Phone Number</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.phone || 'Not set'}</div>
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
            <div style={{ fontWeight: 500 }}>WhatsApp</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{user.whatsapp || 'Not set'}</div>
          </div>
          <ChevronRight size={18} className="chevron" />
        </div>
      </div>

      {/* Recurring Schedules */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <span className="section-title">Recurring Schedules</span>
        <button style={{ color: 'var(--accent-blue)', fontSize: 14, fontWeight: 500 }} onClick={() => setShowAddSchedule(true)}>
          + Add
        </button>
      </div>

      {schedules.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: 14 }}>
          No recurring schedules yet
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
          Tap to edit, long press to delete
        </p>
      )}

      {/* Preferences */}
      <div className="section-header" style={{ marginTop: 24 }}>
        <span className="section-title">Preferences</span>
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,152,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={18} color="var(--accent-orange)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500 }}>Push Notifications</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Get notified when friends are free</div>
        </div>
        <div
          className={`toggle ${pushEnabled ? 'active' : ''}`}
          onClick={() => setPushEnabled(!pushEnabled)}
        />
      </div>

      {/* Sign Out */}
      <button
        className="btn btn-danger btn-block"
        style={{ marginTop: 28 }}
        onClick={logout}
      >
        <LogOut size={16} style={{ marginRight: 8 }} />
        Sign Out
      </button>

      {/* Edit Profile Modal */}
      {showEditProfile && (
        <div className="modal-overlay" onClick={() => setShowEditProfile(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Edit Profile</h2>
            <form onSubmit={saveProfile}>
              <div className="form-group">
                <label className="form-label">Display Name</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  placeholder="+1234567890"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp Number</label>
                <input
                  type="tel"
                  placeholder="+1234567890"
                  value={editWhatsapp}
                  onChange={e => setEditWhatsapp(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block">Save</button>
            </form>
          </div>
        </div>
      )}

      {/* Add Schedule Modal */}
      {showAddSchedule && (
        <div className="modal-overlay" onClick={() => setShowAddSchedule(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Add Schedule</h2>
            <form onSubmit={addSchedule}>
              <div className="form-group">
                <label className="form-label">Days</label>
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
                  <label className="form-label">Start Time</label>
                  <input
                    type="time"
                    value={scheduleStart}
                    onChange={e => setScheduleStart(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">End Time</label>
                  <input
                    type="time"
                    value={scheduleEnd}
                    onChange={e => setScheduleEnd(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
                Add Schedule
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
