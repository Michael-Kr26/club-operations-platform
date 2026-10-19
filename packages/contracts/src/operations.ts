import type {
  Dataset,
  Principal,
  ReportOrganization,
  ForecastDashboard,
} from './index';
export type OperationKind =
  'task' | 'employee' | 'shift' | 'checklist' | 'asset' | 'contact';
export type Activity =
  'floor' | 'class' | 'pt' | 'intake' | 'admin' | 'training';
export interface TaskData {
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  priority: 'normal' | 'high';
  status: 'open' | 'in-progress' | 'done' | 'cancelled';
  source?: {
    type: 'report' | 'member' | 'checklist' | 'asset';
    key: string;
    importId?: string;
    memberKey?: string;
    assetId?: string;
  };
  checks?: { label: string; done: boolean }[];
  completedAt?: string | null;
}
export interface EmployeeData {
  name: string;
  number: string;
  locationIds: string[];
  skills: Activity[];
  contractMinutes: number | null;
  active: boolean;
}
export interface ShiftData {
  employeeId: string | null;
  date: string;
  start: string;
  end: string;
  activity: Activity;
  status: 'draft' | 'published' | 'cancelled';
  notes: string;
}
export interface ChecklistData {
  title: string;
  items: string[];
  cadence: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  assigneeId: string | null;
  active: boolean;
}
export interface AssetData {
  name: string;
  serial: string;
  status: 'operational' | 'maintenance' | 'out-of-service';
  nextMaintenance: string | null;
  notes: string;
}
export interface ContactData {
  memberKey: string;
  sourceId: string;
  note: string;
  nextContact: string | null;
}
export type OperationData =
  TaskData | EmployeeData | ShiftData | ChecklistData | AssetData | ContactData;
export interface OperationRecord<
  K extends OperationKind = OperationKind,
  D extends OperationData = OperationData,
> {
  id: string;
  kind: K;
  locationId: string;
  dataset: Dataset;
  data: D;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}
export type TaskRecord = OperationRecord<'task', TaskData>;
export type EmployeeRecord = OperationRecord<'employee', EmployeeData>;
export type ShiftRecord = OperationRecord<'shift', ShiftData>;
export type ChecklistRecord = OperationRecord<'checklist', ChecklistData>;
export type AssetRecord = OperationRecord<'asset', AssetData>;
export type ContactRecord = OperationRecord<'contact', ContactData>;
export interface OperationsWorkspace {
  organization: ReportOrganization;
  principal: Principal;
  dataset: Dataset;
  tasks: TaskRecord[];
  employees: EmployeeRecord[];
  shifts: ShiftRecord[];
  checklists: ChecklistRecord[];
  assets: AssetRecord[];
  reports: ForecastDashboard | null;
  warnings: string[];
}
export interface DirectoryMember {
  key: string;
  number: string;
  locationId: string;
  sourceId: string;
  asOf: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  lastVisit: string | null;
  inactiveDays: number | null;
}
export interface MemberDirectory {
  members: DirectoryMember[];
  contacts: ContactRecord[];
  sources: { id: string; locationId: string; asOf: string; filename: string }[];
  warnings: string[];
}
