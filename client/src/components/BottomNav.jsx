import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Users, User } from 'lucide-react';

const tabs = [
  { path: '/', label: 'Home', icon: Home },
  { path: '/circles', label: 'Circles', icon: Users },
  { path: '/profile', label: 'Profile', icon: User },
];

export default function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

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
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
