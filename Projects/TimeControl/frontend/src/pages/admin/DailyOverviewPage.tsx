import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Row,
  Col,
  DatePicker,
  Table,
  Typography,
  Space,
  message,
  Tag,
  Button,
  Modal,
  Form,
  Input,
  Avatar,
  TimePicker,
  InputNumber,
  Select,
  Popconfirm,
  Dropdown,
} from 'antd';
import {
  ClockCircleOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  DownOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import { User, TimeEntry } from '../../types';
import DynamicIcon from '../../components/DynamicIcon';
import { useSettingsStore } from '../../store/settingsStore';

const { Title, Text } = Typography;

interface EmployeeDayData {
  user: User;
  entries: TimeEntry[];
  totalHours: number;
  status: 'working' | 'vacation' | 'sick' | 'excused' | 'unexcused' | 'holiday' | 'dayoff' | 'absent';
  dayStatusId?: number;
}

const DailyOverviewPage: React.FC = () => {
  const { t } = useTranslation();
  const { settings } = useSettingsStore();
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [employees, setEmployees] = useState<User[]>([]);
  const [dailyData, setDailyData] = useState<EmployeeDayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [excusedModalVisible, setExcusedModalVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [excusedForm] = Form.useForm();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [entryForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees(true);
      setEmployees(data);
      return data;
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
      return [];
    }
  };

  const fetchDailyData = async (date: dayjs.Dayjs, employeeList: User[]) => {
    setLoading(true);
    try {
      const dateStr = date.format('YYYY-MM-DD');
      const results: EmployeeDayData[] = [];

      // Get all employees status for the day
      let employeesStatus: Record<number, { status: string; dayStatusId?: number }> = {};
      try {
        const statusResponse = await api.getAllEmployeesStatus(dateStr);
        if (statusResponse?.employees) {
          statusResponse.employees.forEach((emp: any) => {
            employeesStatus[emp.user_id] = {
              status: emp.status,
              dayStatusId: emp.day_status_id,
            };
          });
        }
      } catch (e) {
        // If API fails, continue without status data
      }

      // Filter out employees whose employment hasn't started yet
      const filteredEmployeeList = employeeList.filter(emp => {
        if (!emp.profile?.employment_start_date) return true;
        return dateStr >= emp.profile.employment_start_date;
      });

      for (const employee of filteredEmployeeList) {
        try {
          const entries = await api.getEmployeeTimeEntries(employee.id, dateStr, dateStr);

          let totalHours = 0;
          if (entries && entries.length > 0) {
            totalHours = entries.reduce((sum: number, entry: TimeEntry) => {
              const start = dayjs(`${entry.date} ${entry.start_time}`);
              const end = dayjs(`${entry.date} ${entry.end_time}`);
              const hours = end.diff(start, 'hour', true) - (entry.break_minutes || 0) / 60;
              return sum + hours;
            }, 0);
          }

          // Determine status from API or entries
          let status: EmployeeDayData['status'] = 'absent';
          const empStatus = employeesStatus[employee.id];
          const apiStatus = empStatus?.status;
          const dayStatusId = empStatus?.dayStatusId;

          if (apiStatus === 'vacation') {
            status = 'vacation';
          } else if (apiStatus === 'sick') {
            status = 'sick';
          } else if (apiStatus === 'excused') {
            status = 'excused';
          } else if (apiStatus === 'unexcused') {
            status = 'unexcused';
          } else if (apiStatus === 'holiday') {
            status = 'holiday';
          } else if (apiStatus === 'dayoff') {
            status = 'dayoff';
          } else if (entries && entries.length > 0) {
            status = 'working';
          }

          results.push({
            user: employee,
            entries: entries || [],
            totalHours,
            status,
            dayStatusId,
          });
        } catch (err) {
          console.error(`Error fetching entries for employee ${employee.id}:`, err);
          results.push({
            user: employee,
            entries: [],
            totalHours: 0,
            status: 'absent',
          });
        }
      }

      setDailyData(results);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const empList = await fetchEmployees();
      if (empList.length > 0) {
        await fetchDailyData(selectedDate, empList);
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (employees.length > 0) {
      fetchDailyData(selectedDate, employees);
    }
  }, [selectedDate]);

  const handleDateChange = (date: dayjs.Dayjs | null) => {
    if (date) {
      setSelectedDate(date);
    }
  };

  // Helper to parse time from backend (supports both HH:mm and HH:mm:ss)
  const parseTime = (timeStr: string) => {
    if (!timeStr) return null;
    // Try HH:mm:ss first, then HH:mm
    let parsed = dayjs(timeStr, 'HH:mm:ss');
    if (!parsed.isValid()) {
      parsed = dayjs(timeStr, 'HH:mm');
    }
    return parsed.isValid() ? parsed : null;
  };

  // Map of known backend error messages to translation keys
  const errorTranslations: Record<string, string> = {
    'Maximum work time is 8 hours': 'errors.maxWorkTime8Hours',
    'end_time must be after start_time': 'errors.endTimeAfterStart',
    'Time entry overlaps with existing entry': 'errors.timeEntryOverlaps',
    'Cannot create time entries beyond next month': 'errors.cannotCreateBeyondNextMonth',
    'Time entry not found': 'errors.timeEntryNotFound',
    'Employee not found': 'errors.employeeNotFound',
    'Invalid time format': 'errors.invalidTimeFormat',
    'Invalid date format': 'errors.invalidDateFormat',
  };

  // Translate a single error message
  const translateError = (msg: string): string => {
    // Check for known error messages
    for (const [key, translationKey] of Object.entries(errorTranslations)) {
      if (msg.toLowerCase().includes(key.toLowerCase())) {
        return t(translationKey);
      }
    }
    return msg;
  };

  // Helper to extract error message from API response
  const getErrorMessage = (error: any): string => {
    const detail = error?.response?.data?.detail;
    if (!detail) return t('errors.somethingWentWrong');

    // If detail is a string, translate it
    if (typeof detail === 'string') return translateError(detail);

    // If detail is an array of validation errors, extract and translate messages
    if (Array.isArray(detail)) {
      const messages = detail.map((err: any) => {
        if (typeof err === 'string') return translateError(err);
        if (err?.msg) return translateError(err.msg);
        return JSON.stringify(err);
      });
      return messages.join(', ');
    }

    // Otherwise, stringify it
    return JSON.stringify(detail);
  };

  const openExcusedModal = (employee: User) => {
    setSelectedEmployee(employee);
    excusedForm.resetFields();
    setExcusedModalVisible(true);
  };

  const handleExcusedAbsence = async (values: any) => {
    if (!selectedEmployee) return;

    try {
      await api.createEmployeeDayStatus(selectedEmployee.id, {
        date: selectedDate.format('YYYY-MM-DD'),
        status: 'excused',
        note: values.note,
      });
      message.success(t('calendar.excusedAbsence') + ' - OK');
      setExcusedModalVisible(false);
      excusedForm.resetFields();
      setSelectedEmployee(null);
      // Refresh data
      fetchDailyData(selectedDate, employees);
    } catch (error: any) {
      message.error(getErrorMessage(error));
    }
  };

  const handleSetStatus = async (employee: User, status: 'sick' | 'vacation' | 'excused' | 'unexcused' | 'holiday' | 'dayoff') => {
    try {
      await api.createEmployeeDayStatus(employee.id, {
        date: selectedDate.format('YYYY-MM-DD'),
        status: status,
        note: '',
      });
      const statusLabels: Record<string, string> = {
        sick: t('calendar.sickDay'),
        vacation: t('calendar.vacation'),
        excused: t('calendar.excusedAbsence'),
        unexcused: t('calendar.unexcusedAbsence'),
        holiday: t('calendar.holiday'),
        dayoff: t('calendar.dayoff'),
      };
      message.success(statusLabels[status] + ' - OK');
      fetchDailyData(selectedDate, employees);
    } catch (error: any) {
      message.error(getErrorMessage(error));
    }
  };

  const handleClearStatus = async (employee: User, dayStatusId: number) => {
    try {
      await api.deleteEmployeeDayStatus(employee.id, dayStatusId);
      message.success(t('admin.daily.statusCleared'));
      fetchDailyData(selectedDate, employees);
    } catch (error: any) {
      message.error(getErrorMessage(error));
    }
  };

  const openEditModal = (entry: TimeEntry, user: User) => {
    setEditingEntry(entry);
    setEditingUser(user);
    entryForm.setFieldsValue({
      start_time: parseTime(entry.start_time),
      end_time: parseTime(entry.end_time),
      break_minutes: entry.break_minutes,
      workplace: entry.workplace,
      comment: entry.comment,
    });
    setEditModalVisible(true);
  };

  const openAddModal = (user: User) => {
    setEditingEntry(null);
    setEditingUser(user);
    entryForm.resetFields();

    // Check if employee already has entries for this day
    const employeeData = dailyData.find(d => d.user.id === user.id);
    const hasExistingEntries = employeeData && employeeData.entries.length > 0;

    // Admin can set any break time, default to 60 for first entry, 0 for subsequent
    entryForm.setFieldsValue({
      break_minutes: hasExistingEntries ? 0 : 60,
      workplace: 'office',
    });
    setEditModalVisible(true);
  };

  const handleSaveEntry = async (values: any) => {
    if (!editingUser) return;

    try {
      // Build entry data with time format without seconds
      const entryData: Record<string, any> = {
        date: selectedDate.format('YYYY-MM-DD'),
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: values.break_minutes ?? 0,
        workplace: values.workplace,
      };
      // Only include comment if it has a value (avoid sending undefined/empty)
      if (values.comment && values.comment.trim()) {
        entryData.comment = values.comment;
      }

      if (editingEntry) {
        // Update existing entry (use admin endpoint)
        await api.adminUpdateTimeEntry(editingEntry.id, entryData);
        message.success(t('timeEntry.updateSuccess'));
      } else {
        // Create new entry for employee
        await api.createEmployeeTimeEntry(editingUser.id, entryData);
        message.success(t('timeEntry.addSuccess'));
      }

      setEditModalVisible(false);
      entryForm.resetFields();
      setEditingEntry(null);
      setEditingUser(null);
      fetchDailyData(selectedDate, employees);
    } catch (error: any) {
      message.error(getErrorMessage(error));
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    try {
      await api.deleteTimeEntry(entryId);
      message.success(t('timeEntry.deleteSuccess'));
      fetchDailyData(selectedDate, employees);
    } catch (error: any) {
      message.error(getErrorMessage(error));
    }
  };

  const getStatusTag = (data: EmployeeDayData) => {
    if (data.status === 'working') {
      // Check workplace from entries
      const hasOffice = data.entries.some(e => e.workplace === 'office');
      const hasRemote = data.entries.some(e => e.workplace === 'remote');
      if (hasOffice && hasRemote) {
        return <Tag color="green"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('timeEntry.office')} / {t('timeEntry.remote')}</Tag>;
      } else if (hasOffice) {
        return <Tag color="green"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('timeEntry.office')}</Tag>;
      } else {
        return <Tag color="cyan"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} />{t('timeEntry.remote')}</Tag>;
      }
    }
    if (data.status === 'vacation') {
      return <Tag color="geekblue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} />{t('calendar.vacation')}</Tag>;
    }
    if (data.status === 'sick') {
      return <Tag color="gold"><DynamicIcon name={settings.icon_sick} size={14} style={{ marginRight: 4 }} />{t('calendar.sickDay')}</Tag>;
    }
    if (data.status === 'excused') {
      return <Tag color="purple"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} />{t('calendar.excusedAbsence')}</Tag>;
    }
    if (data.status === 'unexcused') {
      return <Tag color="orange"><DynamicIcon name={settings.icon_unexcused} size={14} style={{ marginRight: 4 }} />{t('calendar.unexcusedAbsence')}</Tag>;
    }
    if (data.status === 'holiday') {
      return <Tag color="red"><DynamicIcon name={settings.icon_holiday} size={14} style={{ marginRight: 4 }} />{t('calendar.holiday')}</Tag>;
    }
    if (data.status === 'dayoff') {
      return <Tag color="pink"><DynamicIcon name={settings.icon_dayoff} size={14} style={{ marginRight: 4 }} />{t('calendar.dayoff')}</Tag>;
    }
    return <Tag color="red">{t('admin.daily.absent')}</Tag>;
  };

  const columns = [
    {
      title: t('profile.avatar'),
      key: 'avatar',
      width: 60,
      render: (_: any, record: EmployeeDayData) => (
        <Avatar
          size={40}
          src={record.user.profile?.avatar_url}
          icon={!record.user.profile?.avatar_url && <UserOutlined />}
        />
      ),
    },
    {
      title: t('admin.employees.firstName') + ' ' + t('admin.employees.lastName'),
      key: 'name',
      render: (_: any, record: EmployeeDayData) =>
        record.user.profile
          ? `${record.user.profile.first_name} ${record.user.profile.last_name}`
          : record.user.email,
    },
    {
      title: t('admin.daily.status'),
      key: 'status',
      render: (_: any, record: EmployeeDayData) => getStatusTag(record),
    },
    {
      title: t('admin.daily.entries'),
      key: 'entries',
      render: (_: any, record: EmployeeDayData) => (
        <Space direction="vertical" size="small">
          {record.entries.length === 0 ? (
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => openAddModal(record.user)}
            >
              {t('timeEntry.addEntry')}
            </Button>
          ) : (
            <>
              {record.entries.map((entry, idx) => (
                <Space key={idx} size="small" wrap>
                  <ClockCircleOutlined />
                  <Text>{entry.start_time?.substring(0, 5)} - {entry.end_time?.substring(0, 5)}</Text>
                  {entry.workplace === 'office' ? (
                    <Tag color="green"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('timeEntry.office')}</Tag>
                  ) : (
                    <Tag color="cyan"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} />{t('timeEntry.remote')}</Tag>
                  )}
                  {entry.comment && (
                    <Text type="secondary" style={{ fontSize: 12 }}>({entry.comment})</Text>
                  )}
                  <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => openEditModal(entry, record.user)}
                  />
                  <Popconfirm
                    title={t('timeEntry.deleteConfirm')}
                    onConfirm={() => handleDeleteEntry(entry.id)}
                    okText={t('common.yes')}
                    cancelText={t('common.no')}
                  >
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ))}
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => openAddModal(record.user)}
              >
                {t('timeEntry.addEntry')}
              </Button>
            </>
          )}
        </Space>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 180,
      render: (_: any, record: EmployeeDayData) => (
        <Dropdown
          menu={{
            onClick: ({ key }) => {
              if (key === 'clear' && record.dayStatusId) {
                handleClearStatus(record.user, record.dayStatusId);
              } else if (key === 'excused') {
                openExcusedModal(record.user);
              } else {
                handleSetStatus(record.user, key as 'sick' | 'vacation' | 'excused' | 'unexcused' | 'holiday' | 'dayoff');
              }
            },
            items: [
              ...(record.dayStatusId ? [{
                key: 'clear',
                icon: <DeleteOutlined />,
                label: t('admin.daily.clearStatus'),
                danger: true,
              }, { type: 'divider' as const }] : []),
              {
                key: 'sick',
                icon: <DynamicIcon name={settings.icon_sick} size={14} />,
                label: t('calendar.sickDay'),
              },
              {
                key: 'vacation',
                icon: <DynamicIcon name={settings.icon_vacation} size={14} />,
                label: t('calendar.vacation'),
              },
              {
                key: 'excused',
                icon: <DynamicIcon name={settings.icon_excused} size={14} />,
                label: t('calendar.excusedAbsence'),
              },
              {
                key: 'unexcused',
                icon: <DynamicIcon name={settings.icon_unexcused} size={14} />,
                label: t('calendar.unexcusedAbsence'),
              },
              {
                key: 'holiday',
                icon: <DynamicIcon name={settings.icon_holiday} size={14} />,
                label: t('calendar.holiday'),
              },
              {
                key: 'dayoff',
                icon: <DynamicIcon name={settings.icon_dayoff} size={14} />,
                label: t('calendar.dayoff'),
              },
            ],
          }}
        >
          <Button>
            {t('admin.daily.setStatus')} <DownOutlined />
          </Button>
        </Dropdown>
      ),
    },
  ];

  const totalWorking = dailyData.filter(d => d.status === 'working').length;
  const totalAbsent = dailyData.filter(d => d.status === 'absent').length;

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} md="auto">
          <Title level={3} style={{ margin: 0 }}>
            {t('admin.daily.title')}
          </Title>
          <Text type="secondary">{t('admin.daily.subtitle')}</Text>
        </Col>
        <Col xs={24} md="auto">
          <DatePicker
            value={selectedDate}
            onChange={handleDateChange}
            allowClear={false}
            size="large"
            format="DD.MM.YYYY"
          />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} md={8}>
          <Card>
            <Space>
              <ClockCircleOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <div>
                <Text type="secondary">{t('admin.daily.working')}</Text>
                <Title level={4} style={{ margin: 0 }}>{totalWorking}</Title>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Space>
              <ExclamationCircleOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />
              <div>
                <Text type="secondary">{t('admin.daily.absent')}</Text>
                <Title level={4} style={{ margin: 0 }}>{totalAbsent}</Title>
              </div>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card>
            <Space>
              <UserOutlined style={{ fontSize: 24, color: '#52c41a' }} />
              <div>
                <Text type="secondary">{t('admin.daily.total')}</Text>
                <Title level={4} style={{ margin: 0 }}>{dailyData.length}</Title>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      <Card extra={
        <Input
          placeholder={t('common.search')}
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          allowClear
          style={{ width: 200 }}
        />
      }>
        <Table
          columns={columns}
          dataSource={dailyData.filter((d) => {
            if (!debouncedSearch) return true;
            const name = `${d.user.profile?.first_name || ''} ${d.user.profile?.last_name || ''}`.toLowerCase();
            return name.includes(debouncedSearch.toLowerCase());
          })}
          rowKey={(record) => record.user.id}
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Excused Absence Modal */}
      <Modal
        title={t('calendar.excusedAbsence')}
        open={excusedModalVisible}
        onCancel={() => {
          setExcusedModalVisible(false);
          setSelectedEmployee(null);
          excusedForm.resetFields();
        }}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          {selectedEmployee && (
            <Space>
              <Text>{t('statistics.employee')}:</Text>
              <Text strong>
                {selectedEmployee.profile
                  ? `${selectedEmployee.profile.first_name} ${selectedEmployee.profile.last_name}`
                  : selectedEmployee.email}
              </Text>
            </Space>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text>{t('common.date')}: </Text>
          <Text strong>{selectedDate.format('DD.MM.YYYY')}</Text>
        </div>
        <Form form={excusedForm} onFinish={handleExcusedAbsence} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setExcusedModalVisible(false);
                setSelectedEmployee(null);
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('common.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit/Add Time Entry Modal */}
      <Modal
        title={editingEntry ? t('timeEntry.editEntry') : t('timeEntry.addEntry')}
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          setEditingEntry(null);
          setEditingUser(null);
          entryForm.resetFields();
        }}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          {editingUser && (
            <Space>
              <Text>{t('statistics.employee')}:</Text>
              <Text strong>
                {editingUser.profile
                  ? `${editingUser.profile.first_name} ${editingUser.profile.last_name}`
                  : editingUser.email}
              </Text>
            </Space>
          )}
        </div>
        <div style={{ marginBottom: 16 }}>
          <Text>{t('common.date')}: </Text>
          <Text strong>{selectedDate.format('DD.MM.YYYY')}</Text>
        </div>
        <Form form={entryForm} onFinish={handleSaveEntry} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="start_time"
                label={t('timeEntry.startTime')}
                rules={[{ required: true, message: t('errors.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="end_time"
                label={t('timeEntry.endTime')}
                rules={[{ required: true, message: t('errors.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="break_minutes" label={t('timeEntry.breakMinutes')}>
                <InputNumber min={0} max={480} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="workplace"
                label={t('timeEntry.workplace')}
                rules={[{ required: true, message: t('errors.required') }]}
              >
                <Select>
                  <Select.Option value="office">{t('timeEntry.office')}</Select.Option>
                  <Select.Option value="remote">{t('timeEntry.remote')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="comment" label={t('timeEntry.comment')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setEditModalVisible(false);
                setEditingEntry(null);
                setEditingUser(null);
                entryForm.resetFields();
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('common.save')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default DailyOverviewPage;