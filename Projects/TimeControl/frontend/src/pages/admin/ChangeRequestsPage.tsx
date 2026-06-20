import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Tag,
  Space,
  Button,
  Modal,
  Input,
  InputNumber,
  message,
  Typography,
  Select,
  Tooltip,
  Spin,
  Alert,
  TimePicker,
  DatePicker,
} from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined, DeleteOutlined, ExclamationCircleOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useResponsive } from '../../hooks/useResponsive';
import PageSizeSelector from '../../components/PageSizeSelector';
import api from '../../services/api';
import DynamicIcon from '../../components/DynamicIcon';
import { useSettingsStore } from '../../store/settingsStore';

dayjs.extend(utc);

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
  monthly_hours?: number;
  monthly_limit?: number;
  weekly_hours?: number;
}

const ChangeRequestsPage: React.FC = () => {
  const { t } = useTranslation();
  const { isMobile, modalWidth } = useResponsive();
  const { settings } = useSettingsStore();
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  const [pendingCount, setPendingCount] = useState(0);
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [adminComment, setAdminComment] = useState('');
  const [resolving, setResolving] = useState(false);
  const [monthlyHours, setMonthlyHours] = useState<{ worked: number; norm: number } | null>(null);
  const [monthlyHoursLoading, setMonthlyHoursLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editStartTime, setEditStartTime] = useState<dayjs.Dayjs | null>(null);
  const [editEndTime, setEditEndTime] = useState<dayjs.Dayjs | null>(null);
  const [editBreakMinutes, setEditBreakMinutes] = useState<number | null>(null);
  const [editDate, setEditDate] = useState<dayjs.Dayjs | null>(null);
  const [editDateTo, setEditDateTo] = useState<dayjs.Dayjs | null>(null);
  const [editWorkplace, setEditWorkplace] = useState<string | null>(null);
  const [editComment, setEditComment] = useState<string | null>(null);

  const fetchMonthlyHours = useCallback(async (userId: number, dateStr: string) => {
    setMonthlyHoursLoading(true);
    setMonthlyHours(null);
    try {
      const requestDate = dayjs(dateStr);
      const year = requestDate.year();
      const month = requestDate.month() + 1;
      const dateFrom = requestDate.startOf('month').format('YYYY-MM-DD');
      const dateTo = requestDate.endOf('month').format('YYYY-MM-DD');

      const [stats, calendarData] = await Promise.all([
        api.getEmployeeStats({ user_id: userId, period: 'custom', date_from: dateFrom, date_to: dateTo }),
        api.getCalendarMonth(year, month),
      ]);

      const workingDays = (calendarData.days || []).filter((d: any) => d.is_working_day).length;
      const normHours = workingDays * 8;
      const workedHours = stats.total_hours || 0;

      setMonthlyHours({ worked: workedHours, norm: normHours });
    } catch {
      setMonthlyHours(null);
    } finally {
      setMonthlyHoursLoading(false);
    }
  }, []);

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

  const resetEditState = () => {
    setEditMode(false);
    setEditStartTime(null);
    setEditEndTime(null);
    setEditBreakMinutes(null);
    setEditDate(null);
    setEditDateTo(null);
    setEditWorkplace(null);
    setEditComment(null);
  };

  const initEditMode = (request: ChangeRequest) => {
    setEditMode(true);
    setEditStartTime(request.start_time ? dayjs(request.start_time, 'HH:mm:ss') : null);
    setEditEndTime(request.end_time ? dayjs(request.end_time, 'HH:mm:ss') : null);
    setEditBreakMinutes(request.break_minutes ?? 0);
    setEditDate(dayjs(request.date));
    setEditDateTo(request.date_to ? dayjs(request.date_to) : null);
    setEditWorkplace(request.workplace || null);
    setEditComment(request.comment || null);
  };

  const handleResolve = async (approved: boolean) => {
    if (!selectedRequest) return;
    setResolving(true);
    try {
      const payload: any = {
        status: approved ? 'approved' : 'rejected',
        admin_comment: adminComment || undefined,
      };

      // Send admin corrections if in edit mode
      if (editMode && approved) {
        if (editStartTime) payload.start_time = editStartTime.format('HH:mm');
        if (editEndTime) payload.end_time = editEndTime.format('HH:mm');
        if (editBreakMinutes !== null) payload.break_minutes = editBreakMinutes;
        if (editDate) payload.date = editDate.format('YYYY-MM-DD');
        if (editDateTo) payload.date_to = editDateTo.format('YYYY-MM-DD');
        if (editWorkplace) payload.workplace = editWorkplace;
        if (editComment !== null) payload.comment = editComment;
      }

      await api.resolveChangeRequest(selectedRequest.id, payload);
      message.success(approved ? t('changeRequest.approveSuccess') : t('changeRequest.rejectSuccess'));
      setResolveModalVisible(false);
      setSelectedRequest(null);
      setAdminComment('');
      resetEditState();
      fetchRequests();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setResolving(false);
    }
  };

  const handleDelete = (request: ChangeRequest) => {
    Modal.confirm({
      title: t('changeRequest.deleteConfirm'),
      icon: <ExclamationCircleOutlined />,
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await api.adminDeleteChangeRequest(request.id);
          message.success(t('changeRequest.deleteSuccess'));
          fetchRequests();
        } catch (error) {
          message.error(t('errors.somethingWentWrong'));
        }
      },
    });
  };

  const handleBulkDelete = () => {
    Modal.confirm({
      title: t('changeRequest.bulkDeleteConfirm', { count: selectedRowKeys.length }),
      icon: <ExclamationCircleOutlined />,
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        setBulkDeleting(true);
        try {
          const result = await api.adminBulkDeleteChangeRequests(selectedRowKeys as number[]);
          message.success(t('changeRequest.bulkDeleteSuccess', { count: result.deleted }));
          setSelectedRowKeys([]);
          fetchRequests();
        } catch (error) {
          message.error(t('errors.somethingWentWrong'));
        } finally {
          setBulkDeleting(false);
        }
      },
    });
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

  // Calculate request's work hours from start/end/break
  const getRequestHours = (record: ChangeRequest): number => {
    if (!record.start_time || !record.end_time) return 0;
    const [sH, sM] = record.start_time.split(':').map(Number);
    const [eH, eM] = record.end_time.split(':').map(Number);
    return ((eH * 60 + eM) - (sH * 60 + sM) - (record.break_minutes || 0)) / 60;
  };

  // Determine overtime type based on actual hours data from backend
  // Backend always sends hours BEFORE this entry (cumulative, not including this entry)
  // So we always add reqHours to check if THIS entry crosses the limit
  const getRecordOvertimeType = (record: ChangeRequest): 'daily' | 'weekly' | 'monthly' | null => {
    const reqHours = getRequestHours(record);
    const weeklyTotal = record.weekly_hours != null ? record.weekly_hours + reqHours : null;
    const monthlyTotal = record.monthly_hours != null ? record.monthly_hours + reqHours : null;
    const exceedsMonthly = monthlyTotal != null && record.monthly_limit != null && monthlyTotal > record.monthly_limit;
    const exceedsWeekly = weeklyTotal != null && weeklyTotal > 40;
    if (exceedsMonthly) return 'monthly';
    if (exceedsWeekly) return 'weekly';
    if (reqHours > 8) return 'daily';
    return null;
  };

  const getOvertimeColorByType = (type: 'daily' | 'weekly' | 'monthly' | null) => {
    if (type === 'monthly') return '#ff4d4f';
    if (type === 'weekly') return '#fa8c16';
    if (type === 'daily') return '#d4b106';
    return undefined;
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
      key: 'reason',
      width: 300,
      render: (_: any, record: ChangeRequest) => {
        const overtimeType = getRecordOvertimeType(record);
        const color = getOvertimeColorByType(overtimeType);
        const reqHours = getRequestHours(record);
        // Backend sends hours BEFORE this entry → always add reqHours
        const weeklyTotal = record.weekly_hours != null ? record.weekly_hours + reqHours : null;
        const monthlyTotal = record.monthly_hours != null ? record.monthly_hours + reqHours : null;
        const weeklyExcess = weeklyTotal != null ? weeklyTotal - 40 : 0;
        const monthlyExcess = monthlyTotal != null && record.monthly_limit != null ? monthlyTotal - record.monthly_limit : 0;
        return (
          <Space direction="vertical" size={2}>
            <Text strong={!!overtimeType} style={color ? { color } : undefined}>
              {record.reason}
            </Text>
            {reqHours > 8 && (
              <Tag color="gold" style={{ fontSize: 11 }}>
                {t('changeRequest.overtypeDaily')}: +{(reqHours - 8).toFixed(1)}h
              </Tag>
            )}
            {weeklyExcess > 0 && (
              <Tag color="orange" style={{ fontSize: 11 }}>
                {t('changeRequest.overtypeWeekly')}: +{weeklyExcess.toFixed(1)}h
              </Tag>
            )}
            {monthlyExcess > 0 && (
              <Tag color="red" style={{ fontSize: 11 }}>
                {t('changeRequest.overtypeMonthly')}: +{monthlyExcess.toFixed(1)}h
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: t('changeRequest.submittedAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs.utc(date).local().format('DD.MM.YYYY HH:mm'),
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
                    fetchMonthlyHours(record.user_id, record.date);
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
                    fetchMonthlyHours(record.user_id, record.date);
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
                  fetchMonthlyHours(record.user_id, record.date);
                }}
              />
            </Tooltip>
          )}
          <Tooltip title={t('common.delete')}>
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
<Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>
              {t('changeRequest.title')}
              {pendingCount > 0 && (
                <Tag color="orange" style={{ marginLeft: 8 }}>
                  {pendingCount} {t('changeRequest.pendingRequests')}
                </Tag>
              )}
            </Title>
            <Space wrap>
              <Input
                placeholder={t('common.search')}
                prefix={<SearchOutlined />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                allowClear
                style={{ width: 200 }}
              />
              <Select
                style={{ width: isMobile ? '100%' : 200 }}
                placeholder={t('common.filter')}
                allowClear
                value={statusFilter}
                onChange={setStatusFilter}
              >
                <Select.Option value="pending">{t('changeRequest.status.pending')}</Select.Option>
                <Select.Option value="approved">{t('changeRequest.status.approved')}</Select.Option>
                <Select.Option value="rejected">{t('changeRequest.status.rejected')}</Select.Option>
              </Select>
              {selectedRowKeys.length > 0 && (
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  onClick={handleBulkDelete}
                  loading={bulkDeleting}
                >
                  {t('changeRequest.deleteSelected', { count: selectedRowKeys.length })}
                </Button>
              )}
            </Space>
          </Space>

          <Table
            columns={columns}
            dataSource={requests.filter((r) => {
              if (!debouncedSearch) return true;
              const name = (r.employee_name || '').toLowerCase();
              return name.includes(debouncedSearch.toLowerCase());
            })}
            rowKey="id"
            loading={loading}
            pagination={{ total, pageSize, showSizeChanger: false }}
            scroll={{ x: 'max-content' }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            footer={() => (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <PageSizeSelector
                  value={pageSize}
                  total={total || requests.length}
                  onChange={setPageSize}
                />
              </div>
            )}
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
          setMonthlyHours(null);
          resetEditState();
        }}
        footer={selectedRequest?.status === 'pending' ? (
          <Space wrap>
            <Button onClick={() => setResolveModalVisible(false)}>{t('common.cancel')}</Button>
            {!editMode && (
              <Button icon={<EditOutlined />} onClick={() => initEditMode(selectedRequest)}>
                {t('changeRequest.editBeforeApprove')}
              </Button>
            )}
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
        width={modalWidth(600)}
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
              {editMode ? (
                <Space>
                  <DatePicker
                    value={editDate}
                    onChange={setEditDate}
                    format="DD.MM.YYYY"
                  />
                  {(selectedRequest.date_to || selectedRequest.request_type.includes('vacation') || selectedRequest.request_type.includes('sick')) && (
                    <>
                      <Text> - </Text>
                      <DatePicker
                        value={editDateTo}
                        onChange={setEditDateTo}
                        format="DD.MM.YYYY"
                      />
                    </>
                  )}
                </Space>
              ) : (
                <Text strong>
                  {dayjs(selectedRequest.date).format('DD.MM.YYYY')}
                  {selectedRequest.date_to && selectedRequest.date_to !== selectedRequest.date && (
                    <> - {dayjs(selectedRequest.date_to).format('DD.MM.YYYY')}</>
                  )}
                </Text>
              )}
            </div>
            {((selectedRequest.start_time && selectedRequest.end_time) || editMode) && (
              <div>
                <Text type="secondary">{t('common.time')}:</Text>
                <br />
                {editMode ? (
                  <Space wrap>
                    <TimePicker value={editStartTime} onChange={setEditStartTime} format="HH:mm" minuteStep={5} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                    <Text> - </Text>
                    <TimePicker value={editEndTime} onChange={setEditEndTime} format="HH:mm" minuteStep={5} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                    <Space>
                      <Text type="secondary">{t('timeEntry.breakMinutes')}:</Text>
                      <InputNumber
                        min={0}
                        max={120}
                        value={editBreakMinutes}
                        onChange={(v) => setEditBreakMinutes(v ?? 0)}
                        style={{ width: 80 }}
                        addonAfter={t('common.minutesShort')}
                      />
                    </Space>
                    {editStartTime && editEndTime && (() => {
                      const startMins = editStartTime.hour() * 60 + editStartTime.minute();
                      const endMins = editEndTime.hour() * 60 + editEndTime.minute();
                      const brk = editBreakMinutes || 0;
                      const dur = endMins - startMins - brk;
                      if (dur <= 0) return null;
                      const h = Math.floor(dur / 60);
                      const m = dur % 60;
                      return <Text type="secondary">({h}{t('common.hoursShort')} {m > 0 ? `${m}${t('common.minutesShort')}` : ''})</Text>;
                    })()}
                  </Space>
                ) : (
                  <Text strong>
                    {selectedRequest.start_time?.substring(0, 5)} - {selectedRequest.end_time?.substring(0, 5)}
                    {(() => {
                      const [startH, startM] = (selectedRequest.start_time || '00:00').split(':').map(Number);
                      const [endH, endM] = (selectedRequest.end_time || '00:00').split(':').map(Number);
                      const startMins = startH * 60 + startM;
                      const endMins = endH * 60 + endM;
                      const breakMins = selectedRequest.break_minutes || 0;
                      const durationMins = endMins - startMins - breakMins;
                      const hours = Math.floor(durationMins / 60);
                      const mins = durationMins % 60;
                      const durationStr = mins > 0 ? `${hours}${t('common.hoursShort')} ${mins}${t('common.minutesShort')}` : `${hours}${t('common.hoursShort')}`;
                      return ` (${t('timeEntry.duration')}: ${durationStr}${breakMins > 0 ? `, ${t('timeEntry.breakMinutes')}: ${breakMins}${t('common.minutesShort')}` : ''})`;
                    })()}
                  </Text>
                )}
              </div>
            )}
            {(selectedRequest.workplace || editMode) && (
              <div>
                <Text type="secondary">{t('timeEntry.workplace')}:</Text>
                <br />
                {editMode ? (
                  <Select
                    value={editWorkplace}
                    onChange={setEditWorkplace}
                    style={{ width: 200 }}
                  >
                    <Select.Option value="office">
                      <Space>{getWorkplaceIcon('office')} {t('timeEntry.office')}</Space>
                    </Select.Option>
                    <Select.Option value="remote">
                      <Space>{getWorkplaceIcon('remote')} {t('timeEntry.remote')}</Space>
                    </Select.Option>
                  </Select>
                ) : (
                  <Space>
                    {getWorkplaceIcon(selectedRequest.workplace)}
                    <Text strong>{t(`timeEntry.${selectedRequest.workplace}`)}</Text>
                  </Space>
                )}
              </div>
            )}
            <div>
              <Text type="secondary">{t('changeRequest.reason')}:</Text>
              <br />
              {(() => {
                const overtimeType = getRecordOvertimeType(selectedRequest);
                const color = getOvertimeColorByType(overtimeType);
                return (
                  <>
                    <Text strong style={color ? { color } : undefined}>
                      {selectedRequest.reason}
                    </Text>
                    {overtimeType && (
                      <div style={{ marginTop: 4 }}>
                        {getRequestHours(selectedRequest) > 8 && (
                          <Tag color="gold">{t('changeRequest.overtypeDaily')}</Tag>
                        )}
                        {selectedRequest.weekly_hours != null && (selectedRequest.weekly_hours + getRequestHours(selectedRequest)) > 40 && (
                          <Tag color="orange">{t('changeRequest.overtypeWeekly')}</Tag>
                        )}
                        {selectedRequest.monthly_hours != null && selectedRequest.monthly_limit != null && (selectedRequest.monthly_hours + getRequestHours(selectedRequest)) > selectedRequest.monthly_limit && (
                          <Tag color="red">{t('changeRequest.overtypeMonthly')}</Tag>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <Text type="secondary">{t('changeRequest.monthlyHours')}:</Text>
              <br />
              {monthlyHoursLoading ? (
                <Spin size="small" />
              ) : monthlyHours ? (
                <Text strong>
                  {monthlyHours.worked.toFixed(1)}h / {monthlyHours.norm}h
                  <Text type="secondary" style={{ marginLeft: 8 }}>
                    ({t('changeRequest.availableHours')}: {Math.max(0, monthlyHours.norm - monthlyHours.worked).toFixed(1)}h)
                  </Text>
                </Text>
              ) : (
                <Text type="secondary">-</Text>
              )}
            </div>
            {selectedRequest.start_time && selectedRequest.end_time && (() => {
              const reqHours = getRequestHours(selectedRequest);
              const warnings: { type: 'daily' | 'weekly' | 'monthly'; text: string }[] = [];

              if (reqHours > 8) {
                warnings.push({
                  type: 'daily',
                  text: `${t('changeRequest.overtypeDaily')}: ${reqHours.toFixed(1)}h (+${(reqHours - 8).toFixed(1)}h)`,
                });
              }
              // Backend sends hours BEFORE this entry → always add reqHours
              if (selectedRequest.weekly_hours != null) {
                const weeklyTotal = selectedRequest.weekly_hours + reqHours;
                if (weeklyTotal > 40) {
                  warnings.push({
                    type: 'weekly',
                    text: `${t('changeRequest.overtypeWeekly')}: ${weeklyTotal.toFixed(1)}h / 40h (+${(weeklyTotal - 40).toFixed(1)}h)`,
                  });
                }
              }
              if (selectedRequest.monthly_hours != null && selectedRequest.monthly_limit != null) {
                const monthlyTotal = selectedRequest.monthly_hours + reqHours;
                if (monthlyTotal > selectedRequest.monthly_limit) {
                  warnings.push({
                    type: 'monthly',
                    text: `${t('changeRequest.overtypeMonthly')}: ${monthlyTotal.toFixed(1)}h / ${selectedRequest.monthly_limit}h (+${(monthlyTotal - selectedRequest.monthly_limit).toFixed(1)}h)`,
                  });
                }
              }

              if (warnings.length === 0) return null;
              return (
                <Alert
                  type="warning"
                  showIcon
                  message={
                    <Space direction="vertical" size={2}>
                      {warnings.map((w, i) => (
                        <Text key={i} strong style={{ color: w.type === 'monthly' ? '#ff4d4f' : w.type === 'weekly' ? '#fa8c16' : '#d4b106' }}>
                          {w.text}
                        </Text>
                      ))}
                    </Space>
                  }
                />
              );
            })()}
            {(selectedRequest.comment || editMode) && (
              <div>
                <Text type="secondary">{t('timeEntry.comment')}:</Text>
                <br />
                {editMode ? (
                  <TextArea
                    value={editComment ?? ''}
                    onChange={(e) => setEditComment(e.target.value)}
                    rows={2}
                  />
                ) : (
                  <Text>{selectedRequest.comment}</Text>
                )}
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