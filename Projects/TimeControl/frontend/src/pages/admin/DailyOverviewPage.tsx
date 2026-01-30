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
} from 'antd';
import {
  ClockCircleOutlined,
  HomeOutlined,
  LaptopOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import { User, TimeEntry } from '../../types';

const { Title, Text } = Typography;

interface EmployeeDayData {
  user: User;
  entries: TimeEntry[];
  totalHours: number;
  status: 'working' | 'vacation' | 'sick' | 'excused' | 'absent';
}

const DailyOverviewPage: React.FC = () => {
  const { t } = useTranslation();
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
      let employeesStatus: any = {};
      try {
        const statusResponse = await api.getAllEmployeesStatus(dateStr);
        if (statusResponse?.employees) {
          statusResponse.employees.forEach((emp: any) => {
            employeesStatus[emp.user_id] = emp.status;
          });
        }
      } catch (e) {
        // If API fails, continue without status data
      }

      for (const employee of employeeList) {
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
          const apiStatus = employeesStatus[employee.id];

          if (apiStatus === 'vacation') {
            status = 'vacation';
          } else if (apiStatus === 'sick') {
            status = 'sick';
          } else if (apiStatus === 'excused') {
            status = 'excused';
          } else if (entries && entries.length > 0) {
            status = 'working';
          }

          results.push({
            user: employee,
            entries: entries || [],
            totalHours,
            status,
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
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const openEditModal = (entry: TimeEntry, user: User) => {
    setEditingEntry(entry);
    setEditingUser(user);
    entryForm.setFieldsValue({
      start_time: dayjs(entry.start_time, 'HH:mm'),
      end_time: dayjs(entry.end_time, 'HH:mm'),
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
    entryForm.setFieldsValue({
      break_minutes: 0,
      workplace: 'office',
    });
    setEditModalVisible(true);
  };

  const handleSaveEntry = async (values: any) => {
    if (!editingUser) return;

    try {
      const entryData = {
        date: selectedDate.format('YYYY-MM-DD'),
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: values.break_minutes || 0,
        workplace: values.workplace,
        comment: values.comment,
      };

      if (editingEntry) {
        // Update existing entry
        await api.updateTimeEntry(editingEntry.id, entryData);
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
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleDeleteEntry = async (entryId: number) => {
    try {
      await api.deleteTimeEntry(entryId);
      message.success(t('timeEntry.deleteSuccess'));
      fetchDailyData(selectedDate, employees);
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const getStatusTag = (data: EmployeeDayData) => {
    if (data.status === 'working') {
      return <Tag color="green">{formatHours(data.totalHours)}</Tag>;
    }
    if (data.status === 'vacation') {
      return <Tag color="blue">{t('calendar.vacation')}</Tag>;
    }
    if (data.status === 'sick') {
      return <Tag color="orange">{t('calendar.sickDay')}</Tag>;
    }
    if (data.status === 'excused') {
      return <Tag color="purple">{t('calendar.excusedAbsence')}</Tag>;
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
                  <Text>{entry.start_time} - {entry.end_time}</Text>
                  {entry.workplace === 'office' ? (
                    <Tag icon={<HomeOutlined />} color="blue">{t('timeEntry.office')}</Tag>
                  ) : (
                    <Tag icon={<LaptopOutlined />} color="green">{t('timeEntry.remote')}</Tag>
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
      width: 120,
      render: (_: any, record: EmployeeDayData) => (
        <Button
          type="link"
          icon={<ExclamationCircleOutlined />}
          onClick={() => openExcusedModal(record.user)}
        >
          {t('calendar.excusedAbsence')}
        </Button>
      ),
    },
  ];

  const totalWorking = dailyData.filter(d => d.status === 'working').length;
  const totalAbsent = dailyData.filter(d => d.status === 'absent').length;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            {t('admin.daily.title')}
          </Title>
          <Text type="secondary">{t('admin.daily.subtitle')}</Text>
        </Col>
        <Col>
          <DatePicker
            value={selectedDate}
            onChange={handleDateChange}
            allowClear={false}
            size="large"
          />
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
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
        <Col span={8}>
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
        <Col span={8}>
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

      <Card>
        <Table
          columns={columns}
          dataSource={dailyData}
          rowKey={(record) => record.user.id}
          loading={loading}
          pagination={false}
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
        <Form form={excusedForm} onFinish={handleExcusedAbsence} layout="vertical">
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
        <Form form={entryForm} onFinish={handleSaveEntry} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label={t('timeEntry.startTime')}
                rules={[{ required: true, message: t('errors.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label={t('timeEntry.endTime')}
                rules={[{ required: true, message: t('errors.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="break_minutes" label={t('timeEntry.breakMinutes')}>
                <InputNumber min={0} max={480} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
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