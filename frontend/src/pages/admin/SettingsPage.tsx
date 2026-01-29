import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Typography,
  Form,
  Select,
  Button,
  Upload,
  message,
  Space,
  Row,
  Col,
  Divider,
  Image,
  Spin,
  Tooltip,
} from 'antd';
import { UploadOutlined, DeleteOutlined, SaveOutlined, FileImageOutlined } from '@ant-design/icons';
import api from '../../services/api';
import { useSettingsStore } from '../../store/settingsStore';
import DynamicIcon from '../../components/DynamicIcon';
import { CompanySettings } from '../../types';

const { Title, Text } = Typography;

const iconCategories = [
  { key: 'icon_vacation', labelKey: 'calendar.vacation', color: 'blue' },
  { key: 'icon_sick', labelKey: 'calendar.sickDay', color: 'gold' },
  { key: 'icon_office', labelKey: 'timeEntry.office', color: 'green' },
  { key: 'icon_remote', labelKey: 'timeEntry.remote', color: 'purple' },
  { key: 'icon_holiday', labelKey: 'calendar.holiday', color: 'red' },
  { key: 'icon_excused', labelKey: 'calendar.excusedAbsence', color: 'violet' },
];

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings, fetchSettings, updateSettings } = useSettingsStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [allowedIcons, setAllowedIcons] = useState<string[]>([]);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsData, iconsData] = await Promise.all([
        api.getAdminSettings(),
        api.getAllowedIcons(),
      ]);

      form.setFieldsValue({
        icon_vacation: settingsData.icon_vacation,
        icon_sick: settingsData.icon_sick,
        icon_office: settingsData.icon_office,
        icon_remote: settingsData.icon_remote,
        icon_holiday: settingsData.icon_holiday,
        icon_excused: settingsData.icon_excused,
      });

      setLogoPreview(settingsData.logo_url);
      setAllowedIcons(iconsData.icons);
      updateSettings(settingsData);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveIcons = async (values: Record<string, string>) => {
    setSaving(true);
    try {
      const updated = await api.updateIconSettings(values);
      updateSettings(updated);
      await fetchSettings();
      message.success(t('admin.settings.saveSuccess'));
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const result = await api.uploadCompanyLogo(file);
      setLogoPreview(result.logo_url);
      updateSettings({ logo_url: result.logo_url });
      await fetchSettings();
      message.success(t('admin.settings.uploadSuccess'));
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
    return false;
  };

  const handleDeleteLogo = async () => {
    try {
      await api.deleteCompanyLogo();
      setLogoPreview(null);
      updateSettings({ logo_url: null });
      await fetchSettings();
      message.success(t('admin.settings.deleteSuccess'));
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>{t('admin.settings.title')}</Title>

      <Row gutter={24}>
        <Col xs={24} lg={12}>
          <Card title={t('admin.settings.companyLogo')}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              {logoPreview ? (
                <Image
                  src={logoPreview}
                  alt="Company Logo"
                  style={{ maxHeight: 120, maxWidth: '100%' }}
                  preview={false}
                />
              ) : (
                <div
                  style={{
                    height: 120,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f5f5f5',
                    borderRadius: 8,
                  }}
                >
                  <Text type="secondary">{t('admin.settings.noLogo')}</Text>
                </div>
              )}
            </div>

            <Space style={{ width: '100%', justifyContent: 'center' }}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={handleLogoUpload}
              >
                <Button icon={<UploadOutlined />}>
                  {t('admin.settings.uploadLogo')}
                </Button>
              </Upload>
              {logoPreview && (
                <Button danger icon={<DeleteOutlined />} onClick={handleDeleteLogo}>
                  {t('common.delete')}
                </Button>
              )}
            </Space>

            <Divider />
            <Text type="secondary">
              {t('admin.settings.logoHint')}
            </Text>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title={t('admin.settings.iconCustomization')}>
            <Form form={form} onFinish={handleSaveIcons} layout="vertical">
              {iconCategories.map((cat) => (
                <Form.Item
                  key={cat.key}
                  label={
                    <Space>
                      <DynamicIcon
                        name={form.getFieldValue(cat.key) || settings?.[cat.key as keyof CompanySettings] as string || 'HelpCircle'}
                        size={16}
                      />
                      {t(cat.labelKey)}
                    </Space>
                  }
                >
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name={cat.key} noStyle>
                      <Select
                        showSearch
                        optionFilterProp="children"
                        style={{ flex: 1 }}
                      >
                        {allowedIcons.map((icon) => (
                          <Select.Option key={icon} value={icon}>
                            <Space>
                              <DynamicIcon name={icon} size={16} />
                              {icon}
                            </Space>
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                    <Tooltip title="Upload custom SVG">
                      <Upload
                        accept=".svg"
                        showUploadList={false}
                        beforeUpload={async (file) => {
                          try {
                            const result = await api.uploadCustomIcon(cat.key, file);
                            form.setFieldValue(cat.key, result.icon_url);
                            message.success(t('admin.settings.uploadSuccess'));
                          } catch (error) {
                            message.error(t('errors.somethingWentWrong'));
                          }
                          return false;
                        }}
                      >
                        <Button icon={<FileImageOutlined />} />
                      </Upload>
                    </Tooltip>
                  </Space.Compact>
                </Form.Item>
              ))}

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={saving}
                  icon={<SaveOutlined />}
                  block
                >
                  {t('common.save')}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SettingsPage;
