import React, { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Row,
  Col,
  Statistic,
  Typography,
  Select,
  DatePicker,
  Space,
  Table,
  Tag,
  message,
  theme,
} from 'antd';
import { Clock, Calendar } from 'lucide-react';
import { FieldTimeOutlined } from '@ant-design/icons';
import DynamicIcon from '../components/DynamicIcon';
import { useSettingsStore } from '../store/settingsStore';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import dayjs from 'dayjs';
import api from '../services/api';
import { Stats, DailyStats, PeriodType } from '../types';
import { useResponsive } from '../hooks/useResponsive';
import PageSizeSelector from '../components/PageSizeSelector';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const COLORS = ['#279CF1', '#52c41a', '#ff7043', '#436597'];

const calculateWorkingDays = (start: dayjs.Dayjs, end: dayjs.Dayjs, holidayDates: Set<string> = new Set()) => {
  let count = 0;
  let current = start.startOf('day');
  const endDay = end.startOf('day');
  while (current.isBefore(endDay) || current.isSame(endDay, 'day')) {
    const dow = current.day();
    const isWeekday = dow !== 0 && dow !== 6;
    const isHoliday = holidayDates.has(current.format('YYYY-MM-DD'));
    if (isWeekday && !isHoliday) count++;
    current = current.add(1, 'day');
  }
  return count;
};

const StatsPage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { settings, fetchSettings } = useSettingsStore();
  const { isMobile } = useResponsive();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());
  const [pageSize, setPageSize] = useState(10);
  const [holidayDates, setHolidayDates] = useState<Set<string>>(new Set());

  // Fetch holidays for the relevant year (covers month + year norm)
  useEffect(() => {
    const year = selectedDate.year();
    let cancelled = false;
    (async () => {
      try {
        const months = Array.from({ length: 12 }, (_, i) => i + 1);
        const results = await Promise.all(months.map(m => api.getCalendarMonth(year, m)));
        const set = new Set<string>();
        results.forEach((res: any) => {
          const days = res?.days || res || [];
          if (Array.isArray(days)) {
            days.forEach((d: any) => {
              if (d.day_type === 'holiday') {
                const dt = dayjs(d.date);
                const dow = dt.day();
                if (dow !== 0 && dow !== 6) set.add(d.date);
              }
            });
          }
        });
        if (!cancelled) setHolidayDates(set);
      } catch (e) {
        // ignore — fallback uses no holidays
      }
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // Norm hours calculation
  const normHours = useMemo(() => {
    const monthStart = selectedDate.startOf('month');
    const monthEnd = selectedDate.endOf('month');
    const yearStart = selectedDate.startOf('year');
    const yearEnd = selectedDate.endOf('year');

    const monthDays = calculateWorkingDays(monthStart, monthEnd, holidayDates);
    const yearDays = calculateWorkingDays(yearStart, yearEnd, holidayDates);

    return {
      week: 40,
      month: monthDays * 8,
      monthDays,
      year: yearDays * 8,
      yearDays,
    };
  }, [selectedDate, holidayDates]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (period === 'month') {
        params.date_from = selectedDate.startOf('month').format('YYYY-MM-DD');
        params.date_to = selectedDate.endOf('month').format('YYYY-MM-DD');
      } else if (period === 'year') {
        params.date_from = selectedDate.startOf('year').format('YYYY-MM-DD');
        params.date_to = selectedDate.endOf('year').format('YYYY-MM-DD');
      } else if (period === 'custom' && dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }

      const data = await api.getMyStats(params);
      setStats(data);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Don't fetch if custom period is selected but no dates chosen yet
    if (period === 'custom' && !dateRange) {
      return;
    }
    fetchStats();
  }, [period, dateRange, selectedDate]);

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const hShort = t('common.hoursShort');
    const mShort = t('common.minutesShort');
    return m > 0 ? `${h}${hShort} ${m}${mShort}` : `${h}${hShort}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: token.colorBgContainer, padding: '10px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 4 }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: token.colorText }}>{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ margin: 0, color: entry.color }}>
              {entry.name}: {formatHours(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const dailyChartData = stats?.daily_stats
    .map((d) => ({
      date: dayjs(d.date).format('DD/MM'),
      hours: d.total_hours,
      office: d.office_minutes / 60,
      remote: d.remote_minutes / 60,
    })) || [];

  // Calculate dynamic Y-axis max (max value + 2, minimum 12)
  const maxHours = dailyChartData.reduce((max, d) => {
    const total = d.office + d.remote;
    return total > max ? total : max;
  }, 0);
  const yAxisMax = Math.max(12, Math.ceil(maxHours) + 2);

  const workplaceData = [
    { name: t('timeEntry.office'), value: stats?.office_days || 0 },
    { name: t('timeEntry.remote'), value: stats?.remote_days || 0 },
  ];

  const tableColumns = [
    {
      title: t('common.date'),
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('DD.MM.YYYY'),
    },
    {
      title: t('days.monday').substring(0, 3),
      dataIndex: 'date',
      key: 'day',
      render: (date: string) => dayjs(date).format('ddd'),
    },
    {
      title: t('timeEntry.hours'),
      dataIndex: 'total_hours',
      key: 'hours',
      render: (hours: number) => formatHours(hours),
    },
    {
      title: <><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('timeEntry.office')}</>,
      dataIndex: 'office_minutes',
      key: 'office',
      render: (minutes: number) => (minutes > 0 ? formatHours(minutes / 60) : '-'),
    },
    {
      title: <><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} />{t('timeEntry.remote')}</>,
      dataIndex: 'remote_minutes',
      key: 'remote',
      render: (minutes: number) => (minutes > 0 ? formatHours(minutes / 60) : '-'),
    },
    {
      title: t('common.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: DailyStats) => {
        if (status === 'sick') return <Tag color="gold"><DynamicIcon name={settings.icon_sick} size={14} style={{ marginRight: 4 }} /> {t('calendar.sickDay')}</Tag>;
        if (status === 'vacation') return <Tag color="geekblue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} /> {t('calendar.vacation')}</Tag>;
        if (status === 'excused') return <Tag color="purple"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} /> {t('calendar.excusedAbsence')}</Tag>;
        if (!record.is_working_day && record.total_minutes > 0) {
          return <Tag color="green">{t('calendar.workday')}</Tag>;
        }
        if (!record.is_working_day) return <Tag>{t('calendar.weekend')}/{t('calendar.holiday')}</Tag>;
        return <Tag color="green">{t('calendar.workday')}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} md="auto">
          <Title level={3} style={{ margin: 0 }}>
            {t('statistics.title')}
          </Title>
        </Col>
        <Col xs={24} md="auto">
          <Space wrap>
<Select
              value={period}
              onChange={setPeriod}
              style={{ width: isMobile ? '100%' : 120, minWidth: isMobile ? undefined : 120 }}
            >
              <Select.Option value="week">{t('statistics.week')}</Select.Option>
              <Select.Option value="month">{t('statistics.month')}</Select.Option>
              <Select.Option value="year">{t('statistics.year')}</Select.Option>
              <Select.Option value="custom">{t('statistics.custom')}</Select.Option>
            </Select>
            {period === 'month' && (
              <>
                <Select
                  value={selectedDate.month()}
                  onChange={(month) => setSelectedDate(selectedDate.month(month))}
                  style={{ width: isMobile ? '100%' : 140, minWidth: isMobile ? undefined : 140 }}
                >
                  {Array.from({ length: 12 }, (_, i) => (
                    <Select.Option key={i} value={i}>
                      {t(`months.${['january','february','march','april','may','june','july','august','september','october','november','december'][i]}`)}
                    </Select.Option>
                  ))}
                </Select>
                <Select
                  value={selectedDate.year()}
                  onChange={(year) => setSelectedDate(selectedDate.year(year))}
                  style={{ width: isMobile ? '100%' : 80, minWidth: isMobile ? undefined : 80 }}
                >
                  {Array.from({ length: 5 }, (_, i) => dayjs().year() - 2 + i).map((year) => (
                    <Select.Option key={year} value={year}>{year}</Select.Option>
                  ))}
                </Select>
              </>
            )}
            {period === 'year' && (
              <Select
                value={selectedDate.year()}
                onChange={(year) => setSelectedDate(selectedDate.year(year))}
                style={{ width: isMobile ? '100%' : 80, minWidth: isMobile ? undefined : 80 }}
              >
                {Array.from({ length: 5 }, (_, i) => dayjs().year() - 2 + i).map((year) => (
                  <Select.Option key={year} value={year}>{year}</Select.Option>
                ))}
              </Select>
            )}
            {period === 'custom' && (
              <RangePicker
                format="DD.MM.YYYY"
                onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              />
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={8} lg={5}>
          <Card className="stats-card" loading={loading} size="small">
            <Statistic
              title={t('statistics.totalHours')}
              value={formatHours(stats?.total_hours || 0)}
              prefix={<Clock size={18} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <Card className="stats-card" loading={loading} size="small">
            <Statistic
              title={t('statistics.daysWorked')}
              value={stats?.days_with_entries || 0}
              prefix={<Calendar size={18} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <Card className="stats-card" loading={loading} size="small">
            <Statistic
              title={t('calendar.sickDay')}
              value={stats?.sick_days || 0}
              prefix={<DynamicIcon name={settings.icon_sick} size={18} />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} lg={5}>
          <Card className="stats-card" loading={loading} size="small">
            <Statistic
              title={t('calendar.vacation')}
              value={stats?.vacation_days || 0}
              prefix={<DynamicIcon name={settings.icon_vacation} size={18} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8} lg={4}>
          <Card className="stats-card" size="small">
            <Statistic
              title={t('statistics.normHours')}
              value={period === 'year' ? `${normHours.year}${t('common.hoursShort')}` : period === 'week' ? `40${t('common.hoursShort')}` : `${normHours.month}${t('common.hoursShort')}`}
              suffix={period === 'month' ? <span style={{ fontSize: 13, color: token.colorTextSecondary }}>({normHours.monthDays}d)</span> : period === 'year' ? <span style={{ fontSize: 13, color: token.colorTextSecondary }}>({normHours.yearDays}d)</span> : undefined}
              prefix={<FieldTimeOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={16}>
          <Card title={t('statistics.hoursDistribution')} loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dailyChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, yAxisMax]} allowDecimals={false} tickFormatter={(value) => Math.floor(value).toString()} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="office" name={t('timeEntry.office')} fill="#279CF1" stackId="a" />
                <Bar dataKey="remote" name={t('timeEntry.remote')} fill="#52c41a" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title={t('statistics.workplaceDistribution')} loading={loading} styles={{ body: { overflow: 'visible' } }}>
            <div style={{ overflow: 'visible' }}>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart style={{ overflow: 'visible' }}>
                  <Pie
                    data={workplaceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ cx, cy, index, name, value, percent }) => {
                      const cxN = cx as number;
                      const cyN = cy as number;
                      const y = index === 0 ? cyN - 100 : cyN + 110;
                      return (
                        <text x={cxN} y={y} textAnchor="middle" dominantBaseline="central" fontSize={14} fill={COLORS[index % COLORS.length]}>
                          {`${name}: ${value} (${(percent * 100).toFixed(0)}%)`}
                        </text>
                      );
                    }}
                    outerRadius={80}
                    dataKey="value"
                  >
                    {workplaceData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {stats && (() => {
        const worked = stats.total_hours || 0;
        const norm = period === 'week' ? 40
          : period === 'year' ? normHours.year
          : period === 'custom' && dateRange ? calculateWorkingDays(dateRange[0], dateRange[1]) * 8
          : normHours.month;
        const barMax = Math.max(norm, worked) || 1;
        const greenWidth = Math.min(worked, norm) / barMax * 100;
        const yellowWidth = worked < norm ? (norm - worked) / barMax * 100 : 0;
        const redWidth = worked > norm ? (worked - norm) / barMax * 100 : 0;

        return (
          <Card title={t('statistics.hoursProgress')} style={{ marginTop: 16 }} loading={loading}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text strong>{formatHours(worked)} / {formatHours(norm)}</Text>
              {worked > norm ? (
                <Text type="danger" strong>+{formatHours(worked - norm)} {t('statistics.overtimeLabel')}</Text>
              ) : (
                <Text type="secondary">{t('statistics.remaining')}: {formatHours(norm - worked)}</Text>
              )}
            </div>
            <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', background: '#f0f0f0' }}>
              {greenWidth > 0 && <div style={{ width: `${greenWidth}%`, background: '#52c41a', transition: 'width 0.3s' }} />}
              {yellowWidth > 0 && <div style={{ width: `${yellowWidth}%`, background: '#faad14', transition: 'width 0.3s' }} />}
              {redWidth > 0 && <div style={{ width: `${redWidth}%`, background: '#ff4d4f', transition: 'width 0.3s' }} />}
            </div>
          </Card>
        );
      })()}

      <Card title={t('statistics.table')} style={{ marginTop: 16 }} loading={loading}>
        <Table
          dataSource={stats?.daily_stats}
          columns={tableColumns}
          rowKey="date"
          pagination={{ pageSize, showSizeChanger: false }}
          size="small"
          scroll={{ x: 'max-content' }}
          footer={() => (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PageSizeSelector
                value={pageSize}
                total={stats?.daily_stats?.length || 0}
                onChange={setPageSize}
              />
            </div>
          )}
        />
      </Card>
    </div>
  );
};

export default StatsPage;
