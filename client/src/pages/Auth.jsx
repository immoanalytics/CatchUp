import { useState } from 'react';
import { Eye, EyeOff, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

export default function Auth() {
  const { login, register } = useAuth();
  const { t } = useLanguage();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isRegister) {
        await register(username, displayName || username, password, phone, whatsapp);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t('appName')}</h1>
        <p className="auth-subtitle">
          {isRegister ? t('createYourAccount') : t('welcomeBack')}
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

          {isRegister && (
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

          <div className="form-group" style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder={t('password')}
              value={password}
              onChange={e => setPassword(e.target.value)}
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

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
            style={{ marginTop: 8 }}
          >
            {submitting ? t('pleaseWait') : isRegister ? t('createAccount') : t('signIn')}
          </button>
        </form>

        <div className="auth-toggle">
          {isRegister ? t('alreadyHaveAccount') : t('dontHaveAccount')}
          <button onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? t('signIn') : t('signUp')}
          </button>
        </div>
      </div>
    </div>
  );
}
