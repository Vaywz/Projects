import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Button,
  Space,
  Typography,
  theme,
} from 'antd';
import {
  DashboardOutlined,
  CalendarOutlined,
  BarChartOutlined,
  TeamOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  HomeOutlined,
  FileTextOutlined,
  MoonOutlined,
  SunOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useThemeStore } from '../../store/themeStore';
import LanguageSelector from '../LanguageSelector';
import NotificationBell from '../NotificationBell';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuthStore();
  const { settings, fetchSettings } = useSettingsStore();
  const { mode, toggleMode } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const isDark = mode === 'dark';
  const { token } = theme.useToken();

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const isAdmin = user?.role === 'admin';

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: t('nav.dashboard'),
    },
    {
      key: '/calendar',
      icon: <CalendarOutlined />,
      label: t('nav.calendar'),
    },
    {
      key: '/stats',
      icon: <BarChartOutlined />,
      label: t('nav.statistics'),
    },
    {
      key: '/office',
      icon: <HomeOutlined />,
      label: t('nav.office'),
    },
    ...(isAdmin
      ? [
          {
            type: 'divider' as const,
          },
          {
            key: 'admin-group',
            icon: <SettingOutlined />,
            label: t('nav.admin'),
            children: [
              {
                key: '/admin',
                icon: <DashboardOutlined />,
                label: t('nav.dashboard'),
              },
              {
                key: '/admin/employees',
                icon: <TeamOutlined />,
                label: t('nav.employees'),
              },
              {
                key: '/admin/stats',
                icon: <BarChartOutlined />,
                label: t('nav.statistics'),
              },
              {
                key: '/admin/daily',
                icon: <CalendarOutlined />,
                label: t('admin.daily.title'),
              },
              {
                key: '/admin/calendar',
                icon: <CalendarOutlined />,
                label: t('admin.calendar.title'),
              },
              {
                key: '/admin/change-requests',
                icon: <FileTextOutlined />,
                label: t('changeRequest.title'),
              },
              {
                key: '/admin/settings',
                icon: <SettingOutlined />,
                label: t('admin.settings.title'),
              },
            ],
          },
        ]
      : []),
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: t('nav.profile'),
      onClick: () => navigate('/profile'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: t('auth.logout'),
      onClick: () => {
        logout();
        navigate('/login');
      },
    },
  ];

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/admin/employees')) return '/admin/employees';
    if (path.startsWith('/admin/stats')) return '/admin/stats';
    if (path.startsWith('/admin/daily')) return '/admin/daily';
    if (path.startsWith('/admin/calendar')) return '/admin/calendar';
    if (path.startsWith('/admin/change-requests')) return '/admin/change-requests';
    if (path.startsWith('/admin/settings')) return '/admin/settings';
    if (path.startsWith('/admin')) return '/admin';
    return path;
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme={isDark ? 'dark' : 'light'}
        style={{
          boxShadow: '2px 0 8px rgba(0, 0, 0, 0.1)',
          background: token.colorBgContainer,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '8px',
          }}
        >
          <img
            src={settings.logo_url || "/logo.svg"}
            alt="Company Logo"
            style={{
              height: collapsed ? 32 : 48,
              width: 'auto',
              transition: 'height 0.2s'
            }}
          />
        </div>
        <Menu
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.1)',
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16, width: 64, height: 64 }}
          />
          <Space>
            <Button
              type="text"
              icon={isDark ? <SunOutlined /> : <MoonOutlined />}
              onClick={toggleMode}
              style={{ fontSize: 16 }}
            />
            <NotificationBell />
            <LanguageSelector />
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar
                  src={user?.profile?.avatar_url}
                  icon={!user?.profile?.avatar_url && <UserOutlined />}
                />
                <Text>
                  {user?.profile
                    ? `${user.profile.first_name} ${user.profile.last_name}`
                    : user?.email}
                </Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content
          style={{
            margin: 24,
            padding: 24,
            background: token.colorBgContainer,
            borderRadius: 8,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
