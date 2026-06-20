import React, { useCallback, useEffect, useState } from 'react';
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
  Switch,
  Tabs,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  ExclamationCircleOutlined,
  DownloadOutlined,
  SearchOutlined,
  InboxOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';
import { useResponsive } from '../../hooks/useResponsive';
import PageSizeSelector from '../../components/PageSizeSelector';
import api from '../../services/api';
import { User, Department } from '../../types';

const { Title } = Typography;

const EmployeesPage: React.FC = () => {
  const { t } = useTranslation();
  const { isMobile, modalWidth } = useResponsive();
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [excusedModalVisible, setExcusedModalVisible] = useState(false);
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<User | null>(null);
  const [archiveEmployee, setArchiveEmployee] = useState<User | null>(null);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [customEmploymentTypes, setCustomEmploymentTypes] = useState<string[]>([]);
  const [customPaymentTypes, setCustomPaymentTypes] = useState<string[]>([]);
  const [newEmploymentType, setNewEmploymentType] = useState('');
  const [newPaymentType, setNewPaymentType] = useState('');
  const [form] = Form.useForm();
  const [excusedForm] = Form.useForm();
  const [archiveForm] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [employeeTab, setEmployeeTab] = useState<'active' | 'archive'>('active');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getEmployees(employeeTab === 'active', employeeTab === 'archive');
      setEmployees(data);
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    } finally {
      setLoading(false);
    }
  }, [employeeTab, t]);

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

  const fetchCustomTypes = async () => {
    try {
      const data = await api.getCustomTypes();
      setCustomEmploymentTypes(data.employment_types || []);
      setCustomPaymentTypes(data.payment_types || []);
    } catch (error) {
      console.error('Failed to load custom types:', error);
    }
  };

  const handleAddEmploymentType = async () => {
    if (!newEmploymentType.trim()) return;
    const value = newEmploymentType.trim();
    const updated = [...customEmploymentTypes, value];
    try {
      await api.updateCustomTypes({ employment_types: updated });
      setCustomEmploymentTypes(updated);
      setNewEmploymentType('');
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  const handleAddPaymentType = async () => {
    if (!newPaymentType.trim()) return;
    const value = newPaymentType.trim();
    const updated = [...customPaymentTypes, value];
    try {
      await api.updateCustomTypes({ payment_types: updated });
      setCustomPaymentTypes(updated);
      setNewPaymentType('');
    } catch (error) {
      message.error(t('errors.somethingWentWrong'));
    }
  };

  useEffect(() => {
    fetchEmployees();
    setSelectedRowKeys([]);
  }, [fetchEmployees]);

  useEffect(() => {
    fetchDepartments();
    fetchCustomTypes();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      const payload = {
        ...values,
        birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : null,
        name_day: values.name_day_day && values.name_day_month
          ? `2024-${String(values.name_day_month).padStart(2, '0')}-${String(values.name_day_day).padStart(2, '0')}`
          : null,
        employment_start_date: values.employment_start_date ? values.employment_start_date.format('YYYY-MM-DD') : null,
        employment_end_date: values.employment_end_date ? values.employment_end_date.format('YYYY-MM-DD') : null,
        employment_end_reason: values.employment_end_reason,
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
        name_day: values.name_day_day && values.name_day_month
          ? `2024-${String(values.name_day_month).padStart(2, '0')}-${String(values.name_day_day).padStart(2, '0')}`
          : null,
        contract_number: values.contract_number,
        employment_start_date: values.employment_start_date ? values.employment_start_date.format('YYYY-MM-DD') : null,
        employment_end_date: values.employment_end_date ? values.employment_end_date.format('YYYY-MM-DD') : null,
        employment_end_reason: values.employment_end_reason,
        emergency_contact_name: values.emergency_contact_name,
        emergency_contact_phone: values.emergency_contact_phone,
        declared_address: values.declared_address,
        actual_address: values.actual_address,
        personal_code: values.personal_code,
      });

      // Update email, role, or is_employee if changed
      const userUpdates: any = {};
      if (values.email && values.email !== editingEmployee.email) {
        userUpdates.email = values.email;
      }
      if (values.role && values.role !== editingEmployee.role) {
        userUpdates.role = values.role;
      }
      if (values.is_employee !== editingEmployee.is_employee) {
        userUpdates.is_employee = values.is_employee;
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
      name_day_day: employee.profile?.name_day ? dayjs(employee.profile.name_day).date() : null,
      name_day_month: employee.profile?.name_day ? dayjs(employee.profile.name_day).month() + 1 : null,
      contract_number: employee.profile?.contract_number,
      employment_start_date: employee.profile?.employment_start_date ? dayjs(employee.profile.employment_start_date) : null,
      employment_end_date: employee.profile?.employment_end_date ? dayjs(employee.profile.employment_end_date) : null,
      employment_end_reason: employee.profile?.employment_end_reason,
      emergency_contact_name: employee.profile?.emergency_contact_name,
      emergency_contact_phone: employee.profile?.emergency_contact_phone,
      declared_address: employee.profile?.declared_address,
      actual_address: employee.profile?.actual_address,
      personal_code: employee.profile?.personal_code,
      role: employee.role,
      is_employee: employee.is_employee,
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

  const openArchiveModal = (employee: User) => {
    setArchiveEmployee(employee);
    archiveForm.resetFields();
    archiveForm.setFieldsValue({
      employment_end_date: dayjs(),
      employment_end_reason: employee.profile?.employment_end_reason,
    });
    setArchiveModalVisible(true);
  };

  const handleArchiveEmployee = async (values: any) => {
    if (!archiveEmployee) return;

    try {
      await api.updateEmployeeProfile(archiveEmployee.id, {
        employment_end_date: values.employment_end_date.format('YYYY-MM-DD'),
        employment_end_reason: values.employment_end_reason,
      });
      message.success(t('admin.employees.archiveSuccess'));
      setArchiveModalVisible(false);
      if (editingEmployee?.id === archiveEmployee.id) {
        setModalVisible(false);
        setEditingEmployee(null);
        form.resetFields();
      }
      setArchiveEmployee(null);
      archiveForm.resetFields();
      fetchEmployees();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const handleRestoreEmployee = async (employee: User) => {
    try {
      await api.updateEmployeeProfile(employee.id, {
        employment_end_date: null,
        employment_end_reason: null,
      });
      message.success(t('admin.employees.restoreSuccess'));
      fetchEmployees();
    } catch (error: any) {
      message.error(error.response?.data?.detail || t('errors.somethingWentWrong'));
    }
  };

  const prepareExportData = () => {
    const list = selectedRowKeys.length > 0
      ? employees.filter(emp => selectedRowKeys.includes(emp.id))
      : employees;
    return list.map(emp => ({
      [t('admin.employees.firstName')]: emp.profile?.first_name || '',
      [t('admin.employees.lastName')]: emp.profile?.last_name || '',
      [t('admin.employees.email')]: emp.email || '',
      [t('admin.employees.workEmail')]: emp.profile?.work_email || '',
      [t('admin.employees.phone')]: emp.profile?.phone || '',
      [t('admin.employees.position')]: emp.profile?.position || '',
      [t('admin.employees.department')]: emp.profile?.department || '',
      [t('admin.employees.personalCode')]: emp.profile?.personal_code || '',
      [t('admin.employees.employmentType')]: emp.profile?.employment_type === 'full_time'
        ? t('admin.employees.fullTime') : emp.profile?.employment_type === 'part_time'
        ? t('admin.employees.partTime') : (emp.profile?.employment_type || ''),
      [t('admin.employees.paymentType')]: emp.profile?.payment_type === 'salary'
        ? t('admin.employees.salary') : emp.profile?.payment_type === 'hourly'
        ? t('admin.employees.hourly') : (emp.profile?.payment_type || ''),
      [t('admin.employees.birthday')]: emp.profile?.birthday
        ? dayjs(emp.profile.birthday).format('DD.MM.YYYY') : '',
      [t('admin.employees.contractNumber')]: emp.profile?.contract_number || '',
      [t('admin.employees.employmentStartDate')]: emp.profile?.employment_start_date
        ? dayjs(emp.profile.employment_start_date).format('DD.MM.YYYY') : '',
      [t('admin.employees.employmentEndDate')]: emp.profile?.employment_end_date
        ? dayjs(emp.profile.employment_end_date).format('DD.MM.YYYY') : '',
      [t('admin.employees.employmentEndReason')]: emp.profile?.employment_end_reason || '',
      [t('profile.bankAccount')]: emp.profile?.bank_account || '',
      [t('admin.employees.defaultWorkplace')]: emp.profile?.default_workplace === 'office'
        ? t('timeEntry.office') : emp.profile?.default_workplace === 'remote'
        ? t('timeEntry.remote') : '',
      [t('admin.employees.emergencyContactName')]: emp.profile?.emergency_contact_name || '',
      [t('admin.employees.emergencyContactPhone')]: emp.profile?.emergency_contact_phone || '',
      [t('admin.employees.declaredAddress')]: emp.profile?.declared_address || '',
      [t('admin.employees.actualAddress')]: emp.profile?.actual_address || '',
      [t('admin.employees.role')]: emp.role === 'admin'
        ? t('admin.employees.roles.admin') : t('admin.employees.roles.employee'),
    }));
  };

  const exportToExcel = () => {
    const data = prepareExportData();
    const ws = XLSX.utils.json_to_sheet(data);

    // Auto-size columns based on content
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      ws['!cols'] = headers.map((header) => {
        let maxLen = header.length;
        data.forEach(row => {
          const val = String((row as Record<string, unknown>)[header] || '');
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: Math.min(maxLen + 2, 60) };
      });
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('admin.employees.title'));
    XLSX.writeFile(wb, `employees_${dayjs().format('YYYY-MM-DD')}.xlsx`);
  };

  const exportToCSV = () => {
    const data = prepareExportData();
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `employees_${dayjs().format('YYYY-MM-DD')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const allColumns = [
    {
      title: t('profile.avatar'),
      dataIndex: 'profile',
      key: 'avatar',
      width: 70,
      fixed: 'left' as const,
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
            size={40}
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
      width: 180,
      fixed: 'left' as const,
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
      width: 200,
    },
    {
      title: t('admin.employees.phone'),
      dataIndex: ['profile', 'phone'],
      key: 'phone',
      width: 130,
      render: (phone: string) => phone || '-',
    },
    {
      title: t('admin.employees.position'),
      dataIndex: ['profile', 'position'],
      key: 'position',
      width: 130,
      render: (position: string) => position || '-',
    },
    {
      title: t('admin.employees.department'),
      dataIndex: ['profile', 'department'],
      key: 'department',
      width: 130,
      render: (dept: string) => dept || '-',
    },
    {
      title: t('admin.employees.employmentType'),
      dataIndex: ['profile', 'employment_type'],
      key: 'employment_type',
      width: 120,
      render: (type: string) => type ? (
        <Tag color={type === 'full_time' ? 'green' : type === 'part_time' ? 'orange' : 'purple'}>
          {type === 'full_time' ? t('admin.employees.fullTime') : type === 'part_time' ? t('admin.employees.partTime') : type}
        </Tag>
      ) : '-',
    },
    {
      title: t('admin.employees.paymentType'),
      dataIndex: ['profile', 'payment_type'],
      key: 'payment_type',
      width: 120,
      render: (type: string) => type ? (
        <Tag color={type === 'salary' ? 'blue' : type === 'hourly' ? 'cyan' : 'purple'}>
          {type === 'salary' ? t('admin.employees.salary') : type === 'hourly' ? t('admin.employees.hourly') : type}
        </Tag>
      ) : '-',
    },
    {
      title: t('admin.employees.birthday'),
      dataIndex: ['profile', 'birthday'],
      key: 'birthday',
      width: 120,
      render: (date: string) => date ? dayjs(date).format('DD.MM.YYYY') : '-',
    },
    {
      title: t('admin.employees.contractNumber'),
      dataIndex: ['profile', 'contract_number'],
      key: 'contract_number',
      width: 130,
      render: (val: string) => val || '-',
    },
    {
      title: t('admin.employees.employmentStartDate'),
      dataIndex: ['profile', 'employment_start_date'],
      key: 'employment_start_date',
      width: 130,
      render: (date: string) => date ? dayjs(date).format('DD.MM.YYYY') : '-',
    },
    {
      title: t('admin.employees.employmentEndDate'),
      dataIndex: ['profile', 'employment_end_date'],
      key: 'employment_end_date',
      width: 150,
      render: (date: string) => date ? <Tag color="red">{dayjs(date).format('DD.MM.YYYY')}</Tag> : '-',
    },
    {
      title: t('admin.employees.employmentEndReason'),
      dataIndex: ['profile', 'employment_end_reason'],
      key: 'employment_end_reason',
      width: 220,
      ellipsis: true,
      render: (reason: string) => reason || '-',
    },
    {
      title: t('profile.bankAccount'),
      dataIndex: ['profile', 'bank_account'],
      key: 'bank_account',
      width: 150,
      render: (account: string) => account || '-',
    },
    {
      title: t('admin.employees.workEmail'),
      dataIndex: ['profile', 'work_email'],
      key: 'work_email',
      width: 200,
      render: (email: string) => email || '-',
    },
    {
      title: t('admin.employees.defaultWorkplace'),
      dataIndex: ['profile', 'default_workplace'],
      key: 'default_workplace',
      width: 120,
      render: (wp: string) => wp ? (
        <Tag color={wp === 'office' ? 'green' : 'purple'}>
          {wp === 'office' ? t('timeEntry.office') : t('timeEntry.remote')}
        </Tag>
      ) : '-',
    },
    {
      title: t('admin.employees.personalCode'),
      dataIndex: ['profile', 'personal_code'],
      key: 'personal_code',
      width: 140,
      render: (val: string) => val || '-',
    },
    {
      title: t('admin.employees.emergencyContactName'),
      dataIndex: ['profile', 'emergency_contact_name'],
      key: 'emergency_contact_name',
      width: 150,
      render: (val: string) => val || '-',
    },
    {
      title: t('admin.employees.emergencyContactPhone'),
      dataIndex: ['profile', 'emergency_contact_phone'],
      key: 'emergency_contact_phone',
      width: 150,
      render: (val: string) => val || '-',
    },
    {
      title: t('admin.employees.declaredAddress'),
      dataIndex: ['profile', 'declared_address'],
      key: 'declared_address',
      width: 200,
      ellipsis: true,
      render: (val: string) => val || '-',
    },
    {
      title: t('admin.employees.role'),
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string, record: User) => (
        <>
          <Tag color={role === 'admin' ? 'purple' : 'blue'}>
            {role === 'admin' ? t('admin.employees.roles.admin') : t('admin.employees.roles.employee')}
          </Tag>
          {!record.is_employee && <Tag color="orange" style={{ marginTop: 2 }}>{t('admin.employees.roles.itOnly')}</Tag>}
        </>
      ),
    },
    {
      title: t('common.actions'),
      key: 'actions',
      width: 190,
      fixed: 'right' as const,
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
          {employeeTab === 'archive' ? (
            <Popconfirm
              title={t('admin.employees.restoreConfirm')}
              onConfirm={() => handleRestoreEmployee(record)}
            >
              <Button
                type="link"
                icon={<RollbackOutlined />}
                title={t('admin.employees.restoreFromArchive')}
              />
            </Popconfirm>
          ) : (
            <Button
              type="link"
              icon={<InboxOutlined />}
              onClick={() => openArchiveModal(record)}
              title={t('admin.employees.moveToArchive')}
            />
          )}
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

  // On mobile, show only essential columns without fixed positioning
  const mobileColumns = [
    {
      title: t('admin.employees.firstName') + ' ' + t('admin.employees.lastName'),
      key: 'name',
      render: (_: any, record: User) => (
        <Space>
          <Upload
            showUploadList={false}
            beforeUpload={(file) => {
              handleAvatarUpload(record.id, file);
              return false;
            }}
            accept="image/*"
          >
            <Avatar
              size={36}
              src={record.profile?.avatar_url}
              icon={!record.profile?.avatar_url && <UserOutlined />}
              style={{ cursor: 'pointer' }}
            />
          </Upload>
          <div>
            <div style={{ fontWeight: 500 }}>
              {record.profile ? `${record.profile.first_name} ${record.profile.last_name}` : '-'}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>
              {record.profile?.position || record.email}
            </div>
          </div>
        </Space>
      ),
      sorter: (a: User, b: User) => {
        const nameA = a.profile ? `${a.profile.first_name} ${a.profile.last_name}` : '';
        const nameB = b.profile ? `${b.profile.first_name} ${b.profile.last_name}` : '';
        return nameA.localeCompare(nameB);
      },
    },
    {
      title: t('admin.employees.role'),
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string, record: User) => (
        <>
          <Tag color={role === 'admin' ? 'purple' : 'blue'}>
            {role === 'admin' ? t('admin.employees.roles.admin') : t('admin.employees.roles.employee')}
          </Tag>
          {!record.is_employee && <Tag color="orange" style={{ marginTop: 2 }}>{t('admin.employees.roles.itOnly')}</Tag>}
        </>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 130,
      render: (_: any, record: User) => (
        <Space size={0}>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          />
          <Button
            type="link"
            size="small"
            icon={<ExclamationCircleOutlined />}
            onClick={() => openExcusedModal(record)}
          />
          {employeeTab === 'archive' ? (
            <Popconfirm
              title={t('admin.employees.restoreConfirm')}
              onConfirm={() => handleRestoreEmployee(record)}
            >
              <Button type="link" size="small" icon={<RollbackOutlined />} />
            </Popconfirm>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<InboxOutlined />}
              onClick={() => openArchiveModal(record)}
            />
          )}
          <Popconfirm
            title={t('admin.employees.deleteConfirm')}
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const columns = isMobile ? mobileColumns : allColumns;

  return (
    <div>
      <Row justify="space-between" align="middle" gutter={[0, 12]} style={{ marginBottom: 24 }}>
        <Col xs={24} md="auto">
          <Title level={3} style={{ margin: 0 }}>
            {t('admin.employees.title')}
          </Title>
        </Col>
        <Col xs={24} md="auto">
          <Space wrap>
            <Input
              placeholder={t('common.search')}
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Button icon={<DownloadOutlined />} onClick={exportToExcel}>
              {t('admin.reports.exportExcel')}{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
            </Button>
            <Button icon={<DownloadOutlined />} onClick={exportToCSV}>
              {t('admin.reports.exportCsv')}{selectedRowKeys.length > 0 ? ` (${selectedRowKeys.length})` : ''}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              {t('admin.employees.addEmployee')}
            </Button>
          </Space>
        </Col>
      </Row>

      <Card>
        <Tabs
          activeKey={employeeTab}
          onChange={(key) => setEmployeeTab(key as 'active' | 'archive')}
          items={[
            { key: 'active', label: t('admin.employees.current') },
            { key: 'archive', label: t('admin.employees.archive') },
          ]}
        />
        <Table
          columns={columns}
          dataSource={employees.filter((emp) => {
            if (!debouncedSearch) return true;
            const name = `${emp.profile?.first_name || ''} ${emp.profile?.last_name || ''}`.toLowerCase();
            return name.includes(debouncedSearch.toLowerCase()) || emp.email.toLowerCase().includes(debouncedSearch.toLowerCase());
          })}
          rowKey="id"
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys),
          }}
          rowClassName={(record: User) => record.role === 'admin' ? 'admin-row' : ''}
          loading={loading}
          pagination={{ pageSize, showSizeChanger: false }}
          scroll={isMobile ? undefined : { x: 3200 }}
          size="small"
          footer={() => (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <PageSizeSelector
                value={pageSize}
                total={employees.length}
                onChange={setPageSize}
              />
            </div>
          )}
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
        width={modalWidth(700)}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={editingEmployee ? handleUpdate : handleCreate}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="first_name"
                label={t('admin.employees.firstName')}
                rules={[{ required: true, message: t('timeEntry.validation.required') }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
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
            <Col xs={24} md={12}>
              <Form.Item name="phone" label={t('admin.employees.phone')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="position" label={t('admin.employees.position')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
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
            <Col xs={24} md={12}>
              <Form.Item name="work_email" label={t('admin.employees.workEmail')}>
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="bank_account" label={t('profile.bankAccount')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="contract_number" label={t('admin.employees.contractNumber')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="personal_code" label={t('admin.employees.personalCode')}>
                <Input maxLength={20} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="employment_type"
                label={t('admin.employees.employmentType')}
                initialValue="full_time"
              >
                <Select
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px' }}>
                        <Input
                          placeholder={t('common.add')}
                          value={newEmploymentType}
                          onChange={(e) => setNewEmploymentType(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <Button type="text" icon={<PlusOutlined />} onClick={handleAddEmploymentType}>
                          {t('common.add')}
                        </Button>
                      </Space>
                    </>
                  )}
                >
                  <Select.Option value="full_time">{t('admin.employees.fullTime')}</Select.Option>
                  <Select.Option value="part_time">{t('admin.employees.partTime')}</Select.Option>
                  {customEmploymentTypes.map((type) => (
                    <Select.Option key={type} value={type}>{type}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="payment_type"
                label={t('admin.employees.paymentType')}
                initialValue="salary"
              >
                <Select
                  dropdownRender={(menu) => (
                    <>
                      {menu}
                      <Divider style={{ margin: '8px 0' }} />
                      <Space style={{ padding: '0 8px 4px' }}>
                        <Input
                          placeholder={t('common.add')}
                          value={newPaymentType}
                          onChange={(e) => setNewPaymentType(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                        />
                        <Button type="text" icon={<PlusOutlined />} onClick={handleAddPaymentType}>
                          {t('common.add')}
                        </Button>
                      </Space>
                    </>
                  )}
                >
                  <Select.Option value="salary">{t('admin.employees.salary')}</Select.Option>
                  <Select.Option value="hourly">{t('admin.employees.hourly')}</Select.Option>
                  {customPaymentTypes.map((type) => (
                    <Select.Option key={type} value={type}>{type}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="employment_start_date" label={t('admin.employees.employmentStartDate')}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="birthday" label={t('admin.employees.birthday')}>
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label={t('admin.employees.nameDay')}>
                <Space.Compact style={{ width: '100%' }}>
                  <Form.Item name="name_day_day" noStyle>
                    <Select placeholder={t('common.day')} style={{ width: '50%' }}>
                      {Array.from({ length: 31 }, (_, i) => (
                        <Select.Option key={i + 1} value={i + 1}>{i + 1}</Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item name="name_day_month" noStyle>
                    <Select placeholder={t('common.month')} style={{ width: '50%' }}>
                      {Array.from({ length: 12 }, (_, i) => (
                        <Select.Option key={i + 1} value={i + 1}>
                          {dayjs().month(i).format('MMMM')}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Space.Compact>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="declared_address" label={t('admin.employees.declaredAddress')}>
            <Input.TextArea rows={2} />
          </Form.Item>

          <Divider>{t('admin.employees.emergencyContact')}</Divider>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="emergency_contact_name" label={t('admin.employees.emergencyContactName')}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="emergency_contact_phone" label={t('admin.employees.emergencyContactPhone')}>
                <Input />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="actual_address" label={t('admin.employees.actualAddress')}>
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

          {editingEmployee && (
            <Form.Item
              name="is_employee"
              label={t('admin.employees.isEmployee')}
              valuePropName="checked"
              initialValue={true}
              extra={t('admin.employees.isEmployeeHint')}
            >
              <Switch />
            </Form.Item>
          )}

          <Divider>{t('admin.employees.archive')}</Divider>

          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item
                name="employment_end_date"
                label={t('admin.employees.employmentEndDate')}
              >
                <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item name="employment_end_reason" label={t('admin.employees.employmentEndReason')}>
                <Input.TextArea rows={2} maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>

          {editingEmployee && !editingEmployee.profile?.employment_end_date && (
            <Form.Item>
              <Button icon={<InboxOutlined />} onClick={() => openArchiveModal(editingEmployee)}>
                {t('admin.employees.moveToArchive')}
              </Button>
            </Form.Item>
          )}

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
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
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

      <Modal
        title={t('admin.employees.moveToArchive')}
        open={archiveModalVisible}
        onCancel={() => {
          setArchiveModalVisible(false);
          setArchiveEmployee(null);
          archiveForm.resetFields();
        }}
        footer={null}
      >
        <div style={{ marginBottom: 16 }}>
          {archiveEmployee && (
            <span>
              {t('statistics.employee')}: <strong>
                {archiveEmployee.profile
                  ? `${archiveEmployee.profile.first_name} ${archiveEmployee.profile.last_name}`
                  : archiveEmployee.email}
              </strong>
            </span>
          )}
        </div>
        <Form form={archiveForm} onFinish={handleArchiveEmployee} layout="vertical">
          <Form.Item
            name="employment_end_date"
            label={t('admin.employees.employmentEndDate')}
            rules={[{ required: true, message: t('timeEntry.validation.required') }]}
          >
            <DatePicker style={{ width: '100%' }} format="DD.MM.YYYY" />
          </Form.Item>
          <Form.Item name="employment_end_reason" label={t('admin.employees.employmentEndReason')}>
            <Input.TextArea rows={3} maxLength={500} showCount />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => {
                setArchiveModalVisible(false);
                setArchiveEmployee(null);
                archiveForm.resetFields();
              }}>
                {t('common.cancel')}
              </Button>
              <Button type="primary" htmlType="submit" icon={<InboxOutlined />}>
                {t('admin.employees.moveToArchive')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
