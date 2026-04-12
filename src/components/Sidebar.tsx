import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  Settings as SettingsIcon, 
  BarChart, 
  Calendar as CalendarIcon, 
  Target, 
  Lightbulb, 
  CheckSquare,
  Clock
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/calendar', label: 'Calendar', icon: CalendarIcon },
  { path: '/planner', label: 'Planner', icon: CalendarIcon },
  { path: '/subjects', label: 'Subjects', icon: BookOpen },
  { path: '/pyq-tracker', label: 'PYQ Tracker', icon: Target },
  { path: '/tests', label: 'Tests', icon: CheckSquare },
  { path: '/timer', label: 'Timer', icon: Clock },
  { path: '/analytics', label: 'Analytics', icon: BarChart },
  { path: '/notes', label: 'Notes', icon: Lightbulb },
  { path: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Sidebar() {
  return (
    <aside style={{ width: '250px', flexShrink: 0, borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--surface-color)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '2rem 1.5rem', fontWeight: 600, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
        GATE Tracker
      </div>
      
      <nav style={{ flex: 1, padding: '0 1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              backgroundColor: isActive ? 'var(--surface-active)' : 'transparent',
              fontWeight: isActive ? 500 : 400,
              transition: 'background-color var(--transition-fast), color var(--transition-fast)'
            })}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
