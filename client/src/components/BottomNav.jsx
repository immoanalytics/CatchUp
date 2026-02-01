import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, User } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const tabs = [
  { path: '/', labelKey: 'home', icon: Home },
  { path: '/circles', labelKey: 'circles', icon: Users },
  { path: '/profile', labelKey: 'profile', icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <nav className="bottom-nav">
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = location.pathname === tab.path;
        return (
          <button
            key={tab.path}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <Icon size={22} />
            <span>{t(tab.labelKey)}</span>
          </button>
        );
      })}
    </nav>
  );
}
