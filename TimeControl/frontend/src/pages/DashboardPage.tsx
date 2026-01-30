import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Row,
  Col,
  Card,
  Statistic,
  Button,
  Typography,
  Space,
  Modal,
  Form,
  TimePicker,
  InputNumber,
  Select,
  Input,
  message,
  List,
  Tag,
  DatePicker,
  Divider,
  Popconfirm,
  Empty,
  Tabs,
  theme,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { Clock, Calendar } from 'lucide-react';
import DynamicIcon from '../components/DynamicIcon';
import { useSettingsStore } from '../store/settingsStore';
import dayjs from 'dayjs';
import api from '../services/api';
import { DaySummary, TimeEntry, Stats, Vacation, DayStatus } from '../types';

const { Title, Text } = Typography;

const DashboardPage: React.FC = () => {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const { settings, fetchSettings } = useSettingsStore();
  const [todaySummary, setTodaySummary] = useState<DaySummary | null>(null);
  const [monthStats, setMonthStats] = useState<Stats | null>(null);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [sickDays, setSickDays] = useState<DayStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [vacationModalVisible, setVacationModalVisible] = useState(false);
  const [sickModalVisible, setSickModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [vacationForm] = Form.useForm();
  const [sickForm] = Form.useForm();
  const [editVacationForm] = Form.useForm();
  const [editSickForm] = Form.useForm();
  const [editVacationModalVisible, setEditVacationModalVisible] = useState(false);
  const [editSickModalVisible, setEditSickModalVisible] = useState(false);
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null);
  const [editingSickDay, setEditingSickDay] = useState<DayStatus | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');
      const [summary, stats] = await Promise.all([
        api.getDaySummary(today),
        api.getMyStats({ period: 'month' }),
      ]);
      setTodaySummary(summary);
      setMonthStats(stats);
    } catch (error) {
      message.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async () => {
    setScheduleLoading(true);
    try {
      const [vacationsData, sickDaysData] = await Promise.all([
        api.getVacations(),
        api.getMySickDays(),
      ]);
      setVacations(vacationsData);
      setSickDays(sickDaysData);
    } catch (error) {
      console.error('Failed to load schedule data');
    } finally {
      setScheduleLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchSchedule();
    fetchSettings();
  }, [fetchSettings]);

  const handleCreateEntry = async (values: any) => {
    // Break is 60 for first entry, 0 for subsequent entries (enforced, not editable)
    const isFirstEntry = !todaySummary?.entries || todaySummary.entries.length === 0;
    const breakMins = isFirstEntry ? 60 : 0;

    // Calculate existing work hours for the day
    const existingWorkMinutes = todaySummary?.entries?.reduce((sum, e) => sum + (e.duration_hours * 60), 0) || 0;

    // Validate max 8 hours total work time per day
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const newWorkMinutes = (endMinutes - startMinutes) - breakMins;
    const totalWorkMinutes = existingWorkMinutes + newWorkMinutes;
    if (totalWorkMinutes > 480) {
      message.error(t('timeEntry.validation.maxHoursDaily'));
      return;
    }

    try {
      await api.createTimeEntry({
        date: dayjs().format('YYYY-MM-DD'),
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: breakMins,
        workplace: values.workplace,
        comment: values.comment,
      });
      message.success('Time entry created');
      setEntryModalVisible(false);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Failed to create entry');
    }
  };

  const handleCreateVacation = async (values: any) => {
    try {
      await api.createVacation({
        date_from: values.dates[0].format('YYYY-MM-DD'),
        date_to: values.dates[1].format('YYYY-MM-DD'),
        note: values.note,
      });
      message.success(t('vacation.requestSuccess'));
      setVacationModalVisible(false);
      vacationForm.resetFields();
      fetchData();
      fetchSchedule();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleCreateSick = async (values: any) => {
    try {
      await api.createDayStatus({
        date: values.date.format('YYYY-MM-DD'),
        status: 'sick',
        note: values.note,
      });
      message.success(t('calendar.sickDay') + ' - OK');
      setSickModalVisible(false);
      sickForm.resetFields();
      fetchData();
      fetchSchedule();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleDeleteEntry = async (id: number) => {
    try {
      await api.deleteTimeEntry(id);
      message.success(t('timeEntry.deleteSuccess'));
      fetchData();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleDeleteVacation = async (id: number) => {
    try {
      await api.deleteVacation(id);
      message.success(t('vacation.deleteSuccess'));
      fetchSchedule();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleDeleteSickDay = async (id: number) => {
    try {
      await api.deleteDayStatus(id);
      message.success(t('sickDay.deleteSuccess'));
      fetchSchedule();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const openEditVacationModal = (vacation: Vacation) => {
    setEditingVacation(vacation);
    const today = dayjs();
    const startDate = dayjs(vacation.date_from);
    // If vacation has started, start date is locked to today or original (whichever is later)
    const effectiveStartDate = startDate.isBefore(today) ? today : startDate;
    editVacationForm.setFieldsValue({
      date_from: effectiveStartDate,
      date_to: dayjs(vacation.date_to),
      note: vacation.note,
    });
    setEditVacationModalVisible(true);
  };

  const openEditSickModal = (sickDay: DayStatus) => {
    setEditingSickDay(sickDay);
    editSickForm.setFieldsValue({
      date: dayjs(sickDay.date),
      note: sickDay.note,
    });
    setEditSickModalVisible(true);
  };

  const handleEditVacation = async (values: any) => {
    if (!editingVacation) return;
    try {
      await api.updateVacation(editingVacation.id, {
        date_from: values.date_from.format('YYYY-MM-DD'),
        date_to: values.date_to.format('YYYY-MM-DD'),
        note: values.note,
      });
      message.success(t('vacation.updateSuccess'));
      setEditVacationModalVisible(false);
      editVacationForm.resetFields();
      setEditingVacation(null);
      fetchData();
      fetchSchedule();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleEditSickDay = async (values: any) => {
    if (!editingSickDay) return;
    try {
      await api.updateDayStatus(editingSickDay.id, {
        date: values.date.format('YYYY-MM-DD'),
        note: values.note,
      });
      message.success(t('sickDay.updateSuccess'));
      setEditSickModalVisible(false);
      editSickForm.resetFields();
      setEditingSickDay(null);
      fetchData();
      fetchSchedule();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  // Helper to check if vacation can be deleted (only future vacations)
  const canDeleteVacation = (vacation: Vacation) => {
    const today = dayjs().startOf('day');
    return dayjs(vacation.date_from).isAfter(today);
  };

  // Helper to check if sick day can be deleted (only future dates)
  const canDeleteSickDay = (sickDay: DayStatus) => {
    const today = dayjs().startOf('day');
    return dayjs(sickDay.date).isAfter(today);
  };

  // Helper to check if vacation start date is editable
  const isVacationStartEditable = (vacation: Vacation) => {
    const today = dayjs().startOf('day');
    return dayjs(vacation.date_from).isAfter(today);
  };

  // Helper to check if vacation has ended (no editing allowed)
  const hasVacationEnded = (vacation: Vacation) => {
    const today = dayjs().startOf('day');
    return dayjs(vacation.date_to).isBefore(today);
  };

  // Helper to check if sick day is in the past (no editing allowed)
  const isSickDayPast = (sickDay: DayStatus) => {
    const today = dayjs().startOf('day');
    return dayjs(sickDay.date).isBefore(today);
  };

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5);
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const scheduleTabItems = [
    {
      key: 'vacations',
      label: (
        <span>
          <DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} /> {t('calendar.vacation')}
        </span>
      ),
      children: (
        <List
          loading={scheduleLoading}
          dataSource={vacations}
          locale={{ emptyText: <Empty description={t('vacation.noVacations')} /> }}
          renderItem={(vacation: Vacation) => {
            const ended = hasVacationEnded(vacation);
            const canDelete = canDeleteVacation(vacation);
            return (
              <List.Item
                actions={[
                  // Edit button - only if vacation hasn't ended
                  !ended && (
                    <Button
                      key="edit"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => openEditVacationModal(vacation)}
                    >
                      {t('common.edit')}
                    </Button>
                  ),
                  // Delete button - only for future vacations
                  canDelete && (
                    <Popconfirm
                      key="delete"
                      title={t('vacation.deleteConfirm')}
                      onConfirm={() => handleDeleteVacation(vacation.id)}
                      okText={t('common.yes')}
                      cancelText={t('common.no')}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />}>
                        {t('common.delete')}
                      </Button>
                    </Popconfirm>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>
                        {dayjs(vacation.date_from).format('DD.MM.YYYY')} - {dayjs(vacation.date_to).format('DD.MM.YYYY')}
                      </Text>
                      <Tag color="blue">{vacation.days_count} {t('vacation.days')}</Tag>
                    </Space>
                  }
                  description={vacation.note}
                />
              </List.Item>
            );
          }}
        />
      ),
    },
    {
      key: 'sickDays',
      label: (
        <span>
          <DynamicIcon name={settings.icon_sick} size={14} style={{ marginRight: 4 }} /> {t('calendar.sickDay')}
        </span>
      ),
      children: (
        <List
          loading={scheduleLoading}
          dataSource={sickDays}
          locale={{ emptyText: <Empty description={t('vacation.noSickDays')} /> }}
          renderItem={(sickDay: DayStatus) => {
            const isPast = isSickDayPast(sickDay);
            const canDelete = canDeleteSickDay(sickDay);
            return (
              <List.Item
                actions={[
                  // Edit button - only if not in the past
                  !isPast && (
                    <Button
                      key="edit"
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => openEditSickModal(sickDay)}
                    >
                      {t('common.edit')}
                    </Button>
                  ),
                  // Delete button - only for future sick days
                  canDelete && (
                    <Popconfirm
                      key="delete"
                      title={t('sickDay.deleteConfirm')}
                      onConfirm={() => handleDeleteSickDay(sickDay.id)}
                      okText={t('common.yes')}
                      cancelText={t('common.no')}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />}>
                        {t('common.delete')}
                      </Button>
                    </Popconfirm>
                  ),
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{dayjs(sickDay.date).format('DD.MM.YYYY')}</Text>
                      <Tag color="red">{t('calendar.sickDay')}</Tag>
                    </Space>
                  }
                  description={sickDay.note}
                />
              </List.Item>
            );
          }}
        />
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            {t('dashboard.title')}
          </Title>
          <Text type="secondary">
            {dayjs().format('dddd, D MMMM YYYY')}
          </Text>
        </Col>
        <Col>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                const isFirstEntry = !todaySummary?.entries || todaySummary.entries.length === 0;
                form.setFieldsValue({ break_minutes: isFirstEntry ? 60 : 0 });
                setEntryModalVisible(true);
              }}
            >
              {t('timeEntry.addEntry')}
            </Button>
            <Button
              icon={<DynamicIcon name={settings.icon_vacation} size={16} />}
              onClick={() => setVacationModalVisible(true)}
            >
              {t('calendar.vacation')}
            </Button>
            <Button
              icon={<DynamicIcon name={settings.icon_sick} size={16} />}
              onClick={() => setSickModalVisible(true)}
            >
              {t('calendar.sickDay')}
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('dashboard.todayHours')}
              value={formatHours(todaySummary?.total_hours || 0)}
              prefix={<Clock size={20} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('dashboard.monthHours')}
              value={formatHours(monthStats?.total_hours || 0)}
              prefix={<Calendar size={20} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('statistics.officeTime')}
              value={monthStats?.office_days || 0}
              prefix={<DynamicIcon name={settings.icon_office} size={20} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('statistics.remoteTime')}
              value={monthStats?.remote_days || 0}
              prefix={<DynamicIcon name={settings.icon_remote} size={20} />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        <Col xs={24} lg={12}>
          <Card title={<><Clock size={18} style={{ marginRight: 8 }} />{t('dashboard.recentTimeLogs')}</>} loading={loading}>
            {todaySummary?.entries && todaySummary.entries.length > 0 ? (
              <>
                <List
                  dataSource={todaySummary.entries}
                  renderItem={(entry: TimeEntry) => (
                    <List.Item
                      className="time-entry-item"
                      style={{
                        background: token.colorFillQuaternary,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                      actions={[
                        <Button
                          type="link"
                          danger
                          onClick={() => handleDeleteEntry(entry.id)}
                        >
                          {t('common.delete')}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Text strong>
                              {formatTime(entry.start_time)} - {formatTime(entry.end_time)}
                            </Text>
                            <Tag color={entry.workplace === 'office' ? 'blue' : 'green'}>
                              {entry.workplace === 'office' ? (
                                <>
                                  <DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} /> {t('timeEntry.office')}
                                </>
                              ) : (
                                <>
                                  <DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} /> {t('timeEntry.remote')}
                                </>
                              )}
                            </Tag>
                          </Space>
                        }
                        description={
                          <Space>
                            <Text>{t('timeEntry.duration')}: {formatHours(entry.duration_hours)}</Text>
                            {entry.break_minutes > 0 && (
                              <Text type="secondary">
                                ({t('timeEntry.breakMinutes')}: {entry.break_minutes})
                              </Text>
                            )}
                            {entry.comment && (
                              <Text type="secondary">- {entry.comment}</Text>
                            )}
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
                <Divider />
                <Row justify="end">
                  <Col>
                    <Space size="large">
                      <Text strong>
                        {t('common.total')}: {formatHours(todaySummary.total_hours)}
                      </Text>
                      {todaySummary.total_break_minutes > 0 && (
                        <Text type="secondary">
                          {t('timeEntry.breakMinutes')}: {todaySummary.total_break_minutes}
                        </Text>
                      )}
                    </Space>
                  </Col>
                </Row>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="secondary">{t('dashboard.noTimeLogs')}</Text>
                <br />
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    form.setFieldsValue({ break_minutes: 60 });
                    setEntryModalVisible(true);
                  }}
                  style={{ marginTop: 16 }}
                >
                  {t('dashboard.addWorkTime')}
                </Button>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title={t('vacation.mySchedule')}>
            <Tabs items={scheduleTabItems} />
          </Card>
        </Col>
      </Row>

      {/* Add Time Entry Modal */}
      <Modal
        title={t('timeEntry.addEntry')}
        open={entryModalVisible}
        onCancel={() => setEntryModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreateEntry} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="start_time"
                label={t('timeEntry.startTime')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="end_time"
                label={t('timeEntry.endTime')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="break_minutes"
                label={t('timeEntry.breakMinutes')}
                initialValue={todaySummary?.entries && todaySummary.entries.length > 0 ? 0 : 60}
                tooltip={todaySummary?.entries && todaySummary.entries.length > 0 ? t('timeEntry.breakNotAllowedSecondEntry') : undefined}
              >
                <InputNumber
                  min={0}
                  max={480}
                  style={{ width: '100%' }}
                  disabled={true}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="workplace"
                label={t('timeEntry.workplace')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                initialValue="office"
              >
                <Select>
                  <Select.Option value="office">
                    <DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} /> {t('timeEntry.office')}
                  </Select.Option>
                  <Select.Option value="remote">
                    <DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} /> {t('timeEntry.remote')}
                  </Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="comment" label={t('timeEntry.comment')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEntryModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {t('common.add')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Vacation Modal */}
      <Modal
        title={t('vacation.requestVacation')}
        open={vacationModalVisible}
        onCancel={() => setVacationModalVisible(false)}
        footer={null}
      >
        <Form form={vacationForm} onFinish={handleCreateVacation} layout="vertical">
          <Form.Item
            name="dates"
            label={t('vacation.startDate') + ' - ' + t('vacation.endDate')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setVacationModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {t('common.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Sick Day Modal */}
      <Modal
        title={t('calendar.sickDay')}
        open={sickModalVisible}
        onCancel={() => setSickModalVisible(false)}
        footer={null}
      >
        <Form form={sickForm} onFinish={handleCreateSick} layout="vertical">
          <Form.Item
            name="date"
            label={t('common.date')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            initialValue={dayjs()}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setSickModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {t('common.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Edit Vacation Modal */}
      <Modal
        title={t('vacation.editVacation')}
        open={editVacationModalVisible}
        onCancel={() => {
          setEditVacationModalVisible(false);
          setEditingVacation(null);
          editVacationForm.resetFields();
        }}
        footer={null}
      >
        {editingVacation && (
          <Form form={editVacationForm} onFinish={handleEditVacation} layout="vertical">
            <Form.Item
              name="date_from"
              label={t('vacation.startDate')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabled={!isVacationStartEditable(editingVacation)}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>
            <Form.Item
              name="date_to"
              label={t('vacation.endDate')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>
            <Form.Item name="note" label={t('vacation.reason')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            {!isVacationStartEditable(editingVacation) && (
              <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                {t('vacation.startDateLocked')}
              </Text>
            )}
            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => {
                  setEditVacationModalVisible(false);
                  setEditingVacation(null);
                  editVacationForm.resetFields();
                }}>
                  {t('common.cancel')}
                </Button>
                <Button type="primary" htmlType="submit">
                  {t('common.save')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>

      {/* Edit Sick Day Modal */}
      <Modal
        title={t('sickDay.editSickDay')}
        open={editSickModalVisible}
        onCancel={() => {
          setEditSickModalVisible(false);
          setEditingSickDay(null);
          editSickForm.resetFields();
        }}
        footer={null}
      >
        {editingSickDay && (
          <Form form={editSickForm} onFinish={handleEditSickDay} layout="vertical">
            <Form.Item
              name="date"
              label={t('common.date')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(current) => current && current < dayjs().startOf('day')}
              />
            </Form.Item>
            <Form.Item name="note" label={t('vacation.reason')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => {
                  setEditSickModalVisible(false);
                  setEditingSickDay(null);
                  editSickForm.resetFields();
                }}>
                  {t('common.cancel')}
                </Button>
                <Button type="primary" htmlType="submit">
                  {t('common.save')}
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default DashboardPage;