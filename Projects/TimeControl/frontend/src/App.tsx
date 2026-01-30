import React, { useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp, Spin, theme } from 'antd';
import { useTranslation } from 'react-i18next';
import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';
import lvLV from 'antd/locale/lv_LV';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ru';
import 'dayjs/locale/lv';

import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import MainLayout from './components/Layout/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CalendarPage from './pages/CalendarPage';
import StatsPage from './pages/StatsPage';
import OfficePage from './pages/OfficePage';
import ProfilePage from './pages/ProfilePage';
import AdminDashboard from './pages/admin/AdminDashboard';
import EmployeesPage from './pages/admin/EmployeesPage';
import AdminStatsPage from './pages/admin/AdminStatsPage';
import DailyOverviewPage from './pages/admin/DailyOverviewPage';
import AdminCalendarPage from './pages/admin/AdminCalendarPage';
import SettingsPage from './pages/admin/SettingsPage';
import ChangeRequestsPage from './pages/admin/ChangeRequestsPage';

const antdLocales: Record<string, typeof enUS> = {
  en: enUS,
  ru: ruRU,
  lv: lvLV,
};

// Helper to normalize language code (e.g., 'en-US' -> 'en')
const normalizeLanguage = (lang: string): string => {
  const baseLang = lang.split('-')[0].toLowerCase();
  return ['en', 'ru', 'lv'].includes(baseLang) ? baseLang : 'lv';
};

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/" />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  const { checkAuth, isLoading } = useAuthStore();
  const { mode } = useThemeStore();
  const { i18n } = useTranslation();
  const [currentLang, setCurrentLang] = useState(() => normalizeLanguage(i18n.language || 'lv'));

  // Listen for language changes and update state
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      const normalized = normalizeLanguage(lng);
      setCurrentLang(normalized);
      dayjs.locale(normalized);
    };

    // Set initial dayjs locale
    dayjs.locale(currentLang);

    // Listen to i18n language change events
    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n, currentLang]);

  const currentLocale = useMemo(() => {
    return antdLocales[currentLang] || lvLV;
  }, [currentLang]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <ConfigProvider
      locale={currentLocale}
      theme={{
        algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#279CF1',
          borderRadius: 6,
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <PrivateRoute>
                  <MainLayout />
                </PrivateRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="stats" element={<StatsPage />} />
              <Route path="office" element={<OfficePage />} />
              <Route path="profile" element={<ProfilePage />} />

              {/* Redirect /change-requests to calendar (change requests are handled via modal) */}
              <Route path="change-requests" element={<Navigate to="/calendar" replace />} />

              {/* Admin routes */}
              <Route
                path="admin"
                element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/employees"
                element={
                  <AdminRoute>
                    <EmployeesPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/stats"
                element={
                  <AdminRoute>
                    <AdminStatsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/daily"
                element={
                  <AdminRoute>
                    <DailyOverviewPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/calendar"
                element={
                  <AdminRoute>
                    <AdminCalendarPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/settings"
                element={
                  <AdminRoute>
                    <SettingsPage />
                  </AdminRoute>
                }
              />
              <Route
                path="admin/change-requests"
                element={
                  <AdminRoute>
                    <ChangeRequestsPage />
                  </AdminRoute>
                }
              />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;