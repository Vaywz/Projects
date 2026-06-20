import React, { useEffect, useState, useRef } from 'react';
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
  Empty,
  Tabs,
  theme,
  Checkbox,
  Alert,
} from 'antd';
import type { Dayjs } from 'dayjs';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  SendOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Clock, Calendar } from 'lucide-react';
import DynamicIcon from '../components/DynamicIcon';
import { useSettingsStore } from '../store/settingsStore';
import dayjs from 'dayjs';
import api from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useResponsive } from '../hooks/useResponsive';
import { DaySummary, TimeEntry, Stats, Vacation, DayStatus, ChangeRequest, CalendarDay, WorkScheduleTemplate, WeeklySchedule, WeekdayKey } from '../types';

const WEEKDAY_KEYS: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// dayjs.day(): 0=Sun..6=Sat -> map to our keys
const dayjsDayToKey = (d: number): WeekdayKey => {
  const map: WeekdayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return map[d];
};

const clampBreakMinutes = (value?: number | null): number => Math.min(Math.max(value ?? 0, 0), 60);

const defaultWeeklySchedule = (): WeeklySchedule => ({
  mon: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  tue: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  wed: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  thu: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  fri: { enabled: true, start: '09:00', end: '18:00', break: 60, workplace: 'office' },
  sat: { enabled: false, start: '09:00', end: '18:00', break: 0, workplace: 'office' },
  sun: { enabled: false, start: '09:00', end: '18:00', break: 0, workplace: 'office' },
});

const { Title, Text } = Typography;

// Group consecutive day offs into date ranges for display
interface DayOffGroup {
  startDate: string;
  endDate: string;
  days: number;
  items: DayStatus[];
  note: string | null;
}

const groupConsecutiveDayOffs = (dayOffs: DayStatus[]): DayOffGroup[] => {
  if (dayOffs.length === 0) return [];
  const sorted = [...dayOffs].sort((a, b) =>
    dayjs(a.date).valueOf() - dayjs(b.date).valueOf()
  );
  const groups: DayOffGroup[] = [];
  let current: DayOffGroup = {
    startDate: sorted[0].date,
    endDate: sorted[0].date,
    days: 1,
    items: [sorted[0]],
    note: sorted[0].note ?? null,
  };
  for (let i = 1; i < sorted.length; i++) {
    const prevDate = dayjs(current.endDate);
    const currDate = dayjs(sorted[i].date);
    if (currDate.diff(prevDate, 'day') === 1) {
      current.endDate = sorted[i].date;
      current.days++;
      current.items.push(sorted[i]);
    } else {
      groups.push(current);
      current = {
        startDate: sorted[i].date,
        endDate: sorted[i].date,
        days: 1,
        items: [sorted[i]],
        note: sorted[i].note ?? null,
      };
    }
  }
  groups.push(current);
  return groups;
};

// Map of known backend error messages to translation keys
const errorTranslations: Record<string, string> = {
  'Maximum work time is 8 hours': 'errors.maxWorkTime8Hours',
  'Maximum total work time per day is 8 hours': 'errors.maxWorkTime8Hours',
  'Maximum total work time per week is 40 hours': 'errors.maxWeeklyHours',
  'Maximum total work time per month': 'errors.maxMonthlyHours',
  'First time entry of the day must have 60 minutes break': 'errors.firstEntryBreakRequired',
  'Only the first entry of the day can have break time': 'errors.onlyFirstEntryCanHaveBreak',
  'end_time must be after start_time': 'errors.endTimeAfterStart',
  'Time entry overlaps with existing entry': 'errors.timeEntryOverlaps',
  'Vacation overlaps with existing vacation': 'errors.vacationOverlaps',
  'Cannot create time entry on a day with vacation, sick day, or day off': 'errors.dayHasStatus',
  'Cannot set day status on a day with time entries': 'errors.dayHasEntries',
  'Cannot create vacation on days with time entries': 'errors.dayHasEntries',
  'Cannot set day status on a day with vacation': 'errors.dayHasVacation',
  'Cannot create vacation on days with sick day or day off': 'errors.vacationHasStatus',
  'Cannot move time entry to a day with vacation, sick day, or day off': 'errors.dayHasStatus',
  'Cannot move time entry to a day with vacation': 'errors.dayHasVacation',
  'Cannot create time entries beyond next month': 'errors.cannotCreateBeyondNextMonth',
  'Time entry not found': 'errors.timeEntryNotFound',
  'Employee not found': 'errors.employeeNotFound',
  'Invalid time format': 'errors.invalidTimeFormat',
  'Invalid date format': 'errors.invalidDateFormat',
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

const DashboardPage: React.FC = () => {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const { settings, fetchSettings } = useSettingsStore();
  const { user } = useAuthStore();
  const { modalWidth } = useResponsive();
  const [todaySummary, setTodaySummary] = useState<DaySummary | null>(null);
  const [monthStats, setMonthStats] = useState<Stats | null>(null);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [sickDays, setSickDays] = useState<DayStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [vacationModalVisible, setVacationModalVisible] = useState(false);
  const [sickModalVisible, setSickModalVisible] = useState(false);
  const [dayOffModalVisible, setDayOffModalVisible] = useState(false);
  const [dayOffs, setDayOffs] = useState<DayStatus[]>([]);
  const [form] = Form.useForm();
  const [vacationForm] = Form.useForm();
  const [sickForm] = Form.useForm();
  const [dayOffForm] = Form.useForm();
  const [editVacationForm] = Form.useForm();
  const [editSickForm] = Form.useForm();
  const [editDayOffForm] = Form.useForm();
  const [editVacationModalVisible, setEditVacationModalVisible] = useState(false);
  const [editSickModalVisible, setEditSickModalVisible] = useState(false);
  const [editDayOffModalVisible, setEditDayOffModalVisible] = useState(false);
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null);
  const [editingSickDay, setEditingSickDay] = useState<DayStatus | null>(null);
  const [editingDayOff, setEditingDayOff] = useState<DayStatus | null>(null);
  const [changeRequestModalVisible, setChangeRequestModalVisible] = useState(false);
  const [changeRequestType, setChangeRequestType] = useState<'edit_sick_day' | 'delete_sick_day' | 'edit_vacation' | 'delete_vacation' | 'edit_dayoff' | 'delete_dayoff' | null>(null);
  const [changeRequestItem, setChangeRequestItem] = useState<DayStatus | Vacation | null>(null);
  const [submittingChangeRequest, setSubmittingChangeRequest] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [changeRequestForm] = Form.useForm();
  const [bulkEntryForm] = Form.useForm();
  const [bulkEntryModalVisible, setBulkEntryModalVisible] = useState(false);
  const [bulkDateRange, setBulkDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [bulkAvailableDays, setBulkAvailableDays] = useState<Dayjs[]>([]);
  const [bulkSelectedDays, setBulkSelectedDays] = useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const isSubmittingRef = useRef(false);
  const [bulkAllDays, setBulkAllDays] = useState<{ day: Dayjs; blockedReason: string | null }[]>([]);
  const [scheduleTemplates, setScheduleTemplates] = useState<WorkScheduleTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateManagerVisible, setTemplateManagerVisible] = useState(false);
  const [templateForm] = Form.useForm();
  const [editingTemplate, setEditingTemplate] = useState<WorkScheduleTemplate | null>(null);
  const [templateFormVisible, setTemplateFormVisible] = useState(false);

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
      message.error(t('errors.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedule = async () => {
    setScheduleLoading(true);
    try {
      const [vacationsData, sickDaysData, dayOffsData] = await Promise.all([
        api.getVacations(),
        api.getMySickDays(),
        api.getMyDayOffs(),
      ]);
      setVacations(vacationsData);
      setSickDays(sickDaysData);
      setDayOffs(dayOffsData);
    } catch (error) {
      console.error('Failed to load schedule data');
    } finally {
      setScheduleLoading(false);
    }
  };

  const fetchScheduleTemplates = async () => {
    try {
      const data = await api.getScheduleTemplates();
      setScheduleTemplates(data || []);
    } catch (e) {
      // ignore — templates are non-critical
    }
  };

  useEffect(() => {
    fetchData();
    fetchSchedule();
    fetchSettings();
    fetchScheduleTemplates();
  }, [fetchSettings]);

  const resetBulkFormDefaults = () => {
    bulkEntryForm.resetFields();
    bulkEntryForm.setFieldsValue({
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

  const resolveTemplateDayCfg = (tpl: WorkScheduleTemplate, dateStr: string) => {
    const dKey = dayjsDayToKey(dayjs(dateStr).day());
    const cfg = tpl.schedule[dKey];
    if (!cfg || !cfg.enabled) return null;
    const breakMins = clampBreakMinutes(cfg.break);
    return { start: cfg.start, end: cfg.end, break_minutes: breakMins, workplace: cfg.workplace };
  };

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

  const applyTemplateToBulk = (templateId: number) => {
    setSelectedTemplateId(templateId);
    const template = scheduleTemplates.find(tt => tt.id === templateId);
    if (!template) return;
    const sched = template.schedule;

    // Pick a representative enabled day to populate the form fields
    const firstEnabled = WEEKDAY_KEYS.find(k => sched[k]?.enabled);
    if (firstEnabled) {
      const cfg = sched[firstEnabled];
      bulkEntryForm.setFieldsValue({
        start_time: dayjs(cfg.start, 'HH:mm'),
        end_time: dayjs(cfg.end, 'HH:mm'),
        break_minutes: cfg.break,
        workplace: cfg.workplace,
      });
    }

    // Auto-select only days whose weekday is enabled in the template
    const matching = bulkAvailableDays
      .filter(dd => sched[dayjsDayToKey(dd.day())]?.enabled)
      .map(dd => dd.format('YYYY-MM-DD'));
    setBulkSelectedDays(matching);
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
        ...WEEKDAY_KEYS.reduce((acc, k) => {
          const c = template.schedule[k] || defaultWeeklySchedule()[k];
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
      const def = defaultWeeklySchedule();
      templateForm.resetFields();
      templateForm.setFieldsValue({
        name: '',
        ...WEEKDAY_KEYS.reduce((acc, k) => {
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
    const schedule: WeeklySchedule = WEEKDAY_KEYS.reduce((acc, k) => {
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
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
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
          message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
        }
      },
    });
  };

  // Helper to calculate total break minutes for a day's entries
  const getTotalBreakMinutesForDay = (entries: TimeEntry[] | undefined, excludeEntryId?: number): number => {
    if (!entries) return 0;
    return entries
      .filter(e => excludeEntryId ? e.id !== excludeEntryId : true)
      .reduce((sum, e) => sum + (e.break_minutes || 0), 0);
  };

  const computeAvailableDays = async (startDate: Dayjs, endDate: Dayjs) => {
    setBulkLoading(true);
    try {
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

      const available: Dayjs[] = [];
      const allDays: { day: Dayjs; blockedReason: string | null }[] = [];
      const isAdminUser = user?.role === 'admin';
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

        // Conflicts that even admin can't override via bulk modal
        const hardBlock = hasSpecialStatus || hasEntry || hasPending;
        // Soft block: weekend/holiday — admin allowed to fill these
        const softBlock = isWeekend || isHoliday;

        let reason: string | null = null;
        if (hasEntry) reason = t('calendar.bulkEntry.blockedHasEntry');
        else if (hasPending) reason = t('calendar.bulkEntry.blockedPending');
        else if (hasSpecialStatus) reason = t('calendar.bulkEntry.blockedHasStatus');
        else if (isHoliday) reason = t('calendar.bulkEntry.blockedHoliday');
        else if (isWeekend) reason = t('calendar.bulkEntry.blockedWeekend');

        const isAvailable = !hardBlock && (!softBlock || isAdminUser);
        if (isAvailable) {
          available.push(current);
          allDays.push({ day: current, blockedReason: null });
        } else {
          allDays.push({ day: current, blockedReason: reason });
        }
        current = current.add(1, 'day');
      }

      setBulkAvailableDays(available);
      setBulkAllDays(allDays);
      // Default selection: only weekdays (skip weekends even for admin)
      setBulkSelectedDays(available.filter(dd => dd.day() !== 0 && dd.day() !== 6).map(dd => dd.format('YYYY-MM-DD')));
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkEntryComplete = () => {
    setBulkEntryModalVisible(false);
    setBulkDateRange(null);
    setBulkAvailableDays([]);
    setBulkSelectedDays([]);
    bulkEntryForm.resetFields();
    fetchData();
  };

  const handleBulkEntrySubmit = async (values: any) => {
    if (bulkSelectedDays.length === 0) {
      message.warning(t('calendar.weeklyReminder.selectAtLeastOne'));
      return;
    }

    const breakMins = clampBreakMinutes(values.break_minutes);

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
        content: t('timeEntry.overtime.message', { hours: totalHours, minutes: totalMins, overtime: overtimeMinutes }),
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
            handleBulkEntryComplete();
          } finally {
            isSubmittingRef.current = false;
          }
        },
      });
      return;
    }

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

  const handleCreateEntry = async (values: any) => {
    const breakMins = clampBreakMinutes(values.break_minutes);
    const existingBreak = getTotalBreakMinutesForDay(todaySummary?.entries);
    if (existingBreak + breakMins > 60) {
      message.error(t('errors.maxBreakTime60Minutes'));
      return;
    }

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
      message.success(t('timeEntry.addSuccess'));
      setEntryModalVisible(false);
      setEditingEntry(null);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(getErrorMessage(error, t('errors.failedToCreateEntry'), t));
    }
  };

  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
    form.resetFields();
    form.setFieldsValue({
      start_time: dayjs(entry.start_time, 'HH:mm:ss'),
      end_time: dayjs(entry.end_time, 'HH:mm:ss'),
      break_minutes: entry.break_minutes ?? 0,
      workplace: entry.workplace,
      comment: entry.comment,
    });
    setEntryModalVisible(true);
  };

  const handleUpdateEntry = async (values: any) => {
    if (!editingEntry) return;

    const breakMins = clampBreakMinutes(values.break_minutes ?? editingEntry.break_minutes);
    const existingBreak = getTotalBreakMinutesForDay(todaySummary?.entries, editingEntry.id);
    if (existingBreak + breakMins > 60) {
      message.error(t('errors.maxBreakTime60Minutes'));
      return;
    }

    try {
      await api.updateTimeEntry(editingEntry.id, {
        start_time: values.start_time.format('HH:mm'),
        end_time: values.end_time.format('HH:mm'),
        break_minutes: breakMins,
        workplace: values.workplace,
        comment: values.comment,
      });
      message.success(t('timeEntry.updateSuccess'));
      setEntryModalVisible(false);
      setEditingEntry(null);
      form.resetFields();
      fetchData();
    } catch (error: any) {
      message.error(getErrorMessage(error, t('errors.failedToUpdateEntry'), t));
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
            note: values.note,
          });
          message.success(t('vacation.requestSuccess'));
          setVacationModalVisible(false);
          vacationForm.resetFields();
          fetchData();
          fetchSchedule();
        } catch (error: any) {
          message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
        }
      },
    });
  };

  const handleCreateSick = async (values: any) => {
    Modal.confirm({
      title: t('common.confirmSubmitTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('common.confirmSubmitMessage', { count: 1 }),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
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
          fetchData();
          fetchSchedule();
        } catch (error: any) {
          message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
        }
      },
    });
  };

  const handleDeleteDayOffGroup = async (group: DayOffGroup) => {
    try {
      for (const item of group.items) {
        await api.deleteDayStatus(item.id);
      }
      message.success(t('calendar.dayoff') + ' - OK');
      fetchSchedule();
    } catch (error: any) {
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
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
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
    }
  };

  const openEditVacationModal = (vacation: Vacation) => {
    setEditingVacation(vacation);
    // Always show original dates - admin can edit any date,
    // non-admin will have the start date field disabled if it's in the past
    editVacationForm.setFieldsValue({
      date_from: dayjs(vacation.date_from),
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
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
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
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
    }
  };

  const [editingDayOffGroup, setEditingDayOffGroup] = useState<DayOffGroup | null>(null);

  const openEditDayOffGroupModal = (group: DayOffGroup) => {
    setEditingDayOffGroup(group);
    editDayOffForm.setFieldsValue({
      dates: [dayjs(group.startDate), dayjs(group.endDate)],
      note: group.note,
    });
    setEditDayOffModalVisible(true);
  };

  const handleEditDayOff = async (values: any) => {
    if (editingDayOffGroup) {
      // Editing a group - delete old records, create new ones
      try {
        for (const item of editingDayOffGroup.items) {
          await api.deleteDayStatus(item.id);
        }
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
        setEditDayOffModalVisible(false);
        editDayOffForm.resetFields();
        setEditingDayOffGroup(null);
        fetchData();
        fetchSchedule();
      } catch (error: any) {
        message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
      }
      return;
    }
    if (!editingDayOff) return;
    try {
      await api.updateDayStatus(editingDayOff.id, {
        date: values.date.format('YYYY-MM-DD'),
        note: values.note,
      });
      message.success(t('calendar.dayoff') + ' - OK');
      setEditDayOffModalVisible(false);
      editDayOffForm.resetFields();
      setEditingDayOff(null);
      fetchData();
      fetchSchedule();
    } catch (error: any) {
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
    }
  };

  const isAdmin = user?.role === 'admin';

  // Helper to check if vacation can be edited/deleted directly
  // Admin can always edit directly
  // Regular user: vacation must start today or later (no past days)
  const canEditVacationDirectly = (vacation: Vacation) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const vacationStart = dayjs(vacation.date_from).startOf('day');
    return !vacationStart.isBefore(today); // date_from >= today (starts today or later)
  };

  // Helper to check if vacation can be deleted directly
  // Admin can always delete
  // Regular user: vacation must start today or in future (not past)
  const canDeleteVacationDirectly = (vacation: Vacation) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const vacationStart = dayjs(vacation.date_from).startOf('day');
    return !vacationStart.isBefore(today); // date_from >= today
  };

  // Helper to check if sick day can be edited directly
  // Admin can always edit
  // Regular user: sick day must be today or future
  const canEditSickDayDirectly = (sickDay: DayStatus) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const sickDayDate = dayjs(sickDay.date).startOf('day');
    return !sickDayDate.isBefore(today); // date >= today
  };

  // Helper to check if sick day can be deleted directly
  // Admin can always delete
  // Regular user: sick day must be today or in future (not past)
  const canDeleteSickDayDirectly = (sickDay: DayStatus) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const sickDayDate = dayjs(sickDay.date).startOf('day');
    return !sickDayDate.isBefore(today); // date >= today
  };

  // Helper to check if day off can be edited directly
  // Admin can always edit
  // Regular user: day off must be today or future
  const canEditDayOffDirectly = (dayOff: DayStatus) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const dayOffDate = dayjs(dayOff.date).startOf('day');
    return !dayOffDate.isBefore(today); // date >= today
  };

  // Helper to check if day off can be deleted directly
  // Admin can always delete
  // Regular user: day off must be today or in future (not past)
  const canDeleteDayOffDirectly = (dayOff: DayStatus) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const dayOffDate = dayjs(dayOff.date).startOf('day');
    return !dayOffDate.isBefore(today); // date >= today
  };

  // Helper to check if vacation start date is editable in edit modal
  const isVacationStartEditableDirectly = (vacation: Vacation) => {
    if (isAdmin) return true;
    const today = dayjs().startOf('day');
    const vacationStart = dayjs(vacation.date_from).startOf('day');
    return !vacationStart.isBefore(today); // date_from >= today
  };

  // Open change request modal for past sick day/vacation/dayoff operations
  const openChangeRequestModal = (
    type: 'edit_sick_day' | 'delete_sick_day' | 'edit_vacation' | 'delete_vacation' | 'edit_dayoff' | 'delete_dayoff',
    item: DayStatus | Vacation
  ) => {
    setChangeRequestType(type);
    setChangeRequestItem(item);
    changeRequestForm.resetFields();

    if ((type === 'edit_sick_day' || type === 'edit_dayoff') && 'date' in item) {
      changeRequestForm.setFieldsValue({
        date: dayjs(item.date),
        note: item.note,
      });
    } else if (type === 'edit_vacation' && 'date_from' in item) {
      changeRequestForm.setFieldsValue({
        date_from: dayjs(item.date_from),
        date_to: dayjs(item.date_to),
        note: item.note,
      });
    }

    setChangeRequestModalVisible(true);
  };

  // Handle change request submission
  const handleCreateChangeRequest = async (values: any) => {
    if (!changeRequestType || !changeRequestItem) return;
    if (submittingChangeRequest) return; // Prevent double submit
    setSubmittingChangeRequest(true);

    try {
      const baseRequest = {
        reason: values.reason,
      };

      let requestData: any = null;

      if (changeRequestType === 'edit_sick_day') {
        const sickDay = changeRequestItem as DayStatus;
        requestData = {
          ...baseRequest,
          request_type: 'edit_sick_day',
          day_status_id: sickDay.id,
          date: values.date.format('YYYY-MM-DD'),
          comment: values.note,
        };
      } else if (changeRequestType === 'delete_sick_day') {
        const sickDay = changeRequestItem as DayStatus;
        requestData = {
          ...baseRequest,
          request_type: 'delete_sick_day',
          day_status_id: sickDay.id,
          date: sickDay.date,
        };
      } else if (changeRequestType === 'edit_vacation') {
        const vacation = changeRequestItem as Vacation;
        requestData = {
          ...baseRequest,
          request_type: 'edit_vacation',
          vacation_id: vacation.id,
          date: values.date_from.format('YYYY-MM-DD'),
          date_to: values.date_to.format('YYYY-MM-DD'),
          comment: values.note,
        };
      } else if (changeRequestType === 'delete_vacation') {
        const vacation = changeRequestItem as Vacation;
        requestData = {
          ...baseRequest,
          request_type: 'delete_vacation',
          vacation_id: vacation.id,
          date: vacation.date_from,
          date_to: vacation.date_to,
        };
      } else if (changeRequestType === 'edit_dayoff') {
        const dayOff = changeRequestItem as DayStatus;
        requestData = {
          ...baseRequest,
          request_type: 'edit_sick_day', // Use same type as sick day on backend
          day_status_id: dayOff.id,
          date: values.date.format('YYYY-MM-DD'),
          comment: values.note,
        };
      } else if (changeRequestType === 'delete_dayoff') {
        const dayOff = changeRequestItem as DayStatus;
        requestData = {
          ...baseRequest,
          request_type: 'delete_sick_day', // Use same type as sick day on backend
          day_status_id: dayOff.id,
          date: dayOff.date,
        };
      }

      console.log('Sending change request:', requestData);

      if (requestData) {
        await api.createChangeRequest(requestData);
      }

      message.success(t('changeRequest.createSuccess'));
      setChangeRequestModalVisible(false);
      changeRequestForm.resetFields();
      setChangeRequestType(null);
      setChangeRequestItem(null);
    } catch (error: any) {
      console.error('Change request error:', error);
      console.error('Error response:', error.response?.data);
      message.error(getErrorMessage(error, t('errors.somethingWentWrong'), t));
    } finally {
      setSubmittingChangeRequest(false);
    }
  };

  // Handle sick day edit button click
  const handleSickDayEditClick = (sickDay: DayStatus) => {
    if (canEditSickDayDirectly(sickDay)) {
      // Admin or today/future sick day - edit directly
      openEditSickModal(sickDay);
    } else {
      // Past sick day - need admin request (only for non-admin)
      Modal.confirm({
        title: t('changeRequest.pastDayTitle'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.pastDayMessage'),
        okText: t('changeRequest.requestChange'),
        cancelText: t('common.cancel'),
        onOk: () => openChangeRequestModal('edit_sick_day', sickDay),
      });
    }
  };

  // Handle sick day delete button click
  const handleSickDayDeleteClick = (sickDay: DayStatus) => {
    if (canDeleteSickDayDirectly(sickDay)) {
      // Admin or future sick day - delete directly with confirmation
      Modal.confirm({
        title: t('sickDay.deleteConfirm'),
        onOk: () => handleDeleteSickDay(sickDay.id),
        okText: t('common.yes'),
        cancelText: t('common.no'),
      });
    } else {
      // Past or today's sick day for non-admin - need admin request
      Modal.confirm({
        title: t('changeRequest.pastDayTitle'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.pastDayDeleteMessage'),
        okText: t('changeRequest.requestChange'),
        cancelText: t('common.cancel'),
        onOk: () => openChangeRequestModal('delete_sick_day', sickDay),
      });
    }
  };

  // Handle vacation edit button click
  const handleVacationEditClick = (vacation: Vacation) => {
    if (canEditVacationDirectly(vacation)) {
      // Admin or vacation starts today/future - edit directly
      openEditVacationModal(vacation);
    } else {
      // Vacation has past days for non-admin - need admin request
      Modal.confirm({
        title: t('changeRequest.pastDayTitle'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.pastDayMessage'),
        okText: t('changeRequest.requestChange'),
        cancelText: t('common.cancel'),
        onOk: () => openChangeRequestModal('edit_vacation', vacation),
      });
    }
  };

  // Handle vacation delete button click
  const handleVacationDeleteClick = (vacation: Vacation) => {
    if (canDeleteVacationDirectly(vacation)) {
      // Admin or future vacation - delete directly with confirmation
      Modal.confirm({
        title: t('vacation.deleteConfirm'),
        onOk: () => handleDeleteVacation(vacation.id),
        okText: t('common.yes'),
        cancelText: t('common.no'),
      });
    } else {
      // Vacation started/ongoing for non-admin - need admin request
      Modal.confirm({
        title: t('changeRequest.pastDayTitle'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.pastDayDeleteMessage'),
        okText: t('changeRequest.requestChange'),
        cancelText: t('common.cancel'),
        onOk: () => openChangeRequestModal('delete_vacation', vacation),
      });
    }
  };

  // Handle day off group edit button click
  const handleDayOffGroupEditClick = (group: DayOffGroup) => {
    // Check if all items can be edited directly (all today or future)
    const allEditable = group.items.every(item => canEditDayOffDirectly(item));
    if (allEditable) {
      openEditDayOffGroupModal(group);
    } else {
      // Has past days - need change request for first item
      Modal.confirm({
        title: t('changeRequest.pastDayTitle'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.pastDayMessage'),
        okText: t('changeRequest.requestChange'),
        cancelText: t('common.cancel'),
        onOk: () => openChangeRequestModal('edit_dayoff', group.items[0]),
      });
    }
  };

  // Handle day off group delete button click
  const handleDayOffGroupDeleteClick = (group: DayOffGroup) => {
    const allDeletable = group.items.every(item => canDeleteDayOffDirectly(item));
    if (allDeletable) {
      Modal.confirm({
        title: t('calendar.dayoff') + ' - ' + t('common.delete'),
        onOk: () => handleDeleteDayOffGroup(group),
        okText: t('common.yes'),
        cancelText: t('common.no'),
      });
    } else {
      // Has past days - need change request for first item
      Modal.confirm({
        title: t('changeRequest.pastDayTitle'),
        icon: <ExclamationCircleOutlined />,
        content: t('changeRequest.pastDayDeleteMessage'),
        okText: t('changeRequest.requestChange'),
        cancelText: t('common.cancel'),
        onOk: () => openChangeRequestModal('delete_dayoff', group.items[0]),
      });
    }
  };

  const formatTime = (timeStr: string) => {
    return timeStr.substring(0, 5);
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const hShort = t('common.hoursShort');
    const mShort = t('common.minutesShort');
    return m > 0 ? `${h}${hShort} ${m}${mShort}` : `${h}${hShort}`;
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
            return (
              <List.Item
                actions={[
                  // Edit button - always visible, triggers change request for past vacations
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleVacationEditClick(vacation)}
                  >
                    {t('common.edit')}
                  </Button>,
                  // Delete button - always visible, triggers change request for past/ongoing vacations
                  <Button
                    key="delete"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleVacationDeleteClick(vacation)}
                  >
                    {t('common.delete')}
                  </Button>,
                ]}
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
            return (
              <List.Item
                actions={[
                  // Edit button - always visible, triggers change request for past sick days
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleSickDayEditClick(sickDay)}
                  >
                    {t('common.edit')}
                  </Button>,
                  // Delete button - always visible, triggers change request for past/today sick days
                  <Button
                    key="delete"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleSickDayDeleteClick(sickDay)}
                  >
                    {t('common.delete')}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>{dayjs(sickDay.date).format('DD.MM.YYYY')}</Text>
                      <Tag color="gold">{t('calendar.sickDay')}</Tag>
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
    // Day Off tab - only for hourly employees
    ...(user?.profile?.payment_type === 'hourly' ? [{
      key: 'dayOffs',
      label: (
        <span>
          <DynamicIcon name={settings.icon_dayoff} size={14} style={{ marginRight: 4 }} /> {t('calendar.dayoff')}
        </span>
      ),
      children: (
        <List
          loading={scheduleLoading}
          dataSource={groupConsecutiveDayOffs(dayOffs)}
          locale={{ emptyText: <Empty description={t('vacation.noDayOffs')} /> }}
          renderItem={(group: DayOffGroup) => {
            return (
              <List.Item
                actions={[
                  <Button
                    key="edit"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={() => handleDayOffGroupEditClick(group)}
                  >
                    {t('common.edit')}
                  </Button>,
                  <Button
                    key="delete"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDayOffGroupDeleteClick(group)}
                  >
                    {t('common.delete')}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>
                        {group.days === 1
                          ? dayjs(group.startDate).format('DD.MM.YYYY')
                          : `${dayjs(group.startDate).format('DD.MM.YYYY')} - ${dayjs(group.endDate).format('DD.MM.YYYY')}`
                        }
                      </Text>
                      <Tag color="pink">{group.days} {t('vacation.days')}</Tag>
                    </Space>
                  }
                  description={group.note}
                />
              </List.Item>
            );
          }}
        />
      ),
    }] : []),
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} md="auto">
          <Title level={3} style={{ margin: 0 }}>
            {t('dashboard.title')}
          </Title>
          <Text type="secondary">
            {dayjs().format('dddd, D MMMM YYYY')}
          </Text>
        </Col>
        <Col xs={24} md="auto">
          <Space wrap>
            <Button
              type="primary"
	              icon={<PlusOutlined />}
	              onClick={() => {
	                form.resetFields();
	                form.setFieldsValue({ break_minutes: 0, workplace: 'office' });
	                setEditingEntry(null);
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
              icon={<Calendar size={16} />}
	              onClick={() => {
	                bulkEntryForm.resetFields();
	                bulkEntryForm.setFieldsValue({ break_minutes: 0 });
	                setSelectedTemplateId(null);
	                setBulkEntryModalVisible(true);
	              }}
            >
              {t('calendar.bulkEntry.title')}
            </Button>
            <Button
              icon={<Calendar size={16} />}
              onClick={openTemplateManager}
            >
              {t('calendar.scheduleTemplate.manage')}
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
                        paddingInlineStart: 16,
                      }}
                      actions={[
                        <Button
                          type="link"
                          onClick={() => handleEditEntry(entry)}
                        >
                          {t('common.edit')}
                        </Button>,
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
                            <Tag color={entry.workplace === 'office' ? 'green' : 'cyan'}>
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
	                    form.resetFields();
	                    form.setFieldsValue({ break_minutes: 0, workplace: 'office' });
	                    setEditingEntry(null);
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
        title={editingEntry ? t('timeEntry.editEntry') : t('timeEntry.addEntry')}
        open={entryModalVisible}
        onCancel={() => {
          setEntryModalVisible(false);
          setEditingEntry(null);
          form.resetFields();
        }}
        footer={null}
        width={modalWidth()}
      >
        <Form form={form} onFinish={editingEntry ? handleUpdateEntry : handleCreateEntry} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="start_time"
                label={t('timeEntry.startTime')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="end_time"
                label={t('timeEntry.endTime')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <TimePicker format="HH:mm" style={{ width: '100%' }} onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
	                name="break_minutes"
	                label={t('timeEntry.breakMinutes')}
	                extra={t('timeEntry.maxBreak60Minutes')}
	              >
	                <InputNumber
	                  min={0}
	                  max={60}
	                  style={{ width: '100%' }}
	                />
	              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="workplace"
                label={t('timeEntry.workplace')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
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
          <Form.Item style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {!editingEntry ? (
                <Button
                  icon={<Calendar size={14} />}
	                  onClick={() => {
	                    setEntryModalVisible(false);
	                    setBulkEntryModalVisible(true);
	                    bulkEntryForm.resetFields();
	                    bulkEntryForm.setFieldsValue({ break_minutes: 0 });
	                  }}
                >
                  {t('calendar.bulkEntry.title')}
                </Button>
              ) : <div />}
              <Space>
                <Button onClick={() => setEntryModalVisible(false)}>{t('common.cancel')}</Button>
                <Button type="primary" htmlType="submit">
                  {editingEntry ? t('common.save') : t('common.add')}
                </Button>
              </Space>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Vacation Modal */}
      <Modal
        title={t('vacation.requestVacation')}
        open={vacationModalVisible}
        onCancel={() => setVacationModalVisible(false)}
        footer={null}
        width={modalWidth()}
      >
        <Form form={vacationForm} onFinish={handleCreateVacation} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item
            name="dates"
            label={t('vacation.startDate') + ' - ' + t('vacation.endDate')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.dates !== cur.dates}>
            {() => {
              const dates = vacationForm.getFieldValue('dates');
              const count = getDaysCount(dates);
              return count > 0 ? <div style={{ marginTop: -12, marginBottom: 12 }}><Text type="secondary">{t('common.daysSelected', { count })}</Text></div> : null;
            }}
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
        width={modalWidth()}
      >
        <Form form={sickForm} onFinish={handleCreateSick} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item
            name="date"
            label={t('common.date')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            initialValue={dayjs()}
          >
            <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
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

      {/* Day Off Modal */}
      <Modal
        title={t('calendar.dayoff')}
        open={dayOffModalVisible}
        onCancel={() => setDayOffModalVisible(false)}
        footer={null}
        width={modalWidth()}
      >
        <Form form={dayOffForm} onFinish={handleCreateDayOff} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          <Form.Item
            name="dates"
            label={t('vacation.startDate') + ' - ' + t('vacation.endDate')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev: any, cur: any) => prev.dates !== cur.dates}>
            {() => {
              const dates = dayOffForm.getFieldValue('dates');
              const count = getDaysCount(dates);
              return count > 0 ? <div style={{ marginTop: -12, marginBottom: 12 }}><Text type="secondary">{t('common.daysSelected', { count })}</Text></div> : null;
            }}
          </Form.Item>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={2} />
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
        width={modalWidth()}
      >
        {editingVacation && (
          <Form form={editVacationForm} onFinish={handleEditVacation} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
            <Form.Item
              name="date_from"
              label={t('vacation.startDate')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker
                format="DD.MM.YYYY"
                style={{ width: '100%' }}
                disabled={!isVacationStartEditableDirectly(editingVacation)}
                disabledDate={(current) => disableBeforeEmployment(current) || (!isAdmin && current && current < dayjs().startOf('day'))}
              />
            </Form.Item>
            <Form.Item
              name="date_to"
              label={t('vacation.endDate')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker
                format="DD.MM.YYYY"
                style={{ width: '100%' }}
                disabledDate={(current) => disableBeforeEmployment(current) || (!isAdmin && current && current < dayjs().startOf('day'))}
              />
            </Form.Item>
            <Form.Item name="note" label={t('vacation.reason')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            {!isVacationStartEditableDirectly(editingVacation) && (
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
        width={modalWidth()}
      >
        {editingSickDay && (
          <Form form={editSickForm} onFinish={handleEditSickDay} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
            <Form.Item
              name="date"
              label={t('common.date')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker
                format="DD.MM.YYYY"
                style={{ width: '100%' }}
                disabledDate={(current) => disableBeforeEmployment(current) || (!isAdmin && current && current < dayjs().startOf('day'))}
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

      {/* Edit Day Off Modal */}
      <Modal
        title={t('calendar.dayoff') + ' - ' + t('common.edit')}
        open={editDayOffModalVisible}
        onCancel={() => {
          setEditDayOffModalVisible(false);
          setEditingDayOff(null);
          setEditingDayOffGroup(null);
          editDayOffForm.resetFields();
        }}
        footer={null}
        width={modalWidth()}
      >
        {(editingDayOff || editingDayOffGroup) && (
          <Form form={editDayOffForm} onFinish={handleEditDayOff} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
            {editingDayOffGroup ? (
              <Form.Item
                name="dates"
                label={t('vacation.startDate') + ' - ' + t('vacation.endDate')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <DatePicker.RangePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
              </Form.Item>
            ) : (
              <Form.Item
                name="date"
                label={t('common.date')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <DatePicker
                  format="DD.MM.YYYY"
                  style={{ width: '100%' }}
                  disabledDate={(current) => disableBeforeEmployment(current) || (!isAdmin && current && current < dayjs().startOf('day'))}
                />
              </Form.Item>
            )}
            <Form.Item name="note" label={t('vacation.reason')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
              <Space>
                <Button onClick={() => {
                  setEditDayOffModalVisible(false);
                  setEditingDayOff(null);
                  setEditingDayOffGroup(null);
                  editDayOffForm.resetFields();
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

      {/* Change Request Modal for past sick days/vacations */}
      <Modal
        title={
          <>
            <SendOutlined style={{ marginRight: 8 }} />
            {t('changeRequest.requestChange')}
          </>
        }
        open={changeRequestModalVisible}
        onCancel={() => {
          setChangeRequestModalVisible(false);
          setChangeRequestType(null);
          setChangeRequestItem(null);
          changeRequestForm.resetFields();
        }}
        footer={null}
        width={modalWidth()}
      >
        <Form form={changeRequestForm} onFinish={handleCreateChangeRequest} layout="vertical" onKeyDown={(e: any) => e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.preventDefault()}>
          {/* Show current item info */}
          {changeRequestItem && (
            <div style={{ marginBottom: 16, padding: 12, background: token.colorFillQuaternary, borderRadius: 4, border: `1px solid ${token.colorBorderSecondary}` }}>
              {'date' in changeRequestItem ? (
                <Text>
                  {t('calendar.sickDay')}: <strong>{dayjs(changeRequestItem.date).format('DD.MM.YYYY')}</strong>
                </Text>
              ) : (
                <Text>
                  {t('calendar.vacation')}: <strong>{dayjs((changeRequestItem as Vacation).date_from).format('DD.MM.YYYY')} - {dayjs((changeRequestItem as Vacation).date_to).format('DD.MM.YYYY')}</strong>
                </Text>
              )}
            </div>
          )}

          {/* For edit requests, show editable fields */}
          {(changeRequestType === 'edit_sick_day' || changeRequestType === 'edit_dayoff') && (
            <Form.Item
              name="date"
              label={t('common.date')}
              rules={[{ required: true, message: t('timeEntry.validation.required') }]}
            >
              <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
            </Form.Item>
          )}

          {(changeRequestType === 'edit_vacation') && (
            <>
              <Form.Item
                name="date_from"
                label={t('vacation.startDate')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
              </Form.Item>
              <Form.Item
                name="date_to"
                label={t('vacation.endDate')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <DatePicker format="DD.MM.YYYY" style={{ width: '100%' }} disabledDate={disableBeforeEmployment} />
              </Form.Item>
            </>
          )}

          {(changeRequestType === 'edit_sick_day' || changeRequestType === 'edit_vacation' || changeRequestType === 'edit_dayoff') && (
            <Form.Item name="note" label={t('vacation.reason')}>
              <Input.TextArea rows={2} />
            </Form.Item>
          )}

          <Form.Item
            name="reason"
            label={t('changeRequest.reason')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <Input.TextArea rows={3} placeholder={t('changeRequest.reasonPlaceholder')} />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setChangeRequestModalVisible(false);
                setChangeRequestType(null);
                setChangeRequestItem(null);
                changeRequestForm.resetFields();
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" icon={<SendOutlined />} loading={submittingChangeRequest}>
                {t('changeRequest.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Bulk Entry Modal */}
      <Modal
        title={<Space><Calendar size={16} />{t('calendar.bulkEntry.title')}</Space>}
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
                  <Button size="small" type="link" onClick={() => setBulkSelectedDays(bulkAvailableDays.map(dd => dd.format('YYYY-MM-DD')))}>
                    {t('calendar.weeklyReminder.selectAll')}
                  </Button>
                  <Button size="small" type="link" onClick={() => setBulkSelectedDays([])}>
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
                    <Form.Item name="start_time" label={t('timeEntry.startTime')} rules={[{ required: true, message: t('timeEntry.validation.required') }]} style={{ marginBottom: 8 }}>
                      <TimePicker format="HH:mm" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                    </Form.Item>
                    <Form.Item name="end_time" label={t('timeEntry.endTime')} rules={[{ required: true, message: t('timeEntry.validation.required') }]} style={{ marginBottom: 8 }}>
                      <TimePicker format="HH:mm" onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()} />
                    </Form.Item>
	                    <Form.Item name="break_minutes" label={t('timeEntry.breakMinutes')} style={{ marginBottom: 8 }} extra={t('timeEntry.maxBreak60Minutes')}>
	                      <InputNumber min={0} max={60} style={{ width: 80 }} />
                    </Form.Item>
                  </Space>

                  <Form.Item name="workplace" label={t('timeEntry.workplace')} rules={[{ required: true, message: t('timeEntry.validation.required') }]}>
                    <Select style={{ width: '100%' }}>
                      <Select.Option value="office"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 8 }} />{t('timeEntry.office')}</Select.Option>
                      <Select.Option value="remote"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 8 }} />{t('timeEntry.remote')}</Select.Option>
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
                        fetchData();
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
          <Alert message={t('calendar.bulkEntry.noDaysAvailable')} type="warning" showIcon />
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
            const enabledDays = WEEKDAY_KEYS.filter(k => tpl.schedule[k]?.enabled);
            return (
              <List.Item
                actions={[
                  <Button key="edit" type="text" icon={<EditOutlined />} onClick={() => openTemplateForm(tpl)}>
                    {t('common.edit')}
                  </Button>,
                  <Button key="del" type="text" danger icon={<DeleteOutlined />} onClick={() => handleDeleteTemplate(tpl)}>
                    {t('common.delete')}
                  </Button>,
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
        <Form
          form={templateForm}
          layout="vertical"
          onFinish={handleSaveTemplate}
        >
          <Form.Item
            name="name"
            label={t('calendar.scheduleTemplate.name')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <Input placeholder={t('calendar.scheduleTemplate.namePlaceholder')} />
          </Form.Item>

          <Divider style={{ margin: '8px 0 12px' }} />

          {WEEKDAY_KEYS.filter(k => k !== 'sat' && k !== 'sun').map(k => (
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
	                    placeholder={t('timeEntry.breakMinutes')}
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

export default DashboardPage;
