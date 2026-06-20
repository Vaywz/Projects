import React, { useEffect, useState, useRef } from 'react';
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
  Row,
  Col,
  theme,
  Checkbox,
  Empty,
} from 'antd';
import { PlusOutlined, ExclamationCircleOutlined, SendOutlined, CalendarOutlined, SaveOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../services/api';
import { CalendarDay, DaySummary, TimeEntry, DayStatus, ChangeRequest, WorkScheduleTemplate, WeeklySchedule, WeekdayKey } from '../types';
import DynamicIcon from '../components/DynamicIcon';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeStore } from '../store/themeStore';
import { useAuthStore } from '../store/authStore';
import { useResponsive } from '../hooks/useResponsive';

const WEEKDAY_KEYS_CAL: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const dayjsDayToKeyCal = (d: number): WeekdayKey => (['sun','mon','tue','wed','thu','fri','sat'] as WeekdayKey[])[d];
const clampBreakMinutes = (value?: number | null): number => Math.min(Math.max(value ?? 0, 0), 60);
const defaultWeeklyScheduleCal = (): WeeklySchedule => ({
  mon: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  tue: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  wed: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  thu: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  fri: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  sat: { enabled: false, start: '09:00', end: '18:00', break: 0, workplace: 'office' },
  sun: { enabled: false, start: '09:00', end: '18:00', break: 0, workplace: 'office' },
});

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

// Map of known backend error messages to translation keys
const errorTranslations: Record<string, string> = {
  'Maximum work time is 8 hours': 'errors.maxWorkTime8Hours',
  'Maximum total break time is 60 minutes per day': 'errors.maxBreakTime60Minutes',
  'end_time must be after start_time': 'errors.endTimeAfterStart',
  'Time entry overlaps with existing entry': 'errors.timeEntryOverlaps',
  'Cannot create time entries beyond next month': 'errors.cannotCreateBeyondNextMonth',
  'Time entry not found': 'errors.timeEntryNotFound',
  'Employee not found': 'errors.employeeNotFound',
  'Invalid time format': 'errors.invalidTimeFormat',
  'Invalid date format': 'errors.invalidDateFormat',
  'Cannot create time entry for a day marked as sick': 'errors.cannotCreateEntrySickDay',
  'Cannot create time entry for a day marked as vacation': 'errors.cannotCreateEntryVacation',
  'Cannot create time entry for a day marked as dayoff': 'errors.cannotCreateEntryDayOff',
  'Cannot create time entry on a day with vacation, sick day, or day off': 'errors.dayHasStatus',
  'Cannot set day status on a day with time entries': 'errors.dayHasEntries',
  'Cannot create vacation on days with time entries': 'errors.dayHasEntries',
  'Cannot set day status on a day with vacation': 'errors.dayHasVacation',
  'Cannot create vacation on days with sick day or day off': 'errors.vacationHasStatus',
  'Cannot move time entry to a day with vacation, sick day, or day off': 'errors.dayHasStatus',
  'Cannot move time entry to a day with vacation': 'errors.dayHasVacation',
};

// Translate a single error message
const translateError = (msg: string, t: (key: string) => string): string => {
  for (const [key, translationKey] of Object.entries(errorTranslations)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) {
      return t(translationKey);
    }
  }
  return msg;
};

// Helper to extract error message from API response
const getErrorMessage = (error: any, fallback: string, t?: (key: string) => string): string => {
  const detail = error.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === 'string') {
    return t ? translateError(detail, t) : detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    const msg = detail[0]?.msg || fallback;
    return t ? translateError(msg, t) : msg;
  }
  if (typeof detail === 'object' && detail.msg) {
    return t ? translateError(detail.msg, t) : detail.msg;
  }
  return fallback;
};

const CalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { token } = theme.useToken();
  const { mode } = useThemeStore();
  const { settings, fetchSettings } = useSettingsStore();
  const isDark = mode === 'dark';

  const calendarColors = {
    pending: isDark ? 'rgba(250, 173, 20, 0.15)' : '#fff7e6',
    sick: isDark ? 'rgba(250, 173, 20, 0.15)' : '#fffbe6',
    vacation: isDark ? 'rgba(24, 144, 255, 0.15)' : '#e6f4ff',
    excused: isDark ? 'rgba(114, 46, 209, 0.15)' : '#f9f0ff',
    unexcused: isDark ? 'rgba(250, 173, 20, 0.15)' : '#fff7e6',
    holidayStatus: isDark ? 'rgba(255, 77, 79, 0.15)' : '#fff0f6',
    dayoff: isDark ? 'rgba(219, 68, 119, 0.20)' : '#fff0f6',
    holidayCalendar: isDark ? 'rgba(255, 77, 79, 0.15)' : '#fff1f0',
    weekend: isDark ? '#2A191F' : '#fff0f6',
    office: 'rgba(106, 195, 46, 0.10)',
    remote: isDark ? 'rgba(114, 46, 209, 0.15)' : '#f9f0ff',
    mixed: isDark ? 'rgba(24, 144, 255, 0.15)' : '#f0f5ff',
  };
  const { user } = useAuthStore();
  const { isMobile, modalWidth } = useResponsive();

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
  const [dayOffModalVisible, setDayOffModalVisible] = useState(false);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [calendarMode, setCalendarMode] = useState<'month' | 'year'>('month');
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [changeRequestModalVisible, setChangeRequestModalVisible] = useState(false);
  const [changeRequestDate, setChangeRequestDate] = useState<string | null>(null);
  const [weeklyReminderVisible, setWeeklyReminderVisible] = useState(false);
  const [missingDays, setMissingDays] = useState<Dayjs[]>([]);
  const [selectedWeeklyDays, setSelectedWeeklyDays] = useState<string[]>([]);
  const [weeklyReminderChecked, setWeeklyReminderChecked] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<Map<string, ChangeRequest>>(new Map());
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const isSubmittingRef = useRef(false); // Ref for Modal.confirm protection
  const [form] = Form.useForm();
  const [vacationForm] = Form.useForm();
  const [sickDayForm] = Form.useForm();
  const [dayOffForm] = Form.useForm();
  const [changeRequestForm] = Form.useForm();
  const [weeklyForm] = Form.useForm();
  const [bulkEntryForm] = Form.useForm();
  const [bulkEntryModalVisible, setBulkEntryModalVisible] = useState(false);
  const [bulkDateRange, setBulkDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [bulkAvailableDays, setBulkAvailableDays] = useState<Dayjs[]>([]);
  const [bulkSelectedDays, setBulkSelectedDays] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [scheduleTemplates, setScheduleTemplates] = useState<WorkScheduleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateManagerVisible, setTemplateManagerVisible] = useState(false);
  const [templateFormVisible, setTemplateFormVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkScheduleTemplate | null>(null);
  const [templateForm] = Form.useForm();
  const [dayTemplateFormVisible, setDayTemplateFormVisible] = useState(false);
  const [dayTemplateForm] = Form.useForm();

  const getCalendarMonthsForRange = (start: Dayjs, end: Dayjs) => {
    const months: { year: number; month: number }[] = [];
    let cursor = start.startOf('month');

    while (!cursor.isAfter(end, 'month')) {
      months.push({ year: cursor.year(), month: cursor.month() + 1 });
      cursor = cursor.add(1, 'month');
    }

    return months;
  };

  const loadCalendarDaysForRange = async (start: Dayjs, end: Dayjs) => {
    const monthResponses = await Promise.all(
      getCalendarMonthsForRange(start, end).map((item) => api.getCalendarMonth(item.year, item.month))
    );

    const daysMap = new Map<string, CalendarDay>();
    monthResponses.forEach((response) => {
      response.days.forEach((day: CalendarDay) => {
        daysMap.set(day.date, day);
      });
    });

    return daysMap;
  };

  const fetchScheduleTemplates = async () => {
    try {
      const data = await api.getScheduleTemplates();
      setScheduleTemplates(data || []);
    } catch (e) { /* non-critical */ }
  };

  useEffect(() => { fetchScheduleTemplates(); }, []);

  const resetBulkFormDefaults = () => {
    bulkEntryForm.resetFields();
    bulkEntryForm.setFieldsValue({
      workplace: 'office',
      break_minutes: 0,
      start_time: dayjs('09:00', 'HH:mm'),
      end_time: dayjs('18:00', 'HH:mm'),
    });
  };

  const resetWeeklyFormDefaults = () => {
    weeklyForm.resetFields();
    weeklyForm.setFieldsValue({
      workplace: 'office',
      break_minutes: 0,
      start_time: dayjs('09:00', 'HH:mm'),
      end_time: dayjs('18:00', 'HH:mm'),
    });
  };

  const cancelBulkTemplate = () => {
    setSelectedTemplateId(null);
    resetBulkFormDefaults();
  };

  const cancelWeeklyTemplate = () => {
    setSelectedTemplateId(null);
    resetWeeklyFormDefaults();
  };

  // Resolve a per-day config from a template; returns null if day not covered.
  const resolveTemplateDayCfg = (tpl: WorkScheduleTemplate, dateStr: string) => {
    const dKey = dayjsDayToKeyCal(dayjs(dateStr).day());
    const cfg = tpl.schedule[dKey];
    if (!cfg || !cfg.enabled) return null;
    const breakMins = clampBreakMinutes(cfg.break);
    return { start: cfg.start, end: cfg.end, break_minutes: breakMins, workplace: cfg.workplace };
  };

  // Submit selected days using a template's per-day config.
  // On 8h/40h/monthly limit errors, offers to submit as change requests (per-day).
  const submitWithTemplate = async (
    templateId: number,
    selectedDates: string[],
    comment: string | undefined,
    onComplete: () => void
  ) => {
    const tpl = scheduleTemplates.find(tt => tt.id === templateId);
    if (!tpl) return;
    if (selectedDates.length === 0) {
      message.warning(t('calendar.weeklyReminder.selectAtLeastOne'));
      return;
    }
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    let successCount = 0;
    const limitExceededDays: string[] = [];

    try {
      for (const dateStr of selectedDates) {
        const cfg = resolveTemplateDayCfg(tpl, dateStr);
        if (!cfg) continue;
        try {
          if (cfg.workplace === 'dayoff') {
            await api.createDayStatus({
              date: dateStr,
              status: 'dayoff',
              note: comment || null,
            });
          } else {
            await api.createTimeEntry({
              date: dateStr,
              start_time: cfg.start,
              end_time: cfg.end,
              break_minutes: cfg.break_minutes,
              workplace: cfg.workplace,
              comment: comment,
            });
          }
          successCount++;
        } catch (error: any) {
          const detail = error.response?.data?.detail;
          // detail can be a string (HTTPException) or an array of validation errors (Pydantic 422)
          let errorText = '';
          if (typeof detail === 'string') {
            errorText = detail;
          } else if (Array.isArray(detail)) {
            errorText = detail.map((d: any) => d?.msg || '').join(' ');
          }
          if (
            errorText.includes('Maximum total work time per week') ||
            errorText.includes('Maximum total work time per day') ||
            errorText.includes('Maximum total work time per month') ||
            errorText.includes('Maximum work time')
          ) {
            limitExceededDays.push(dateStr);
          } else {
            message.error(`${dayjs(dateStr).format('DD.MM')}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
          }
        }
      }
      if (successCount > 0) {
        message.success(t('calendar.bulkEntry.successDirect', { count: successCount }));
      }

      if (limitExceededDays.length > 0) {
        Modal.confirm({
          title: t('changeRequest.weeklyLimitExceeded'),
          icon: <ExclamationCircleOutlined />,
          content: t('changeRequest.weeklyLimitMessage', {
            dates: limitExceededDays.map(dd => dayjs(dd).format('DD.MM')).join(', ')
          }),
          okText: t('changeRequest.submitRequest'),
          cancelText: t('common.cancel'),
          onOk: async () => {
            let requestCount = 0;
            for (const dateStr of limitExceededDays) {
              const cfg = resolveTemplateDayCfg(tpl, dateStr);
              if (!cfg) continue;
              try {
                await api.createChangeRequest({
                  request_type: 'add',
                  date: dateStr,
                  start_time: cfg.start,
                  end_time: cfg.end,
                  break_minutes: cfg.break_minutes,
                  workplace: cfg.workplace,
                  comment: comment,
                  reason: t('changeRequest.weeklyLimitReason'),
                });
                requestCount++;
              } catch (error: any) {
                message.error(`${dayjs(dateStr).format('DD.MM')}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
              }
            }
            if (requestCount > 0) {
              message.success(t('calendar.bulkEntry.successRequests', { count: requestCount }));
            }
            onComplete();
          },
          onCancel: () => onComplete(),
        });
        return;
      }

      onComplete();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const applyTemplateToWeekly = (templateId: number) => {
    setSelectedTemplateId(templateId);
    const tpl = scheduleTemplates.find(tt => tt.id === templateId);
    if (!tpl) return;
    const sched = tpl.schedule;
    const firstEnabled = WEEKDAY_KEYS_CAL.find(k => sched[k]?.enabled);
    if (firstEnabled) {
      const cfg = sched[firstEnabled];
      weeklyForm.setFieldsValue({
        start_time: dayjs(cfg.start, 'HH:mm'),
        end_time: dayjs(cfg.end, 'HH:mm'),
        break_minutes: cfg.break,
        workplace: cfg.workplace,
      });
    }
    const matching = missingDays
      .filter(dd => sched[dayjsDayToKeyCal(dd.day())]?.enabled)
      .map(dd => dd.format('YYYY-MM-DD'));
    setSelectedWeeklyDays(matching);
  };

  const applyTemplateToBulk = (templateId: number) => {
    setSelectedTemplateId(templateId);
    const tpl = scheduleTemplates.find(tt => tt.id === templateId);
    if (!tpl) return;
    const sched = tpl.schedule;
    const firstEnabled = WEEKDAY_KEYS_CAL.find(k => sched[k]?.enabled);
    if (firstEnabled) {
      const cfg = sched[firstEnabled];
      bulkEntryForm.setFieldsValue({
        start_time: dayjs(cfg.start, 'HH:mm'),
        end_time: dayjs(cfg.end, 'HH:mm'),
        break_minutes: cfg.break,
        workplace: cfg.workplace,
      });
    }
    const matching = bulkAvailableDays
      .filter(dd => sched[dayjsDayToKeyCal(dd.day())]?.enabled)
      .map(dd => dd.format('YYYY-MM-DD'));
    setBulkSelectedDays(matching);
  };

  const getTemplateEntryConfig = (tpl: WorkScheduleTemplate, dateStr: string) => {
    const dateKey = dayjsDayToKeyCal(dayjs(dateStr).day());
    const dateCfg = tpl.schedule[dateKey];
    if (dateCfg?.enabled && dateCfg.workplace !== 'dayoff') {
      return dateCfg;
    }

    const firstWorkdayKey = WEEKDAY_KEYS_CAL.find(k => {
      const cfg = tpl.schedule[k];
      return cfg?.enabled && cfg.workplace !== 'dayoff';
    });

    return firstWorkdayKey ? tpl.schedule[firstWorkdayKey] : null;
  };

  const applyTemplateToEntryForm = (templateId: number) => {
    const tpl = scheduleTemplates.find(tt => tt.id === templateId);
    if (!tpl) return;

    const cfg = getTemplateEntryConfig(tpl, selectedDate.format('YYYY-MM-DD'));
    if (!cfg) {
      message.warning(t('calendar.scheduleTemplate.noWorkTimeInTemplate'));
      return;
    }

    setSelectedTemplateId(templateId);
    form.setFieldsValue({
      start_time: dayjs(cfg.start, 'HH:mm'),
      end_time: dayjs(cfg.end, 'HH:mm'),
      break_minutes: clampBreakMinutes(cfg.break),
      workplace: cfg.workplace,
    });
  };

  const openDayTemplateForm = async () => {
    try {
      await form.validateFields(['start_time', 'end_time', 'break_minutes', 'workplace']);
      dayTemplateForm.setFieldsValue({
        name: `${t('calendar.scheduleTemplate.dayTemplateDefaultName')} ${selectedDate.format('DD.MM.YYYY')}`,
      });
      setDayTemplateFormVisible(true);
    } catch (error) {
      // Form validation already marks the fields.
    }
  };

  const handleSaveDayTemplate = async (values: any) => {
    try {
      const entryValues = await form.validateFields(['start_time', 'end_time', 'break_minutes', 'workplace']);
      const defaults = defaultWeeklyScheduleCal();
      const schedule = WEEKDAY_KEYS_CAL.reduce((acc, k) => {
        acc[k] = { ...defaults[k], enabled: false, break: 0 };
        return acc;
      }, {} as WeeklySchedule);
      const dateKey = dayjsDayToKeyCal(selectedDate.day());

      schedule[dateKey] = {
        enabled: true,
        start: entryValues.start_time.format('HH:mm'),
        end: entryValues.end_time.format('HH:mm'),
        break: clampBreakMinutes(entryValues.break_minutes),
        workplace: entryValues.workplace || 'office',
      };

      await api.createScheduleTemplate({ name: values.name, schedule });
      message.success(t('calendar.scheduleTemplate.createSuccess'));
      setDayTemplateFormVisible(false);
      dayTemplateForm.resetFields();
      fetchScheduleTemplates();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const openTemplateManager = () => {
    setTemplateManagerVisible(true);
    fetchScheduleTemplates();
  };

  const openTemplateForm = (template?: WorkScheduleTemplate) => {
    if (template) {
      setEditingTemplate(template);
      templateForm.setFieldsValue({
        name: template.name,
        ...WEEKDAY_KEYS_CAL.reduce((acc, k) => {
          const c = template.schedule[k] || defaultWeeklyScheduleCal()[k];
          acc[`${k}_enabled`] = c.enabled;
          acc[`${k}_start`] = dayjs(c.start, 'HH:mm');
          acc[`${k}_end`] = dayjs(c.end, 'HH:mm');
          acc[`${k}_break`] = clampBreakMinutes(c.break);
          acc[`${k}_workplace`] = c.workplace;
          return acc;
        }, {} as any),
      });
    } else {
      setEditingTemplate(null);
      const def = defaultWeeklyScheduleCal();
      templateForm.resetFields();
      templateForm.setFieldsValue({
        name: '',
        ...WEEKDAY_KEYS_CAL.reduce((acc, k) => {
          const c = def[k];
          acc[`${k}_enabled`] = c.enabled;
          acc[`${k}_start`] = dayjs(c.start, 'HH:mm');
          acc[`${k}_end`] = dayjs(c.end, 'HH:mm');
          acc[`${k}_break`] = c.break;
          acc[`${k}_workplace`] = c.workplace;
          return acc;
        }, {} as any),
      });
    }
    setTemplateFormVisible(true);
  };

  const handleSaveTemplate = async (values: any) => {
    const schedule: WeeklySchedule = WEEKDAY_KEYS_CAL.reduce((acc, k) => {
      const rawBreak = values[`${k}_break`] ?? 0;
      acc[k] = {
        enabled: !!values[`${k}_enabled`],
        start: values[`${k}_start`] ? values[`${k}_start`].format('HH:mm') : '09:00',
        end: values[`${k}_end`] ? values[`${k}_end`].format('HH:mm') : '18:00',
        break: clampBreakMinutes(rawBreak),
        workplace: values[`${k}_workplace`] || 'office',
      };
      return acc;
    }, {} as WeeklySchedule);

    try {
      if (editingTemplate) {
        await api.updateScheduleTemplate(editingTemplate.id, { name: values.name, schedule });
        message.success(t('calendar.scheduleTemplate.updateSuccess'));
      } else {
        await api.createScheduleTemplate({ name: values.name, schedule });
        message.success(t('calendar.scheduleTemplate.createSuccess'));
      }
      setTemplateFormVisible(false);
      setEditingTemplate(null);
      templateForm.resetFields();
      fetchScheduleTemplates();
    } catch (error: any) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleDeleteTemplate = (template: WorkScheduleTemplate) => {
    Modal.confirm({
      title: t('calendar.scheduleTemplate.deleteConfirm'),
      okText: t('common.yes'),
      cancelText: t('common.no'),
      onOk: async () => {
        try {
          await api.deleteScheduleTemplate(template.id);
          message.success(t('calendar.scheduleTemplate.deleteSuccess'));
          fetchScheduleTemplates();
        } catch (error: any) {
          message.error(t('errors.somethingWentWrong'));
        }
      },
    });
  };

  const fetchMonthData = async (month: Dayjs) => {
    setLoading(true);
    try {
      const visibleStart = month.startOf('month').startOf('isoWeek');
      const visibleEnd = month.endOf('month').endOf('isoWeek');
      const startDate = visibleStart.format('YYYY-MM-DD');
      const endDate = visibleEnd.format('YYYY-MM-DD');

      const [calendarMap, entriesData, statusesData] = await Promise.all([
        loadCalendarDaysForRange(visibleStart, visibleEnd),
        api.getTimeEntries({ date_from: startDate, date_to: endDate }),
        api.getDayStatuses({ date_from: startDate, date_to: endDate }),
      ]);

      setCalendarDays(calendarMap);

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
      message.error(t('errors.failedToLoadCalendarData'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const requests = await api.getMyChangeRequests('pending');
      const requestsMap = new Map<string, ChangeRequest>();
      if (Array.isArray(requests)) {
        requests.forEach((req: ChangeRequest) => {
          // Store by date - if multiple requests for same date, keep the latest
          if (!requestsMap.has(req.date) || new Date(req.created_at) > new Date(requestsMap.get(req.date)!.created_at)) {
            requestsMap.set(req.date, req);
          }
        });
      }
      setPendingRequests(requestsMap);
    } catch (error) {
      console.error('Failed to fetch pending requests:', error);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchPendingRequests();
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
        const calendarMap = await loadCalendarDaysForRange(weekStart, weekEnd);

        // Get entries, statuses and pending requests for this week
        const [entriesData, statusesData, pendingRequestsData] = await Promise.all([
          api.getTimeEntries({ date_from: weekStart.format('YYYY-MM-DD'), date_to: weekEnd.format('YYYY-MM-DD') }),
          api.getDayStatuses({ date_from: weekStart.format('YYYY-MM-DD'), date_to: weekEnd.format('YYYY-MM-DD') }),
          api.getMyChangeRequests('pending'),
        ]);

        const entriesMap = new Map<string, boolean>();
        entriesData.forEach((entry: TimeEntry) => {
          entriesMap.set(entry.date, true);
        });

        const statusMap = new Map<string, DayStatus>();
        statusesData.forEach((status: DayStatus) => {
          statusMap.set(status.date, status);
        });

        // Map pending requests by date
        const pendingRequestsMap = new Map<string, boolean>();
        if (Array.isArray(pendingRequestsData)) {
          pendingRequestsData.forEach((req: ChangeRequest) => {
            pendingRequestsMap.set(req.date, true);
          });
        }

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

          // Skip sick/vacation/excused/unexcused/dayoff days
          if (status?.status === 'sick' || status?.status === 'vacation' || status?.status === 'excused' || status?.status === 'unexcused' || status?.status === 'dayoff') {
            currentDay = currentDay.add(1, 'day');
            continue;
          }

          // Skip days with pending change requests (waiting for admin approval)
          if (pendingRequestsMap.has(dateStr)) {
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
          // Select all days by default
          setSelectedWeeklyDays(missing.map(d => d.format('YYYY-MM-DD')));
          weeklyForm.setFieldsValue({ break_minutes: 0 });
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
    // Update current month if navigating to different month (use 1st of month to avoid day overflow issues)
    if (date.month() !== currentMonth.month() || date.year() !== currentMonth.year()) {
      setCurrentMonth(date.date(1));
    }

    // Only open modal when clicking on a date cell directly
    // In Ant Design Calendar: 'date' = clicking a date cell
    // For other sources (month/year navigation), don't open modal
    if (info.source !== 'date') {
      return;
    }

    // Block dates before employment start date
    if (employmentStartDate && date.isBefore(employmentStartDate, 'day')) {
      return;
    }

    setSelectedDate(date);
    try {
      const summary = await api.getDaySummary(date.format('YYYY-MM-DD'));
      setDaySummary(summary);
      setDetailModalVisible(true);
    } catch (error) {
      message.error(t('errors.failedToLoadDayDetails'));
    }
  };

  const handlePanelChange = (date: Dayjs, mode: 'month' | 'year') => {
    // When changing month/year via selector, always use 1st of the selected month
    // This prevents the "28/30 day bug" when coming from months with different day counts
    setCurrentMonth(date.date(1));
    setCalendarMode(mode);
  };

  // Helper to calculate total break minutes for a day's entries
  const getTotalBreakMinutesForDay = (entries: TimeEntry[] | undefined, excludeEntryId?: number): number => {
    if (!entries) return 0;
    return entries
      .filter(e => excludeEntryId ? e.id !== excludeEntryId : true)
      .reduce((sum, e) => sum + (e.break_minutes || 0), 0);
  };

  const getAvailableBreakMinutesForDay = (entries: TimeEntry[] | undefined, excludeEntryId?: number): number => {
    return Math.max(0, 60 - getTotalBreakMinutesForDay(entries, excludeEntryId));
  };

  // Helper to determine break minutes for a new entry.
  const getBreakMinutesForNewEntry = (_isFirstEntry: boolean): number => {
    return 0;
  };

  // Check if break field should be disabled
  const isBreakFieldDisabled = (_isFirstEntry: boolean, _isEditing: boolean = false): boolean => {
    return false;
  };

  const handleCreateEntry = async (values: any) => {
    const breakMins = clampBreakMinutes(values.break_minutes);
    const existingBreak = getTotalBreakMinutesForDay(daySummary?.entries);
    if (existingBreak + breakMins > 60) {
      message.error(t('errors.maxBreakTime60Minutes'));
      return;
    }

    // Calculate existing work hours for the day
    const existingWorkMinutes = daySummary?.entries?.reduce((sum, e) => sum + (e.duration_hours * 60), 0) || 0;

    // Validate max 8 hours total work time per day
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const newWorkMinutes = (endMinutes - startMinutes) - breakMins;
    const totalWorkMinutes = existingWorkMinutes + newWorkMinutes;

    // Check ALL limits at once for non-admin users
    if (user?.role !== 'admin') {
      const exceededLimits: string[] = [];
      const reasonParts: string[] = [];

      // Check daily limit (>8h)
      if (totalWorkMinutes > 480) {
        const totalHours = Math.floor(totalWorkMinutes / 60);
        const totalMins = totalWorkMinutes % 60;
        exceededLimits.push('daily');
        reasonParts.push(t('timeEntry.overtime.title') + ` (${totalHours}h ${totalMins}min)`);
      }

      // Check weekly limit (>40h)
      try {
        const weeklyData = await api.getWeeklyHours(selectedDate.format('YYYY-MM-DD'));
        const currentWeeklyMinutes = (weeklyData.weekly_hours || 0) * 60;
        const totalWeeklyMinutes = currentWeeklyMinutes + newWorkMinutes;
        if (totalWeeklyMinutes > 2400) {
          const weeklyTotalHours = Math.floor(totalWeeklyMinutes / 60);
          const weeklyTotalMins = totalWeeklyMinutes % 60;
          exceededLimits.push('weekly');
          reasonParts.push(t('timeEntry.overtime.weeklyTitle') + ` (${weeklyTotalHours}h ${weeklyTotalMins}min)`);
        }
      } catch (error) {
        console.warn('Failed to check weekly hours:', error);
      }

      // Check monthly limit
      try {
        const monthlyData = await api.getMonthlyHours(selectedDate.format('YYYY-MM-DD'));
        const currentMonthlyMinutes = (monthlyData.monthly_hours || 0) * 60;
        const monthlyLimitMinutes = (monthlyData.monthly_limit || 160) * 60;
        const totalMonthlyMinutes = currentMonthlyMinutes + newWorkMinutes;
        if (totalMonthlyMinutes > monthlyLimitMinutes) {
          const monthlyTotalHours = Math.floor(totalMonthlyMinutes / 60);
          const monthlyTotalMins = totalMonthlyMinutes % 60;
          const monthlyLimit = monthlyData.monthly_limit || 160;
          exceededLimits.push('monthly');
          reasonParts.push(t('timeEntry.overtime.monthlyTitle') + ` (${monthlyTotalHours}h ${monthlyTotalMins}min / ${monthlyLimit}h)`);
        }
      } catch (error) {
        console.warn('Failed to check monthly hours:', error);
      }

      // If any limits exceeded, show combined modal
      if (exceededLimits.length > 0) {
        // Use the highest severity limit for the modal title
        const highestLimit = exceededLimits.includes('monthly') ? 'monthly' : exceededLimits.includes('weekly') ? 'weekly' : 'daily';
        const titleKey = highestLimit === 'monthly' ? 'timeEntry.overtime.monthlyTitle' : highestLimit === 'weekly' ? 'timeEntry.overtime.weeklyTitle' : 'timeEntry.overtime.title';

        Modal.confirm({
          title: t(titleKey),
          icon: <ExclamationCircleOutlined />,
          content: reasonParts.join('\n'),
          okText: t('timeEntry.overtime.submitRequest'),
          cancelText: t('timeEntry.overtime.adjustTime'),
          onOk: async () => {
            if (isSubmittingRef.current) return;
            isSubmittingRef.current = true;
            try {
              await api.createChangeRequest({
                request_type: 'add',
                date: selectedDate.format('YYYY-MM-DD'),
                start_time: values.start_time.format('HH:mm'),
                end_time: values.end_time.format('HH:mm'),
                break_minutes: breakMins,
                workplace: values.workplace,
                comment: values.comment,
                reason: reasonParts.join(' | '),
              });
              message.success(t('changeRequest.createSuccess'));
              setEntryModalVisible(false);
              form.resetFields();
              fetchPendingRequests();
              fetchMonthData(currentMonth);
            } catch (error: any) {
              message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
            } finally {
              isSubmittingRef.current = false;
            }
          },
        });
        return;
      }
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
      message.success(t('timeEntry.addSuccess'));
      setEntryModalVisible(false);
      setSelectedTemplateId(null);
      form.resetFields();
      fetchMonthData(currentMonth);
      // Refresh day summary
      const summary = await api.getDaySummary(selectedDate.format('YYYY-MM-DD'));
      setDaySummary(summary);
    } catch (error: any) {
      message.error(getErrorMessage(error, t('errors.failedToCreateEntry'), t));
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
              message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
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

    const breakMins = clampBreakMinutes(values.break_minutes ?? editingEntry.break_minutes);
    const existingBreak = getTotalBreakMinutesForDay(daySummary?.entries, editingEntry.id);
    if (existingBreak + breakMins > 60) {
      message.error(t('errors.maxBreakTime60Minutes'));
      return;
    }

    // Calculate existing work hours from OTHER entries (excluding the one being edited)
    const otherEntriesWorkMinutes = daySummary?.entries
      ?.filter(e => e.id !== editingEntry.id)
      ?.reduce((sum, e) => sum + (e.duration_hours * 60), 0) || 0;

    // Validate max 8 hours work time
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const newWorkMinutes = (endMinutes - startMinutes) - breakMins;
    const totalWorkMinutes = otherEntriesWorkMinutes + newWorkMinutes;

    // If exceeds 8 hours, show choice dialog (only for non-admin users)
    if (totalWorkMinutes > 480 && user?.role !== 'admin') {
      const overtimeMinutes = totalWorkMinutes - 480;
      const totalHours = Math.floor(totalWorkMinutes / 60);
      const totalMins = totalWorkMinutes % 60;

      Modal.confirm({
        title: t('timeEntry.overtime.title'),
        icon: <ExclamationCircleOutlined />,
        content: t('timeEntry.overtime.message', {
          hours: totalHours,
          minutes: totalMins,
          overtime: overtimeMinutes
        }),
        okText: t('timeEntry.overtime.submitRequest'),
        cancelText: t('timeEntry.overtime.adjustTime'),
        onOk: async () => {
          if (isSubmittingRef.current) return;
          isSubmittingRef.current = true;
          // Submit as change request for admin approval (edit existing entry)
          try {
            await api.createChangeRequest({
              request_type: 'edit',
              time_entry_id: editingEntry.id,
              date: editingEntry.date,
              start_time: values.start_time.format('HH:mm'),
              end_time: values.end_time.format('HH:mm'),
              break_minutes: breakMins,
              workplace: values.workplace,
              comment: values.comment,
              reason: t('timeEntry.overtime.title') + ` (${totalHours}h ${totalMins}min)`,
            });
            message.success(t('changeRequest.createSuccess'));
            setEditingEntry(null);
            setEntryModalVisible(false);
            form.resetFields();
            fetchPendingRequests();
            fetchMonthData(currentMonth);
          } catch (error: any) {
            message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
          } finally {
            isSubmittingRef.current = false;
          }
        },
      });
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
      message.success(t('timeEntry.updateSuccess'));
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
        message.error(getErrorMessage(error, t('errors.failedToUpdateEntry'), t));
      }
    }
  };

  const handleDeleteEntry = async (entry: TimeEntry) => {
    try {
      await api.deleteTimeEntry(entry.id);
      message.success(t('timeEntry.deleteSuccess'));
      fetchMonthData(currentMonth);
      // Refresh day summary
      const summary = await api.getDaySummary(selectedDate.format('YYYY-MM-DD'));
      setDaySummary(summary);
    } catch (error: any) {
      if (error.response?.data?.detail === 'EDIT_TIME_EXPIRED') {
        showEditTimeExpiredModal(entry, 'delete');
      } else {
        message.error(t('errors.failedToDeleteEntry'));
      }
    }
  };

  const employmentStartDate = user?.profile?.employment_start_date ? dayjs(user.profile.employment_start_date) : null;
  const disableBeforeEmployment = (current: Dayjs) => {
    if (!current || !employmentStartDate) return false;
    return current.isBefore(employmentStartDate, 'day');
  };

  const getDaysCount = (dates: [Dayjs, Dayjs] | null | undefined): number => {
    if (!dates || !dates[0] || !dates[1]) return 0;
    return dates[1].diff(dates[0], 'day') + 1;
  };

  const handleCreateVacation = async (values: any) => {
    const count = getDaysCount(values.dates);
    Modal.confirm({
      title: t('common.confirmSubmitTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('common.confirmSubmitMessage', { count }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await api.createVacation({
            date_from: values.dates[0].format('YYYY-MM-DD'),
            date_to: values.dates[1].format('YYYY-MM-DD'),
            note: values.reason || null,
          });
          message.success(t('vacation.requestSuccess'));
          setVacationModalVisible(false);
          vacationForm.resetFields();
          fetchMonthData(currentMonth);
        } catch (error: any) {
          message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
        }
      },
    });
  };

  const handleCreateSickDay = async (values: any) => {
    const count = getDaysCount(values.dates);
    Modal.confirm({
      title: t('common.confirmSubmitTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('common.confirmSubmitMessage', { count }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
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
          message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
        }
      },
    });
  };

  const handleCreateDayOff = async (values: any) => {
    const count = getDaysCount(values.dates);
    Modal.confirm({
      title: t('common.confirmSubmitTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('common.confirmSubmitMessage', { count }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          const startDate = values.dates[0];
          const endDate = values.dates[1];
          let currentDate = startDate;

          while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
            await api.createDayStatus({
              date: currentDate.format('YYYY-MM-DD'),
              status: 'dayoff',
              note: values.note || null,
            });
            currentDate = currentDate.add(1, 'day');
          }

          message.success(t('calendar.dayoff') + ' - OK');
          setDayOffModalVisible(false);
          dayOffForm.resetFields();
          fetchMonthData(currentMonth);
        } catch (error: any) {
          message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
        }
      },
    });
  };

  const handleCreateChangeRequest = async (values: any) => {
    if (submittingChangeRequest) return; // Prevent double submit
    setSubmittingChangeRequest(true);

    const selectedEntry = daySummary?.entries?.find(e => e.id === values.time_entry_id);
    const breakMins = clampBreakMinutes(values.break_minutes ?? selectedEntry?.break_minutes ?? 0);

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
      fetchPendingRequests();
      fetchMonthData(currentMonth);
    } catch (error: any) {
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
    } finally {
      setSubmittingChangeRequest(false);
    }
  };

  const handleWeeklyEntrySubmit = async (values: any) => {
    if (selectedWeeklyDays.length === 0) {
      message.warning(t('calendar.weeklyReminder.selectAtLeastOne'));
      return;
    }

    const breakMins = clampBreakMinutes(values.break_minutes);

    // Validate max 8 hours work time
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const workMinutes = (endMinutes - startMinutes) - breakMins;

    // If exceeds 8 hours, show warning (only for non-admin users)
    if (workMinutes > 480 && user?.role !== 'admin') {
      const totalHours = Math.floor(workMinutes / 60);
      const totalMins = workMinutes % 60;
      const overtimeMinutes = workMinutes - 480;

      Modal.confirm({
        title: t('timeEntry.overtime.title'),
        icon: <ExclamationCircleOutlined />,
        content: t('timeEntry.overtime.message', {
          hours: totalHours,
          minutes: totalMins,
          overtime: overtimeMinutes
        }),
        okText: t('timeEntry.overtime.submitRequest'),
        cancelText: t('timeEntry.overtime.adjustTime'),
        onOk: async () => {
          if (isSubmittingRef.current) return;
          isSubmittingRef.current = true;
          // Submit as change requests for all selected days
          let successCount = 0;
          try {
            for (const dateStr of selectedWeeklyDays) {
              try {
                await api.createChangeRequest({
                  request_type: 'add',
                  date: dateStr,
                  start_time: values.start_time.format('HH:mm'),
                  end_time: values.end_time.format('HH:mm'),
                  break_minutes: breakMins,
                  workplace: values.workplace,
                  comment: values.comment,
                  reason: t('timeEntry.overtime.title') + ` (${totalHours}h ${totalMins}min)`,
                });
                successCount++;
              } catch (error: any) {
                message.error(`${dateStr}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
              }
            }
            if (successCount > 0) {
              message.success(t('calendar.weeklyReminder.entriesCreated', { count: successCount }));
            }
            fetchPendingRequests();
            handleWeeklyComplete();
          } finally {
            isSubmittingRef.current = false;
          }
        },
      });
      return;
    }

    // Create entries for all selected days
    let successCount = 0;
    const failedDays: string[] = [];
    const limitExceededDays: string[] = [];

    for (const dateStr of selectedWeeklyDays) {
      try {
        await api.createTimeEntry({
          date: dateStr,
          start_time: values.start_time.format('HH:mm'),
          end_time: values.end_time.format('HH:mm'),
          break_minutes: breakMins,
          workplace: values.workplace,
          comment: values.comment,
        });
        successCount++;
      } catch (error: any) {
        const errorMsg = error.response?.data?.detail || '';
        // Check if error is about weekly/daily/monthly limit
        if (errorMsg.includes('Maximum total work time per week') || errorMsg.includes('Maximum total work time per day') || errorMsg.includes('Maximum total work time per month')) {
          limitExceededDays.push(dateStr);
        } else {
          failedDays.push(dateStr);
          message.error(`${dayjs(dateStr).format('DD.MM')}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
        }
      }
    }

    if (successCount > 0) {
      message.success(t('calendar.weeklyReminder.entriesCreated', { count: successCount }));
    }

    // If there are days that exceeded the limit, offer to submit change request
    if (limitExceededDays.length > 0) {
      Modal.confirm({
        title: t('changeRequest.weeklyLimitExceeded'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.weeklyLimitMessage', {
          dates: limitExceededDays.map(d => dayjs(d).format('DD.MM')).join(', ')
        }),
        okText: t('changeRequest.submitRequest'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          if (isSubmittingRef.current) return;
          isSubmittingRef.current = true;
          let requestCount = 0;
          try {
            for (const dateStr of limitExceededDays) {
              try {
                await api.createChangeRequest({
                  request_type: 'add',
                  date: dateStr,
                  start_time: values.start_time.format('HH:mm'),
                  end_time: values.end_time.format('HH:mm'),
                  break_minutes: breakMins,
                  workplace: values.workplace,
                  comment: values.comment,
                  reason: t('changeRequest.weeklyLimitReason'),
                });
                requestCount++;
              } catch (error: any) {
                message.error(`${dayjs(dateStr).format('DD.MM')}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
              }
            }
            if (requestCount > 0) {
              message.success(t('changeRequest.requestsSubmitted', { count: requestCount }));
            }
            fetchPendingRequests();
            handleWeeklyComplete();
          } finally {
            isSubmittingRef.current = false;
          }
        },
        onCancel: () => {
          handleWeeklyComplete();
        },
      });
      return;
    }

    handleWeeklyComplete();
  };

  const handleWeeklyComplete = () => {
    // Find remaining days that weren't selected
    const remainingDays = missingDays.filter(d => !selectedWeeklyDays.includes(d.format('YYYY-MM-DD')));

    if (remainingDays.length > 0) {
      // Show form again for remaining days
      setMissingDays(remainingDays);
      setSelectedWeeklyDays(remainingDays.map(d => d.format('YYYY-MM-DD')));
      weeklyForm.resetFields();
      weeklyForm.setFieldsValue({
        workplace: 'office',
        break_minutes: 0,
        start_time: dayjs('09:00', 'HH:mm'),
        end_time: dayjs('18:00', 'HH:mm'),
      });
    } else {
      // All days filled
      setWeeklyReminderVisible(false);
      setMissingDays([]);
      setSelectedWeeklyDays([]);
      weeklyForm.resetFields();
      fetchMonthData(currentMonth);
      message.success(t('calendar.weekFilledSuccess'));
    }
  };

  // Bulk entry: compute available days in selected range
  const computeAvailableDays = async (startDate: Dayjs, endDate: Dayjs) => {
    setBulkLoading(true);
    try {
      // Determine which months we need data for
      const months: { year: number; month: number }[] = [];
      let d = startDate.startOf('month');
      while (!d.isAfter(endDate, 'month')) {
        months.push({ year: d.year(), month: d.month() + 1 });
        d = d.add(1, 'month');
      }

      const [calDataArrays, entriesData, statusesData, pendingRequestsData] = await Promise.all([
        Promise.all(months.map(m => api.getCalendarMonth(m.year, m.month))),
        api.getTimeEntries({ date_from: startDate.format('YYYY-MM-DD'), date_to: endDate.format('YYYY-MM-DD') }),
        api.getDayStatuses({ date_from: startDate.format('YYYY-MM-DD'), date_to: endDate.format('YYYY-MM-DD') }),
        api.getMyChangeRequests('pending'),
      ]);

      // Build maps
      const calMap = new Map<string, CalendarDay>();
      calDataArrays.forEach((cd: any) => {
        const days = cd.days || cd;
        if (Array.isArray(days)) {
          days.forEach((day: CalendarDay) => calMap.set(day.date, day));
        }
      });

      const entriesSet = new Set<string>();
      if (Array.isArray(entriesData)) {
        entriesData.forEach((entry: TimeEntry) => entriesSet.add(entry.date));
      }

      const statusMap = new Map<string, DayStatus>();
      if (Array.isArray(statusesData)) {
        statusesData.forEach((status: DayStatus) => statusMap.set(status.date, status));
      }

      const pendingSet = new Set<string>();
      if (Array.isArray(pendingRequestsData)) {
        pendingRequestsData.forEach((req: ChangeRequest) => pendingSet.add(req.date));
      }

      // Filter valid days
      const available: Dayjs[] = [];
      let current = startDate;
      while (!current.isAfter(endDate, 'day')) {
        const dateStr = current.format('YYYY-MM-DD');
        const calDay = calMap.get(dateStr);
        const status = statusMap.get(dateStr);
        const isWeekend = current.day() === 0 || current.day() === 6;
        const isHoliday = calDay?.day_type === 'holiday';
        const hasSpecialStatus = status && ['sick', 'vacation', 'excused', 'unexcused', 'dayoff'].includes(status.status);
        const hasEntry = entriesSet.has(dateStr);
        const hasPending = pendingSet.has(dateStr);

        if (!isWeekend && !isHoliday && !hasSpecialStatus && !hasEntry && !hasPending) {
          available.push(current);
        }
        current = current.add(1, 'day');
      }

      setBulkAvailableDays(available);
      setBulkSelectedDays(available.map(dd => dd.format('YYYY-MM-DD')));
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setBulkLoading(false);
    }
  };

  // Bulk entry: submit entries for all selected days
  const handleBulkEntrySubmit = async (values: any) => {
    if (bulkSelectedDays.length === 0) {
      message.warning(t('calendar.weeklyReminder.selectAtLeastOne'));
      return;
    }

    const breakMins = clampBreakMinutes(values.break_minutes);

    // Validate max 8 hours work time
    const startMinutes = values.start_time.hour() * 60 + values.start_time.minute();
    const endMinutes = values.end_time.hour() * 60 + values.end_time.minute();
    const workMinutes = (endMinutes - startMinutes) - breakMins;

    if (workMinutes > 480 && user?.role !== 'admin') {
      const totalHours = Math.floor(workMinutes / 60);
      const totalMins = workMinutes % 60;
      const overtimeMinutes = workMinutes - 480;

      Modal.confirm({
        title: t('timeEntry.overtime.title'),
        icon: <ExclamationCircleOutlined />,
        content: t('timeEntry.overtime.message', {
          hours: totalHours,
          minutes: totalMins,
          overtime: overtimeMinutes
        }),
        okText: t('timeEntry.overtime.submitRequest'),
        cancelText: t('timeEntry.overtime.adjustTime'),
        onOk: async () => {
          if (isSubmittingRef.current) return;
          isSubmittingRef.current = true;
          let successCount = 0;
          try {
            for (const dateStr of bulkSelectedDays) {
              try {
                await api.createChangeRequest({
                  request_type: 'add',
                  date: dateStr,
                  start_time: values.start_time.format('HH:mm'),
                  end_time: values.end_time.format('HH:mm'),
                  break_minutes: breakMins,
                  workplace: values.workplace,
                  comment: values.comment,
                  reason: t('timeEntry.overtime.title') + ` (${totalHours}h ${totalMins}min)`,
                });
                successCount++;
              } catch (error: any) {
                message.error(`${dateStr}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
              }
            }
            if (successCount > 0) {
              message.success(t('calendar.bulkEntry.successRequests', { count: successCount }));
            }
            fetchPendingRequests();
            handleBulkEntryComplete();
          } finally {
            isSubmittingRef.current = false;
          }
        },
      });
      return;
    }

    // Create entries for all selected days
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    let successCount = 0;
    const limitExceededDays: string[] = [];

    try {
      for (const dateStr of bulkSelectedDays) {
        try {
          await api.createTimeEntry({
            date: dateStr,
            start_time: values.start_time.format('HH:mm'),
            end_time: values.end_time.format('HH:mm'),
            break_minutes: breakMins,
            workplace: values.workplace,
            comment: values.comment,
          });
          successCount++;
        } catch (error: any) {
          const errorMsg = error.response?.data?.detail || '';
          if (errorMsg.includes('Maximum total work time per week') || errorMsg.includes('Maximum total work time per day') || errorMsg.includes('Maximum total work time per month')) {
            limitExceededDays.push(dateStr);
          } else {
            message.error(`${dayjs(dateStr).format('DD.MM')}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
          }
        }
      }

      if (successCount > 0) {
        message.success(t('calendar.bulkEntry.successDirect', { count: successCount }));
      }

      if (limitExceededDays.length > 0) {
        Modal.confirm({
          title: t('changeRequest.weeklyLimitExceeded'),
          icon: <ExclamationCircleOutlined />,
          content: t('changeRequest.weeklyLimitMessage', {
            dates: limitExceededDays.map(dd => dayjs(dd).format('DD.MM')).join(', ')
          }),
          okText: t('changeRequest.submitRequest'),
          cancelText: t('common.cancel'),
          onOk: async () => {
            let requestCount = 0;
            for (const dateStr of limitExceededDays) {
              try {
                await api.createChangeRequest({
                  request_type: 'add',
                  date: dateStr,
                  start_time: values.start_time.format('HH:mm'),
                  end_time: values.end_time.format('HH:mm'),
                  break_minutes: breakMins,
                  workplace: values.workplace,
                  comment: values.comment,
                  reason: t('changeRequest.weeklyLimitReason'),
                });
                requestCount++;
              } catch (error: any) {
                message.error(`${dayjs(dateStr).format('DD.MM')}: ${getErrorMessage(error, t('errors.somethingWentWrong'), t)}`);
              }
            }
            if (requestCount > 0) {
              message.success(t('calendar.bulkEntry.successRequests', { count: requestCount }));
            }
            fetchPendingRequests();
            handleBulkEntryComplete();
          },
          onCancel: () => {
            handleBulkEntryComplete();
          },
        });
        return;
      }

      handleBulkEntryComplete();
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const handleBulkEntryComplete = () => {
    setBulkEntryModalVisible(false);
    setBulkDateRange(null);
    setBulkAvailableDays([]);
    setBulkSelectedDays([]);
    bulkEntryForm.resetFields();
    fetchMonthData(currentMonth);
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
    const hShort = t('common.hoursShort');
    const mShort = t('common.minutesShort');
    return m > 0 ? `${h}${hShort} ${m}${mShort}` : `${h}${hShort}`;
  };

  const fullCellRender = (date: Dayjs, info: { type: string }) => {
    if (info.type !== 'date') return undefined;
    const dateStr = date.format('YYYY-MM-DD');
    const calDay = calendarDays.get(dateStr);
    const entries = timeEntries.get(dateStr) || [];
    const status = dayStatuses.get(dateStr);
    const pendingRequest = pendingRequests.get(dateStr);

    const totalHours = entries.reduce((sum, e) => sum + e.duration_hours, 0);
    const hasOffice = entries.some((e) => e.workplace === 'office');
    const hasRemote = entries.some((e) => e.workplace === 'remote');
    const isCalendarHoliday = calDay?.day_type === 'holiday';
    const isLegacyHolidayStatus = status?.status === 'holiday' && !isCalendarHoliday;

    // Calculate pending request hours if exists
    let pendingHours = 0;
    if (pendingRequest && pendingRequest.start_time && pendingRequest.end_time) {
      const [startH, startM] = pendingRequest.start_time.split(':').map(Number);
      const [endH, endM] = pendingRequest.end_time.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const breakMins = pendingRequest.break_minutes || 0;
      pendingHours = (endMinutes - startMinutes - breakMins) / 60;
    }

    let bgColor = '';

    if (pendingRequest && !entries.length) {
      bgColor = calendarColors.pending;
    } else if (status?.status === 'sick') {
      bgColor = calendarColors.sick;
    } else if (status?.status === 'vacation') {
      bgColor = calendarColors.vacation;
    } else if (status?.status === 'excused') {
      bgColor = calendarColors.excused;
    } else if (status?.status === 'unexcused') {
      bgColor = calendarColors.unexcused;
    } else if (isLegacyHolidayStatus) {
      bgColor = calendarColors.holidayStatus;
    } else if (status?.status === 'dayoff') {
      bgColor = calendarColors.dayoff;
    } else if (isCalendarHoliday) {
      bgColor = calendarColors.holidayCalendar;
    } else if (calDay?.day_type === 'weekend') {
      bgColor = calendarColors.weekend;
    } else if (hasOffice && !hasRemote) {
      bgColor = calendarColors.office;
    } else if (hasRemote && !hasOffice) {
      bgColor = calendarColors.remote;
    } else if (hasOffice && hasRemote) {
      bgColor = calendarColors.mixed;
    }

    const isTodayCell = date.format('YYYY-MM-DD') === dayjs().format('YYYY-MM-DD');
    const isCurrentMonth = date.month() === currentMonth.month();
    const isBeforeEmployment = employmentStartDate && date.isBefore(employmentStartDate, 'day');

    return (
      <div
        className="ant-picker-cell-inner ant-picker-calendar-date"
        style={{
          position: 'relative',
          opacity: isBeforeEmployment ? 0.3 : (isCurrentMonth ? 1 : 0.4),
          cursor: isBeforeEmployment ? 'not-allowed' : undefined,
          border: `1px solid ${isDark ? '#2a2a2a' : '#ebebeb'}`,
          borderTop: isTodayCell ? `2px solid ${token.colorPrimary}` : `1px solid ${isDark ? '#2a2a2a' : '#ebebeb'}`,
          margin: 2,
          borderRadius: 2,
        }}
      >
        {bgColor && (
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: bgColor,
            opacity: isDark ? 0.90 : 0.85,
            zIndex: 0,
            pointerEvents: 'none',
          }} />
        )}
        <div className="ant-picker-calendar-date-value" style={{
          position: 'relative',
          zIndex: 1,
          color: isTodayCell ? token.colorPrimary : isDark ? '#fff' : token.colorTextSecondary,
          fontSize: 14,
          textAlign: 'right',
          paddingRight: 8,
        }}>
          {date.date() < 10 ? `0${date.date()}` : date.date()}
        </div>
        <div className="ant-picker-calendar-date-content" style={{ padding: 4, position: 'relative', zIndex: 1 }}>
        {calDay && getHolidayName(calDay) && (
          <Tooltip title={getHolidayName(calDay)}>
            <span style={{ color: '#ff4d4f', marginBottom: 2, display: 'inline-block' }}>
              <DynamicIcon name={settings.icon_holiday} size={16} />
            </span>
          </Tooltip>
        )}
        {status?.status === 'sick' && (
          <span style={{ color: '#faad14', marginBottom: 2, display: 'inline-block' }}>
            <DynamicIcon name={settings.icon_sick} size={16} />
          </span>
        )}
        {status?.status === 'vacation' && (
          <span style={{ color: '#2f54eb', marginBottom: 2, display: 'inline-block' }}>
            <DynamicIcon name={settings.icon_vacation} size={16} />
          </span>
        )}
        {status?.status === 'excused' && (
          <span style={{ color: '#722ed1', marginBottom: 2, display: 'inline-block' }}>
            <DynamicIcon name={settings.icon_excused} size={16} />
          </span>
        )}
        {status?.status === 'unexcused' && (
          <span style={{ color: '#fa8c16', marginBottom: 2, display: 'inline-block' }}>
            <DynamicIcon name={settings.icon_unexcused} size={16} />
          </span>
        )}
        {isLegacyHolidayStatus && (
          <span style={{ color: '#ff4d4f', marginBottom: 2, display: 'inline-block' }}>
            <DynamicIcon name={settings.icon_holiday} size={16} />
          </span>
        )}
        {status?.status === 'dayoff' && (
          <span style={{ color: '#eb2f96', marginBottom: 2, display: 'inline-block' }}>
            <DynamicIcon name={settings.icon_dayoff} size={16} />
          </span>
        )}
        {entries.length > 0 && (
          <div style={{ marginTop: 2 }}>
            <Text type="success" strong style={{ fontSize: 12 }}>
              {formatHours(totalHours)}
            </Text>
            <div style={{ marginTop: 2 }}>
              {hasOffice && (
                <span style={{ color: '#52c41a', marginRight: 4, display: 'inline-block' }}>
                  <DynamicIcon name={settings.icon_office} size={16} />
                </span>
              )}
              {hasRemote && (
                <span style={{ color: '#13c2c2', display: 'inline-block' }}>
                  <DynamicIcon name={settings.icon_remote} size={16} />
                </span>
              )}
            </div>
          </div>
        )}
        {pendingRequest && !entries.length && (
          <Tooltip title={t('calendar.pendingRequest')}>
            <div style={{ marginTop: 2 }}>
              <Text type="warning" strong style={{ fontSize: 12 }}>
                {pendingHours > 0 ? formatHours(pendingHours) : ''}
              </Text>
              <div style={{ marginTop: 2 }}>
                <Tag color="orange" style={{ fontSize: 10, padding: '1px 4px' }}>
                  {t('calendar.pending')}
                </Tag>
              </div>
            </div>
          </Tooltip>
        )}
        </div>
      </div>
    );
  };

  const selectedDateStr = selectedDate.format('YYYY-MM-DD');
  const selectedCalDay = calendarDays.get(selectedDateStr);
  const selectedStatus = dayStatuses.get(selectedDateStr);
  const hasPendingRequest = pendingRequests.has(selectedDateStr);
  const isSelectedCalendarHoliday = selectedCalDay?.day_type === 'holiday';
  const isSelectedLegacyHolidayStatus = selectedStatus?.status === 'holiday' && !isSelectedCalendarHoliday;

  // Check if selected date is in the past (before today)
  const isPastDate = selectedDate.isBefore(dayjs().startOf('day'));
  const isFutureDate = selectedDate.isAfter(dayjs().endOf('day'));
  const isToday = selectedDate.isSame(dayjs(), 'day');
  const isWeekend = selectedDate.day() === 0 || selectedDate.day() === 6; // Saturday or Sunday
  // Can edit today's and future entries directly (except weekends for non-admins)
  const canEditEntries = user?.role === 'admin' ? (isToday || isFutureDate) : ((isToday || isFutureDate) && !isWeekend);

  // Check if future date is within current or next month (can add entries)
  const today = dayjs();
  const nextMonthEnd = today.add(1, 'month').endOf('month');
  const isFutureInAllowedRange = isFutureDate && !selectedDate.isAfter(nextMonthEnd, 'day');
  // Admin can add entries anytime, employees can add for current + next month (weekends require change request)
  const canAddEntry = user?.role === 'admin' ? true : ((isToday || isFutureInAllowedRange) && !isWeekend);

  return (
    <div>
      <Title level={3}>{t('calendar.title')}</Title>

      <Space wrap style={{ marginBottom: 16 }}>
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
        {user?.profile?.payment_type === 'hourly' && (
          <Button
            icon={<DynamicIcon name={settings.icon_dayoff} size={16} />}
            onClick={() => {
              dayOffForm.resetFields();
              setDayOffModalVisible(true);
            }}
          >
            {t('calendar.dayoff')}
          </Button>
        )}
        <Button
          icon={<PlusOutlined />}
          onClick={() => {
            setBulkEntryModalVisible(true);
            bulkEntryForm.resetFields();
            bulkEntryForm.setFieldsValue({ break_minutes: 0 });
            setBulkSelectedDays([]);
            setBulkAvailableDays([]);
            setBulkDateRange(null);
            setSelectedTemplateId(null);
          }}
        >
          {t('calendar.bulkEntry.title')}
        </Button>
        <Button
          icon={<CalendarOutlined />}
          onClick={openTemplateManager}
        >
          {t('calendar.scheduleTemplate.manage')}
        </Button>
      </Space>

      <Card loading={loading}>
        <Calendar
          value={currentMonth}
          mode={calendarMode}
          fullscreen={!isMobile}
          fullCellRender={(date, info) => fullCellRender(date as Dayjs, info)}
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
              <Tag color="geekblue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} /> {t('calendar.vacation')}</Tag>
            )}
            {selectedStatus?.status === 'excused' && (
              <Tag color="purple"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} /> {t('calendar.excusedAbsence')}</Tag>
            )}
            {selectedStatus?.status === 'unexcused' && (
              <Tag color="orange"><DynamicIcon name={settings.icon_unexcused} size={14} style={{ marginRight: 4 }} /> {t('calendar.unexcusedAbsence')}</Tag>
            )}
            {isSelectedLegacyHolidayStatus && (
              <Tag color="red"><DynamicIcon name={settings.icon_holiday} size={14} style={{ marginRight: 4 }} /> {t('calendar.holidayStatus')}</Tag>
            )}
            {selectedStatus?.status === 'dayoff' && (
              <Tag color="pink"><DynamicIcon name={settings.icon_dayoff} size={14} style={{ marginRight: 4 }} /> {t('calendar.dayoff')}</Tag>
            )}
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={
          <Space direction="vertical" style={{ width: '100%' }}>
            {isPastDate && !isWeekend && (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {t('calendar.pastDateWarning')}
              </Text>
            )}
            {isWeekend && user?.role !== 'admin' && (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {t('calendar.weekendWarning')}
              </Text>
            )}
            {isFutureDate && !isFutureInAllowedRange && !isWeekend && (
              <Text type="secondary" style={{ display: 'block', textAlign: 'center' }}>
                {t('calendar.futureDateWarning')}
              </Text>
            )}
            {hasPendingRequest && (
              <Alert
                type="warning"
                message={t('calendar.pendingRequestBlocked')}
                showIcon
                style={{ marginBottom: 8, textAlign: 'left' }}
              />
            )}
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setDetailModalVisible(false)}>{t('common.close')}</Button>
              {/* Weekend handling for non-admin users - require change request */}
              {isWeekend && user?.role !== 'admin' ? (
                <Tooltip title={hasPendingRequest ? t('calendar.pendingRequestBlocked') : ''}>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
	                    onClick={() => {
	                      changeRequestForm.resetFields();
	                      changeRequestForm.setFieldsValue({ break_minutes: 0 });
	                      setChangeRequestDate(null);
	                      setChangeRequestModalVisible(true);
	                    }}
                    disabled={hasPendingRequest}
                  >
                    {t('changeRequest.requestChange')}
                  </Button>
                </Tooltip>
              ) : isPastDate ? (
                user?.role === 'admin' ? (
                  <Button
                    type="primary"
	                    icon={<PlusOutlined />}
	                    onClick={() => {
	                      form.resetFields();
	                      setSelectedTemplateId(null);
	                      form.setFieldsValue({ workplace: 'office', break_minutes: 0 });
	                      setEntryModalVisible(true);
	                    }}
                  >
                    {t('calendar.addWorkTime')}
                  </Button>
                ) : (
                  <Tooltip title={hasPendingRequest ? t('calendar.pendingRequestBlocked') : ''}>
                    <Button
                      type="primary"
                      icon={<SendOutlined />}
	                      onClick={() => {
	                        changeRequestForm.resetFields();
	                        changeRequestForm.setFieldsValue({ break_minutes: 0 });
	                        setChangeRequestDate(null); // Use selectedDate for regular requests
	                        setChangeRequestModalVisible(true);
	                      }}
                      disabled={hasPendingRequest}
                    >
                      {t('changeRequest.requestChange')}
                    </Button>
                  </Tooltip>
                )
              ) : canAddEntry ? (
                <Tooltip title={
                  hasPendingRequest
                    ? t('calendar.pendingRequestBlocked')
                    : selectedStatus?.status === 'sick' || selectedStatus?.status === 'vacation'
                      ? t('calendar.pastDateWarning')
                      : ''
                }>
                  <Button
                    type="primary"
	                    icon={<PlusOutlined />}
	                    onClick={() => {
	                      form.resetFields();
	                      setSelectedTemplateId(null);
	                      form.setFieldsValue({ workplace: 'office', break_minutes: 0 });
	                      setEntryModalVisible(true);
	                    }}
                    disabled={hasPendingRequest || selectedStatus?.status === 'sick' || selectedStatus?.status === 'vacation'}
                  >
                    {t('calendar.addWorkTime')}
                  </Button>
                </Tooltip>
              ) : null}
            </Space>
          </Space>
        }
        width={modalWidth(600)}
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
                    paddingInlineStart: 16,
                  }}
                  actions={[
                    <Button
                      type="link"
                      size="small"
                      disabled={hasPendingRequest}
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
                      disabled={hasPendingRequest}
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
                        <Tag color={entry.workplace === 'office' ? 'green' : 'cyan'}>
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
                        <Text>{t('timeEntry.duration')}: {formatHours(entry.duration_hours)}</Text>
                        {entry.break_minutes > 0 && (
                          <Text type="secondary">({t('timeEntry.breakMinutes')}: {entry.break_minutes})</Text>
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
	          setSelectedTemplateId(null);
	          form.resetFields();
	        }}
        footer={null}
        width={modalWidth()}
	      >
	        <Form form={form} onFinish={editingEntry ? handleEditEntry : handleCreateEntry} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
	          {!editingEntry && (
	            <>
	              <Form.Item label={t('calendar.scheduleTemplate.useTemplate')}>
	                <Select
	                  allowClear
	                  style={{ width: '100%' }}
	                  placeholder={t('calendar.scheduleTemplate.selectPlaceholder')}
	                  value={selectedTemplateId ?? undefined}
	                  disabled={scheduleTemplates.length === 0}
	                  onChange={(val) => {
	                    if (val == null) {
	                      setSelectedTemplateId(null);
	                      return;
	                    }
	                    applyTemplateToEntryForm(val);
	                  }}
	                  onClear={() => setSelectedTemplateId(null)}
	                  options={scheduleTemplates.map(tpl => ({ value: tpl.id, label: tpl.name }))}
	                />
	              </Form.Item>
	              <Button
	                block
	                icon={<SaveOutlined />}
	                style={{ marginBottom: 16 }}
	                onClick={openDayTemplateForm}
	              >
	                {t('calendar.scheduleTemplate.saveDayTemplate')}
	              </Button>
	            </>
	          )}
	          <Form.Item
	            name="start_time"
	            label={t('timeEntry.startTime')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
          </Form.Item>
          <Form.Item
            name="end_time"
            label={t('timeEntry.endTime')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
          </Form.Item>
          <Form.Item
	            name="break_minutes"
	            label={t('timeEntry.breakMinutes')}
	            initialValue={getBreakMinutesForNewEntry(!daySummary?.entries || daySummary.entries.length === 0)}
	            extra={t('timeEntry.maxBreak60Minutes')}
	          >
	            <InputNumber
	              min={0}
	              max={getAvailableBreakMinutesForDay(daySummary?.entries, editingEntry?.id)}
	              style={{ width: '100%' }}
	              disabled={isBreakFieldDisabled(!daySummary?.entries || daySummary.entries.length === 0, !!editingEntry)}
	            />
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
              {!editingEntry && (
                <Button
                  icon={<CalendarOutlined />}
	                  onClick={() => {
	                    setEntryModalVisible(false);
	                    setSelectedTemplateId(null);
	                    form.resetFields();
	                    setBulkEntryModalVisible(true);
	                    bulkEntryForm.resetFields();
	                    bulkEntryForm.setFieldsValue({ break_minutes: 0 });
	                    setBulkSelectedDays([]);
	                    setBulkAvailableDays([]);
                    setBulkDateRange(null);
                  }}
                >
                  {t('calendar.bulkEntry.title')}
                </Button>
              )}
              <Button onClick={() => {
                setEntryModalVisible(false);
                setSelectedTemplateId(null);
                form.resetFields();
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {editingEntry ? t('common.save') : t('common.add')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
	      </Modal>

	      <Modal
	        title={t('calendar.scheduleTemplate.saveDayTemplateTitle')}
	        open={dayTemplateFormVisible}
	        onCancel={() => {
	          setDayTemplateFormVisible(false);
	          dayTemplateForm.resetFields();
	        }}
	        footer={null}
	        width={modalWidth()}
	      >
	        <Form form={dayTemplateForm} layout="vertical" onFinish={handleSaveDayTemplate}>
	          <Form.Item
	            name="name"
	            label={t('calendar.scheduleTemplate.name')}
	            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
	          >
	            <Input placeholder={t('calendar.scheduleTemplate.namePlaceholder')} />
	          </Form.Item>
	          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
	            <Space>
	              <Button onClick={() => {
	                setDayTemplateFormVisible(false);
	                dayTemplateForm.resetFields();
	              }}>
	                {t('common.cancel')}
	              </Button>
	              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
	                {t('common.save')}
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
        width={modalWidth()}
      >
        <Form form={vacationForm} onFinish={handleCreateVacation} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item
            name="dates"
            label={`${t('vacation.startDate')} - ${t('vacation.endDate')}`}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabledDate={disableBeforeEmployment} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.dates !== cur.dates}>
            {() => {
              const dates = vacationForm.getFieldValue('dates');
              const count = getDaysCount(dates);
              return count > 0 ? <div style={{ marginTop: -12, marginBottom: 12 }}><Text type="secondary">{t('common.daysSelected', { count })}</Text></div> : null;
            }}
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
        width={modalWidth()}
      >
        <Form form={sickDayForm} onFinish={handleCreateSickDay} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item
            name="dates"
            label={`${t('vacation.startDate')} - ${t('vacation.endDate')}`}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabledDate={disableBeforeEmployment} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.dates !== cur.dates}>
            {() => {
              const dates = sickDayForm.getFieldValue('dates');
              const count = getDaysCount(dates);
              return count > 0 ? <div style={{ marginTop: -12, marginBottom: 12 }}><Text type="secondary">{t('common.daysSelected', { count })}</Text></div> : null;
            }}
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

      {/* Day Off Modal (for hourly employees) */}
      <Modal
        title={<><DynamicIcon name={settings.icon_dayoff} size={16} style={{ marginRight: 8 }} />{t('calendar.dayoff')}</>}
        open={dayOffModalVisible}
        onCancel={() => {
          setDayOffModalVisible(false);
          dayOffForm.resetFields();
        }}
        footer={null}
        width={modalWidth()}
      >
        <Form form={dayOffForm} onFinish={handleCreateDayOff} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item
            name="dates"
            label={`${t('vacation.startDate')} - ${t('vacation.endDate')}`}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker style={{ width: '100%' }} format="DD.MM.YYYY" disabledDate={disableBeforeEmployment} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.dates !== cur.dates}>
            {() => {
              const dates = dayOffForm.getFieldValue('dates');
              const count = getDaysCount(dates);
              return count > 0 ? <div style={{ marginTop: -12, marginBottom: 12 }}><Text type="secondary">{t('common.daysSelected', { count })}</Text></div> : null;
            }}
          </Form.Item>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setDayOffModalVisible(false)}>{t('common.cancel')}</Button>
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
        width={modalWidth(600)}
      >
        <Form form={changeRequestForm} onFinish={handleCreateChangeRequest} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
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
                        <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                      </Form.Item>
                      <Form.Item
                        name="end_time"
                        label={t('timeEntry.endTime')}
                        rules={[{ required: requestType === 'add', message: t('timeEntry.validation.required') }]}
                      >
                        <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                      </Form.Item>
	                      <Form.Item name="break_minutes" label={t('timeEntry.breakMinutes')}>
	                        <InputNumber
	                          min={0}
	                          max={60}
	                          style={{ width: '100%' }}
	                        />
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
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submittingChangeRequest}>
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
          setSelectedWeeklyDays([]);
          fetchMonthData(currentMonth);
        }}
        footer={null}
        width={modalWidth(520)}
        maskClosable={false}
      >
        <Alert
          message={t('calendar.weeklyReminder.message', { count: missingDays.length })}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />

        {/* Day selection checkboxes */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('calendar.weeklyReminder.selectDays')}:
          </Text>
          <Checkbox.Group
            value={selectedWeeklyDays}
            onChange={(checked) => setSelectedWeeklyDays(checked as string[])}
            style={{ width: '100%' }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {missingDays.map((day) => (
                <Checkbox
                  key={day.format('YYYY-MM-DD')}
                  value={day.format('YYYY-MM-DD')}
                  style={{
                    padding: '8px 14px',
                    border: `1px solid ${token.colorBorder}`,
                    borderRadius: 6,
                    background: selectedWeeklyDays.includes(day.format('YYYY-MM-DD')) ? token.colorPrimaryBg : token.colorFillQuaternary,
                    minWidth: 64,
                    textAlign: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.4 }}>
                    <Text strong style={{ fontSize: 13 }}>{day.format('dd')}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{day.format('DD.MM')}</Text>
                  </div>
                </Checkbox>
              ))}
            </div>
          </Checkbox.Group>
          <div style={{ marginTop: 8 }}>
            <Space>
              <Button
                size="small"
                type="link"
                onClick={() => setSelectedWeeklyDays(missingDays.map(d => d.format('YYYY-MM-DD')))}
              >
                {t('calendar.weeklyReminder.selectAll')}
              </Button>
              <Button
                size="small"
                type="link"
                onClick={() => setSelectedWeeklyDays([])}
              >
                {t('calendar.weeklyReminder.deselectAll')}
              </Button>
            </Space>
          </div>
        </div>

        <Divider />

        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('calendar.scheduleTemplate.useTemplate')}:
          </Text>
          {scheduleTemplates.length > 0 ? (
            <>
              <Select
                style={{ width: '100%' }}
                placeholder={t('calendar.scheduleTemplate.selectPlaceholder')}
                value={selectedTemplateId ?? undefined}
                onChange={(val) => {
                  if (val != null) applyTemplateToWeekly(val);
                }}
                options={scheduleTemplates.map(tpl => ({ value: tpl.id, label: tpl.name }))}
              />
              {selectedTemplateId != null && (
                <Button
                  size="small"
                  type="link"
                  style={{ paddingLeft: 0, marginTop: 4 }}
                  onClick={cancelWeeklyTemplate}
                >
                  {t('calendar.scheduleTemplate.cancelTemplate')}
                </Button>
              )}
            </>
          ) : (
            <Alert
              type="info"
              showIcon
              message={t('calendar.scheduleTemplate.emptyHint')}
              action={
                <Button size="small" type="primary" onClick={() => openTemplateForm()}>
                  {t('calendar.scheduleTemplate.add')}
                </Button>
              }
            />
          )}
        </div>

        {/* Schedule form (hidden when template is selected) */}
        {selectedTemplateId == null && (
          <Text strong style={{ display: 'block', marginBottom: 12 }}>
            {t('calendar.weeklyReminder.schedule')}:
          </Text>
        )}
        <Form
          form={weeklyForm}
          onFinish={handleWeeklyEntrySubmit}
          layout="vertical"
          onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}
          initialValues={{
            workplace: 'office',
            break_minutes: 0,
            start_time: dayjs('09:00', 'HH:mm'),
            end_time: dayjs('18:00', 'HH:mm'),
          }}
        >
          {selectedTemplateId == null && (
            <>
              <Row gutter={16}>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="start_time"
                    label={t('timeEntry.startTime')}
                    rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                    style={{ marginBottom: 8 }}
                  >
                    <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="end_time"
                    label={t('timeEntry.endTime')}
                    rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                    style={{ marginBottom: 8 }}
                  >
                    <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={8}>
                  <Form.Item
                    name="break_minutes"
                    label={t('timeEntry.breakMinutes')}
	                    style={{ marginBottom: 8 }}
	                    extra={t('timeEntry.maxBreak60Minutes')}
	                  >
	                    <InputNumber
	                      min={0}
	                      max={60}
	                      style={{ width: '100%' }}
	                    />
	                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="workplace"
                label={t('timeEntry.workplace')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
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
            </>
          )}

          <Form.Item name="comment" label={t('timeEntry.comment')}>
            <Input placeholder={t('timeEntry.commentPlaceholder')} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setWeeklyReminderVisible(false);
                setSelectedWeeklyDays([]);
                setSelectedTemplateId(null);
                fetchMonthData(currentMonth);
              }}>
                {t('common.cancel')}
              </Button>
              <Button
                type="primary"
                htmlType={selectedTemplateId == null ? 'submit' : 'button'}
                icon={<PlusOutlined />}
                disabled={selectedWeeklyDays.length === 0}
                onClick={selectedTemplateId != null ? () => {
                  const comment = weeklyForm.getFieldValue('comment');
                  submitWithTemplate(selectedTemplateId, selectedWeeklyDays, comment, () => {
                    setWeeklyReminderVisible(false);
                    setSelectedWeeklyDays([]);
                    setSelectedTemplateId(null);
                    fetchMonthData(currentMonth);
                    fetchPendingRequests();
                  });
                } : undefined}
              >
                {t('calendar.weeklyReminder.applySchedule')} ({selectedWeeklyDays.length})
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk Entry Modal */}
      <Modal
        title={
          <Space>
            <PlusOutlined />
            {t('calendar.bulkEntry.title')}
          </Space>
        }
        open={bulkEntryModalVisible}
        onCancel={() => {
          setBulkEntryModalVisible(false);
          setBulkSelectedDays([]);
          setBulkAvailableDays([]);
          setBulkDateRange(null);
          bulkEntryForm.resetFields();
        }}
        footer={null}
        width={modalWidth(600)}
        maskClosable={false}
      >
        {/* Step 1: Date Range Selection */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {t('calendar.bulkEntry.selectPeriod')}:
          </Text>
          <DatePicker.RangePicker
            style={{ width: '100%' }}
            format="DD.MM.YYYY"
            value={bulkDateRange}
            disabledDate={(current) => {
              if (!current) return false;
              if (disableBeforeEmployment(current)) return true;
              const today = dayjs().startOf('day');
              const nextMonthEnd = today.add(1, 'month').endOf('month');
              return current.isBefore(today, 'day') || current.isAfter(nextMonthEnd, 'day');
            }}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setBulkDateRange([dates[0], dates[1]]);
                computeAvailableDays(dates[0], dates[1]);
              } else {
                setBulkDateRange(null);
                setBulkAvailableDays([]);
                setBulkSelectedDays([]);
              }
            }}
          />
        </div>

        {/* Step 2: Day checkboxes */}
        {bulkLoading && <div style={{ textAlign: 'center', padding: 20 }}>{t('common.loading')}</div>}

        {!bulkLoading && bulkAvailableDays.length > 0 && (
          <>
            <Alert
              message={t('calendar.bulkEntry.availableDays', { count: bulkAvailableDays.length })}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <div style={{ marginBottom: 16 }}>
              <Checkbox.Group
                value={bulkSelectedDays}
                onChange={(checked) => setBulkSelectedDays(checked as string[])}
                style={{ width: '100%' }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {bulkAvailableDays.map((day) => (
                    <Checkbox
                      key={day.format('YYYY-MM-DD')}
                      value={day.format('YYYY-MM-DD')}
                      style={{
                        padding: '8px 14px',
                        border: `1px solid ${token.colorBorder}`,
                        borderRadius: 6,
                        background: bulkSelectedDays.includes(day.format('YYYY-MM-DD')) ? token.colorPrimaryBg : token.colorFillQuaternary,
                        minWidth: 64,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.4 }}>
                        <Text strong style={{ fontSize: 13 }}>{day.format('dd')}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{day.format('DD.MM')}</Text>
                      </div>
                    </Checkbox>
                  ))}
                </div>
              </Checkbox.Group>
              <div style={{ marginTop: 8 }}>
                <Space>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setBulkSelectedDays(bulkAvailableDays.map(dd => dd.format('YYYY-MM-DD')))}
                  >
                    {t('calendar.weeklyReminder.selectAll')}
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setBulkSelectedDays([])}
                  >
                    {t('calendar.weeklyReminder.deselectAll')}
                  </Button>
                </Space>
              </div>
            </div>

            <Divider />

            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                {t('calendar.scheduleTemplate.useTemplate')}:
              </Text>
              {scheduleTemplates.length > 0 ? (
                <>
                  <Select
                    style={{ width: '100%' }}
                    placeholder={t('calendar.scheduleTemplate.selectPlaceholder')}
                    value={selectedTemplateId ?? undefined}
                    onChange={(val) => {
                      if (val != null) applyTemplateToBulk(val);
                    }}
                    options={scheduleTemplates.map(tpl => ({ value: tpl.id, label: tpl.name }))}
                  />
                  {selectedTemplateId != null && (
                    <Button
                      size="small"
                      type="link"
                      style={{ paddingLeft: 0, marginTop: 4 }}
                      onClick={cancelBulkTemplate}
                    >
                      {t('calendar.scheduleTemplate.cancelTemplate')}
                    </Button>
                  )}
                </>
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message={t('calendar.scheduleTemplate.emptyHint')}
                  action={
                    <Button size="small" type="primary" onClick={() => openTemplateForm()}>
                      {t('calendar.scheduleTemplate.add')}
                    </Button>
                  }
                />
              )}
            </div>

            {/* Step 3: Schedule form (hidden when template selected) */}
            {selectedTemplateId == null && (
              <Text strong style={{ display: 'block', marginBottom: 12 }}>
                {t('calendar.weeklyReminder.schedule')}:
              </Text>
            )}
            <Form
              form={bulkEntryForm}
              onFinish={handleBulkEntrySubmit}
              layout="vertical"
              onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}
              initialValues={{
                workplace: 'office',
                break_minutes: 0,
                start_time: dayjs('09:00', 'HH:mm'),
                end_time: dayjs('18:00', 'HH:mm'),
              }}
            >
              {selectedTemplateId == null && (
                <>
                  <Space style={{ width: '100%' }} size="middle">
                    <Form.Item
                      name="start_time"
                      label={t('timeEntry.startTime')}
                      rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                      style={{ marginBottom: 8 }}
                    >
                      <TimePicker format="HH:mm" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                    </Form.Item>
                    <Form.Item
                      name="end_time"
                      label={t('timeEntry.endTime')}
                      rules={[{ required: true, message: t('timeEntry.validation.required') }]}
                      style={{ marginBottom: 8 }}
                    >
                      <TimePicker format="HH:mm" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                    </Form.Item>
                    <Form.Item
                      name="break_minutes"
                      label={t('timeEntry.breakMinutes')}
	                      style={{ marginBottom: 8 }}
	                      extra={t('timeEntry.maxBreak60Minutes')}
	                    >
	                      <InputNumber
	                        min={0}
	                        max={60}
	                        style={{ width: 80 }}
	                      />
	                    </Form.Item>
                  </Space>

                  <Form.Item
                    name="workplace"
                    label={t('timeEntry.workplace')}
                    rules={[{ required: true, message: t('timeEntry.validation.required') }]}
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
                </>
              )}

              <Form.Item name="comment" label={t('timeEntry.comment')}>
                <Input placeholder={t('timeEntry.commentPlaceholder')} />
              </Form.Item>

              <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
                <Space>
                  <Button onClick={() => {
                    setBulkEntryModalVisible(false);
                    setBulkSelectedDays([]);
                    setBulkAvailableDays([]);
                    setBulkDateRange(null);
                    setSelectedTemplateId(null);
                    bulkEntryForm.resetFields();
                  }}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="primary"
                    htmlType={selectedTemplateId == null ? 'submit' : 'button'}
                    icon={<PlusOutlined />}
                    disabled={bulkSelectedDays.length === 0}
                    onClick={selectedTemplateId != null ? () => {
                      const comment = bulkEntryForm.getFieldValue('comment');
                      submitWithTemplate(selectedTemplateId, bulkSelectedDays, comment, () => {
                        setBulkEntryModalVisible(false);
                        setBulkSelectedDays([]);
                        setBulkAvailableDays([]);
                        setBulkDateRange(null);
                        setSelectedTemplateId(null);
                        bulkEntryForm.resetFields();
                        fetchMonthData(currentMonth);
                        fetchPendingRequests();
                      });
                    } : undefined}
                  >
                    {t('calendar.weeklyReminder.applySchedule')} ({bulkSelectedDays.length})
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </>
        )}

        {!bulkLoading && bulkDateRange && bulkAvailableDays.length === 0 && (
          <Alert
            message={t('calendar.bulkEntry.noDaysAvailable')}
            type="warning"
            showIcon
          />
        )}
      </Modal>

      {/* Schedule Template Manager */}
      <Modal
        title={t('calendar.scheduleTemplate.manage')}
        open={templateManagerVisible}
        onCancel={() => setTemplateManagerVisible(false)}
        footer={[
          <Button key="add" type="primary" icon={<PlusOutlined />} onClick={() => openTemplateForm()}>
            {t('calendar.scheduleTemplate.add')}
          </Button>,
          <Button key="close" onClick={() => setTemplateManagerVisible(false)}>{t('common.close')}</Button>,
        ]}
        width={modalWidth(640)}
      >
        <List
          dataSource={scheduleTemplates}
          locale={{ emptyText: <Empty description={t('calendar.scheduleTemplate.noTemplates')} /> }}
          renderItem={(tpl: WorkScheduleTemplate) => {
            const enabledDays = WEEKDAY_KEYS_CAL.filter(k => tpl.schedule[k]?.enabled);
            return (
              <List.Item
                actions={[
                  <Button key="edit" type="text" onClick={() => openTemplateForm(tpl)}>{t('common.edit')}</Button>,
                  <Button key="del" type="text" danger onClick={() => handleDeleteTemplate(tpl)}>{t('common.delete')}</Button>,
                ]}
              >
                <List.Item.Meta
                  title={<Text strong>{tpl.name}</Text>}
                  description={
                    <Space wrap size={4}>
                      {enabledDays.map(k => (
                        <Tag key={k} color="blue">
                          {t(`calendar.scheduleTemplate.short.${k}`)} {tpl.schedule[k].start}-{tpl.schedule[k].end}
                        </Tag>
                      ))}
                    </Space>
                  }
                />
              </List.Item>
            );
          }}
        />
      </Modal>

      {/* Schedule Template Form */}
      <Modal
        title={editingTemplate ? t('calendar.scheduleTemplate.editTitle') : t('calendar.scheduleTemplate.addTitle')}
        open={templateFormVisible}
        onCancel={() => {
          setTemplateFormVisible(false);
          setEditingTemplate(null);
          templateForm.resetFields();
        }}
        footer={null}
        width={modalWidth(720)}
        maskClosable={false}
      >
        <Form form={templateForm} layout="vertical" onFinish={handleSaveTemplate}>
          <Form.Item
            name="name"
            label={t('calendar.scheduleTemplate.name')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <Input placeholder={t('calendar.scheduleTemplate.namePlaceholder')} />
          </Form.Item>

          <Divider style={{ margin: '8px 0 12px' }} />

          {WEEKDAY_KEYS_CAL.filter(k => k !== 'sat' && k !== 'sun').map(k => (
            <Row key={k} gutter={8} align="middle" style={{ marginBottom: 8 }}>
              <Col span={4}>
                <Form.Item name={`${k}_enabled`} valuePropName="checked" style={{ marginBottom: 0 }}>
                  <Checkbox>{t(`calendar.scheduleTemplate.short.${k}`)}</Checkbox>
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name={`${k}_start`} style={{ marginBottom: 0 }}>
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={5}>
                <Form.Item name={`${k}_end`} style={{ marginBottom: 0 }}>
                  <TimePicker format="HH:mm" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name={`${k}_break`} style={{ marginBottom: 0 }}>
                  <InputNumber
                    min={0}
	                    max={60}
	                    style={{ width: '100%' }}
	                  />
	                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name={`${k}_workplace`} style={{ marginBottom: 0 }}>
                  <Select>
                    <Select.Option value="office">{t('timeEntry.office')}</Select.Option>
                    <Select.Option value="remote">{t('timeEntry.remote')}</Select.Option>
                    {(user?.profile?.payment_type === 'hourly' || user?.role === 'admin') && (
                      <Select.Option value="dayoff">{t('calendar.dayoff')}</Select.Option>
                    )}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          ))}

          <Form.Item style={{ marginBottom: 0, marginTop: 16, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setTemplateFormVisible(false);
                setEditingTemplate(null);
                templateForm.resetFields();
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">{t('common.save')}</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CalendarPage;
