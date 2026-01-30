import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tag,
  Avatar,
  Typography,
  Popconfirm,
  Upload,
  Row,
  Col,
  Card,
  DatePicker,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../../services/api';
import { User, Department } from '../../types';

const { Title } = Typography;

const EmployeesPage: React.FC = () => {
  const { t } = useTranslation();
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [excusedModalVisible, setExcusedModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [form] = Form.useForm();
  const [excusedForm] = Form.useForm();

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const data = await api.getEmployees(true);
      setEmployees(data);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await api.getDepartments();
      setDepartments(data);
    } catch (error) {
      console.error('Failed to load departments:', error);
    }
  };

  const handleAddDepartment = async () => {
    if (!newDepartmentName.trim()) return;
    try {
      const newDept = await api.createDepartment(newDepartmentName.trim());
      setDepartments([...departments, newDept]);
      setNewDepartmentName('');
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  useEffect(() => {
    fetchEmployees();
    fetchDepartments();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      const payload = {
        ...values,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : null,
        name_day: values.name_day ? values.name_day.format('YYYY-MM-DD') : null,
        employment_start_date: values.employment_start_date ? values.employment_start_date.format('YYYY-MM-DD') : null,
      };
      await api.createEmployee(payload);
      message.success(t('admin.employees.addSuccess'));
      setModalVisible(false);
      form.resetFields();
      fetchEmployees();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleUpdate = async (values: any) => {
    if (!editingEmployee) return;

    try {
      await api.updateEmployeeProfile(editingEmployee.id, {
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone,
        bank_account: values.bank_account,
        position: values.position,
        department: values.department,
        work_email: values.work_email,
        employment_type: values.employment_type,
        payment_type: values.payment_type,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : null,
        name_day: values.name_day ? values.name_day.format('YYYY-MM-DD') : null,
        contract_number: values.contract_number,
        employment_start_date: values.employment_start_date ? values.employment_start_date.format('YYYY-MM-DD') : null,
        emergency_contact_name: values.emergency_contact_name,
        emergency_contact_phone: values.emergency_contact_phone,
        declared_address: values.declared_address,
      });

      // Update email or role if changed
      const userUpdates: any = {};
      if (values.email && values.email !== editingEmployee.email) {
        userUpdates.email = values.email;
      }
      if (values.role && values.role !== editingEmployee.role) {
        userUpdates.role = values.role;
      }
      if (Object.keys(userUpdates).length > 0) {
        await api.updateEmployee(editingEmployee.id, userUpdates);
      }

      message.success(t('admin.employees.updateSuccess'));
      setModalVisible(false);
      setEditingEmployee(null);
      form.resetFields();
      fetchEmployees();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteEmployee(id);
      message.success(t('admin.employees.deleteSuccess'));
      fetchEmployees();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleAvatarUpload = async (userId: number, file: File) => {
    try {
      await api.uploadAvatar(userId, file);
      message.success(t('profile.updateSuccess'));
      fetchEmployees();
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleExcusedAbsence = async (values: any) => {
    if (!selectedEmployee) return;

    try {
      await api.createEmployeeDayStatus(selectedEmployee.id, {
        date: values.date.format('YYYY-MM-DD'),
        status: 'excused',
        note: values.note,
      });
      message.success(t('calendar.excusedAbsence') + ' - OK');
      setExcusedModalVisible(false);
      excusedForm.resetFields();
      setSelectedEmployee(null);
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const openEditModal = (employee: User) => {
    setEditingEmployee(employee);
    form.setFieldsValue({
      first_name: employee.profile?.first_name,
      last_name: employee.profile?.last_name,
      email: employee.email,
      phone: employee.profile?.phone,
      bank_account: employee.profile?.bank_account,
      position: employee.profile?.position,
      department: employee.profile?.department,
      work_email: employee.profile?.work_email,
      employment_type: employee.profile?.employment_type || 'full_time',
      payment_type: employee.profile?.payment_type || 'salary',
      birthday: employee.profile?.birthday ? dayjs(employee.profile.birthday) : null,
      name_day: employee.profile?.name_day ? dayjs(employee.profile.name_day) : null,
      contract_number: employee.profile?.contract_number,
      employment_start_date: employee.profile?.employment_start_date ? dayjs(employee.profile.employment_start_date) : null,
      emergency_contact_name: employee.profile?.emergency_contact_name,
      emergency_contact_phone: employee.profile?.emergency_contact_phone,
      declared_address: employee.profile?.declared_address,
      role: employee.role,
    });
    setModalVisible(true);
  };

  const openCreateModal = () => {
    setEditingEmployee(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openExcusedModal = (employee: User) => {
    setSelectedEmployee(employee);
    excusedForm.resetFields();
    excusedForm.setFieldValue('date', dayjs());
    setExcusedModalVisible(true);
  };

  const columns = [
    {
      title: t('profile.avatar'),
      dataIndex: 'profile',
      key: 'avatar',
      width: 80,
      render: (_: any, record: User) => (
        <Upload
          showUploadList={false}
          beforeUpload={(file) => {
            handleAvatarUpload(record.id, file);
            return false;
          }}
          accept="image/*"
        >
          <Avatar
            size={48}
            src={record.profile?.avatar_url}
            icon={!record.profile?.avatar_url && <UserOutlined />}
            style={{ cursor: 'pointer' }}
          />
        </Upload>
      ),
    },
    {
      title: t('admin.employees.firstName') + ' ' + t('admin.employees.lastName'),
      key: 'name',
      render: (_: any, record: User) =>
        record.profile
          ? `${record.profile.first_name} ${record.profile.last_name}`
          : '-',
      sorter: (a: User, b: User) => {
        const nameA = a.profile
          ? `${a.profile.first_name} ${a.profile.last_name}`
          : '';
        const nameB = b.profile
          ? `${b.profile.first_name} ${b.profile.last_name}`
          : '';
        return nameA.localeCompare(nameB);
      },
    },
    {
      title: t('admin.employees.email'),
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: t('admin.employees.phone'),
      dataIndex: ['profile', 'phone'],
      key: 'phone',
      render: (phone: string) => phone || '-',
    },
    {
      title: t('admin.employees.position'),
      dataIndex: ['profile', 'position'],
      key: 'position',
      render: (position: string) => position || '-',
    },
    {
      title: t('profile.bankAccount'),
      dataIndex: ['profile', 'bank_account'],
      key: 'bank_account',
      render: (account: string) => account || '-',
    },
    {
      title: t('admin.employees.role'),
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'purple' : 'blue'}>
          {role === 'admin' ? t('admin.employees.roles.admin') : t('admin.employees.roles.employee')}
        </Tag>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 150,
      render: (_: any, record: User) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
            title={t('common.edit')}
          />
          <Button
            type="link"
            icon={<ExclamationCircleOutlined />}
            onClick={() => openExcusedModal(record)}
            title={t('calendar.excusedAbsence')}
          />
          <Popconfirm
            title={t('admin.employees.deleteConfirm')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger icon={<DeleteOutlined />} title={t('common.delete')} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0 }}>
            {t('admin.employees.title')}
          </Title>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            {t('admin.employees.addEmployee')}
          </Button>
        </Col>
      </Row>

      <Card>
        <Table
          columns={columns}
          dataSource={employees}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingEmployee ? t('admin.employees.editEmployee') : t('admin.employees.addEmployee')}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingEmployee(null);
          form.resetFields();
        }}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingEmployee ? handleUpdate : handleCreate}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="first_name"
                label={t('admin.employees.firstName')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="last_name"
                label={t('admin.employees.lastName')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="email"
            label={t('admin.employees.email')}
            rules={[
              { required: true, message: t('timeEntry.validation.required') },
              { type: 'email', message: t('auth.loginError') },
            ]}
          >
            <Input />
          </Form.Item>

          {!editingEmployee && (
            <Form.Item
              name="password"
              label={t('auth.password')}
              rules={[
                { required: true, message: t('timeEntry.validation.required') },
                { min: 6, message: t('timeEntry.validation.required') },
              ]}
            >
              <Input.Password />
            </Form.Item>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label={t('admin.employees.phone')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="position" label={t('admin.employees.position')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="department" label={t('admin.employees.department')}>
                <Select
                  allowClear
                  showSearch
                  placeholder={t('admin.employees.department')}
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px' }}>
                        <Input
                          placeholder={t('common.add')}
                          value={newDepartmentName}
                          onChange={(e) => setNewDepartmentName(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <Button type="text" icon={<PlusOutlined />} onClick={handleAddDepartment}>
                          {t('common.add')}
                        </Button>
                      </Space>
                    </>
                  )}
                >
                  {departments.map((dept) => (
                    <Select.Option key={dept.id} value={dept.name}>
                      {dept.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="work_email" label={t('admin.employees.workEmail')}>
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bank_account" label={t('profile.bankAccount')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contract_number" label={t('admin.employees.contractNumber')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name="employment_type"
                label={t('admin.employees.employmentType')}
                initialValue="full_time"
              >
                <Select>
                  <Select.Option value="full_time">{t('admin.employees.fullTime')}</Select.Option>
                  <Select.Option value="part_time">{t('admin.employees.partTime')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name="payment_type"
                label={t('admin.employees.paymentType')}
                initialValue="salary"
              >
                <Select>
                  <Select.Option value="salary">{t('admin.employees.salary')}</Select.Option>
                  <Select.Option value="hourly">{t('admin.employees.hourly')}</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="employment_start_date" label={t('admin.employees.employmentStartDate')}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="birthday" label={t('admin.employees.birthday')}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name_day" label={t('admin.employees.nameDay')}>
                <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
              </Form.Item>
            </Col>
          </Row>

          <Divider>{t('admin.employees.emergencyContact')}</Divider>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="emergency_contact_name" label={t('admin.employees.emergencyContactName')}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="emergency_contact_phone" label={t('admin.employees.emergencyContactPhone')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="declared_address" label={t('admin.employees.declaredAddress')}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item
            name="role"
            label={t('admin.employees.role')}
            initialValue="employee"
          >
            <Select>
              <Select.Option value="employee">{t('admin.employees.roles.employee')}</Select.Option>
              <Select.Option value="admin">{t('admin.employees.roles.admin')}</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingEmployee(null);
                  form.resetFields();
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {editingEmployee ? t('common.save') : t('common.add')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Excused Absence Modal */}
      <Modal
        title={t('calendar.excusedAbsence')}
        open={excusedModalVisible}
        onCancel={() => {
          setExcusedModalVisible(false);
          setSelectedEmployee(null);
          excusedForm.resetFields();
        }}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          {selectedEmployee && (
            <span>
              {t('statistics.employee')}: <strong>
                {selectedEmployee.profile
                  ? `${selectedEmployee.profile.first_name} ${selectedEmployee.profile.last_name}`
                  : selectedEmployee.email}
              </strong>
            </span>
          )}
        </div>
        <Form form={excusedForm} onFinish={handleExcusedAbsence} layout="vertical">
          <Form.Item
            name="date"
            label={t('common.date')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label={t('vacation.reason')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setExcusedModalVisible(false);
                setSelectedEmployee(null);
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('common.submit')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeesPage;