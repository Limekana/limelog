import { cn } from '@/utils/helpers';
import type { ButtonHTMLAttributes } from 'react';

interface BadgeProps {
  label: string;
  variant?: 'accent' | 'danger' | 'warning' | 'success' | 'info' | 'muted';
  size?: 'sm' | 'md';
}

export function Badge({ label, variant = 'muted', size = 'sm' }: BadgeProps) {
  const variantStyles: Record<string, string> = {
    accent: 'badge--accent',
    danger: 'badge--danger',
    warning: 'badge--warning',
    success: 'badge--success',
    info: 'badge--info',
    muted: 'badge--muted',
  };
  return (
    <span className={cn('badge', variantStyles[variant], size === 'md' && 'badge--md')}>
      {label}
    </span>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        fullWidth && 'btn--full',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md';
}

export function Card({ children, className, onClick, padding = 'md' }: CardProps) {
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  }
  return (
    <div
      className={cn('card', `card--p-${padding}`, onClick && 'card--clickable', className)}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon">{icon}</div>}
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

interface TabItem {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeKey, onChange, className }: TabsProps) {
  return (
    <div role="tablist" className={cn('tabs', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          id={`tab-${tab.key}`}
          role="tab"
          aria-selected={activeKey === tab.key}
          aria-controls={`tabpanel-${tab.key}`}
          className={cn('tab', activeKey === tab.key && 'tab--active')}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}{tab.count !== undefined ? ` (${tab.count})` : ''}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps {
  tabKey: string;
  activeKey: string;
  children: React.ReactNode;
}

export function TabPanel({ tabKey, activeKey, children }: TabPanelProps) {
  if (tabKey !== activeKey) return null;
  return (
    <div
      className="tab-panel"
      role="tabpanel"
      id={`tabpanel-${tabKey}`}
      aria-labelledby={`tab-${tabKey}`}
    >
      {children}
    </div>
  );
}
