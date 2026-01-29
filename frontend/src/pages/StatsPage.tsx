import React, { useEffect, useState } from 'react';
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
} from 'antd';
import { Clock, Calendar } from 'lucide-react';
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
import { Stats, DailyStats, PeriodType, User } from '../types';
import { useAuthStore } from '../store/authStore';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const COLORS = ['#279CF1', '#52c41a', '#ff7043', '#436597'];

const StatsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { settings, fetchSettings } = useSettingsStore();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    fetchSettings();
    if (isAdmin) {
      api.getEmployees().then(setEmployees).catch(() => {});
    }
  }, [isAdmin, fetchSettings]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }

      let data;
      if (isAdmin && selectedEmployeeId) {
        data = await api.getEmployeeStats({ user_id: selectedEmployeeId, ...params });
      } else {
        data = await api.getMyStats(params);
      }
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
  }, [period, dateRange, selectedEmployeeId]);

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ backgroundColor: 'white', padding: '10px', border: '1px solid #ccc', borderRadius: 4 }}>
          <p style={{ margin: 0, fontWeight: 'bold' }}>{label}</p>
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
    .filter((d) => d.is_working_day || d.total_minutes > 0)
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
        if (status === 'vacation') return <Tag color="blue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} /> {t('calendar.vacation')}</Tag>;
        if (status === 'excused') return <Tag color="magenta"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} /> {t('calendar.excusedAbsence')}</Tag>;
        if (!record.is_working_day) return <Tag>{t('calendar.weekend')}/{t('calendar.holiday')}</Tag>;
        return <Tag color="green">{t('calendar.workday')}</Tag>;
      },
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            {t('statistics.title')}
          </Title>
        </Col>
        <Col>
          <Space wrap>
            {isAdmin && (
              <Select
                value={selectedEmployeeId}
                onChange={setSelectedEmployeeId}
                style={{ width: 200 }}
                placeholder={t('statistics.selectEmployee')}
                showSearch
                optionFilterProp="children"
              >
                <Select.Option key="all" value={null}>
                  {t('statistics.allEmployees')}
                </Select.Option>
                {employees.map(emp => (
                  <Select.Option key={emp.id} value={emp.id}>
                    {emp.profile ? `${emp.profile.first_name} ${emp.profile.last_name}` : emp.email}
                  </Select.Option>
                ))}
              </Select>
            )}
            <Select
              value={period}
              onChange={setPeriod}
              style={{ width: 120 }}
            >
              <Select.Option value="week">{t('statistics.week')}</Select.Option>
              <Select.Option value="month">{t('statistics.month')}</Select.Option>
              <Select.Option value="year">{t('statistics.year')}</Select.Option>
              <Select.Option value="custom">{t('statistics.custom')}</Select.Option>
            </Select>
            {period === 'custom' && (
              <RangePicker
                onChange={(dates) => setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
              />
            )}
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('statistics.totalHours')}
              value={formatHours(stats?.total_hours || 0)}
              prefix={<Clock size={20} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('statistics.workDays')}
              value={stats?.days_with_entries || 0}
              suffix={`/ ${stats?.working_days || 0}`}
              prefix={<Calendar size={20} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('calendar.sickDay')}
              value={stats?.sick_days || 0}
              prefix={<DynamicIcon name={settings.icon_sick} size={20} />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('calendar.vacation')}
              value={stats?.vacation_days || 0}
              prefix={<DynamicIcon name={settings.icon_vacation} size={20} />}
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
          <Card title={t('statistics.workplaceDistribution')} loading={loading}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={workplaceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent, value }) =>
                    `${name}: ${(percent * 100).toFixed(0)}% (${value})`
                  }
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
          </Card>
        </Col>
      </Row>

      <Card title={t('statistics.table')} style={{ marginTop: 16 }} loading={loading}>
        <Table
          dataSource={stats?.daily_stats}
          columns={tableColumns}
          rowKey="date"
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>
    </div>
  );
};

export default StatsPage;