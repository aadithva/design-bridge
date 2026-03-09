import { Navigate, Outlet } from 'react-router';
import { useSettings } from '../lib/SettingsContext';

export function RequireSettings() {
  const { isConfigured } = useSettings();
  if (!isConfigured) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
