// User types
export type UserRole = 'employee' | 'admin';
export type EmploymentType = 'full_time' | 'part_time';
export type PaymentType = 'salary' | 'hourly';

export interface User {
  id: number;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  profile?: EmployeeProfile;
}

export interface EmployeeProfile {
  id: number;
  user_id: number;
  first_name: string;
  last_name: string;
  phone?: string;
  avatar_url?: string;
  bank_account?: string;
  position?: string;
  department?: string;
  default_workplace?: WorkplaceType;
  work_email?: string;
  employment_type?: EmploymentType;
  payment_type?: PaymentType;
  birthday?: string;
  name_day?: string;
  contract_number?: string;
  employment_start_date?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  declared_address?: string;
  created_at: string;
  updated_at: string;
}

// Calendar types
export type DayType = 'workday' | 'weekend' | 'holiday';

export interface CalendarDay {
  id: number;
  date: string;
  day_type: DayType;
  holiday_name?: string;
  holiday_name_lv?: string;
  holiday_name_en?: string;
  country: string;
  is_working_day: boolean;
}

export interface CalendarMonth {
  year: number;
  month: number;
  days: CalendarDay[];
}

// Time Entry types
export type WorkplaceType = 'office' | 'remote';

export interface TimeEntry {
  id: number;
  user_id: number;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  workplace: WorkplaceType;
  comment?: string;
  duration_minutes: number;
  duration_hours: number;
  created_at: string;
  updated_at: string;
}

export interface TimeEntryCreate {
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  workplace: WorkplaceType;
  comment?: string;
}

export interface DaySummary {
  date: string;
  entries: TimeEntry[];
  total_minutes: number;
  total_hours: number;
  total_break_minutes: number;
  has_office: boolean;
  has_remote: boolean;
}

// Day Status types
export type StatusType = 'normal' | 'sick' | 'vacation' | 'excused';

export interface DayStatus {
  id: number;
  user_id: number;
  date: string;
  status: StatusType;
  auto_skip_day: boolean;
  note?: string;
  created_at: string;
  updated_at: string;
}

// Vacation types
export type VacationStatus = 'pending' | 'approved' | 'rejected';

export interface Vacation {
  id: number;
  user_id: number;
  date_from: string;
  date_to: string;
  status: VacationStatus;
  note?: string;
  days_count: number;
  created_at: string;
  updated_at: string;
}

export interface VacationCreate {
  date_from: string;
  date_to: string;
  note?: string;
}

// Statistics types
export type PeriodType = 'week' | 'month' | 'year' | 'custom';

export interface DailyStats {
  date: string;
  total_minutes: number;
  total_hours: number;
  break_minutes: number;
  office_minutes: number;
  remote_minutes: number;
  status?: string;
  is_working_day: boolean;
}

export interface WeeklyStats {
  week_number: number;
  year: number;
  start_date: string;
  end_date: string;
  total_minutes: number;
  total_hours: number;
  working_days: number;
  days_with_entries: number;
  office_days: number;
  remote_days: number;
}

export interface MonthlyStats {
  month: number;
  year: number;
  total_minutes: number;
  total_hours: number;
  working_days: number;
  days_with_entries: number;
  sick_days: number;
  vacation_days: number;
  office_days: number;
  remote_days: number;
}

export interface Stats {
  period: PeriodType;
  date_from: string;
  date_to: string;
  total_minutes: number;
  total_hours: number;
  total_break_minutes: number;
  working_days: number;
  days_with_entries: number;
  sick_days: number;
  vacation_days: number;
  office_days: number;
  remote_days: number;
  daily_stats: DailyStats[];
  weekly_stats?: WeeklyStats[];
  monthly_stats?: MonthlyStats[];
}

// Office presence types
export interface OfficePresence {
  user_id: number;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  position?: string;
}

export interface OfficePresenceResponse {
  date: string;
  employees: OfficePresence[];
  count: number;
}

export type EmployeeStatus = 'office' | 'remote' | 'sick' | 'vacation' | 'excused' | 'no_plan';

export interface EmployeeWithStatus {
  user_id: number;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  position?: string;
  status: EmployeeStatus | 'office/remote';
  status_emoji?: string;
  statuses?: EmployeeStatus[];
}

export interface AllEmployeesStatusResponse {
  date: string;
  employees: EmployeeWithStatus[];
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

// Company Settings types
export interface CompanySettings {
  logo_url: string | null;
  icon_vacation: string;
  icon_sick: string;
  icon_office: string;
  icon_remote: string;
  icon_holiday: string;
  icon_excused: string;
}

export interface IconSettingsUpdate {
  icon_vacation?: string;
  icon_sick?: string;
  icon_office?: string;
  icon_remote?: string;
  icon_holiday?: string;
  icon_excused?: string;
}

export interface AllowedIconsResponse {
  icons: string[];
}

// Change Request types
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected';
export type ChangeRequestType = 'add' | 'edit' | 'delete';

export interface ChangeRequest {
  id: number;
  user_id: number;
  request_type: ChangeRequestType;
  time_entry_id?: number;
  date: string;
  start_time?: string;
  end_time?: string;
  break_minutes?: number;
  workplace?: string;
  comment?: string;
  reason: string;
  status: ChangeRequestStatus;
  admin_id?: number;
  admin_comment?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  employee_email?: string;
}

export interface ChangeRequestCreate {
  request_type: ChangeRequestType;
  time_entry_id?: number;
  date: string;
  start_time?: string;
  end_time?: string;
  break_minutes?: number;
  workplace?: string;
  comment?: string;
  reason: string;
}

export interface ChangeRequestResolve {
  status: ChangeRequestStatus;
  admin_comment?: string;
}

export interface ChangeRequestListResponse {
  requests: ChangeRequest[];
  total: number;
  pending_count: number;
}

// Department types
export interface Department {
  id: number;
  name: string;
  is_default: boolean;
  created_at: string;
}

export interface DepartmentCreate {
  name: string;
}

// Notification types
export type NotificationType = 'birthday' | 'name_day' | 'change_request' | 'weekly_reminder' | 'missing_entry' | 'system';

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  related_user_id?: number;
  related_request_id?: number;
  created_at: string;
}

export interface NotificationSettings {
  email_birthday: boolean;
  email_name_day: boolean;
  email_change_request: boolean;
  email_weekly_reminder: boolean;
  app_birthday: boolean;
  app_name_day: boolean;
  app_change_request: boolean;
  app_weekly_reminder: boolean;
}

export interface NotificationSettingsUpdate {
  email_birthday?: boolean;
  email_name_day?: boolean;
  email_change_request?: boolean;
  email_weekly_reminder?: boolean;
  app_birthday?: boolean;
  app_name_day?: boolean;
  app_change_request?: boolean;
  app_weekly_reminder?: boolean;
}
