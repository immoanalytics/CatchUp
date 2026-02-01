import { Phone, MessageCircle, X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function CallSheet({ contact, onClose }) {
  const { t } = useLanguage();
  if (!contact) return null;

  function handlePhoneCall() {
    if (contact.phone) {
      window.location.href = `tel:${contact.phone}`;
    }
    onClose();
  }

  function handleWhatsApp() {
    if (contact.whatsapp) {
      const number = contact.whatsapp.replace(/[^0-9]/g, '');
      window.open(`https://wa.me/${number}`, '_blank');
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 className="modal-title" style={{ marginBottom: 0 }}>{t('call')} {contact.displayName}</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={24} />
          </button>
        </div>

        <div className="call-sheet">
          {contact.phone && (
            <button className="call-option" onClick={handlePhoneCall}>
              <div className="call-option-icon" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--accent-green)' }}>
                <Phone size={20} />
              </div>
              <div>
                <div>{t('phoneCall')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{contact.phone}</div>
              </div>
            </button>
          )}

          {contact.whatsapp && (
            <button className="call-option" onClick={handleWhatsApp}>
              <div className="call-option-icon" style={{ background: 'rgba(76,175,80,0.15)', color: '#25D366' }}>
                <MessageCircle size={20} />
              </div>
              <div>
                <div>{t('whatsapp')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{contact.whatsapp}</div>
              </div>
            </button>
          )}

          {!contact.phone && !contact.whatsapp && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
              {t('noContactMethods')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
