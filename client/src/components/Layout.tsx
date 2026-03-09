import { Compass, FileText, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { clsx } from 'clsx';

const navItems = [
  { to: '/discover', label: 'DISCOVER', icon: Compass },
  { to: '/reports', label: 'REPORTS', icon: FileText },
  { to: '/settings', label: 'SETTINGS', icon: Settings },
];

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-panel-base">
      {/* Prismatic accent bar — top of viewport */}
      <div className="prism-bar shrink-0" />

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-border flex flex-col fixed top-[2px] bottom-0 left-0 z-30 bg-panel-base">
          <div className="flex items-center gap-2.5 px-5 py-5">
            <img src="/prism-logo.png" alt="Prism" className="h-7 w-7 object-contain" />
            <span className="text-sm font-semibold tracking-widest uppercase text-ink">Prism</span>
          </div>

          {/* Prismatic divider under logo */}
          <div className="mx-5 prism-bar rounded-full" />

          <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2 rounded text-xs font-medium tracking-wider transition-colors',
                    isActive
                      ? 'bg-accent-dim text-accent-bright'
                      : 'text-ink-muted hover:bg-panel-hover hover:text-ink-secondary',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="px-5 py-4 text-[10px] tracking-widest uppercase text-ink-faint">
            v3.0
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-auto ml-56">
          <div className="px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
