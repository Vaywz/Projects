import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            try {
              const response = await this.client.post('/auth/refresh', {
                refresh_token: refreshToken,
              });

              const { access_token, refresh_token } = response.data;
              localStorage.setItem('access_token', access_token);
              localStorage.setItem('refresh_token', refresh_token);

              originalRequest.headers.Authorization = `Bearer ${access_token}`;
              return this.client(originalRequest);
            } catch (refreshError) {
              // Refresh failed, logout
              this.logout();
              window.location.href = '/login';
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    const { access_token, refresh_token, user } = response.data;
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    return { user, access_token, refresh_token };
  }

  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Calendar
  async getCalendarMonth(year: number, month: number) {
    const response = await this.client.get('/calendar/month', {
      params: { year, month },
    });
    return response.data;
  }

  async getCalendarDay(date: string) {
    const response = await this.client.get('/calendar/day', {
      params: { date },
    });
    return response.data;
  }

  // Time Entries
  async getTimeEntries(params: { date?: string; date_from?: string; date_to?: string }) {
    const response = await this.client.get('/time-entries', { params });
    return response.data;
  }

  async getDaySummary(date: string) {
    const response = await this.client.get('/time-entries/day-summary', {
      params: { date },
    });
    return response.data;
  }

  async createTimeEntry(data: any) {
    const response = await this.client.post('/time-entries', data);
    return response.data;
  }

  async updateTimeEntry(id: number, data: any) {
    const response = await this.client.put(`/time-entries/${id}`, data);
    return response.data;
  }

  async deleteTimeEntry(id: number) {
    await this.client.delete(`/time-entries/${id}`);
  }

  // Day Status
  async getDayStatuses(params: { date_from?: string; date_to?: string }) {
    const response = await this.client.get('/day-status', { params });
    return response.data;
  }

  async getMySickDays() {
    const response = await this.client.get('/day-status/my-sick-days');
    return response.data;
  }

  async createDayStatus(data: any) {
    const response = await this.client.post('/day-status', data);
    return response.data;
  }

  async createSickDay(data: { start_date: string; end_date: string; note?: string }) {
    const response = await this.client.post('/day-status/sick-day', data);
    return response.data;
  }

  async updateDayStatus(id: number, data: { date?: string; note?: string }) {
    const response = await this.client.put(`/day-status/${id}`, data);
    return response.data;
  }

  async deleteDayStatus(id: number) {
    await this.client.delete(`/day-status/${id}`);
  }

  // Vacations
  async getVacations(year?: number) {
    const response = await this.client.get('/vacations', {
      params: year ? { year } : undefined,
    });
    return response.data;
  }

  async createVacation(data: any) {
    const response = await this.client.post('/vacations', data);
    return response.data;
  }

  async updateVacation(id: number, data: { date_from?: string; date_to?: string; note?: string }) {
    const response = await this.client.put(`/vacations/${id}`, data);
    return response.data;
  }

  async deleteVacation(id: number) {
    await this.client.delete(`/vacations/${id}`);
  }

  // Stats
  async getMyStats(params: { period: string; date_from?: string; date_to?: string }) {
    const response = await this.client.get('/stats/me', { params });
    return response.data;
  }

  // Office presence
  async getOfficePresence(date?: string) {
    const response = await this.client.get('/office', {
      params: date ? { date } : undefined,
    });
    return response.data;
  }

  async getWeeklyOfficePresence(date?: string) {
    const response = await this.client.get('/office/week', {
      params: date ? { date } : undefined,
    });
    return response.data;
  }

  async getAllEmployeesStatus(date?: string) {
    const response = await this.client.get('/office/all-employees', {
      params: date ? { date } : undefined,
    });
    return response.data;
  }

  // Profile
  async updateProfile(data: any) {
    const response = await this.client.put('/users/profile', data);
    return response.data;
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const response = await this.client.put('/users/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  }

  // Admin endpoints
  async getEmployees(activeOnly: boolean = true) {
    const response = await this.client.get('/admin/employees', {
      params: { active_only: activeOnly },
    });
    return response.data;
  }

  async createEmployee(data: any) {
    const response = await this.client.post('/admin/employees', data);
    return response.data;
  }

  async getEmployee(id: number) {
    const response = await this.client.get(`/admin/employees/${id}`);
    return response.data;
  }

  async updateEmployee(id: number, data: any) {
    const response = await this.client.put(`/admin/employees/${id}`, data);
    return response.data;
  }

  async updateEmployeeProfile(id: number, data: any) {
    const response = await this.client.put(`/admin/employees/${id}/profile`, data);
    return response.data;
  }

  async activateEmployee(id: number) {
    const response = await this.client.patch(`/admin/employees/${id}/activate`);
    return response.data;
  }

  async deactivateEmployee(id: number) {
    const response = await this.client.patch(`/admin/employees/${id}/deactivate`);
    return response.data;
  }

  async deleteEmployee(id: number) {
    await this.client.delete(`/admin/employees/${id}`);
  }

  async uploadAvatar(userId: number, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.post(`/admin/employees/${userId}/avatar`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async getEmployeeStats(params: {
    user_id: number;
    period: string;
    date_from?: string;
    date_to?: string;
  }) {
    const response = await this.client.get('/admin/stats', { params });
    return response.data;
  }

  async getAllEmployeesStats(params: {
    period: string;
    date_from?: string;
    date_to?: string;
  }) {
    const response = await this.client.get('/admin/stats/summary', { params });
    return response.data;
  }

  async getEmployeeTimeEntries(userId: number, dateFrom: string, dateTo: string) {
    const response = await this.client.get(`/admin/employees/${userId}/time-entries`, {
      params: { date_from: dateFrom, date_to: dateTo },
    });
    return response.data;
  }

  async createEmployeeTimeEntry(userId: number, data: any) {
    const response = await this.client.post(`/admin/employees/${userId}/time-entries`, data);
    return response.data;
  }

  async createEmployeeDayStatus(userId: number, data: { date: string; status: string; note?: string }) {
    const response = await this.client.post(`/admin/employees/${userId}/day-status`, data);
    return response.data;
  }

  async deleteEmployeeDayStatus(userId: number, statusId: number) {
    await this.client.delete(`/admin/employees/${userId}/day-status/${statusId}`);
  }

  // Workplace Plans
  async getWorkplacePlans(dateFrom: string, dateTo: string) {
    const response = await this.client.get('/workplace-plans', {
      params: { date_from: dateFrom, date_to: dateTo },
    });
    return response.data;
  }

  async getWorkplacePlanForDate(date: string) {
    const response = await this.client.get('/workplace-plans/date', {
      params: { date },
    });
    return response.data;
  }

  async createWorkplacePlan(data: { date: string; workplace: 'office' | 'remote' }) {
    const response = await this.client.post('/workplace-plans', data);
    return response.data;
  }

  async deleteWorkplacePlan(date: string) {
    await this.client.delete(`/workplace-plans/${date}`);
  }

  // Company Settings
  async getCompanySettings() {
    const response = await this.client.get('/auth/settings');
    return response.data;
  }

  async getAdminSettings() {
    const response = await this.client.get('/admin/settings');
    return response.data;
  }

  async getAllowedIcons() {
    const response = await this.client.get('/admin/settings/icons/allowed');
    return response.data;
  }

  async updateIconSettings(data: {
    icon_vacation?: string;
    icon_sick?: string;
    icon_office?: string;
    icon_remote?: string;
    icon_holiday?: string;
    icon_excused?: string;
  }) {
    const response = await this.client.put('/admin/settings/icons', data);
    return response.data;
  }

  async uploadCompanyLogo(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.post('/admin/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async deleteCompanyLogo() {
    await this.client.delete('/admin/settings/logo');
  }

  async uploadCustomIcon(iconType: string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await this.client.post('/admin/settings/icons/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { icon_type: iconType },
    });
    return response.data;
  }

  // Change Requests
  async getMyChangeRequests(status?: string) {
    const response = await this.client.get('/change-requests/my', {
      params: status ? { status } : undefined,
    });
    return response.data;
  }

  async createChangeRequest(data: {
    request_type: string;
    time_entry_id?: number;
    vacation_id?: number;
    day_status_id?: number;
    date: string;
    date_to?: string;
    start_time?: string;
    end_time?: string;
    break_minutes?: number;
    workplace?: string;
    comment?: string;
    reason: string;
  }) {
    const response = await this.client.post('/change-requests', data);
    return response.data;
  }

  async deleteChangeRequest(id: number) {
    await this.client.delete(`/change-requests/${id}`);
  }

  // Admin Change Requests
  async getAllChangeRequests(status?: string, limit: number = 100, offset: number = 0) {
    const response = await this.client.get('/change-requests/admin/all', {
      params: { status, limit, offset },
    });
    return response.data;
  }

  async getPendingChangeRequestCount() {
    const response = await this.client.get('/change-requests/admin/pending-count');
    return response.data;
  }

  async resolveChangeRequest(id: number, data: { status: string; admin_comment?: string }) {
    const response = await this.client.put(`/change-requests/admin/${id}`, data);
    return response.data;
  }

  // Departments
  async getDepartments() {
    const response = await this.client.get('/departments');
    return response.data;
  }

  async createDepartment(name: string) {
    const response = await this.client.post('/departments', { name });
    return response.data;
  }

  async deleteDepartment(id: number) {
    await this.client.delete(`/departments/${id}`);
  }

  // Notifications
  async getNotifications(unreadOnly: boolean = false, limit: number = 50) {
    const response = await this.client.get('/notifications', {
      params: { unread_only: unreadOnly, limit },
    });
    return response.data;
  }

  async getUnreadNotificationCount() {
    const response = await this.client.get('/notifications/unread-count');
    return response.data;
  }

  async markNotificationAsRead(id: number) {
    const response = await this.client.post(`/notifications/${id}/read`);
    return response.data;
  }

  async markAllNotificationsAsRead() {
    const response = await this.client.post('/notifications/read-all');
    return response.data;
  }

  async getNotificationSettings() {
    const response = await this.client.get('/notifications/settings');
    return response.data;
  }

  async updateNotificationSettings(data: {
    email_birthday?: boolean;
    email_name_day?: boolean;
    email_change_request?: boolean;
    email_weekly_reminder?: boolean;
    app_birthday?: boolean;
    app_name_day?: boolean;
    app_change_request?: boolean;
    app_weekly_reminder?: boolean;
  }) {
    const response = await this.client.put('/notifications/settings', data);
    return response.data;
  }
}

export const api = new ApiService();
export default api;
