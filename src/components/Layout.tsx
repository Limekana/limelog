import { Outlet, NavLink } from 'react-router-dom';
import { Calendar, BarChart2, Layers, User, BookOpen, Scale } from 'lucide-react';
import './Layout.css';

const NAV_ITEMS = [
  { to: '/today',    icon: Calendar,  label: 'Today'    },
  { to: '/program',  icon: Layers,    label: 'Program'  },
  { to: '/library',  icon: BookOpen,  label: 'Library'  },
  { to: '/progress', icon: BarChart2, label: 'Progress' },
  // v1.3 BUG-19 — body metrics promoted from a ProgressPage tab to its own
  // first-class destination (LimeLog is the sole owner after NCC's cut).
  { to: '/body',     icon: Scale,     label: 'Body'     },
  { to: '/profile',  icon: User,      label: 'Profile'  },
] as const;

export function Layout() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="app-nav">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="nav-item__label">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
