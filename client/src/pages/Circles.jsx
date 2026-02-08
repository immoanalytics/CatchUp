import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Heart, Briefcase, Users, ChevronRight, X, UserPlus, Trash2, BookUser, Upload, Bell, BellOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

const iconMap = {
  heart: Heart,
  briefcase: Briefcase,
  users: Users,
};

const colorMap = {
  '#4CAF50': 'var(--accent-green)',
  '#FF9800': 'var(--accent-orange)',
  '#E91E63': 'var(--accent-red)',
  '#6C63FF': 'var(--accent-blue)',
  '#00BCD4': 'var(--accent-cyan)',
};

export default function Circles() {
  const { apiFetch } = useAuth();
  const { t } = useLanguage();
  const [circles, setCircles] = useState([]);
  const [selectedCircle, setSelectedCircle] = useState(null);
  const [members, setMembers] = useState([]);
  const [showAddCircle, setShowAddCircle] = useState(false);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [newCircleName, setNewCircleName] = useState('');
  const [newCircleIcon, setNewCircleIcon] = useState('users');
  const [newCircleColor, setNewCircleColor] = useState('#6C63FF');
  const [friendUsername, setFriendUsername] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [error, setError] = useState('');
  const [contactMatches, setContactMatches] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [savedPhones, setSavedPhones] = useState([]);
  const vcfInputRef = useRef(null);
  const hasContactPicker = typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

  const fetchCircles = useCallback(async () => {
    try {
      const res = await apiFetch('/circles');
      if (res.ok) setCircles(await res.json());
    } catch (err) {
      console.error(err);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchCircles();
  }, [fetchCircles]);

  async function openCircle(circle) {
    setSelectedCircle(circle);
    try {
      const res = await apiFetch(`/circles/${circle.id}/members`);
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function createCircle(e) {
    e.preventDefault();
    if (!newCircleName.trim()) return;
    try {
      const res = await apiFetch('/circles', {
        method: 'POST',
        body: JSON.stringify({ name: newCircleName, icon: newCircleIcon, color: newCircleColor })
      });
      if (res.ok) {
        setShowAddCircle(false);
        setNewCircleName('');
        fetchCircles();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteCircle(circleId) {
    try {
      await apiFetch(`/circles/${circleId}`, { method: 'DELETE' });
      setSelectedCircle(null);
      fetchCircles();
    } catch (err) {
      console.error(err);
    }
  }

  async function searchUsers(q) {
    setFriendUsername(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await apiFetch(`/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setSearchResults(await res.json());
    } catch (err) {
      console.error(err);
    }
  }

  async function addFriend(user) {
    setError('');
    try {
      const res = await apiFetch('/friends/add', {
        method: 'POST',
        body: JSON.stringify({
          username: user.username,
          circleIds: selectedCircle ? [selectedCircle.id] : []
        })
      });
      if (res.ok) {
        setShowAddFriend(false);
        setFriendUsername('');
        setSearchResults([]);
        if (selectedCircle) openCircle(selectedCircle);
        fetchCircles();
      } else {
        const data = await res.json();
        // If already friends, just add to circle
        if (data.error === 'Already friends' && selectedCircle) {
          await apiFetch(`/friends/${user.id}/circles`, {
            method: 'POST',
            body: JSON.stringify({ circleId: selectedCircle.id })
          });
          setShowAddFriend(false);
          setFriendUsername('');
          setSearchResults([]);
          openCircle(selectedCircle);
          fetchCircles();
        } else {
          setError(data.error);
        }
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function lookupPhones(phones, save) {
    setLoadingContacts(true);
    setError('');
    if (save) setSavedPhones(prev => [...new Set([...prev, ...phones])]);
    try {
      const res = await apiFetch('/users/lookup', {
        method: 'POST',
        body: JSON.stringify({ phones })
      });
      if (res.ok) {
        const matches = await res.json();
        setContactMatches(matches);
        if (matches.length === 0) setError(t('noCatchUpUser'));
      }
    } catch (err) {
      setError(err.message);
    }
    setLoadingContacts(false);
  }

  async function refreshSavedContacts() {
    if (savedPhones.length > 0) {
      await lookupPhones(savedPhones, false);
    }
  }

  async function findFromContacts() {
    if (!hasContactPicker) return;
    try {
      const contacts = await navigator.contacts.select(['tel'], { multiple: true });
      const phones = contacts.flatMap(c => c.tel || []).map(p => p.replace(/\D/g, '')).filter(p => p.length >= 6);
      if (phones.length === 0) {
        setError(t('noCatchUpUser'));
        return;
      }
      await lookupPhones(phones, true);
    } catch (err) {
      if (err.name !== 'TypeError' && err.message) setError(err.message);
    }
  }

  function handleVcfImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target.result;
      const phoneRegex = /TEL[^:]*:([\d\s+\-().]+)/gi;
      const phones = [];
      let match;
      while ((match = phoneRegex.exec(text)) !== null) {
        const cleaned = match[1].replace(/\D/g, '');
        if (cleaned.length >= 6) phones.push(cleaned);
      }
      if (phones.length === 0) {
        setError(t('noCatchUpUser'));
        return;
      }
      await lookupPhones([...new Set(phones)], true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function lookupByPhone() {
    const phone = prompt(t('enterPhoneToLookup'));
    if (!phone) return;
    await lookupPhones([phone], false);
  }

  async function removeMemberFromCircle(memberId) {
    if (!selectedCircle) return;
    try {
      await apiFetch(`/friends/${memberId}/circles/${selectedCircle.id}`, { method: 'DELETE' });
      openCircle(selectedCircle);
      fetchCircles();
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleWatching(memberId, currentlyWatching) {
    try {
      await apiFetch(`/friends/${memberId}/watching`, {
        method: 'PUT',
        body: JSON.stringify({ watching: !currentlyWatching })
      });
      // Update local state
      setMembers(prev => prev.map(m =>
        m.id === memberId ? { ...m, watching: !currentlyWatching } : m
      ));
    } catch (err) {
      console.error(err);
    }
  }

  function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  // Circle detail view
  if (selectedCircle) {
    return (
      <div className="page-content">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelectedCircle(null)} style={{ color: 'var(--text-muted)' }}>
            <ChevronRight size={24} style={{ transform: 'rotate(180deg)' }} />
          </button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{selectedCircle.name}</h1>
        </div>

        <div className="section-header">
          <span className="section-title">{t('members')}</span>
          <button style={{ color: 'var(--accent-blue)', fontSize: 14, fontWeight: 500 }} onClick={() => { setShowAddFriend(true); refreshSavedContacts(); }}>
            {t('add')}
          </button>
        </div>

        {members.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <p>{t('noMembersYet')}</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>{t('addFriendsToCircle')}</p>
          </div>
        )}

        {members.map(m => (
          <div key={m.id} className="contact-card">
            {m.photo ? (
              <img src={m.photo} alt={m.displayName} className="avatar" style={{ objectFit: 'cover' }} />
            ) : (
              <div className="avatar" style={{ backgroundColor: m.avatarColor || '#6C63FF' }}>
                {getInitials(m.displayName)}
              </div>
            )}
            <div className="contact-info">
              <div className="contact-name">{m.displayName}</div>
              {m.isAvailable && (!m.availableUntil || new Date(m.availableUntil).getTime() > Date.now()) && (
                <div className="contact-status">
                  <span className="status-dot" />
                  {t('availableNow')}
                </div>
              )}
            </div>
            <button
              onClick={() => toggleWatching(m.id, m.watching)}
              style={{ color: m.watching ? 'var(--accent-green)' : 'var(--text-muted)', padding: 8 }}
              title={m.watching ? t('watchingOn') : t('watchingOff')}
            >
              {m.watching ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
            <button onClick={() => removeMemberFromCircle(m.id)} style={{ color: 'var(--text-muted)', padding: 8 }}>
              <X size={18} />
            </button>
          </div>
        ))}

        <div style={{ marginTop: 24 }}>
          <button className="btn btn-danger btn-block" onClick={() => deleteCircle(selectedCircle.id)}>
            <Trash2 size={16} style={{ marginRight: 8 }} />
            {t('deleteCircle')}
          </button>
        </div>

        {showAddFriend && (
          <div className="modal-overlay modal-top" onClick={() => { setShowAddFriend(false); setContactMatches([]); }}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <h2 className="modal-title">{t('addFriendTo')} {selectedCircle.name}</h2>
              <div className="form-group">
                <input
                  type="text"
                  placeholder={t('searchPlaceholder')}
                  value={friendUsername}
                  onChange={e => searchUsers(e.target.value)}
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {hasContactPicker && (
                  <button
                    className="btn btn-block"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={findFromContacts}
                    disabled={loadingContacts}
                  >
                    <BookUser size={18} />
                    {loadingContacts ? t('checking') : t('findFromContacts')}
                  </button>
                )}
                <button
                  className="btn btn-block"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => vcfInputRef.current?.click()}
                  disabled={loadingContacts}
                >
                  <Upload size={18} />
                  {t('importContacts')}
                </button>
                <button
                  className="btn btn-block"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={lookupByPhone}
                  disabled={loadingContacts}
                >
                  <BookUser size={18} />
                  {t('lookUpByPhone')}
                </button>
                <input
                  ref={vcfInputRef}
                  type="file"
                  accept=".vcf,text/vcard"
                  style={{ display: 'none' }}
                  onChange={handleVcfImport}
                />
              </div>
              {error && <p className="error-text">{error}</p>}
              {contactMatches.length > 0 && searchResults.length === 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span className="section-title" style={{ fontSize: 13 }}>{t('fromYourContacts')}</span>
                </div>
              )}
              {(searchResults.length > 0 ? searchResults : contactMatches).map(u => (
                <div key={u.id} className="contact-card" style={{ cursor: 'pointer' }} onClick={() => addFriend(u)}>
                  {u.photo ? (
                    <img src={u.photo} alt={u.displayName} className="avatar" style={{ objectFit: 'cover' }} />
                  ) : (
                    <div className="avatar" style={{ backgroundColor: u.avatarColor }}>
                      {getInitials(u.displayName)}
                    </div>
                  )}
                  <div className="contact-info">
                    <div className="contact-name">{u.displayName}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>@{u.username}</div>
                  </div>
                  <UserPlus size={20} color="var(--accent-blue)" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Circles list view
  return (
    <div className="page-content">
      <h1 className="page-title">{t('circles')}</h1>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{t('yourCircles')}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('tapToManageMembers')}</p>
      </div>

      {circles.map(circle => {
        const IconComponent = iconMap[circle.icon] || Users;
        return (
          <div key={circle.id} className="circle-row" onClick={() => openCircle(circle)}>
            <div className="circle-icon" style={{ background: `${circle.color}22` }}>
              <IconComponent size={22} color={circle.color} />
            </div>
            <div className="circle-details">
              <div className="circle-name">{circle.name}</div>
              <div className="circle-count">{circle.memberCount} {circle.memberCount !== 1 ? t('membersPlural') : t('member')}</div>
            </div>
            <ChevronRight size={20} className="chevron" />
          </div>
        );
      })}

      <button className="fab" onClick={() => setShowAddCircle(true)}>
        <Plus size={24} />
      </button>

      {showAddCircle && (
        <div className="modal-overlay" onClick={() => setShowAddCircle(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{t('newCircle')}</h2>
            <form onSubmit={createCircle}>
              <div className="form-group">
                <label className="form-label">{t('circleName')}</label>
                <input
                  type="text"
                  placeholder={t('circleNamePlaceholder')}
                  value={newCircleName}
                  onChange={e => setNewCircleName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{t('icon')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(iconMap).map(([key, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      className={`day-btn ${newCircleIcon === key ? 'selected' : ''}`}
                      onClick={() => setNewCircleIcon(key)}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{t('color')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['#4CAF50', '#FF9800', '#E91E63', '#6C63FF', '#00BCD4'].map(color => (
                    <button
                      key={color}
                      type="button"
                      style={{
                        width: 36, height: 36, borderRadius: '50%', background: color,
                        border: newCircleColor === color ? '3px solid white' : '3px solid transparent'
                      }}
                      onClick={() => setNewCircleColor(color)}
                    />
                  ))}
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: 8 }}>
                {t('createCircle')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
