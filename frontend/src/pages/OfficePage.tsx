import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Row,
  Col,
  Avatar,
  Typography,
  DatePicker,
  Tabs,
  Empty,
  message,
  Tag,
  Space,
  Tooltip,
  Button,
  Segmented,
  Table,
  theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { UserOutlined, HomeOutlined, CalendarOutlined, LaptopOutlined, EditOutlined, DeleteOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import api from '../services/api';
import { EmployeeWithStatus, EmployeeStatus } from '../types';
import DynamicIcon from '../components/DynamicIcon';
import { useSettingsStore } from '../store/settingsStore';

dayjs.extend(isoWeek);

interface WorkplacePlan {
  id: number;
  date: string;
  workplace: 'office' | 'remote';
}

const { Title, Text } = Typography;

// Status colors for borders
const STATUS_COLORS: Record<EmployeeStatus, string> = {
  office: '#52c41a',     // green
  remote: '#722ed1',     // purple
  sick: '#faad14',       // yellow
  vacation: '#1890ff',   // blue
  excused: '#eb2f96',    // pink
  no_plan: '#d9d9d9',    // gray
};

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  office: 'office.workFromOffice',
  remote: 'office.workFromHome',
  sick: 'calendar.sickDay',
  vacation: 'calendar.vacation',
  excused: 'calendar.excusedAbsence',
  no_plan: 'office.noOneScheduled',
};

interface EmployeeRowData {
  key: number;
  user_id: number;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  position?: string;
  [date: string]: any;
}

const OfficePage: React.FC = () => {
  const { t } = useTranslation();
  const { token } = theme.useToken();
  const { settings, fetchSettings } = useSettingsStore();
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [loading, setLoading] = useState(true);
  const [myPlans, setMyPlans] = useState<WorkplacePlan[]>([]);
  const [planLoading, setPlanLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeRowData[]>([]);

  // Get icon for status from settings
  const getStatusIcon = (status: EmployeeStatus, size: number = 16) => {
    const iconMap: Record<EmployeeStatus, string> = {
      office: settings.icon_office,
      remote: settings.icon_remote,
      sick: settings.icon_sick,
      vacation: settings.icon_vacation,
      excused: settings.icon_excused,
      no_plan: 'CircleOff',
    };
    return <DynamicIcon name={iconMap[status]} size={size} />;
  };

  const fetchMonthData = async (month: dayjs.Dayjs) => {
    setLoading(true);
    try {
      const daysInMonth = month.daysInMonth();

      // Fetch all employees status for each day of the month
      const statusData: Record<string, EmployeeWithStatus[]> = {};
      const datePromises: Promise<void>[] = [];

      for (let day = 1; day <= daysInMonth; day++) {
        const date = month.date(day);
        const dateStr = date.format('YYYY-MM-DD');
        datePromises.push(
          api.getAllEmployeesStatus(dateStr).then((response) => {
            statusData[dateStr] = response.employees;
          })
        );
      }

      await Promise.all(datePromises);

      // Build employee rows from the data
      const employeeMap = new Map<number, EmployeeRowData>();

      Object.entries(statusData).forEach(([date, emps]) => {
        emps.forEach((emp) => {
          if (!employeeMap.has(emp.user_id)) {
            employeeMap.set(emp.user_id, {
              key: emp.user_id,
              user_id: emp.user_id,
              first_name: emp.first_name,
              last_name: emp.last_name,
              avatar_url: emp.avatar_url,
              position: emp.position,
            });
          }
          const row = employeeMap.get(emp.user_id)!;
          row[date] = emp;
        });
      });

      setEmployees(Array.from(employeeMap.values()).sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
      ));
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMyPlans = async () => {
    setPlanLoading(true);
    try {
      const today = dayjs();
      const dateFrom = today.format('YYYY-MM-DD');
      const dateTo = today.add(14, 'day').format('YYYY-MM-DD');
      const plans = await api.getWorkplacePlans(dateFrom, dateTo);
      setMyPlans(plans);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setPlanLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    fetchMonthData(currentMonth);
    fetchMyPlans();
  }, [currentMonth]);

  const handlePlanChange = async (date: dayjs.Dayjs, workplace: 'office' | 'remote' | null) => {
    try {
      const dateStr = date.format('YYYY-MM-DD');
      if (workplace === null) {
        await api.deleteWorkplacePlan(dateStr);
      } else {
        await api.createWorkplacePlan({ date: dateStr, workplace });
      }
      message.success(t('office.planSuccess'));
      fetchMyPlans();
      fetchMonthData(currentMonth);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const getPlanForDate = (date: dayjs.Dayjs): 'office' | 'remote' | null => {
    const dateStr = date.format('YYYY-MM-DD');
    const plan = myPlans.find(p => p.date === dateStr);
    return plan?.workplace || null;
  };

  const handleMonthChange = (offset: number) => {
    setCurrentMonth(currentMonth.add(offset, 'month'));
  };

  const getNext14Days = () => {
    const days: dayjs.Dayjs[] = [];
    const today = dayjs();
    for (let i = 0; i < 14; i++) {
      days.push(today.add(i, 'day'));
    }
    return days;
  };

  // Generate columns for each day of the month
  const generateDayColumns = (): ColumnsType<EmployeeRowData> => {
    const daysInMonth = currentMonth.daysInMonth();
    const columns: ColumnsType<EmployeeRowData> = [
      {
        title: t('statistics.employee'),
        key: 'employee',
        fixed: 'left',
        width: 180,
        render: (_, record) => (
          <Space>
            <Avatar
              size={32}
              src={record.avatar_url}
              icon={!record.avatar_url && <UserOutlined />}
            />
            <div>
              <Text strong style={{ display: 'block', fontSize: 13 }}>
                {record.first_name} {record.last_name}
              </Text>
              {record.position && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {record.position}
                </Text>
              )}
            </div>
          </Space>
        ),
      },
    ];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = currentMonth.date(day);
      const dateStr = date.format('YYYY-MM-DD');
      const isWeekend = date.day() === 0 || date.day() === 6;
      const isToday = date.isSame(dayjs(), 'day');

      columns.push({
        title: (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: isWeekend ? '#999' : undefined }}>
              {date.format('ddd')}
            </div>
            <div style={{
              fontWeight: isToday ? 'bold' : 'normal',
              color: isToday ? '#1890ff' : isWeekend ? '#999' : undefined,
            }}>
              {day}
            </div>
          </div>
        ),
        key: dateStr,
        width: 50,
        align: 'center',
        className: isWeekend ? 'weekend-column' : '',
        render: (_, record) => {
          const empData = record[dateStr] as EmployeeWithStatus | undefined;
          if (!empData) {
            return <Text type="secondary">-</Text>;
          }

          const statuses = empData.statuses || [empData.status as EmployeeStatus];
          if (statuses.length === 0 || (statuses.length === 1 && statuses[0] === 'no_plan')) {
            return <Text type="secondary">-</Text>;
          }

          const tooltipText = statuses.map(s => t(STATUS_LABELS[s])).join(' / ');

          return (
            <Tooltip title={tooltipText}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
                {statuses.map((status, idx) => (
                  <span
                    key={idx}
                    style={{
                      color: STATUS_COLORS[status],
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {getStatusIcon(status, 14)}
                  </span>
                ))}
              </div>
            </Tooltip>
          );
        },
      });
    }

    return columns;
  };

  const tabItems = [
    {
      key: 'calendar',
      label: (
        <span>
          <CalendarOutlined /> {t('office.thisWeek')}
        </span>
      ),
      children: (
        <Card loading={loading}>
          {/* Month navigation */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Button icon={<LeftOutlined />} onClick={() => handleMonthChange(-1)} />
              <DatePicker
                picker="month"
                value={currentMonth}
                onChange={(date) => date && setCurrentMonth(date)}
                allowClear={false}
                format="MMMM YYYY"
              />
              <Button icon={<RightOutlined />} onClick={() => handleMonthChange(1)} />
              <Button onClick={() => setCurrentMonth(dayjs())}>{t('calendar.today')}</Button>
            </Space>
            <Space wrap>
              <Tag color="green"><DynamicIcon name={settings.icon_office} size={14} style={{ marginRight: 4 }} />{t('office.workFromOffice')}</Tag>
              <Tag color="purple"><DynamicIcon name={settings.icon_remote} size={14} style={{ marginRight: 4 }} />{t('office.workFromHome')}</Tag>
              <Tag color="gold"><DynamicIcon name={settings.icon_sick} size={14} style={{ marginRight: 4 }} />{t('calendar.sickDay')}</Tag>
              <Tag color="blue"><DynamicIcon name={settings.icon_vacation} size={14} style={{ marginRight: 4 }} />{t('calendar.vacation')}</Tag>
              <Tag color="magenta"><DynamicIcon name={settings.icon_excused} size={14} style={{ marginRight: 4 }} />{t('calendar.excusedAbsence')}</Tag>
            </Space>
          </div>

          {/* Employee status table */}
          {employees.length > 0 ? (
            <Table
              columns={generateDayColumns()}
              dataSource={employees}
              pagination={false}
              scroll={{ x: 'max-content' }}
              size="small"
              bordered
              rowClassName={(record, index) => index % 2 === 0 ? 'even-row' : 'odd-row'}
            />
          ) : (
            <Empty description={t('common.noData')} />
          )}
        </Card>
      ),
    },
    {
      key: 'mySchedule',
      label: (
        <span>
          <EditOutlined /> {t('office.mySchedule')}
        </span>
      ),
      children: (
        <Card loading={planLoading}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('office.selectDays')}
          </Text>
          <Row gutter={[16, 16]}>
            {getNext14Days().map((date) => {
              const currentPlan = getPlanForDate(date);
              const isWeekend = date.day() === 0 || date.day() === 6;
              return (
                <Col xs={24} sm={12} md={8} lg={6} key={date.format('YYYY-MM-DD')}>
                  <Card
                    size="small"
                    style={{
                      backgroundColor: isWeekend ? '#fafafa' : undefined,
                    }}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <div>
                        <Text strong>{date.format('dddd')}</Text>
                        <br />
                        <Text type="secondary">{date.format('D MMMM')}</Text>
                      </div>
                      <Segmented
                        block
                        value={currentPlan || ''}
                        onChange={(value) => {
                          if (value === currentPlan) {
                            handlePlanChange(date, null);
                          } else {
                            handlePlanChange(date, value as 'office' | 'remote');
                          }
                        }}
                        options={[
                          {
                            label: (
                              <Space>
                                <HomeOutlined />
                                <span>{t('office.workFromOffice')}</span>
                              </Space>
                            ),
                            value: 'office',
                          },
                          {
                            label: (
                              <Space>
                                <LaptopOutlined />
                                <span>{t('office.workFromHome')}</span>
                              </Space>
                            ),
                            value: 'remote',
                          },
                        ]}
                      />
                      {currentPlan && (
                        <Button
                          type="link"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => handlePlanChange(date, null)}
                          style={{ padding: 0 }}
                        >
                          {t('common.delete')}
                        </Button>
                      )}
                    </Space>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </Card>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            <HomeOutlined /> {t('office.title')}
          </Title>
          <Text type="secondary">
            {t('office.subtitle')}
          </Text>
        </Col>
      </Row>

      <Tabs items={tabItems} defaultActiveKey="calendar" />

      <style>{`
        .weekend-column {
          background-color: ${token.colorFillQuaternary} !important;
        }
        .even-row {
          background-color: ${token.colorFillQuaternary};
        }
        .odd-row {
          background-color: ${token.colorBgContainer};
        }
        .ant-table-cell {
          padding: 8px 4px !important;
        }
      `}</style>
    </div>
  );
};

export default OfficePage;