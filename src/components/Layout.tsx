import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, BarChart2, Layers, BookOpen, Scale } from 'lucide-react';
import { useUserStore } from '@/store/userStore';
import './Layout.css';

// v1.7 — labels resolved via i18n at render time (labelKey → t()).
const NAV_ITEMS = [
  { to: '/today',    icon: Calendar,  labelKey: 'nav.today'    },
  { to: '/program',  icon: Layers,    labelKey: 'nav.program'  },
  { to: '/library',  icon: BookOpen,  labelKey: 'nav.library'  },
  { to: '/progress', icon: BarChart2, labelKey: 'nav.progress' },
  // v1.3 BUG-19 — body metrics promoted from a ProgressPage tab to its own
  // first-class destination (LimeLog is the sole owner after NCC's cut).
  { to: '/body',     icon: Scale,     labelKey: 'nav.body'     },
  // v1.4.1 — Profile/Settings moved off the bottom bar to the top-right avatar
  // (matches NCC + StudyDesk). The /profile route still exists.
] as const;

// Initials for the top-right avatar, derived from the local profile name.
function profileInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Layout() {
  const { t } = useTranslation();
  const name = useUserStore((s) => s.profile.name);
  return (
    <div className="app-shell">
      <header className="app-topbar">
        <NavLink
          to="/profile"
          className={({ isActive }) => `app-avatar${isActive ? ' app-avatar--active' : ''}`}
          aria-label={t('nav.profileSettings')}
          title={t('nav.profileSettings')}
        >
          {profileInitials(name)}
        </NavLink>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="app-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, labelKey }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-item__label">{t(labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
