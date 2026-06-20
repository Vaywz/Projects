import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Badge, Dropdown, List, Typography, Button, Empty, Spin, theme } from 'antd';
import { BellOutlined, CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import api from '../services/api';
import { Notification } from '../types';
import DynamicIcon from './DynamicIcon';
import { useResponsive } from '../hooks/useResponsive';

dayjs.extend(relativeTime);

const { Text } = Typography;

const NotificationBell: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const { isMobile } = useResponsive();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const [notifs, countData] = await Promise.all([
        api.getNotifications(false, 10),
        api.getUnreadNotificationCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(countData.count);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll for new notifications every 60 seconds
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id: number) => {
    try {
      await api.markNotificationAsRead(id);
      setNotifications(notifications.map(n =>
        n.id === id ? { ...n, is_read: true } : n
      ));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.markAllNotificationsAsRead();
      setNotifications(notifications.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'birthday':
        return <DynamicIcon name="Gift" size={16} />;
      case 'name_day':
        return <DynamicIcon name="Cake" size={16} />;
      case 'change_request':
        return <DynamicIcon name="FileEdit" size={16} />;
      case 'weekly_reminder':
        return <DynamicIcon name="Calendar" size={16} />;
      case 'missing_entry':
        return <DynamicIcon name="AlertCircle" size={16} />;
      case 'overtime_warning':
        return <DynamicIcon name="Clock" size={16} />;
      default:
        return <DynamicIcon name="Bell" size={16} />;
    }
  };

  const getTranslatedNotification = (notification: Notification) => {
    let title = notification.title;
    let notificationMessage = notification.message;

    // Handle change_request notifications with JSON message
    if (notification.type === 'change_request' && notification.title.startsWith('notification.')) {
      try {
        const data = JSON.parse(notification.message);
        title = t('notification.changeRequest.title');
        const requestTypeKey = `changeRequest.${data.request_type}`;
        const translatedType = t(requestTypeKey);
        notificationMessage = t('notification.changeRequest.message', {
          name: data.employee_name,
          type: translatedType !== requestTypeKey ? translatedType : data.request_type
        });
      } catch {
        // If parsing fails, use original values
      }
    }

    // Handle missing_entry notifications with JSON message
    if (notification.type === 'missing_entry' && notification.title.startsWith('notification.')) {
      try {
        const data = JSON.parse(notification.message);
        title = t('notification.missingEntry.title');
        notificationMessage = t('notification.missingEntry.message', {
          dates: data.dates,
          count: data.count
        });
      } catch {
        // If parsing fails, use original values
      }
    }

    // Handle birthday notifications with JSON message
    if (notification.type === 'birthday' && notification.title.startsWith('notification.')) {
      try {
        const data = JSON.parse(notification.message);
        if (notification.title === 'notification.birthday.todayTitle') {
          title = t('notification.birthday.todayTitle');
          notificationMessage = t('notification.birthday.todayMessage', { name: data.name });
        } else {
          title = t('notification.birthday.upcomingTitle');
          notificationMessage = t('notification.birthday.upcomingMessage', { name: data.name, date: data.date });
        }
      } catch {
        // If parsing fails, use original values
      }
    }

    // Handle overtime_warning notifications with JSON message
    if (notification.type === 'overtime_warning' && notification.title.startsWith('notification.')) {
      try {
        const data = JSON.parse(notification.message);
        if (data.warning_type === 'weekly') {
          title = t('notification.overtime.weeklyTitle');
          notificationMessage = t('notification.overtime.weeklyMessage', {
            employee_name: data.employee_name,
            current_hours: data.current_hours,
            limit_hours: data.limit_hours,
            projected_hours: data.projected_hours
          });
        } else {
          title = t('notification.overtime.monthlyTitle');
          notificationMessage = t('notification.overtime.monthlyMessage', {
            employee_name: data.employee_name,
            current_hours: data.current_hours,
            limit_hours: data.limit_hours,
            projected_hours: data.projected_hours
          });
        }
      } catch {
        // If parsing fails, use original values
      }
    }

    return { title, message: notificationMessage };
  };

  const dropdownContent = (
    <div style={{
      width: isMobile ? 'calc(100vw - 32px)' : 360,
      maxHeight: 400,
      overflow: 'auto',
      backgroundColor: token.colorBgContainer,
      borderRadius: 8,
      boxShadow: token.boxShadowSecondary
    }}>
      <div style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${token.colorBorderSecondary}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Text strong>{t('settings.notifications')}</Text>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            onClick={handleMarkAllAsRead}
            icon={<CheckOutlined />}
          >
            {t('common.all')}
          </Button>
        )}
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <Empty
          description={t('common.noData')}
          style={{ padding: 40 }}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(notification) => {
            const { title, message } = getTranslatedNotification(notification);
            return (
              <List.Item
                style={{
                  padding: '12px 16px',
                  backgroundColor: notification.is_read ? 'transparent' : token.colorSuccessBg,
                  cursor: 'pointer'
                }}
                onClick={() => {
                  if (!notification.is_read) {
                    handleMarkAsRead(notification.id);
                  }
                  // Navigate based on notification type
                  if (notification.type === 'change_request' || notification.type === 'overtime_warning') {
                    setOpen(false);
                    navigate('/admin/change-requests');
                  } else if (notification.type === 'missing_entry' || notification.type === 'weekly_reminder') {
                    setOpen(false);
                    navigate('/calendar');
                  } else if (notification.type === 'birthday' || notification.type === 'name_day') {
                    setOpen(false);
                    navigate('/admin/employees');
                  }
                }}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      backgroundColor: token.colorFillSecondary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {getNotificationIcon(notification.type)}
                    </div>
                  }
                  title={<Text strong={!notification.is_read}>{title}</Text>}
                  description={
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {message}
                      </Text>
                      <br />
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {dayjs(notification.created_at).fromNow()}
                      </Text>
                    </>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );

  return (
    <Dropdown
      dropdownRender={() => dropdownContent}
      trigger={['click']}
      open={open}
      onOpenChange={(visible) => {
        setOpen(visible);
        if (visible) {
          fetchNotifications();
        }
      }}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" offset={[-2, 2]}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18 }} />}
          style={{ padding: '4px 8px' }}
        />
      </Badge>
    </Dropdown>
  );
};

export default NotificationBell;