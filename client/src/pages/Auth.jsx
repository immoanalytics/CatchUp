import { useState } from 'react';
import { Eye, EyeOff, Copy, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Auth() {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState('login'); // 'login', 'register', 'forgot'
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      if (mode === 'register') {
        await register(username, displayName || username, password, phone, whatsapp);
      } else if (mode === 'login') {
        await login(username, password);
      } else if (mode === 'forgot') {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, phone, newPassword })
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to reset password');
        }
        setSuccess(t('passwordResetSuccess'));
        setTimeout(() => {
          setMode('login');
          setSuccess('');
          setNewPassword('');
        }, 2000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError('');
    setSuccess('');
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        {mode === 'forgot' && (
          <button
            onClick={() => switchMode('login')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: 'var(--text-muted)',
              marginBottom: 16,
              fontSize: 14
            }}
          >
            <ArrowLeft size={18} />
            {t('backToLogin')}
          </button>
        )}

        <h1 className="auth-title">{t('appName')}</h1>
        <p className="auth-subtitle">
          {mode === 'register' ? t('createYourAccount') :
           mode === 'forgot' ? t('resetYourPassword') :
           t('welcomeBack')}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              placeholder={t('username')}
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>

          {mode === 'register' && (
            <>
              <div className="form-group">
                <input
                  type="text"
                  placeholder={t('displayName')}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <input
                  type="tel"
                  placeholder={`${t('phoneNumber')} (${t('phonePlaceholder')})`}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <input
                  type="tel"
                  placeholder={`${t('whatsappNumber')} (${t('phonePlaceholder')})`}
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  style={{ paddingRight: phone ? 130 : undefined }}
                />
                {phone && (
                  <button
                    type="button"
                    onClick={() => setWhatsapp(phone)}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      color: 'var(--accent-blue)', padding: '4px 8px', fontSize: 12, fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <Copy size={12} />
                    {t('sameAsPhone')}
                  </button>
                )}
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <div className="form-group">
              <input
                type="tel"
                placeholder={t('phoneNumber')}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
              />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {t('enterPhoneToVerify')}
              </p>
            </div>
          )}

          <div className="form-group" style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={mode === 'forgot' ? t('newPassword') : t('password')}
              value={mode === 'forgot' ? newPassword : password}
              onChange={e => mode === 'forgot' ? setNewPassword(e.target.value) : setPassword(e.target.value)}
              required
              style={{ paddingRight: 44 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', padding: 4 }}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>

          {error && <p className="error-text">{error}</p>}
          {success && <p style={{ color: 'var(--accent-green)', fontSize: 13, marginTop: 8 }}>{success}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
            style={{ marginTop: 8 }}
          >
            {submitting ? t('pleaseWait') :
             mode === 'register' ? t('createAccount') :
             mode === 'forgot' ? t('resetPassword') :
             t('signIn')}
          </button>
        </form>

        {mode === 'login' && (
          <button
            onClick={() => switchMode('forgot')}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'center',
              marginTop: 12,
              color: 'var(--accent-blue)',
              fontSize: 14
            }}
          >
            {t('forgotPassword')}
          </button>
        )}

        {mode !== 'forgot' && (
          <div className="auth-toggle">
            {mode === 'register' ? t('alreadyHaveAccount') : t('dontHaveAccount')}
            <button onClick={() => switchMode(mode === 'register' ? 'login' : 'register')}>
              {mode === 'register' ? t('signIn') : t('signUp')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
