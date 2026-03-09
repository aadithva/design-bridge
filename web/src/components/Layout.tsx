import { Layers, Compass, FileText, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { clsx } from 'clsx';

const navItems = [
  { to: '/discover', label: 'Discover', icon: Compass },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {
  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 bg-white shadow-soft flex flex-col fixed inset-y-0 left-0 z-30">
        <div className="flex items-center gap-2.5 px-6 py-6">
          <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Layers className="h-4.5 w-4.5 text-white" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">Design Bridge</span>
        </div>
        <nav className="flex flex-col gap-1 px-3 py-2 flex-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-6 py-5 text-xs text-slate-300">
          Design Bridge v2
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto ml-60">
        <div className="px-10 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
