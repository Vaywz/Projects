import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Input,
  message,
  Typography,
  Select,
  Tooltip,
} from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import DynamicIcon from '../../components/DynamicIcon';
import { useSettingsStore } from '../../store/settingsStore';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ChangeRequest {
  id: number;
  user_id: number;
  request_type: string;
  time_entry_id?: number;
  vacation_id?: number;
  day_status_id?: number;
  date: string;
  date_to?: string;
  start_time?: string;
  end_time?: string;
  break_minutes?: number;
  workplace?: string;
  comment?: string;
  reason: string;
  status: string;
  admin_id?: number;
  admin_comment?: string;
  resolved_at?: string;
  created_at: string;
  employee_name?: string;
  employee_email?: string;
}

const ChangeRequestsPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [resolving, setResolving] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await api.getAllChangeRequests(statusFilter, 100, 0);
      setRequests(data.requests);
      setTotal(data.total);
      setPendingCount(data.pending_count);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const handleResolve = async (approved: boolean) => {
    if (!selectedRequest) return;
    setResolving(true);
    try {
      await api.resolveChangeRequest(selectedRequest.id, {
        status: approved ? 'approved' : 'rejected',
        admin_comment: adminComment || undefined,
      });
      message.success(approved ? t('changeRequest.approveSuccess') : t('changeRequest.rejectSuccess'));
      setResolveModalVisible(false);
      setSelectedRequest(null);
      setAdminComment('');
      fetchRequests();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setResolving(false);
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'pending':
        return <Tag color="orange">{t('changeRequest.status.pending')}</Tag>;
      case 'approved':
        return <Tag color="green">{t('changeRequest.status.approved')}</Tag>;
      case 'rejected':
        return <Tag color="red">{t('changeRequest.status.rejected')}</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const getRequestTypeLabel = (type: string) => {
    const key = `changeRequest.${type}`;
    const translated = t(key);
    return translated !== key ? translated : type;
  };

  const getWorkplaceIcon = (workplace?: string) => {
    if (workplace === 'office') return <DynamicIcon name={settings.icon_office} size={14} />;
    if (workplace === 'remote') return <DynamicIcon name={settings.icon_remote} size={14} />;
    return null;
  };

  const columns = [
    {
      title: t('changeRequest.employee'),
      key: 'employee',
      render: (_: any, record: ChangeRequest) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.employee_name || '-'}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.employee_email}</Text>
        </Space>
      ),
    },
    {
      title: t('changeRequest.requestType'),
      dataIndex: 'request_type',
      key: 'request_type',
      render: (type: string) => getRequestTypeLabel(type),
    },
    {
      title: t('common.date'),
      key: 'date',
      render: (_: any, record: ChangeRequest) => (
        <Space direction="vertical" size={0}>
          <Text>{dayjs(record.date).format('DD.MM.YYYY')}</Text>
          {record.date_to && record.date_to !== record.date && (
            <Text type="secondary">- {dayjs(record.date_to).format('DD.MM.YYYY')}</Text>
          )}
        </Space>
      ),
    },
    {
      title: t('common.time'),
      key: 'time',
      render: (_: any, record: ChangeRequest) => (
        record.start_time && record.end_time ? (
          <Space>
            {getWorkplaceIcon(record.workplace)}
            <Text>{record.start_time?.substring(0, 5)} - {record.end_time?.substring(0, 5)}</Text>
          </Space>
        ) : '-'
      ),
    },
    {
      title: t('changeRequest.reason'),
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (reason: string) => (
        <Tooltip title={reason}>
          <Text style={{ maxWidth: 200 }} ellipsis>{reason}</Text>
        </Tooltip>
      ),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: t('common.date'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('DD.MM.YYYY HH:mm'),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      render: (_: any, record: ChangeRequest) => (
        <Space>
          {record.status === 'pending' ? (
            <>
              <Tooltip title={t('changeRequest.approve')}>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  onClick={() => {
                    setSelectedRequest(record);
                    setAdminComment('');
                    setResolveModalVisible(true);
                  }}
                />
              </Tooltip>
              <Tooltip title={t('changeRequest.reject')}>
                <Button
                  danger
                  size="small"
                  icon={<CloseOutlined />}
                  onClick={() => {
                    setSelectedRequest(record);
                    setAdminComment('');
                    setResolveModalVisible(true);
                  }}
                />
              </Tooltip>
            </>
          ) : (
            <Tooltip title={t('common.view')}>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => {
                  setSelectedRequest(record);
                  setResolveModalVisible(true);
                }}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>
              {t('changeRequest.title')}
              {pendingCount > 0 && (
                <Tag color="orange" style={{ marginLeft: 8 }}>
                  {pendingCount} {t('changeRequest.pendingRequests')}
                </Tag>
              )}
            </Title>
            <Select
              style={{ width: 200 }}
              placeholder={t('common.filter')}
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
            >
              <Select.Option value="pending">{t('changeRequest.status.pending')}</Select.Option>
              <Select.Option value="approved">{t('changeRequest.status.approved')}</Select.Option>
              <Select.Option value="rejected">{t('changeRequest.status.rejected')}</Select.Option>
            </Select>
          </Space>

          <Table
            columns={columns}
            dataSource={requests}
            rowKey="id"
            loading={loading}
            pagination={{ total, pageSize: 100 }}
          />
        </Space>
      </Card>

      <Modal
        title={selectedRequest?.status === 'pending' ? t('changeRequest.resolveRequest') : t('changeRequest.viewRequest')}
        open={resolveModalVisible}
        onCancel={() => {
          setResolveModalVisible(false);
          setSelectedRequest(null);
          setAdminComment('');
        }}
        footer={selectedRequest?.status === 'pending' ? (
          <Space>
            <Button onClick={() => setResolveModalVisible(false)}>{t('common.cancel')}</Button>
            <Button danger onClick={() => handleResolve(false)} loading={resolving}>
              <CloseOutlined /> {t('changeRequest.reject')}
            </Button>
            <Button type="primary" onClick={() => handleResolve(true)} loading={resolving}>
              <CheckOutlined /> {t('changeRequest.approve')}
            </Button>
          </Space>
        ) : (
          <Button onClick={() => setResolveModalVisible(false)}>{t('common.close')}</Button>
        )}
        width={600}
      >
        {selectedRequest && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text type="secondary">{t('changeRequest.employee')}:</Text>
              <br />
              <Text strong>{selectedRequest.employee_name || selectedRequest.employee_email}</Text>
            </div>
            <div>
              <Text type="secondary">{t('changeRequest.requestType')}:</Text>
              <br />
              <Text strong>{getRequestTypeLabel(selectedRequest.request_type)}</Text>
            </div>
            <div>
              <Text type="secondary">{t('common.date')}:</Text>
              <br />
              <Text strong>
                {dayjs(selectedRequest.date).format('DD.MM.YYYY')}
                {selectedRequest.date_to && selectedRequest.date_to !== selectedRequest.date && (
                  <> - {dayjs(selectedRequest.date_to).format('DD.MM.YYYY')}</>
                )}
              </Text>
            </div>
            {selectedRequest.start_time && selectedRequest.end_time && (
              <div>
                <Text type="secondary">{t('common.time')}:</Text>
                <br />
                <Text strong>
                  {selectedRequest.start_time?.substring(0, 5)} - {selectedRequest.end_time?.substring(0, 5)}
                  {selectedRequest.break_minutes ? ` (${t('timeEntry.breakMinutes')}: ${selectedRequest.break_minutes})` : ''}
                </Text>
              </div>
            )}
            {selectedRequest.workplace && (
              <div>
                <Text type="secondary">{t('timeEntry.workplace')}:</Text>
                <br />
                <Space>
                  {getWorkplaceIcon(selectedRequest.workplace)}
                  <Text strong>{t(`timeEntry.${selectedRequest.workplace}`)}</Text>
                </Space>
              </div>
            )}
            <div>
              <Text type="secondary">{t('changeRequest.reason')}:</Text>
              <br />
              <Text strong>{selectedRequest.reason}</Text>
            </div>
            {selectedRequest.comment && (
              <div>
                <Text type="secondary">{t('timeEntry.comment')}:</Text>
                <br />
                <Text>{selectedRequest.comment}</Text>
              </div>
            )}
            {selectedRequest.status === 'pending' && (
              <div>
                <Text type="secondary">{t('changeRequest.adminComment')}:</Text>
                <br />
                <TextArea
                  value={adminComment}
                  onChange={(e) => setAdminComment(e.target.value)}
                  placeholder={t('changeRequest.adminCommentPlaceholder')}
                  rows={3}
                />
              </div>
            )}
            {selectedRequest.status !== 'pending' && selectedRequest.admin_comment && (
              <div>
                <Text type="secondary">{t('changeRequest.adminComment')}:</Text>
                <br />
                <Text>{selectedRequest.admin_comment}</Text>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default ChangeRequestsPage;