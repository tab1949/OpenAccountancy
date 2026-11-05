export interface RecentBookset {
  id: number;
  name: string;
  period: string;
  status: "open" | "closed";
  lastOpenedAt: string;
}

export type UserRole = "admin" | "supervisor" | "bookkeeper";

export type PermissionCode =
  | "create_supervisor"
  | "update_supervisor"
  | "delete_supervisor"
  | "create_bookkeeper"
  | "update_bookkeeper"
  | "delete_bookkeeper"
  | "create_voucher"
  | "update_voucher"
  | "query_voucher"
  | "delete_voucher";

export interface PermissionDefinition {
  code: PermissionCode;
  name: string;
  description: string;
}

export interface UserSummary {
  userId: number;
  userName: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  managedByUserId: number | null;
  permissions: PermissionCode[];
  createdAt: string;
}

export interface SecurityQuestionInput {
  question: string;
  answer: string;
}

export interface SecurityQuestionView {
  ordinal: number;
  question: string;
}

export interface InitSystemPayload {
  dbStoragePath: string;
  adminUserName: string;
  adminPassword: string;
  securityQuestions: SecurityQuestionInput[];
}

export interface LoginPayload {
  userName: string;
  password: string;
}

export interface LoginResult {
  ok: boolean;
  message: string;
  remainingAttempts: number;
}

export interface RecoverAccountPayload {
  answers: string[];
  newPassword: string;
}

export interface RecoverAccountResult {
  ok: boolean;
  message: string;
  userName?: string;
}

export interface ChangeOwnPasswordPayload {
  oldPassword: string;
  newPassword: string;
}

export interface OperationResult {
  ok: boolean;
  message: string;
}

export interface AuthSession {
  isAuthenticated: boolean;
  userId: number | null;
  userName: string;
  displayName: string;
  role: UserRole | null;
  permissions: PermissionCode[];
}

export interface CreateUserPayload {
  userName: string;
  displayName: string;
  role: Exclude<UserRole, "admin">;
  password: string;
  permissions: PermissionCode[];
}

export interface UpdateUserPayload {
  userId: number;
  displayName?: string;
  isActive?: boolean;
  permissions?: PermissionCode[];
  password?: string;
}

export interface DeleteUserPayload {
  userId: number;
}

export interface TodoItem {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
}

export interface AppShellState {
  appName: string;
  version: string;
  hasOpenedBookset: boolean;
  activeBooksetLabel: string;
  todoItems: TodoItem[];
}

export interface OpenBooksetPayload {
  companyName: string;
  fiscalPeriod: string;
}

export interface SystemEntryState {
  hasDatabase: boolean;
  mode: "init" | "login";
  initialized: boolean;
}

export interface OpenAccountancyApi {
  ping: () => Promise<string>;
  getSystemEntryState: () => Promise<SystemEntryState>;
  initSystem: (payload: InitSystemPayload) => Promise<{ ok: boolean; message: string }>;
  login: (payload: LoginPayload) => Promise<LoginResult>;
  logout: () => Promise<void>;
  getAuthSession: () => Promise<AuthSession>;
  getRecoverSecurityQuestions: () => Promise<SecurityQuestionView[]>;
  recoverAccount: (payload: RecoverAccountPayload) => Promise<RecoverAccountResult>;
  changeOwnPassword: (payload: ChangeOwnPasswordPayload) => Promise<OperationResult>;
  getPermissionDefinitions: () => Promise<PermissionDefinition[]>;
  listUsers: () => Promise<UserSummary[]>;
  createUser: (payload: CreateUserPayload) => Promise<{ ok: boolean; message: string }>;
  updateUser: (payload: UpdateUserPayload) => Promise<{ ok: boolean; message: string }>;
  deleteUser: (payload: DeleteUserPayload) => Promise<{ ok: boolean; message: string }>;
  getShellState: () => Promise<AppShellState>;
  openMockBookset: (payload: OpenBooksetPayload) => Promise<AppShellState>;
  closeBookset: () => Promise<AppShellState>;
  getRecentBooksets: () => Promise<RecentBookset[]>;
}
