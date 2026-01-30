import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Row,
  Col,
  Card,
  Avatar,
  Typography,
  Button,
  Space,
  Tag,
  message,
  Input,
  Statistic,
  DatePicker,
  theme,
} from 'antd';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  BankOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  HomeOutlined,
  LaptopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs, { Dayjs } from 'dayjs';
import api from '../../services/api';
import { User } from '../../types';

const { Title, Text } = Typography;
const { Search } = Input;

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [employees, setEmployees] = useState<User[]>([]);
  const [filteredEmployees, setFilteredEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());

  const fetchData = async (month: Dayjs) => {
    setLoading(true);
    try {
      const startOfMonth = month.startOf('month').format('YYYY-MM-DD');
      const endOfMonth = month.endOf('month').format('YYYY-MM-DD');

      const [employeesData, summaryData] = await Promise.all([
        api.getEmployees(true),
        api.getAllEmployeesStats({
          period: 'custom',
          date_from: startOfMonth,
          date_to: endOfMonth,
        }),
      ]);
      setEmployees(employeesData);
      setFilteredEmployees(employeesData);
      setSummary(summaryData);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(selectedMonth);
  }, [selectedMonth]);

  const handleMonthChange = (date: Dayjs | null) => {
    if (date) {
      setSelectedMonth(date);
    }
  };

  const handleSearch = (value: string) => {
    const search = value.toLowerCase();
    const filtered = employees.filter(
      (emp) =>
        emp.email.toLowerCase().includes(search) ||
        emp.profile?.first_name.toLowerCase().includes(search) ||
        emp.profile?.last_name.toLowerCase().includes(search)
    );
    setFilteredEmployees(filtered);
  };

  const totalHours = summary?.employees?.reduce(
    (sum: number, e: any) => sum + (e.total_hours || 0),
    0
  ) || 0;

  const totalOfficeDays = summary?.employees?.reduce(
    (sum: number, e: any) => sum + (e.office_days || 0),
    0
  ) || 0;

  const totalRemoteDays = summary?.employees?.reduce(
    (sum: number, e: any) => sum + (e.remote_days || 0),
    0
  ) || 0;

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            {t('admin.dashboard.title')}
          </Title>
        </Col>
        <Col>
          <Space>
            <DatePicker
              picker="month"
              value={selectedMonth}
              onChange={handleMonthChange}
              allowClear={false}
            />
            <Search
              placeholder={t('admin.dashboard.searchPlaceholder')}
              onSearch={handleSearch}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ width: 250 }}
            />
            <Button type="primary" onClick={() => navigate('/admin/employees')}>
              {t('admin.dashboard.manageEmployees')}
            </Button>
          </Space>
        </Col>
      </Row>

      {/* Summary Stats */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('admin.dashboard.totalEmployees')}
              value={employees.length}
              prefix={<TeamOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('admin.dashboard.totalHours')}
              value={formatHours(totalHours)}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('admin.dashboard.officeDays')}
              value={totalOfficeDays}
              prefix={<HomeOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card className="stats-card" loading={loading}>
            <Statistic
              title={t('admin.dashboard.remoteDays')}
              value={totalRemoteDays}
              prefix={<LaptopOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* Employee Cards */}
      <Title level={4}>{t('admin.employees.title')}</Title>
      <Row gutter={[16, 16]}>
        {filteredEmployees.map((employee) => {
          const empSummary = summary?.employees?.find(
            (e: any) => e.user_id === employee.id
          );

          return (
            <Col xs={24} sm={12} lg={8} xl={6} key={employee.id}>
              <Card
                className="employee-card"
                loading={loading}
                hoverable
                onClick={() => navigate(`/admin/employees`)}
              >
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Avatar
                    size={80}
                    src={employee.profile?.avatar_url}
                    icon={!employee.profile?.avatar_url && <UserOutlined />}
                  />
                </div>
                <div style={{ textAlign: 'center' }}>
                  <Title level={5} style={{ margin: 0 }}>
                    {employee.profile
                      ? `${employee.profile.first_name} ${employee.profile.last_name}`
                      : employee.email}
                  </Title>
                  {employee.profile?.position && (
                    <Text type="secondary" style={{ display: 'block' }}>
                      {employee.profile.position}
                    </Text>
                  )}
                  <Tag
                    color={employee.is_active ? 'green' : 'red'}
                    style={{ marginTop: 8 }}
                  >
                    {employee.is_active ? t('admin.dashboard.active') : t('admin.dashboard.inactive')}
                  </Tag>
                </div>

                <div style={{ marginTop: 16 }}>
                  <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <div>
                      <MailOutlined style={{ marginRight: 8, color: '#999' }} />
                      <Text style={{ fontSize: 12 }}>{employee.email}</Text>
                    </div>
                    {employee.profile?.phone && (
                      <div>
                        <PhoneOutlined style={{ marginRight: 8, color: '#999' }} />
                        <Text style={{ fontSize: 12 }}>{employee.profile.phone}</Text>
                      </div>
                    )}
                    {employee.profile?.bank_account && (
                      <div>
                        <BankOutlined style={{ marginRight: 8, color: '#999' }} />
                        <Text style={{ fontSize: 12 }}>{employee.profile.bank_account}</Text>
                      </div>
                    )}
                  </Space>
                </div>

                {empSummary && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 12,
                      background: token.colorFillSecondary,
                      borderRadius: 4,
                    }}
                  >
                    <Row gutter={8}>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {t('timeEntry.hours')}
                        </Text>
                        <div>
                          <Text strong>{formatHours(empSummary.total_hours || 0)}</Text>
                        </div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {t('statistics.workDays')}
                        </Text>
                        <div>
                          <Text strong>
                            {empSummary.days_with_entries || 0} / {empSummary.working_days || 0}
                          </Text>
                        </div>
                      </Col>
                    </Row>
                  </div>
                )}
              </Card>
            </Col>
          );
        })}
      </Row>
    </div>
  );
};

export default AdminDashboard;
