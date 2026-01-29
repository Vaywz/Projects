import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Row,
  Col,
  Typography,
  Select,
  Tag,
  Space,
  message,
  Spin,
  Tooltip,
  Button,
  Segmented,
  DatePicker,
} from 'antd';
import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { CircleOff } from 'lucide-react';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../../services/api';
import { User, EmployeeWithStatus, EmployeeStatus, CalendarDay, TimeEntry } from '../../types';
import DynamicIcon from '../../components/DynamicIcon';
import { useSettingsStore } from '../../store/settingsStore';

dayjs.extend(isoWeek);

const { Title, Text } = Typography;

// Status colors
const STATUS_COLORS: Record<EmployeeStatus, string> = {
  office: '#52c41a',
  remote: '#722ed1',
  sick: '#faad14',
  vacation: '#1890ff',
  excused: '#eb2f96',
  no_plan: '#d9d9d9',
};

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  office: 'office.workFromOffice',
  remote: 'office.workFromHome',
  sick: 'calendar.sickDay',
  vacation: 'calendar.vacation',
  excused: 'calendar.excusedAbsence',
  no_plan: 'office.noOneScheduled',
};

interface DayEmployeesData {
  [date: string]: EmployeeWithStatus[];
}

interface CalendarDayData {
  [date: string]: CalendarDay;
}

interface EmployeeTimeData {
  [userId: number]: {
    [date: string]: {
      totalHours: number;
      entries: TimeEntry[];
    };
  };
}

const AdminCalendarPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { settings, fetchSettings } = useSettingsStore();

  const getHolidayName = (calDay: CalendarDay): string | undefined => {
    if (!calDay.holiday_name) return undefined;
    const lang = i18n.language;
    if (lang === 'lv') return calDay.holiday_name_lv || calDay.holiday_name;
    if (lang === 'en') return calDay.holiday_name_en || calDay.holiday_name;
    return calDay.holiday_name;
  };
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | 'all'>('all');
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [currentWeek, setCurrentWeek] = useState(dayjs());
  const [dayEmployeesData, setDayEmployeesData] = useState<DayEmployeesData>({});
  const [calendarData, setCalendarData] = useState<CalendarDayData>({});
  const [employeeTimeData, setEmployeeTimeData] = useState<EmployeeTimeData>({});
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

  // Get icon for status from settings
  const getStatusIcon = useCallback((status: EmployeeStatus, size: number = 12) => {
    const iconMap: Record<EmployeeStatus, string> = {
      office: settings.icon_office,
      remote: settings.icon_remote,
      sick: settings.icon_sick,
      vacation: settings.icon_vacation,
      excused: settings.icon_excused,
      no_plan: 'CircleOff',
    };
    const iconName = iconMap[status];
    if (status === 'no_plan') {
      return <CircleOff size={size} />;
    }
    return <DynamicIcon name={iconName} size={size} />;
  }, [settings]);

  // Fetch employees list
  const fetchEmployees = useCallback(async () => {
    try {
      const data = await api.getEmployees(true);
      setEmployees(data);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  }, [t]);

  // Fetch employee status data for the month
  const fetchMonthData = useCallback(async (month: Dayjs) => {
    setLoading(true);
    try {
      const startDate = month.startOf('month');
      const endDate = month.endOf('month');
      const data: DayEmployeesData = {};
      const timeData: EmployeeTimeData = {};

      // Fetch calendar data for holidays/weekends
      const calendarResponse = await api.getCalendarMonth(month.year(), month.month() + 1);
      const calData: CalendarDayData = {};
      calendarResponse.days.forEach((day: CalendarDay) => {
        calData[day.date] = day;
      });
      setCalendarData(calData);

      // Fetch data for each day of the month in parallel
      const datePromises: Promise<void>[] = [];
      let currentDate = startDate;
      while (currentDate.isBefore(endDate) || currentDate.isSame(endDate, 'day')) {
        const dateStr = currentDate.format('YYYY-MM-DD');
        datePromises.push(
          api.getAllEmployeesStatus(dateStr).then((response) => {
            data[dateStr] = response.employees;
          }).catch(() => {
            data[dateStr] = [];
          })
        );
        currentDate = currentDate.add(1, 'day');
      }
      await Promise.all(datePromises);

      // Fetch time entries for all employees in parallel
      const timePromises = employees.map(async (emp) => {
        try {
          const entries = await api.getEmployeeTimeEntries(
            emp.id,
            startDate.format('YYYY-MM-DD'),
            endDate.format('YYYY-MM-DD')
          );
          if (!timeData[emp.id]) {
            timeData[emp.id] = {};
          }
          entries.forEach((entry: TimeEntry) => {
            if (!timeData[emp.id][entry.date]) {
              timeData[emp.id][entry.date] = { totalHours: 0, entries: [] };
            }
            timeData[emp.id][entry.date].entries.push(entry);
            timeData[emp.id][entry.date].totalHours += entry.duration_hours;
          });
        } catch {
          // Ignore errors for individual employees
        }
      });
      await Promise.all(timePromises);

      setDayEmployeesData(data);
      setEmployeeTimeData(timeData);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  }, [t, employees]);

  // Fetch week data
  const fetchWeekData = useCallback(async (week: Dayjs) => {
    setLoading(true);
    try {
      const startDate = week.startOf('isoWeek');
      const endDate = week.endOf('isoWeek');
      const data: DayEmployeesData = {};
      const timeData: EmployeeTimeData = {};

      // Fetch calendar data for holidays/weekends
      const calendarResponse = await api.getCalendarMonth(week.year(), week.month() + 1);
      const calData: CalendarDayData = {};
      calendarResponse.days.forEach((day: CalendarDay) => {
        calData[day.date] = day;
      });
      setCalendarData(calData);

      // Fetch data for each day of the week in parallel
      const datePromises: Promise<void>[] = [];
      for (let i = 0; i < 7; i++) {
        const date = startDate.add(i, 'day');
        const dateStr = date.format('YYYY-MM-DD');
        datePromises.push(
          api.getAllEmployeesStatus(dateStr).then((response) => {
            data[dateStr] = response.employees;
          }).catch(() => {
            data[dateStr] = [];
          })
        );
      }
      await Promise.all(datePromises);

      // Fetch time entries for all employees in parallel
      const timePromises = employees.map(async (emp) => {
        try {
          const entries = await api.getEmployeeTimeEntries(
            emp.id,
            startDate.format('YYYY-MM-DD'),
            endDate.format('YYYY-MM-DD')
          );
          if (!timeData[emp.id]) {
            timeData[emp.id] = {};
          }
          entries.forEach((entry: TimeEntry) => {
            if (!timeData[emp.id][entry.date]) {
              timeData[emp.id][entry.date] = { totalHours: 0, entries: [] };
            }
            timeData[emp.id][entry.date].entries.push(entry);
            timeData[emp.id][entry.date].totalHours += entry.duration_hours;
          });
        } catch {
          // Ignore errors for individual employees
        }
      });
      await Promise.all(timePromises);

      setDayEmployeesData(data);
      setEmployeeTimeData(timeData);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  }, [t, employees]);

  useEffect(() => {
    fetchEmployees();
    fetchSettings();
  }, [fetchEmployees, fetchSettings]);

  useEffect(() => {
    if (employees.length > 0) {
      if (viewMode === 'month') {
        fetchMonthData(currentMonth);
      } else {
        fetchWeekData(currentWeek);
      }
    }
  }, [currentMonth, currentWeek, viewMode, employees, fetchMonthData, fetchWeekData]);

  const getFilteredEmployeesForDate = (dateStr: string): EmployeeWithStatus[] => {
    const emps = dayEmployeesData[dateStr] || [];
    if (selectedEmployee === 'all') {
      // Show all employees with their status
      return emps;
    }
    return emps.filter(e => e.user_id === selectedEmployee);
  };

  const getEmployeeTimeRangeForDate = (userId: number, dateStr: string): string | null => {
    const data = employeeTimeData[userId]?.[dateStr];
    if (!data || data.entries.length === 0) return null;

    // Sort entries by start time and get first start and last end
    const sortedEntries = [...data.entries].sort((a, b) =>
      a.start_time.localeCompare(b.start_time)
    );

    const firstStart = sortedEntries[0].start_time.slice(0, 5); // HH:MM
    const lastEnd = sortedEntries[sortedEntries.length - 1].end_time.slice(0, 5);

    return `${firstStart}-${lastEnd}`;
  };

  const handleWeekChange = (offset: number) => {
    setCurrentWeek(currentWeek.add(offset, 'week'));
  };

  const handleMonthChange = (offset: number) => {
    setCurrentMonth(currentMonth.add(offset, 'month'));
  };

  // Get days of the week for week view header
  const getWeekDays = () => {
    const days = [];
    const startOfWeek = currentWeek.startOf('isoWeek');
    for (let i = 0; i < 7; i++) {
      days.push(startOfWeek.add(i, 'day'));
    }
    return days;
  };

  // Render employee item for calendar cell
  const renderEmployeeItem = (emp: EmployeeWithStatus, dateStr: string, compact: boolean = false) => {
    const timeData = employeeTimeData[emp.user_id]?.[dateStr];
    const timeRange = getEmployeeTimeRangeForDate(emp.user_id, dateStr);

    // Use workplace from time entry if available, otherwise from status
    let displayStatus: EmployeeStatus;
    if (timeData && timeData.entries.length > 0) {
      // Get workplace from actual time entry
      const workplace = timeData.entries[0].workplace;
      displayStatus = workplace as EmployeeStatus; // 'office' or 'remote'
    } else {
      // Fall back to status from workplace plan
      displayStatus = emp.statuses?.[0] || (emp.status as EmployeeStatus);
    }

    const statusColor = STATUS_COLORS[displayStatus];
    const name = compact ? `${emp.first_name?.[0]}. ${emp.last_name}` : `${emp.first_name} ${emp.last_name}`;

    return (
      <Tooltip key={emp.user_id} title={`${emp.first_name} ${emp.last_name} - ${t(STATUS_LABELS[displayStatus])}${timeRange ? ` (${timeRange})` : ''}`}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 4px',
          borderRadius: 4,
          backgroundColor: `${statusColor}15`,
          borderLeft: `3px solid ${statusColor}`,
          marginBottom: 2,
          fontSize: 11,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}>
          <span style={{ color: statusColor, display: 'flex', alignItems: 'center' }}>
            {getStatusIcon(displayStatus, 12)}
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', color: '#333' }}>
            {name}
          </span>
          {timeRange && (
            <span style={{ color: '#1890ff', fontWeight: 600, fontSize: 10 }}>
              {timeRange}
            </span>
          )}
        </div>
      </Tooltip>
    );
  };

  // Generate month calendar grid
  const generateMonthGrid = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startOfGrid = startOfMonth.startOf('isoWeek');
    const endOfGrid = endOfMonth.endOf('isoWeek');

    const weeks: Dayjs[][] = [];
    let currentDate = startOfGrid;

    while (currentDate.isBefore(endOfGrid) || currentDate.isSame(endOfGrid, 'day')) {
      const week: Dayjs[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(currentDate);
        currentDate = currentDate.add(1, 'day');
      }
      weeks.push(week);
    }

    return weeks;
  };

  // Render day cell for month view
  const renderDayCell = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const calDay = calendarData[dateStr];
    const isCurrentMonth = date.month() === currentMonth.month();
    const isToday = date.isSame(dayjs(), 'day');
    const isWeekend = date.day() === 0 || date.day() === 6;
    const filteredEmployees = getFilteredEmployeesForDate(dateStr);

    let bgColor = '#fff';
    if (calDay?.day_type === 'holiday') {
      bgColor = '#fff1f0';
    } else if (isWeekend) {
      bgColor = '#fafafa';
    }

    return (
      <div
        key={dateStr}
        style={{
          flex: 1,
          minWidth: 0,
          border: '1px solid #f0f0f0',
          borderTop: 'none',
          borderLeft: 'none',
          backgroundColor: bgColor,
          opacity: isCurrentMonth ? 1 : 0.4,
          minHeight: 120,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 6px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: isToday ? '#e6f7ff' : undefined,
        }}>
          <span style={{
            fontWeight: isToday ? 700 : 500,
            color: isToday ? '#1890ff' : isWeekend ? '#999' : '#333',
            fontSize: 13,
          }}>
            {date.date()}
          </span>
          {calDay && getHolidayName(calDay) && (
            <Tooltip title={getHolidayName(calDay)}>
              <Tag color="red" style={{ fontSize: 9, padding: '0 4px', margin: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getHolidayName(calDay)}
              </Tag>
            </Tooltip>
          )}
        </div>
        <div style={{
          flex: 1,
          padding: 4,
          overflowY: 'auto',
          maxHeight: 100,
        }}>
          {filteredEmployees.slice(0, 5).map(emp => renderEmployeeItem(emp, dateStr, true))}
          {filteredEmployees.length > 5 && (
            <Tooltip title={filteredEmployees.slice(5).map(e => `${e.first_name} ${e.last_name}`).join(', ')}>
              <div style={{ fontSize: 10, color: '#999', textAlign: 'center', padding: 2 }}>
                +{filteredEmployees.length - 5} {t('common.more') || 'more'}
              </div>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  // Render week day cell (larger)
  const renderWeekDayCell = (date: Dayjs) => {
    const dateStr = date.format('YYYY-MM-DD');
    const calDay = calendarData[dateStr];
    const isToday = date.isSame(dayjs(), 'day');
    const isWeekend = date.day() === 0 || date.day() === 6;
    const filteredEmployees = getFilteredEmployeesForDate(dateStr);

    let bgColor = '#fff';
    if (calDay?.day_type === 'holiday') {
      bgColor = '#fff1f0';
    } else if (isWeekend) {
      bgColor = '#fafafa';
    }

    return (
      <div
        key={dateStr}
        style={{
          flex: 1,
          minWidth: 0,
          border: '1px solid #f0f0f0',
          borderTop: 'none',
          borderLeft: 'none',
          backgroundColor: bgColor,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 10px',
          borderBottom: '1px solid #f0f0f0',
          backgroundColor: isToday ? '#e6f7ff' : undefined,
        }}>
          <div>
            <div style={{
              fontWeight: isToday ? 700 : 500,
              color: isToday ? '#1890ff' : isWeekend ? '#999' : '#333',
              fontSize: 14,
            }}>
              {date.format('ddd')}
            </div>
            <div style={{
              fontWeight: isToday ? 700 : 400,
              color: isToday ? '#1890ff' : isWeekend ? '#999' : '#666',
              fontSize: 18,
            }}>
              {date.date()}
            </div>
          </div>
          {calDay && getHolidayName(calDay) && (
            <Tag color="red" style={{ fontSize: 10, padding: '2px 6px', margin: 0 }}>
              {getHolidayName(calDay)}
            </Tag>
          )}
        </div>
        <div style={{
          flex: 1,
          padding: 8,
          overflowY: 'auto',
        }}>
          {filteredEmployees.map(emp => renderEmployeeItem(emp, dateStr, false))}
          {filteredEmployees.length === 0 && (
            <Text type="secondary" style={{ fontSize: 12 }}>{t('admin.calendar.noData')}</Text>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <CalendarOutlined /> {t('admin.calendar.title')}
          </Title>
          <Text type="secondary">{t('admin.calendar.subtitle')}</Text>
        </Col>
        <Col>
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as 'month' | 'week')}
            options={[
              { label: t('calendar.month'), value: 'month' },
              { label: t('calendar.week'), value: 'week' },
            ]}
          />
        </Col>
      </Row>

      <Card>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Row justify="space-between" align="middle" gutter={16}>
            <Col>
              <Space>
                {viewMode === 'month' ? (
                  <>
                    <Button icon={<LeftOutlined />} onClick={() => handleMonthChange(-1)} />
                    <DatePicker
                      picker="month"
                      value={currentMonth}
                      onChange={(date) => date && setCurrentMonth(date)}
                      allowClear={false}
                      format="MMMM YYYY"
                      style={{ width: 180 }}
                    />
                    <Button icon={<RightOutlined />} onClick={() => handleMonthChange(1)} />
                    <Button onClick={() => setCurrentMonth(dayjs())}>{t('calendar.today')}</Button>
                  </>
                ) : (
                  <>
                    <Button icon={<LeftOutlined />} onClick={() => handleWeekChange(-1)} />
                    <Text strong style={{ fontSize: 15, minWidth: 200, textAlign: 'center', display: 'inline-block' }}>
                      {currentWeek.startOf('isoWeek').format('D MMM')} - {currentWeek.endOf('isoWeek').format('D MMM YYYY')}
                    </Text>
                    <Button icon={<RightOutlined />} onClick={() => handleWeekChange(1)} />
                    <Button onClick={() => setCurrentWeek(dayjs())}>{t('calendar.today')}</Button>
                  </>
                )}
              </Space>
            </Col>
            <Col>
              <Space wrap>
                <Text strong>{t('admin.calendar.filterByEmployee')}:</Text>
                <Select
                  style={{ width: 220 }}
                  value={selectedEmployee}
                  onChange={setSelectedEmployee}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label?.toString() || '').toLowerCase().includes(input.toLowerCase())
                  }
                  options={[
                    { value: 'all', label: t('admin.calendar.allEmployees') },
                    ...employees.map(emp => ({
                      value: emp.id,
                      label: `${emp.profile?.first_name} ${emp.profile?.last_name}`,
                    })),
                  ]}
                />
              </Space>
            </Col>
          </Row>
          <Space wrap>
            <Tag color="green"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('office.workFromOffice')}</Tag>
            <Tag color="purple"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} />{t('office.workFromHome')}</Tag>
            <Tag color="gold"><DynamicIcon name={settings.icon_sick} size={14} style={{ marginRight: 4 }} />{t('calendar.sickDay')}</Tag>
            <Tag color="blue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} />{t('calendar.vacation')}</Tag>
            <Tag color="magenta"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} />{t('calendar.excusedAbsence')}</Tag>
          </Space>
        </Space>

        <Spin spinning={loading}>
          {viewMode === 'month' ? (
            <div style={{ border: '1px solid #f0f0f0', borderBottom: 'none', borderRight: 'none' }}>
              {/* Week day headers */}
              <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
                {['P', 'O', 'T', 'C', 'Pk', 'S', 'Sv'].map((day, idx) => (
                  <div
                    key={idx}
                    style={{
                      flex: 1,
                      padding: '8px 0',
                      textAlign: 'center',
                      fontWeight: 600,
                      color: idx >= 5 ? '#999' : '#333',
                      backgroundColor: '#fafafa',
                      borderRight: '1px solid #f0f0f0',
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>
              {/* Calendar weeks */}
              {generateMonthGrid().map((week, weekIdx) => (
                <div key={weekIdx} style={{ display: 'flex' }}>
                  {week.map(date => renderDayCell(date))}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ border: '1px solid #f0f0f0', borderBottom: 'none', borderRight: 'none' }}>
              <div style={{ display: 'flex', minHeight: 400 }}>
                {getWeekDays().map(date => renderWeekDayCell(date))}
              </div>
            </div>
          )}
        </Spin>
      </Card>

      <style>{`
        .weekend-column {
          background-color: #fafafa !important;
        }
      `}</style>
    </div>
  );
};

export default AdminCalendarPage;