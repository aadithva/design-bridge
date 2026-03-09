import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { SettingsProvider, useSettings } from './lib/SettingsContext';
import { DiscoverProvider } from './lib/DiscoverContext';
import { Layout } from './components/Layout';
import { RequireSettings } from './components/RequireSettings';
import { OnboardingPage } from './pages/OnboardingPage';
import { DiscoverPage } from './pages/DiscoverPage';
import { AnalysisReportPage } from './pages/AnalysisReportPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReviewPage } from './pages/ReviewPage';
import './index.css';

function RootRedirect() {
  const { isConfigured } = useSettings();
  return <Navigate to={isConfigured ? '/discover' : '/onboarding'} replace />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <DiscoverProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<Layout />}>
            <Route element={<RequireSettings />}>
              <Route path="/discover" element={<DiscoverPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/analysis/:id" element={<AnalysisReportPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      </DiscoverProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
