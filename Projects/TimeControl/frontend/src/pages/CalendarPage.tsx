import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Calendar,
  Card,
  Typography,
  Modal,
  List,
  Tag,
  Space,
  Button,
  message,
  Tooltip,
  Form,
  TimePicker,
  InputNumber,
  Select,
  Input,
  DatePicker,
  Alert,
  Divider,
  theme,
} from 'antd';
import { PlusOutlined, ExclamationCircleOutlined, SendOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../services/api';
import { CalendarDay, DaySummary, TimeEntry, DayStatus } from '../types';
import DynamicIcon from '../components/DynamicIcon';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

const CalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const { settings, fetchSettings } = useSettingsStore();
  const { user } = useAuthStore();

  const getHolidayName = (calDay: CalendarDay): string | undefined => {
    if (!calDay.holiday_name) return undefined;
    const lang = i18n.language;
    if (lang === 'lv') return calDay.holiday_name_lv || calDay.holiday_name;
    if (lang === 'en') return calDay.holiday_name_en || calDay.holiday_name;
    return calDay.holiday_name; // Russian default
  };
  const [calendarDays, setCalendarDays] = useState<Map<string, CalendarDay>>(new Map());
  const [timeEntries, setTimeEntries] = useState<Map<string, TimeEntry[]>>(new Map());
  const [dayStatuses, setDayStatuses] = useState<Map<string, DayStatus>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [vacationModalVisible, setVacationModalVisible] = useState(false);
  const [sickDayModalVisible, setSickDayModalVisible] = useState(false);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [changeRequestModalVisible, setChangeRequestModalVisible] = useState(false);
  const [changeRequestDate, setChangeRequestDate] = useState<string | null>(null);
  const [weeklyReminderVisible, setWeeklyReminderVisible] = useState(false);
  const [missingDays, setMissingDays] = useState<Dayjs[]>([]);
  const [currentFillingDay, setCurrentFillingDay] = useState<Dayjs | null>(null);
  const [weeklyReminderChecked, setWeeklyReminderChecked] = useState(false);
  const [form] = Form.useForm();
  const [vacationForm] = Form.useForm();
  const [sickDayForm] = Form.useForm();
  const [changeRequestForm] = Form.useForm();
  const [weeklyForm] = Form.useForm();

  const fetchMonthData = async (month: Dayjs) => {
    setLoading(true);
    try {
      const year = month.year();
      const monthNum = month.month() + 1;
      const startDate = month.startOf('month').format('YYYY-MM-DD');
      const endDate = month.endOf('month').format('YYYY-MM-DD');

      const [calendarData, entriesData, statusesData] = await Promise.all([
        api.getCalendarMonth(year, monthNum),
        api.getTimeEntries({ date_from: startDate, date_to: endDate }),
        api.getDayStatuses({ date_from: startDate, date_to: endDate }),
      ]);

      // Map calendar days
      const daysMap = new Map<string, CalendarDay>();
      calendarData.days.forEach((day: CalendarDay) => {
        daysMap.set(day.date, day);
      });
      setCalendarDays(daysMap);

      // Group entries by date
      const entriesMap = new Map<string, TimeEntry[]>();
      entriesData.forEach((entry: TimeEntry) => {
        if (!entriesMap.has(entry.date)) {
          entriesMap.set(entry.date, []);
        }
        entriesMap.get(entry.date)!.push(entry);
      });
      setTimeEntries(entriesMap);

      // Map statuses
      const statusMap = new Map<string, DayStatus>();
      statusesData.forEach((status: DayStatus) => {
        statusMap.set(status.date, status);
      });
      setDayStatuses(statusMap);
    } catch (error) {
      message.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchMonthData(currentMonth);
  }, [currentMonth]);

  // Check for missing entries this week on mount (only for employees, not admins)
  useEffect(() => {
    const checkWeeklyEntries = async () => {
      if (weeklyReminderChecked) return;

      // Skip for admins - they fill in if they want
      if (user?.role === 'admin') {
        setWeeklyReminderChecked(true);
        return;
      }

      const today = dayjs();
      const weekStart = today.startOf('isoWeek'); // Monday
      const weekEnd = weekStart.add(4, 'day'); // Friday

      try {
        // Get calendar days for this week
        const calendarData = await api.getCalendarMonth(today.year(), today.month() + 1);
        const calendarMap = new Map<string, CalendarDay>();
        calendarData.days.forEach((day: CalendarDay) => {
          calendarMap.set(day.date, day);
        });

        // Get entries and statuses for this week
        const [entriesData, statusesData] = await Promise.all([
          api.getTimeEntries({ date_from: weekStart.format('YYYY-MM-DD'), date_to: weekEnd.format('YYYY-MM-DD') }),
          api.getDayStatuses({ date_from: weekStart.format('YYYY-MM-DD'), date_to: weekEnd.format('YYYY-MM-DD') }),
        ]);

        const entriesMap = new Map<string, boolean>();
        entriesData.forEach((entry: TimeEntry) => {
          entriesMap.set(entry.date, true);
        });

        const statusMap = new Map<string, DayStatus>();
        statusesData.forEach((status: DayStatus) => {
          statusMap.set(status.date, status);
        });

        // Find missing working days - days we can fill (today and past, not future)
        const missing: Dayjs[] = [];
        let currentDay = weekStart;

        while (!currentDay.isAfter(weekEnd, 'day')) {
          const dateStr = currentDay.format('YYYY-MM-DD');
          const calDay = calendarMap.get(dateStr);
          const status = statusMap.get(dateStr);
          const hasEntry = entriesMap.has(dateStr);

          // Skip weekends
          if (currentDay.day() === 0 || currentDay.day() === 6) {
            currentDay = currentDay.add(1, 'day');
            continue;
          }

          // Skip holidays
          if (calDay?.day_type === 'holiday') {
            currentDay = currentDay.add(1, 'day');
            continue;
          }

          // Skip sick/vacation days
          if (status?.status === 'sick' || status?.status === 'vacation' || status?.status === 'excused') {
            currentDay = currentDay.add(1, 'day');
            continue;
          }

          // Add all working days without entries (including future days in current week)
          if (!hasEntry) {
            missing.push(currentDay);
          }

          currentDay = currentDay.add(1, 'day');
        }

        setWeeklyReminderChecked(true);

        if (missing.length > 0) {
          setMissingDays(missing);
          setCurrentFillingDay(missing[0]);
          setWeeklyReminderVisible(true);
        }
      } catch (error) {
        console.error('Failed to check weekly entries:', error);
        setWeeklyReminderChecked(true);
      }
    };

    // Small delay to ensure component is mounted
    const timer = setTimeout(checkWeeklyEntries, 500);
    return () => clearTimeout(timer);
  }, [weeklyReminderChecked, user?.role]);

  const handleDateSelect = async (date: Dayjs, info: { source: string }) => {
    // Update current month if navigating to different month
    if (date.month() !== currentMonth.month() || date.year() !== currentMonth.year()) {
      setCurrentMonth(date);
    }

    // Only open modal when clicking on a date cell, not when using year/month selectors
    if (info.source !== 'date') {
      return;
    }
    setSelectedDate(date);
    try {
      const summary = await api.getDaySummary(date.format('YYYY-MM-DD'));
      setDaySummary(summary);
      setDetailModalVisible(true);
    } catch (error) {
      message.error('Failed to load day details');
    }
  };

  const handlePanelChange = (date: Dayjs) => {
    setCurrentMonth(date);
  };

  const handleCreateEntry = async (values: any) => {
    // Break is 60 for first entry, 0 for subsequent entries (enforced, not editable)
    const isFirstEntry = !daySummary?.entries || daySummary.entries.length === 0;
    const breakMins = isFirstEntry ? 60 : 0;

    // Calculate existing work hours for the day
    const existingWorkMinutes = daySummary?.entries?.reduce((sum, e) => sum + (e.duration_hours * 60), 0) || 0;

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
        date: selectedDate.format('YYYY-MM-DD'),
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: breakMins,
        workplace: values.workplace,
        comment: values.comment,
      });
      message.success('Time entry created');
      setEntryModalVisible(false);
      form.resetFields();
      fetchMonthData(currentMonth);
      // Refresh day summary
      const summary = await api.getDaySummary(selectedDate.format('YYYY-MM-DD'));
      setDaySummary(summary);
    } catch (error: any) {
      message.error(error.response?.data?.detail || 'Failed to create entry');
    }
  };

  const showEditTimeExpiredModal = (entry: TimeEntry, action: 'edit' | 'delete') => {
    // Admins can edit directly without request
    if (user?.role === 'admin') {
      if (action === 'edit') {
        setEditingEntry(entry);
        form.setFieldsValue({
          start_time: dayjs(entry.start_time, 'HH:mm:ss'),
          end_time: dayjs(entry.end_time, 'HH:mm:ss'),
          break_minutes: entry.break_minutes,
          workplace: entry.workplace,
          comment: entry.comment,
        });
        setEntryModalVisible(true);
      } else {
        // Direct delete for admin
        Modal.confirm({
          title: t('calendar.confirmDelete'),
          icon: <ExclamationCircleOutlined />,
          content: t('calendar.confirmDeleteMessage'),
          okText: t('common.delete'),
          okType: 'danger',
          cancelText: t('common.cancel'),
          onOk: async () => {
            try {
              await api.deleteTimeEntry(entry.id);
              message.success(t('calendar.entryDeleted'));
              fetchMonthData(currentMonth);
              const summary = await api.getDaySummary(selectedDate.format('YYYY-MM-DD'));
              setDaySummary(summary);
            } catch (error: any) {
              message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
            }
          },
        });
      }
      return;
    }

    // Regular users need to request change
    Modal.confirm({
      title: t('errors.editTimeExpiredTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('errors.editTimeExpired'),
      okText: t('changeRequest.requestChange'),
      cancelText: t('common.cancel'),
      onOk: () => {
        // Open change request modal with pre-filled data
        changeRequestForm.resetFields();
        changeRequestForm.setFieldsValue({
          request_type: action === 'delete' ? 'delete' : 'edit',
          time_entry_id: entry.id,
          start_time: dayjs(entry.start_time, 'HH:mm:ss'),
          end_time: dayjs(entry.end_time, 'HH:mm:ss'),
          break_minutes: entry.break_minutes,
          workplace: entry.workplace,
          comment: entry.comment,
        });
        setChangeRequestDate(entry.date); // Store entry's date
        setChangeRequestModalVisible(true);
      },
    });
  };

  const handleEditEntry = async (values: any) => {
    if (!editingEntry) return;

    // Keep the existing break value (user can't change it)
    const breakMins = editingEntry.break_minutes;

    // Validate max 8 hours work time
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const workMinutes = (endMinutes - startMinutes) - breakMins;
    if (workMinutes > 480) {
      message.error(t('timeEntry.validation.maxHours'));
      return;
    }

    try{
      await api.updateTimeEntry(editingEntry.id, {
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: breakMins,
        workplace: values.workplace,
        comment: values.comment,
      });
      message.success('Entry updated');
      setEditingEntry(null);
      setEntryModalVisible(false);
      form.resetFields();
      fetchMonthData(currentMonth);
      const summary = await api.getDaySummary(selectedDate.format('YYYY-MM-DD'));
      setDaySummary(summary);
    } catch (error: any){
      if (error.response?.data?.detail === 'EDIT_TIME_EXPIRED') {
        setEntryModalVisible(false);
        showEditTimeExpiredModal(editingEntry, 'edit');
        setEditingEntry(null);
        form.resetFields();
      } else {
        message.error(error.response?.data?.detail || 'Failed to update entry');
      }
    }
  };

  const handleDeleteEntry = async (entry: TimeEntry) => {
    try {
      await api.deleteTimeEntry(entry.id);
      message.success('Entry deleted');
      fetchMonthData(currentMonth);
      // Refresh day summary
      const summary = await api.getDaySummary(selectedDate.format('YYYY-MM-DD'));
      setDaySummary(summary);
    } catch (error: any) {
      if (error.response?.data?.detail === 'EDIT_TIME_EXPIRED') {
        showEditTimeExpiredModal(entry, 'delete');
      } else {
        message.error('Failed to delete entry');
      }
    }
  };

  const handleCreateVacation = async (values: any) => {
    try {
      await api.createVacation({
        start_date: values.dates[0].format('YYYY-MM-DD'),
        end_date: values.dates[1].format('YYYY-MM-DD'),
        reason: values.reason,
      });
      message.success(t('vacation.requestSuccess'));
      setVacationModalVisible(false);
      vacationForm.resetFields();
      fetchMonthData(currentMonth);
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleCreateSickDay = async (values: any) => {
    try {
      await api.createSickDay({
        start_date: values.dates[0].format('YYYY-MM-DD'),
        end_date: values.dates[1].format('YYYY-MM-DD'),
        note: values.note,
      });
      message.success(t('calendar.sickDay') + ' - OK');
      setSickDayModalVisible(false);
      sickDayForm.resetFields();
      fetchMonthData(currentMonth);
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleCreateChangeRequest = async (values: any) => {
    // Determine break minutes based on request type
    let breakMins = values.break_minutes;
    if (values.request_type === 'add') {
      // For new entry: 60 for first entry, 0 for subsequent
      const hasExistingEntries = daySummary?.entries && daySummary.entries.length > 0;
      breakMins = hasExistingEntries ? 0 : 60;
    } else if (values.request_type === 'edit') {
      // For edit: keep the original entry's break value
      const selectedEntry = daySummary?.entries?.find(e => e.id === values.time_entry_id);
      breakMins = selectedEntry?.break_minutes ?? 60;
    }

    try {
      await api.createChangeRequest({
        request_type: values.request_type,
        time_entry_id: values.time_entry_id,
        date: changeRequestDate || selectedDate.format('YYYY-MM-DD'),
        start_time: values.start_time?.format('HH:mm'),
        end_time: values.end_time?.format('HH:mm'),
        break_minutes: breakMins,
        workplace: values.workplace,
        comment: values.comment,
        reason: values.reason,
      });
      message.success(t('changeRequest.createSuccess'));
      setChangeRequestModalVisible(false);
      setChangeRequestDate(null); // Reset stored date
      changeRequestForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleWeeklyEntrySubmit = async (values: any) => {
    if (!currentFillingDay) return;

    // Break is always 60 minutes for first entry (weekly reminder only shows days without entries)
    const breakMins = 60;

    // Validate max 8 hours work time
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const workMinutes = (endMinutes - startMinutes) - breakMins;
    if (workMinutes > 480) {
      message.error(t('timeEntry.validation.maxHours'));
      return;
    }

    try {
      await api.createTimeEntry({
        date: currentFillingDay.format('YYYY-MM-DD'),
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: breakMins,
        workplace: values.workplace,
        comment: values.comment,
      });
      message.success(`${currentFillingDay.format('DD.MM')} - ${t('common.save')}d`);

      // Move to next missing day
      const currentIndex = missingDays.findIndex(d => d.isSame(currentFillingDay, 'day'));
      const remainingDays = missingDays.filter((_, i) => i !== currentIndex);

      if (remainingDays.length > 0) {
        setMissingDays(remainingDays);
        setCurrentFillingDay(remainingDays[0]);
        weeklyForm.resetFields();
        // Set default values
        weeklyForm.setFieldsValue({
          workplace: 'office',
          break_minutes: 60,
        });
      } else {
        // All days filled
        setWeeklyReminderVisible(false);
        setMissingDays([]);
        setCurrentFillingDay(null);
        weeklyForm.resetFields();
        fetchMonthData(currentMonth);
        message.success(t('calendar.weekFilledSuccess'));
      }
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleSkipDay = () => {
    if (!currentFillingDay) return;

    const currentIndex = missingDays.findIndex(d => d.isSame(currentFillingDay, 'day'));
    const remainingDays = missingDays.filter((_, i) => i !== currentIndex);

    if (remainingDays.length > 0) {
      setMissingDays(remainingDays);
      setCurrentFillingDay(remainingDays[0]);
      weeklyForm.resetFields();
      weeklyForm.setFieldsValue({
        workplace: 'office',
        break_minutes: 60,
      });
    } else {
      setWeeklyReminderVisible(false);
      fetchMonthData(currentMonth);
    }
  };

  const handleEntrySelectForChangeRequest = (entryId: number) => {
    const entry = daySummary?.entries?.find(e => e.id === entryId);
    if (entry) {
      changeRequestForm.setFieldsValue({
        start_time: dayjs(entry.start_time, 'HH:mm:ss'),
        end_time: dayjs(entry.end_time, 'HH:mm:ss'),
        break_minutes: entry.break_minutes,
        workplace: entry.workplace,
        comment: entry.comment,
      });
    }
  };

  const formatTime = (timeStr: string) => timeStr.substring(0, 5);

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const dateCellRender = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const calDay = calendarDays.get(dateStr);
    const entries = timeEntries.get(dateStr) || [];
    const status = dayStatuses.get(dateStr);

    const totalHours = entries.reduce((sum, e) => sum + e.duration_hours, 0);
    const hasOffice = entries.some((e) => e.workplace === 'office');
    const hasRemote = entries.some((e) => e.workplace === 'remote');

    let bgColor = '';

    // Colors: sick=yellow, vacation=blue, office=green, remote=purple, holiday=red, weekend=pink
    if (status?.status === 'sick') {
      bgColor = '#fffbe6'; // yellow
    } else if (status?.status === 'vacation') {
      bgColor = '#e6f4ff'; // blue (vacation color)
    } else if (status?.status === 'excused') {
      bgColor = '#f9f0ff'; // light purple for excused
    } else if (calDay?.day_type === 'holiday') {
      bgColor = '#fff1f0'; // red/pink for holiday
    } else if (calDay?.day_type === 'weekend') {
      bgColor = '#fff0f6'; // brighter pink for weekend
    } else if (hasOffice && !hasRemote) {
      bgColor = '#f6ffed'; // green for office only
    } else if (hasRemote && !hasOffice) {
      bgColor = '#f9f0ff'; // purple for remote only
    } else if (hasOffice && hasRemote) {
      bgColor = '#f0f5ff'; // light blue for mixed
    }

    return (
      <div
        style={{
          height: '100%',
          backgroundColor: bgColor,
          borderRadius: 4,
          padding: 4,
        }}
      >
        {calDay && getHolidayName(calDay) && (
          <Tooltip title={getHolidayName(calDay)}>
            <Tag color="red" style={{ fontSize: 12, padding: '2px 6px', marginBottom: 2 }}>
              <DynamicIcon name={settings.icon_holiday} size={16} />
            </Tag>
          </Tooltip>
        )}
        {status?.status === 'sick' && (
          <Tag color="gold" style={{ fontSize: 12, padding: '2px 6px', marginBottom: 2 }}>
            <DynamicIcon name={settings.icon_sick} size={16} />
          </Tag>
        )}
        {status?.status === 'vacation' && (
          <Tag color="blue" style={{ fontSize: 12, padding: '2px 6px', marginBottom: 2 }}>
            <DynamicIcon name={settings.icon_vacation} size={16} />
          </Tag>
        )}
        {status?.status === 'excused' && (
          <Tag color="purple" style={{ fontSize: 12, padding: '2px 6px', marginBottom: 2 }}>
            <DynamicIcon name={settings.icon_excused} size={16} />
          </Tag>
        )}
        {entries.length > 0 && (
          <div style={{ marginTop: 2 }}>
            <Text type="success" strong style={{ fontSize: 12 }}>
              {formatHours(totalHours)}
            </Text>
            <div style={{ marginTop: 2 }}>
              {hasOffice && (
                <Tag color="green" style={{ fontSize: 12, padding: '2px 6px', marginRight: 2 }}>
                  <DynamicIcon name={settings.icon_office} size={16} />
                </Tag>
              )}
              {hasRemote && (
                <Tag color="purple" style={{ fontSize: 12, padding: '2px 6px' }}>
                  <DynamicIcon name={settings.icon_remote} size={16} />
                </Tag>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedDateStr = selectedDate.format('YYYY-MM-DD');
  const selectedCalDay = calendarDays.get(selectedDateStr);
  const selectedStatus = dayStatuses.get(selectedDateStr);

  // Check if selected date is in the past (before today)
  const isPastDate = selectedDate.isBefore(dayjs().startOf('day'));
  const isFutureDate = selectedDate.isAfter(dayjs().endOf('day'));
  const isToday = selectedDate.isSame(dayjs(), 'day');
  const canEditEntries = isToday; // Can only edit today's entries directly

  // Check if future date is within current week (can add entries)
  const today = dayjs();
  const weekEnd = today.startOf('isoWeek').add(4, 'day'); // Friday of current week
  const isFutureInCurrentWeek = isFutureDate && !selectedDate.isAfter(weekEnd, 'day');
  const canAddEntry = isToday || isFutureInCurrentWeek;

  return (
    <div>
      <Title level={3}>{t('calendar.title')}</Title>

      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<DynamicIcon name={settings.icon_vacation} size={16} />}
          onClick={() => {
            vacationForm.resetFields();
            setVacationModalVisible(true);
          }}
        >
          {t('vacation.requestVacation')}
        </Button>
        <Button
          icon={<DynamicIcon name={settings.icon_sick} size={16} />}
          onClick={() => {
            sickDayForm.resetFields();
            setSickDayModalVisible(true);
          }}
        >
          {t('calendar.sickDay')}
        </Button>
      </Space>

      <Card loading={loading}>
        <Calendar
          value={currentMonth}
          cellRender={(date) => dateCellRender(date as Dayjs)}
          onPanelChange={handlePanelChange}
          onSelect={(date, info) => handleDateSelect(date as Dayjs, info)}
        />
      </Card>

      {/* Day Detail Modal */}
      <Modal
        title={
          <Space>
            <span>{selectedDate.format('dddd, D MMMM YYYY')}</span>
            {selectedCalDay && getHolidayName(selectedCalDay) && (
              <Tag color="red"><DynamicIcon name={settings.icon_holiday} size={14} style={{ marginRight: 4 }} /> {getHolidayName(selectedCalDay)}</Tag>
            )}
            {selectedStatus?.status === 'sick' && (
              <Tag color="gold"><DynamicIcon name={settings.icon_sick} size={14} style={{ marginRight: 4 }} /> {t('calendar.sickDay')}</Tag>
            )}
            {selectedStatus?.status === 'vacation' && (
              <Tag color="blue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} /> {t('calendar.vacation')}</Tag>
            )}
            {selectedStatus?.status === 'excused' && (
              <Tag color="purple"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} /> {t('calendar.excusedAbsence')}</Tag>
            )}
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <Space direction="vertical" style={{ width: '100%' }}>
            {isPastDate && (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {t('calendar.pastDateWarning')}
              </Text>
            )}
            {isFutureDate && !isFutureInCurrentWeek && (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {t('calendar.futureDateWarning')}
              </Text>
            )}
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setDetailModalVisible(false)}>{t('common.close')}</Button>
              {isPastDate ? (
                user?.role === 'admin' ? (
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const isFirstEntry = !daySummary?.entries || daySummary.entries.length === 0;
                      form.setFieldsValue({ break_minutes: isFirstEntry ? 60 : 0 });
                      setEntryModalVisible(true);
                    }}
                  >
                    {t('calendar.addWorkTime')}
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => {
                      changeRequestForm.resetFields();
                      const isFirstEntry = !daySummary?.entries || daySummary.entries.length === 0;
                      changeRequestForm.setFieldsValue({ break_minutes: isFirstEntry ? 60 : 0 });
                      setChangeRequestDate(null); // Use selectedDate for regular requests
                      setChangeRequestModalVisible(true);
                    }}
                  >
                    {t('changeRequest.requestChange')}
                  </Button>
                )
              ) : canAddEntry ? (
                <Tooltip title={selectedStatus?.status === 'sick' || selectedStatus?.status === 'vacation' ? t('calendar.pastDateWarning') : ''}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      const isFirstEntry = !daySummary?.entries || daySummary.entries.length === 0;
                      form.setFieldsValue({ break_minutes: isFirstEntry ? 60 : 0 });
                      setEntryModalVisible(true);
                    }}
                    disabled={selectedStatus?.status === 'sick' || selectedStatus?.status === 'vacation'}
                  >
                    {t('calendar.addWorkTime')}
                  </Button>
                </Tooltip>
              ) : null}
            </Space>
          </Space>
        }
        width={600}
      >
        {daySummary?.entries && daySummary.entries.length > 0 ? (
          <>
            <List
              dataSource={daySummary.entries}
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
                      size="small"
                      onClick={() => {
                        if (canEditEntries) {
                          // Direct edit for today
                          setEditingEntry(entry);
                          form.setFieldsValue({
                            start_time: dayjs(entry.start_time, 'HH:mm:ss'),
                            end_time: dayjs(entry.end_time, 'HH:mm:ss'),
                            break_minutes: entry.break_minutes,
                            workplace: entry.workplace,
                            comment: entry.comment,
                          });
                          setEntryModalVisible(true);
                        } else {
                          // Request change for past/future dates
                          showEditTimeExpiredModal(entry, 'edit');
                        }
                      }}
                    >
                      {t('common.edit')}
                    </Button>,
                    <Button
                      type="link"
                      danger
                      size="small"
                      onClick={() => {
                        if (canEditEntries) {
                          handleDeleteEntry(entry);
                        } else {
                          showEditTimeExpiredModal(entry, 'delete');
                        }
                      }}
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
                        <Tag color={entry.workplace === 'office' ? 'green' : 'purple'}>
                          {entry.workplace === 'office' ? (
                            <><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('timeEntry.office')}</>
                          ) : (
                            <><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} />{t('timeEntry.remote')}</>
                          )}
                        </Tag>
                      </Space>
                    }
                    description={
                      <Space>
                        <Text>{formatHours(entry.duration_hours)}</Text>
                        {entry.break_minutes > 0 && (
                          <Text type="secondary">{t('timeEntry.breakMinutes')}: {entry.break_minutes}</Text>
                        )}
                        {entry.comment && <Text type="secondary">- {entry.comment}</Text>}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Text strong>{t('common.total')}: {formatHours(daySummary.total_hours)}</Text>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Text type="secondary">{t('calendar.noTimeLogs')}</Text>
          </div>
        )}
      </Modal>

      {/* Add Entry Modal */}
      <Modal
        title={editingEntry ? `${t('timeEntry.editEntry')} - ${selectedDate.format('D MMMM YYYY')}` : `${t('calendar.addWorkTime')} - ${selectedDate.format('D MMMM YYYY')}`}
        open={entryModalVisible}
        onCancel={() => {
          setEntryModalVisible(false);
          setEditingEntry(null);
          form.resetFields();
        }}
        footer={null}
      >
        <Form form={form} onFinish={editingEntry ? handleEditEntry : handleCreateEntry} layout="vertical">
          <Form.Item
            name="start_time"
            label={t('timeEntry.startTime')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="end_time"
            label={t('timeEntry.endTime')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="break_minutes"
            label={t('timeEntry.breakMinutes')}
            initialValue={60}
            tooltip={daySummary?.entries && daySummary.entries.length > 0 ? t('timeEntry.breakNotAllowedSecondEntry') : undefined}
          >
            <InputNumber min={0} max={480} style={{ width: '100%' }} disabled={true} />
          </Form.Item>
          <Form.Item
            name="workplace"
            label={t('timeEntry.workplace')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            initialValue="office"
          >
            <Select>
              <Select.Option value="office"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 8 }} />{t('timeEntry.office')}</Select.Option>
              <Select.Option value="remote"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 8 }} />{t('timeEntry.remote')}</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="comment" label={t('timeEntry.comment')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setEntryModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {editingEntry ? t('common.save') : t('common.add')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Vacation Modal */}
      <Modal
        title={<><DynamicIcon name={settings.icon_vacation} size={16} style={{ marginRight: 8 }} />{t('vacation.requestVacation')}</>}
        open={vacationModalVisible}
        onCancel={() => {
          setVacationModalVisible(false);
          vacationForm.resetFields();
        }}
        footer={null}
      >
        <Form form={vacationForm} onFinish={handleCreateVacation} layout="vertical">
          <Form.Item
            name="dates"
            label={`${t('vacation.startDate')} - ${t('vacation.endDate')}`}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reason" label={t('vacation.reason')}>
            <Input.TextArea rows={3} placeholder={t('vacation.reason')} />
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
        title={<><DynamicIcon name={settings.icon_sick} size={16} style={{ marginRight: 8 }} />{t('calendar.sickDay')}</>}
        open={sickDayModalVisible}
        onCancel={() => {
          setSickDayModalVisible(false);
          sickDayForm.resetFields();
        }}
        footer={null}
      >
        <Form form={sickDayForm} onFinish={handleCreateSickDay} layout="vertical">
          <Form.Item
            name="dates"
            label={`${t('vacation.startDate')} - ${t('vacation.endDate')}`}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setSickDayModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit">
                {t('common.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Change Request Modal */}
      <Modal
        title={<><SendOutlined style={{ marginRight: 8 }} />{t('changeRequest.requestChange')} - {changeRequestDate ? dayjs(changeRequestDate).format('D MMMM YYYY') : selectedDate.format('D MMMM YYYY')}</>}
        open={changeRequestModalVisible}
        onCancel={() => {
          setChangeRequestModalVisible(false);
          setChangeRequestDate(null);
          changeRequestForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form form={changeRequestForm} onFinish={handleCreateChangeRequest} layout="vertical">
          <Form.Item
            name="request_type"
            label={t('changeRequest.requestType')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            initialValue="add"
          >
            <Select>
              <Select.Option value="add">{t('changeRequest.add')}</Select.Option>
              <Select.Option value="edit">{t('changeRequest.edit')}</Select.Option>
              <Select.Option value="delete">{t('changeRequest.delete')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.request_type !== curr.request_type}>
            {({ getFieldValue }) => {
              const requestType = getFieldValue('request_type');
              const hasEntries = daySummary?.entries && daySummary.entries.length > 0;

              return (
                <>
                  {/* Entry selection for edit/delete */}
                  {(requestType === 'edit' || requestType === 'delete') && hasEntries && (
                    <Form.Item
                      name="time_entry_id"
                      label={t('changeRequest.selectEntry')}
                      rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                    >
                      <Select
                        placeholder={t('changeRequest.selectEntryPlaceholder')}
                        onChange={requestType === 'edit' ? handleEntrySelectForChangeRequest : undefined}
                      >
                        {daySummary?.entries?.map(entry => (
                          <Select.Option key={entry.id} value={entry.id}>
                            {entry.start_time.substring(0, 5)} - {entry.end_time.substring(0, 5)} ({entry.workplace === 'office' ? t('timeEntry.office') : t('timeEntry.remote')})
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>
                  )}

                  {(requestType === 'edit' || requestType === 'delete') && !hasEntries && (
                    <Text type="warning" style={{ display: 'block', marginBottom: 16 }}>
                      {t('changeRequest.noEntriesToModify')}
                    </Text>
                  )}

                  {/* Time fields for add/edit */}
                  {requestType !== 'delete' && (
                    <>
                      <Form.Item
                        name="start_time"
                        label={t('timeEntry.startTime')}
                        rules={[{ required: requestType === 'add', message: t('timeEntry.validation.required') }]}
                      >
                        <TimePicker format="HH:mm" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item
                        name="end_time"
                        label={t('timeEntry.endTime')}
                        rules={[{ required: requestType === 'add', message: t('timeEntry.validation.required') }]}
                      >
                        <TimePicker format="HH:mm" style={{ width: '100%' }} />
                      </Form.Item>
                      <Form.Item name="break_minutes" label={t('timeEntry.breakMinutes')}>
                        <InputNumber min={0} max={480} style={{ width: '100%' }} disabled={true} />
                      </Form.Item>
                      <Form.Item
                        name="workplace"
                        label={t('timeEntry.workplace')}
                        rules={[{ required: requestType === 'add', message: t('timeEntry.validation.required') }]}
                      >
                        <Select>
                          <Select.Option value="office"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 8 }} />{t('timeEntry.office')}</Select.Option>
                          <Select.Option value="remote"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 8 }} />{t('timeEntry.remote')}</Select.Option>
                        </Select>
                      </Form.Item>
                      <Form.Item name="comment" label={t('timeEntry.comment')}>
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </>
                  )}
                </>
              );
            }}
          </Form.Item>

          <Form.Item
            name="reason"
            label={t('changeRequest.reason')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <Input.TextArea rows={3} placeholder={t('changeRequest.reasonPlaceholder')} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setChangeRequestModalVisible(false)}>{t('common.cancel')}</Button>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />}>
                {t('common.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Weekly Reminder Modal */}
      <Modal
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#faad14' }} />
            {t('calendar.weeklyReminder.title')}
          </Space>
        }
        open={weeklyReminderVisible}
        onCancel={() => {
          setWeeklyReminderVisible(false);
          fetchMonthData(currentMonth);
        }}
        footer={null}
        width={500}
        maskClosable={false}
      >
        <Alert
          message={t('calendar.weeklyReminder.message', { count: missingDays.length })}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* Progress indicator */}
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          <Space>
            {missingDays.map((day, index) => (
              <Tag
                key={day.format('YYYY-MM-DD')}
                color={day.isSame(currentFillingDay, 'day') ? 'blue' : 'default'}
              >
                {day.format('dd DD.MM')}
              </Tag>
            ))}
          </Space>
        </div>

        {currentFillingDay && (
          <>
            <Divider>{currentFillingDay.format('dddd, D MMMM')}</Divider>
            <Form
              form={weeklyForm}
              onFinish={handleWeeklyEntrySubmit}
              layout="vertical"
              initialValues={{
                workplace: 'office',
                break_minutes: 60,
                start_time: dayjs('09:00', 'HH:mm'),
                end_time: dayjs('18:00', 'HH:mm'),
              }}
            >
              <Space style={{ width: '100%' }} size="middle">
                <Form.Item
                  name="start_time"
                  label={t('timeEntry.startTime')}
                  rules={[{ required: true }]}
                  style={{ marginBottom: 8 }}
                >
                  <TimePicker format="HH:mm" />
                </Form.Item>
                <Form.Item
                  name="end_time"
                  label={t('timeEntry.endTime')}
                  rules={[{ required: true }]}
                  style={{ marginBottom: 8 }}
                >
                  <TimePicker format="HH:mm" />
                </Form.Item>
                <Form.Item
                  name="break_minutes"
                  label={t('timeEntry.breakMinutes')}
                  style={{ marginBottom: 8 }}
                >
                  <InputNumber min={0} max={480} style={{ width: 80 }} disabled={true} />
                </Form.Item>
              </Space>

              <Form.Item
                name="workplace"
                label={t('timeEntry.workplace')}
                rules={[{ required: true }]}
              >
                <Select style={{ width: '100%' }}>
                  <Select.Option value="office">
                    <DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 8 }} />
                    {t('timeEntry.office')}
                  </Select.Option>
                  <Select.Option value="remote">
                    <DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 8 }} />
                    {t('timeEntry.remote')}
                  </Select.Option>
                </Select>
              </Form.Item>

              <Form.Item name="comment" label={t('timeEntry.comment')}>
                <Input placeholder={t('timeEntry.commentPlaceholder')} />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                <Space>
                  <Button onClick={handleSkipDay}>
                    {t('calendar.weeklyReminder.skip')}
                  </Button>
                  <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
                    {t('calendar.weeklyReminder.saveAndNext')}
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </div>
  );
};

export default CalendarPage;