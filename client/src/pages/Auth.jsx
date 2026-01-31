import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Auth() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
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
        <h1 className="auth-title">CatchUp</h1>
        <p className="auth-subtitle">
          {isRegister ? 'Create your account' : 'Welcome back'}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="text"
              placeholder="Username"
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
                  placeholder="Display Name"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <input
                  type="tel"
                  placeholder="Phone Number (e.g. +1234567890)"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>
              <div className="form-group">
                <input
                  type="tel"
                  placeholder="WhatsApp Number (e.g. +1234567890)"
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="error-text">{error}</p>}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={submitting}
            style={{ marginTop: 8 }}
          >
            {submitting ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="auth-toggle">
          {isRegister ? 'Already have an account? ' : "Don't have an account? "}
          <button onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Sign In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}
