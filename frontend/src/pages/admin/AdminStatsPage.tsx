import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Row,
  Col,
  Select,
  DatePicker,
  Table,
  Typography,
  Space,
  message,
  Statistic,
  theme,
} from 'antd';
import {
  ClockCircleOutlined,
  HomeOutlined,
  LaptopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
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
import api from '../../services/api';
import { User, Stats, PeriodType } from '../../types';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const COLORS = ['#279CF1', '#52c41a', '#ff7043', '#436597', '#00bcd4', '#ff9800'];

const AdminStatsPage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      const data = await api.getEmployees(true);
      setEmployees(data);
    } catch (error) {
      message.error(t('statistics.failedToLoadEmployees'));
    }
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const params: any = { period };
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }
      const data = await api.getAllEmployeesStats(params);
      setSummary(data);
    } catch (error) {
      message.error(t('statistics.failedToLoadSummary'));
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeeStats = async (employeeId: number) => {
    setLoading(true);
    try {
      const params: any = { user_id: employeeId, period };
      if (dateRange) {
        params.date_from = dateRange[0].format('YYYY-MM-DD');
        params.date_to = dateRange[1].format('YYYY-MM-DD');
      }
      const data = await api.getEmployeeStats(params);
      setStats(data);
    } catch (error) {
      message.error(t('statistics.failedToLoadStats'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  useEffect(() => {
    // Don't fetch if custom period is selected but no dates chosen yet
    if (period === 'custom' && !dateRange) {
      return;
    }
    if (selectedEmployee) {
      fetchEmployeeStats(selectedEmployee);
    } else {
      fetchSummary();
      setStats(null);
    }
  }, [selectedEmployee, period, dateRange]);

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

  // Summary table columns
  const summaryColumns = [
    {
      title: t('statistics.employee'),
      key: 'name',
      render: (_: any, record: any) =>
        `${record.first_name || ''} ${record.last_name || ''}`.trim() || record.email,
      sorter: (a: any, b: any) => {
        const nameA = `${a.first_name || ''} ${a.last_name || ''}`;
        const nameB = `${b.first_name || ''} ${b.last_name || ''}`;
        return nameA.localeCompare(nameB);
      },
    },
    {
      title: t('statistics.totalHours'),
      dataIndex: 'total_hours',
      key: 'hours',
      render: (hours: number) => formatHours(hours || 0),
      sorter: (a: any, b: any) => (a.total_hours || 0) - (b.total_hours || 0),
    },
    {
      title: t('statistics.daysWorked'),
      key: 'days',
      render: (_: any, record: any) =>
        `${record.days_with_entries || 0} / ${record.working_days || 0}`,
    },
    {
      title: t('statistics.office'),
      dataIndex: 'office_days',
      key: 'office',
      render: (days: number) => days || 0,
    },
    {
      title: t('statistics.remote'),
      dataIndex: 'remote_days',
      key: 'remote',
      render: (days: number) => days || 0,
    },
    {
      title: t('statistics.sick'),
      dataIndex: 'sick_days',
      key: 'sick',
      render: (days: number) => days || 0,
    },
    {
      title: t('statistics.vacation'),
      dataIndex: 'vacation_days',
      key: 'vacation',
      render: (days: number) => days || 0,
    },
  ];

  // Prepare chart data
  const employeeChartData = summary?.employees?.map((emp: any) => ({
    name: `${emp.first_name || ''} ${emp.last_name?.charAt(0) || ''}`.trim() || emp.email.split('@')[0],
    hours: emp.total_hours || 0,
    office: emp.office_days || 0,
    remote: emp.remote_days || 0,
  })) || [];

  const workplaceDistribution = [
    {
      name: t('statistics.office'),
      value: summary?.employees?.reduce((sum: number, e: any) => sum + (e.office_days || 0), 0) || 0,
    },
    {
      name: t('statistics.remote'),
      value: summary?.employees?.reduce((sum: number, e: any) => sum + (e.remote_days || 0), 0) || 0,
    },
  ];

  const totalHours = summary?.employees?.reduce(
    (sum: number, e: any) => sum + (e.total_hours || 0),
    0
  ) || 0;

  const avgHours = employees.length > 0 ? totalHours / employees.length : 0;

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            {t('statistics.title')}
          </Title>
        </Col>
        <Col>
          <Space>
            <Select
              placeholder={t('statistics.allEmployees')}
              style={{ width: 200 }}
              allowClear
              value={selectedEmployee}
              onChange={setSelectedEmployee}
            >
              {employees.map((emp) => (
                <Select.Option key={emp.id} value={emp.id}>
                  {emp.profile
                    ? `${emp.profile.first_name} ${emp.profile.last_name}`
                    : emp.email}
                </Select.Option>
              ))}
            </Select>
            <Select value={period} onChange={setPeriod} style={{ width: 120 }}>
              <Select.Option value="week">{t('statistics.week')}</Select.Option>
              <Select.Option value="month">{t('statistics.month')}</Select.Option>
              <Select.Option value="year">{t('statistics.year')}</Select.Option>
              <Select.Option value="custom">{t('statistics.custom')}</Select.Option>
            </Select>
            {period === 'custom' && (
              <RangePicker
                onChange={(dates) =>
                  setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])
                }
              />
            )}
          </Space>
        </Col>
      </Row>

      {!selectedEmployee ? (
        // Summary view
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={12} lg={6}>
              <Card className="stats-card" loading={loading}>
                <Statistic
                  title={t('statistics.totalEmployees')}
                  value={employees.length}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="stats-card" loading={loading}>
                <Statistic
                  title={t('statistics.totalHours')}
                  value={formatHours(totalHours)}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="stats-card" loading={loading}>
                <Statistic
                  title={t('statistics.avgHoursPerEmployee')}
                  value={formatHours(avgHours)}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card className="stats-card" loading={loading}>
                <Statistic
                  title={t('statistics.officeVsRemote')}
                  value={`${workplaceDistribution[0].value}`}
                  suffix={`/ ${workplaceDistribution[1].value}`}
                  prefix={<HomeOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={16}>
              <Card title={t('statistics.hoursByEmployee')} loading={loading}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={employeeChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis
                      domain={[0, (dataMax: number) => Math.ceil(dataMax / 5) * 5 || 10]}
                      allowDecimals={false}
                      tickFormatter={(value: number) => Math.round(value).toString()}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="hours" name={t('statistics.hours')} fill="#279CF1" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </Col>
            <Col xs={24} lg={8}>
              <Card title={t('statistics.workplaceDistribution')} loading={loading}>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={workplaceDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, value, percent }) =>
                        `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
                      }
                      outerRadius={80}
                      dataKey="value"
                    >
                      {workplaceDistribution.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </Card>
            </Col>
          </Row>

          <Card title={t('statistics.employeeSummary')} loading={loading}>
            <Table
              columns={summaryColumns}
              dataSource={summary?.employees || []}
              rowKey="user_id"
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </>
      ) : (
        // Individual employee view
        stats && (
          <>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={24} sm={12} lg={6}>
                <Card className="stats-card" loading={loading}>
                  <Statistic
                    title={t('statistics.totalHours')}
                    value={formatHours(stats.total_hours)}
                    prefix={<ClockCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="stats-card" loading={loading}>
                  <Statistic
                    title={t('statistics.workingDays')}
                    value={stats.days_with_entries}
                    suffix={`/ ${stats.working_days}`}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="stats-card" loading={loading}>
                  <Statistic
                    title={t('statistics.officeTime')}
                    value={stats.office_days}
                    prefix={<HomeOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Card className="stats-card" loading={loading}>
                  <Statistic
                    title={t('statistics.remoteTime')}
                    value={stats.remote_days}
                    prefix={<LaptopOutlined />}
                  />
                </Card>
              </Col>
            </Row>

            <Card title={t('statistics.dailyHours')} loading={loading}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={stats.daily_stats
                    .filter((d) => d.is_working_day || d.total_minutes > 0)
                    .map((d) => ({
                      date: dayjs(d.date).format('DD/MM'),
                      office: d.office_minutes / 60,
                      remote: d.remote_minutes / 60,
                    }))}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis
                    domain={[0, (dataMax: number) => Math.ceil(Math.max(dataMax, 8) / 4) * 4]}
                    allowDecimals={false}
                    tickFormatter={(value: number) => Math.round(value).toString()}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="office" name={t('statistics.office')} fill="#279CF1" stackId="a" />
                  <Bar dataKey="remote" name={t('statistics.remote')} fill="#52c41a" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </>
        )
      )}
    </div>
  );
};

export default AdminStatsPage;
