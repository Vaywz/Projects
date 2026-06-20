import React, { useEffect, useState, useMemo } from 'react';
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
  Button,
  Input,
} from 'antd';
import {
  ClockCircleOutlined,
  HomeOutlined,
  LaptopOutlined,
  TeamOutlined,
  FieldTimeOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
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
import { useResponsive } from '../../hooks/useResponsive';
import PageSizeSelector from '../../components/PageSizeSelector';
import api from '../../services/api';
import { User, Stats, PeriodType } from '../../types';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const COLORS = ['#279CF1', '#52c41a', '#ff7043', '#436597', '#00bcd4', '#ff9800'];

const calculateWorkingDays = (start: dayjs.Dayjs, end: dayjs.Dayjs) => {
  let count = 0;
  let current = start.startOf('day');
  const endDay = end.startOf('day');
  while (current.isBefore(endDay) || current.isSame(endDay, 'day')) {
    const dow = current.day();
    if (dow !== 0 && dow !== 6) count++;
    current = current.add(1, 'day');
  }
  return count;
};

const AdminStatsPage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { isMobile } = useResponsive();
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [period, setPeriod] = useState<PeriodType>('month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [selectedDate, setSelectedDate] = useState<dayjs.Dayjs>(dayjs());
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [pageSize, setPageSize] = useState(10);
  const [progressSearch, setProgressSearch] = useState('');
  const [debouncedProgressSearch, setDebouncedProgressSearch] = useState('');
  const [progressPageSize, setProgressPageSize] = useState(10);
  const [progressPage, setProgressPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedProgressSearch(progressSearch), 300);
    return () => clearTimeout(timer);
  }, [progressSearch]);

  // Reset progress page when search changes
  useEffect(() => {
    setProgressPage(1);
  }, [debouncedProgressSearch]);

  const getDateParams = () => {
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
    return params;
  };

  // Norm hours calculation
  const normHours = useMemo(() => {
    const monthStart = selectedDate.startOf('month');
    const monthEnd = selectedDate.endOf('month');
    const yearStart = selectedDate.startOf('year');
    const yearEnd = selectedDate.endOf('year');

    const monthDays = calculateWorkingDays(monthStart, monthEnd);
    const yearDays = calculateWorkingDays(yearStart, yearEnd);

    return {
      week: 40,
      month: monthDays * 8,
      monthDays,
      year: yearDays * 8,
      yearDays,
    };
  }, [selectedDate]);

  // Current norm for progress bars
  const currentNorm = useMemo(() => {
    if (period === 'week') return 40;
    if (period === 'year') return normHours.year;
    if (period === 'custom' && dateRange) {
      return calculateWorkingDays(dateRange[0], dateRange[1]) * 8;
    }
    return normHours.month;
  }, [period, normHours, dateRange]);

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
      const data = await api.getAllEmployeesStats(getDateParams());
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
      const params = { user_id: employeeId, ...getDateParams() };
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
    if (period === 'custom' && !dateRange) {
      return;
    }
    if (selectedEmployee) {
      fetchEmployeeStats(selectedEmployee);
    } else {
      fetchSummary();
      setStats(null);
    }
  }, [selectedEmployee, period, dateRange, selectedDate]);

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

  // Get max hours value for export
  const getMaxHoursValue = () => {
    if (period === 'week') return 40;
    if (period === 'year') return normHours.year;
    if (period === 'custom' && dateRange) {
      return calculateWorkingDays(dateRange[0], dateRange[1]) * 8;
    }
    return normHours.month;
  };

  // Prepare export data rows
  const getExportData = () => {
    const maxHours = getMaxHoursValue();
    const emps = summary?.employees || [];
    const filtered = selectedRowKeys.length > 0
      ? emps.filter((emp: any) => selectedRowKeys.includes(emp.user_id))
      : emps;
    return filtered.map((emp: any) => ({
      [t('statistics.employee')]: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.email,
      [t('statistics.totalHours')]: formatHours(emp.total_hours || 0),
      [t('statistics.maxHours')]: formatHours(maxHours),
      [t('statistics.daysWorked')]: emp.days_with_entries || 0,
      [t('statistics.office')]: emp.office_days || 0,
      [t('statistics.remote')]: emp.remote_days || 0,
      [t('statistics.sick')]: emp.sick_days || 0,
      [t('statistics.vacation')]: emp.vacation_days || 0,
    }));
  };

  const autoFitColumns = (ws: XLSX.WorkSheet, data: Record<string, any>[]) => {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    ws['!cols'] = headers.map((header, idx) => {
      const maxDataLen = Math.max(
        ...data.map((row) => String(row[header] ?? '').length)
      );
      const headerLen = header.length + 4;
      const minWidth = idx === 0 ? 20 : 14;
      return { wch: Math.max(headerLen, maxDataLen + 2, minWidth) };
    });
  };

  const handleExportExcel = () => {
    const data = getExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    autoFitColumns(ws, data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('statistics.employeeSummary'));
    XLSX.writeFile(wb, `employee_stats_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const handleExportCSV = () => {
    const data = getExportData();
    if (data.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employee_stats_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
      title: t('statistics.maxHours'),
      key: 'max_hours',
      render: () => {
        if (period === 'week') return `40${t('common.hoursShort')}`;
        if (period === 'year') return `${normHours.year}${t('common.hoursShort')}`;
        if (period === 'custom' && dateRange) {
          const days = calculateWorkingDays(dateRange[0], dateRange[1]);
          return `${days * 8}${t('common.hoursShort')}`;
        }
        return `${normHours.month}${t('common.hoursShort')}`;
      },
    },
    {
      title: t('statistics.daysWorked'),
      key: 'days',
      dataIndex: 'days_with_entries',
      render: (days: number) => days || 0,
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
    user_id: emp.user_id,
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

  // Traffic light progress bars data
  const maxWorkedAmongAll = summary?.employees?.reduce(
    (max: number, e: any) => Math.max(max, e.total_hours || 0),
    0
  ) || 0;
  const barScale = Math.max(currentNorm, maxWorkedAmongAll) || 1;

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
              style={{ width: isMobile ? '100%' : 200 }}
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              showSearch
              filterOption={(input, option) =>
                (option?.children?.toString() || '').toLowerCase().includes(input.toLowerCase())
              }
            >
              <Select.Option value={null}>{t('statistics.allEmployees')}</Select.Option>
              {employees.map((emp) => (
                <Select.Option key={emp.id} value={emp.id}>
                  {emp.profile
                    ? `${emp.profile.first_name} ${emp.profile.last_name}`
                    : emp.email}
                </Select.Option>
              ))}
            </Select>
            <Select value={period} onChange={setPeriod} style={{ width: isMobile ? '100%' : 120 }}>
              <Select.Option value="week">{t('statistics.week')}</Select.Option>
              <Select.Option value="month">{t('statistics.month')}</Select.Option>
              <Select.Option value="year">{t('statistics.year')}</Select.Option>
              <Select.Option value="custom">{t('statistics.custom')}</Select.Option>
            </Select>
            {period === 'month' && (
              <>
                <Select
                  value={selectedDate.month()}
                  onChange={(month: number) => setSelectedDate(selectedDate.month(month))}
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
                  onChange={(year: number) => setSelectedDate(selectedDate.year(year))}
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
                onChange={(year: number) => setSelectedDate(selectedDate.year(year))}
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
                onChange={(dates: any) =>
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
          {/* Admin overview cards */}
          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={12} sm={8} lg={5}>
              <Card className="stats-card" loading={loading} size="small">
                <Statistic
                  title={t('statistics.totalEmployees')}
                  value={employees.length}
                  prefix={<TeamOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} lg={5}>
              <Card className="stats-card" loading={loading} size="small">
                <Statistic
                  title={t('statistics.totalHours')}
                  value={formatHours(totalHours)}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} lg={5}>
              <Card className="stats-card" loading={loading} size="small">
                <Statistic
                  title={t('statistics.avgHoursPerEmployee')}
                  value={formatHours(avgHours)}
                  prefix={<ClockCircleOutlined />}
                />
              </Card>
            </Col>
            <Col xs={12} sm={8} lg={5}>
              <Card className="stats-card" loading={loading} size="small">
                <Statistic
                  title={t('statistics.officeVsRemote')}
                  value={`${workplaceDistribution[0].value}`}
                  suffix={`/ ${workplaceDistribution[1].value}`}
                  prefix={<HomeOutlined />}
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

          <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
            <Col xs={24} lg={16}>
              <Card title={t('statistics.hoursByEmployee')} loading={loading}>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={employeeChartData} onClick={(data: any) => {
                    if (data?.activePayload?.[0]?.payload?.user_id) {
                      setSelectedEmployee(data.activePayload[0].payload.user_id);
                    }
                  }} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis
                      domain={[0, (dataMax: number) => Math.ceil(dataMax / 5) * 5 || 10]}
                      allowDecimals={false}
                      tickFormatter={(value: number) => Math.round(value).toString()}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="hours" name={t('statistics.hours')} fill="#279CF1" style={{ cursor: 'pointer' }} />
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
                        data={workplaceDistribution}
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
                </div>
              </Card>
            </Col>
          </Row>

          {/* Traffic light progress bars */}
          <Card
            title={t('statistics.employeeProgress')}
            loading={loading}
            style={{ marginBottom: 24 }}
            extra={
              <Input
                placeholder={t('common.search')}
                prefix={<SearchOutlined />}
                value={progressSearch}
                onChange={(e) => setProgressSearch(e.target.value)}
                allowClear
                style={{ width: 200 }}
              />
            }
          >
            {(() => {
              const filtered = (summary?.employees || []).filter((emp: any) => {
                if (!debouncedProgressSearch) return true;
                const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
                return name.includes(debouncedProgressSearch.toLowerCase());
              });
              const totalItems = filtered.length;
              const paged = filtered.slice((progressPage - 1) * progressPageSize, progressPage * progressPageSize);
              const totalPages = Math.ceil(totalItems / progressPageSize);

              return (
                <>
                  {paged.map((emp: any) => {
                    const worked = emp.total_hours || 0;
                    const overtime = Math.max(0, worked - currentNorm);
                    const greenWidth = barScale > 0 ? (Math.min(worked, currentNorm) / barScale) * 100 : 0;
                    const yellowWidth = worked < currentNorm && barScale > 0 ? ((currentNorm - worked) / barScale) * 100 : 0;
                    const redWidth = overtime > 0 && barScale > 0 ? (overtime / barScale) * 100 : 0;
                    const empName = `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || emp.email;

                    return (
                      <div key={emp.user_id} style={{ marginBottom: 16, cursor: 'pointer' }} onClick={() => setSelectedEmployee(emp.user_id)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text strong style={{ cursor: 'pointer' }}>{empName}</Text>
                          <Space size={4}>
                            <Text type="secondary">
                              {formatHours(worked)} / {formatHours(currentNorm)}
                            </Text>
                            {overtime > 0 && (
                              <Text type="danger" strong>
                                +{formatHours(overtime)}
                              </Text>
                            )}
                          </Space>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <div style={{ display: 'flex', height: 20, borderRadius: 4, overflow: 'hidden', background: token.colorBgContainerDisabled }}>
                            {greenWidth > 0 && (
                              <div style={{ width: `${greenWidth}%`, background: '#52c41a', transition: 'width 0.3s' }} />
                            )}
                            {yellowWidth > 0 && (
                              <div style={{ width: `${yellowWidth}%`, background: '#faad14', transition: 'width 0.3s' }} />
                            )}
                            {redWidth > 0 && (
                              <div style={{ width: `${redWidth}%`, background: '#ff4d4f', transition: 'width 0.3s' }} />
                            )}
                          </div>
                          {/* Norm marker line */}
                          {currentNorm > 0 && barScale > 0 && (
                            <div style={{
                              position: 'absolute',
                              left: `${(currentNorm / barScale) * 100}%`,
                              top: -2,
                              bottom: -2,
                              width: 2,
                              background: token.colorTextSecondary,
                              opacity: 0.6,
                            }} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                    <Space size={8}>
                      <Button
                        size="small"
                        disabled={progressPage <= 1}
                        onClick={() => setProgressPage(p => p - 1)}
                      >
                        ←
                      </Button>
                      <Text type="secondary">{progressPage} / {totalPages || 1}</Text>
                      <Button
                        size="small"
                        disabled={progressPage >= totalPages}
                        onClick={() => setProgressPage(p => p + 1)}
                      >
                        →
                      </Button>
                    </Space>
                    <PageSizeSelector
                      value={progressPageSize}
                      total={totalItems}
                      onChange={(size) => { setProgressPageSize(size); setProgressPage(1); }}
                    />
                  </div>
                </>
              );
            })()}
          </Card>

          {/* Employee summary table */}
          <Card
            title={t('statistics.employeeSummary')}
            loading={loading}
            extra={
              <Space>
                <Input
                  placeholder={t('common.search')}
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  allowClear
                  style={{ width: 200 }}
                />
                <Button icon={<FileExcelOutlined />} onClick={handleExportExcel}>
                  Excel{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportCSV}>
                  CSV{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
                </Button>
              </Space>
            }
          >
            <Table
              columns={summaryColumns}
              dataSource={(summary?.employees || []).filter((emp: any) => {
                if (!debouncedSearch) return true;
                const name = `${emp.first_name || ''} ${emp.last_name || ''}`.toLowerCase();
                return name.includes(debouncedSearch.toLowerCase());
              })}
              rowKey="user_id"
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              pagination={{ pageSize, showSizeChanger: false }}
              scroll={{ x: 'max-content' }}
              footer={() => (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <PageSizeSelector
                    value={pageSize}
                    total={(summary?.employees || []).length}
                    onChange={setPageSize}
                  />
                </div>
              )}
            />
          </Card>
        </>
      ) : (
        // Individual employee view
        stats && (
          <>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => setSelectedEmployee(null)}
              style={{ marginBottom: 16 }}
            >
              {t('statistics.allEmployees')}
            </Button>
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
              <Col xs={12} sm={8} lg={5}>
                <Card className="stats-card" loading={loading} size="small">
                  <Statistic
                    title={t('statistics.totalHours')}
                    value={formatHours(stats.total_hours)}
                    prefix={<ClockCircleOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={5}>
                <Card className="stats-card" loading={loading} size="small">
                  <Statistic
                    title={t('statistics.daysWorked')}
                    value={stats.days_with_entries}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={5}>
                <Card className="stats-card" loading={loading} size="small">
                  <Statistic
                    title={t('statistics.officeTime')}
                    value={stats.office_days}
                    prefix={<HomeOutlined />}
                  />
                </Card>
              </Col>
              <Col xs={12} sm={8} lg={5}>
                <Card className="stats-card" loading={loading} size="small">
                  <Statistic
                    title={t('statistics.remoteTime')}
                    value={stats.remote_days}
                    prefix={<LaptopOutlined />}
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

            <Card title={t('statistics.dailyHours')} loading={loading}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={stats.daily_stats
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
