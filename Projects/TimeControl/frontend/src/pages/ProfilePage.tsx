import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Form,
  Input,
  Button,
  Avatar,
  Row,
  Col,
  Typography,
  Space,
  Divider,
  Switch,
  List,
  message,
} from 'antd';
import { UserOutlined, MailOutlined, PhoneOutlined, BankOutlined, BellOutlined } from '@ant-design/icons';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';

const { Title, Text } = Typography;

const ProfilePage: React.FC = () => {
  const { t } = useTranslation();
  const { user, checkAuth } = useAuthStore();
  const [profileForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [notifSettings, setNotifSettings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchNotifSettings = async () => {
      try {
        const data = await api.getNotificationSettings();
        setNotifSettings(data);
      } catch (error) {
        console.error('Failed to fetch notification settings');
      }
    };
    fetchNotifSettings();
  }, []);

  const handleNotifToggle = async (field: string, value: boolean) => {
    setNotifSettings(prev => ({ ...prev, [field]: value }));
    try {
      await api.updateNotificationSettings({ [field]: value });
    } catch (error) {
      setNotifSettings(prev => ({ ...prev, [field]: !value }));
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleProfileUpdate = async (values: any) => {
    setProfileLoading(true);
    try {
      await api.updateProfile(values);
      message.success(t('profile.updateSuccess'));
      await checkAuth();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordChange = async (values: any) => {
    if (values.new_password !== values.confirm_password) {
      message.error(t('errors.somethingWentWrong'));
      return;
    }

    setPasswordLoading(true);
    try {
      await api.changePassword(values.current_password, values.new_password);
      message.success(t('profile.passwordChangeSuccess'));
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div>
      <Title level={3}>{t('profile.title')}</Title>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card>
            <div style={{ textAlign: 'center' }}>
              <Avatar
                size={120}
                src={user?.profile?.avatar_url}
                icon={!user?.profile?.avatar_url && <UserOutlined />}
                style={{ marginBottom: 16 }}
              />
              <Title level={4} style={{ marginBottom: 4 }}>
                {user?.profile
                  ? `${user.profile.first_name} ${user.profile.last_name}`
                  : '-'}
              </Title>
              <Text type="secondary">{user?.profile?.position || '-'}</Text>
              <Divider />
              <Space direction="vertical" style={{ width: '100%', textAlign: 'left' }}>
                <div>
                  <MailOutlined style={{ marginRight: 8 }} />
                  {user?.email}
                </div>
                {user?.profile?.phone && (
                  <div>
                    <PhoneOutlined style={{ marginRight: 8 }} />
                    {user.profile.phone}
                  </div>
                )}
                {user?.profile?.bank_account && (
                  <div>
                    <BankOutlined style={{ marginRight: 8 }} />
                    {user.profile.bank_account}
                  </div>
                )}
              </Space>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          <Card title={t('profile.personalInfo')} style={{ marginBottom: 24 }}>
            <Form
              form={profileForm}
              layout="vertical"
              onFinish={handleProfileUpdate}
              initialValues={{
                first_name: user?.profile?.first_name,
                last_name: user?.profile?.last_name,
                phone: user?.profile?.phone,
                bank_account: user?.profile?.bank_account,
                position: user?.profile?.position,
              }}
            >
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="first_name"
                    label={t('admin.employees.firstName')}
                    rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="last_name"
                    label={t('admin.employees.lastName')}
                    rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item name="phone" label={t('admin.employees.phone')}>
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="position" label={t('admin.employees.position')}>
                    <Input disabled />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="bank_account" label={t('profile.bankAccount')}>
                <Input />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={profileLoading}>
                  {t('common.save')}
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card title={t('profile.changePassword')} style={{ marginBottom: 24 }}>
            <Form
              form={passwordForm}
              layout="vertical"
              onFinish={handlePasswordChange}
            >
              <Form.Item
                name="current_password"
                label={t('profile.currentPassword')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <Input.Password />
              </Form.Item>
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="new_password"
                    label={t('profile.newPassword')}
                    rules={[
                      { required: true, message: t('timeEntry.validation.required') },
                      { min: 6, message: t('timeEntry.validation.required') },
                    ]}
                  >
                    <Input.Password />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="confirm_password"
                    label={t('profile.confirmPassword')}
                    rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                  >
                    <Input.Password />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item style={{ marginBottom: 0 }}>
                <Button type="primary" htmlType="submit" loading={passwordLoading}>
                  {t('profile.changePassword')}
                </Button>
              </Form.Item>
            </Form>
          </Card>

          <Card
            title={
              <Space>
                <BellOutlined />
                {t('profile.emailNotifications')}
              </Space>
            }
          >
            <List>
              <List.Item
                actions={[
                  <Switch
                    checked={notifSettings.email_missing_entry ?? true}
                    onChange={(v) => handleNotifToggle('email_missing_entry', v)}
                  />
                ]}
              >
                <List.Item.Meta title={t('profile.notifyMissingEntries')} />
              </List.Item>
              <List.Item
                actions={[
                  <Switch
                    checked={notifSettings.email_weekly_reminder ?? true}
                    onChange={(v) => handleNotifToggle('email_weekly_reminder', v)}
                  />
                ]}
              >
                <List.Item.Meta title={t('profile.notifyWeeklyReminder')} />
              </List.Item>
              <List.Item
                actions={[
                  <Switch
                    checked={notifSettings.email_birthday ?? true}
                    onChange={(v) => handleNotifToggle('email_birthday', v)}
                  />
                ]}
              >
                <List.Item.Meta title={t('profile.notifyBirthdays')} />
              </List.Item>
              <List.Item
                actions={[
                  <Switch
                    checked={notifSettings.email_name_day ?? true}
                    onChange={(v) => handleNotifToggle('email_name_day', v)}
                  />
                ]}
              >
                <List.Item.Meta title={t('profile.notifyNameDays')} />
              </List.Item>
            </List>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProfilePage;
