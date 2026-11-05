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

export interface BooksetSummary {
  id: number;
  name: string;
  fiscalPeriod: string;
  filePath: string;
  status: "open" | "closed";
  createdAt: string;
  lastOpenedAt: string | null;
}

export interface CreateBooksetPayload {
  name: string;
  bookCode: string;
  accountingStandard: "ASBE_2006" | "SBE_2011";
  fiscalYear: number;
  fiscalPeriodNo: number;
  baseCurrency: string;
}

export interface FiscalPeriodSetting {
  year: number;
  periodNo: number;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  used: boolean;
}

export interface BooksetSettings {
  identity: {
    bookCode: string;
    companyName: string;
    contact: string;
    address: string;
    taxId: string;
    bankAccounts: string[];
    accountingStandard: "ASBE_2006" | "SBE_2011";
    fiscalYear: number;
    fiscalPeriodNo: number;
    baseCurrency: string;
  };
  periods: {
    fiscalYearStartDate: string;
    periodDays: number;
    periodsPerYear: number;
    automaticNewYear: boolean;
    years: number[];
    items: FiscalPeriodSetting[];
  };
  accountStructure: {
    levels: number;
    codeLengths: number[];
    firstMonthClosed: boolean;
  };
  businessRules: {
    checkCashDeficit: boolean;
  };
  closingAndLedger: {
    requireReviewedBeforeClose: boolean;
    sameBalanceDirection: boolean;
  };
  backup: {
    path: string;
    frequencyDays: number;
    time: string;
    lastBackupAt: string;
  };
}

export interface SaveBooksetSettingsPayload extends Omit<BooksetSettings, "periods"> {
  periods: Omit<BooksetSettings["periods"], "years" | "items">;
}

export interface UpdateFiscalPeriodPayload {
  year: number;
  periodNo: number;
  startDate: string;
  endDate: string;
}

export interface OpenBooksetByIdPayload {
  booksetId: number;
}

export interface ImportBooksetPackagePayload {
  packagePath: string;
  targetDirectory: string;
}

export interface ExportBooksetPackagePayload {
  booksetId: number;
  destinationPath: string;
}

export interface BackupBooksetPayload {
  destinationPath: string;
}

export interface RestoreBooksetBackupPayload {
  booksetId: number;
  packagePath: string;
}

export type VoucherStatus = "draft" | "posted";

export interface VoucherLineInput {
  lineNo: number;
  summary: string;
  accountCode: string;
  accountName: string;
  detail: string;
  debit: number;
  credit: number;
}

export interface VoucherAttachmentInput {
  fileName: string;
  filePath: string;
}

export interface VoucherInput {
  voucherId?: number;
  voucherDate: string;
  lines: VoucherLineInput[];
  attachments: VoucherAttachmentInput[];
}

export interface VoucherRecord {
  voucherId: number;
  voucherDate: string;
  voucherNo: number;
  status: VoucherStatus;
  amount: number;
  lines: VoucherLineInput[];
  attachments: VoucherAttachmentInput[];
  periodClosed: boolean;
  isCurrentPeriod: boolean;
  isPastPeriod: boolean;
}

export interface VoucherSearchPayload {
  dateFrom?: string;
  dateTo?: string;
  month?: string;
  voucherNoFrom?: number;
  voucherNoTo?: number;
  keyword?: string;
  status?: VoucherStatus;
}

export interface VoucherAccountOption {
  accountCode: string;
  accountName: string;
  allowsManualDetail: boolean;
  requiresAttachment: boolean;
  detailOptions: string[];
  detailSuggestions: string[];
}

export interface BookkeepingPayload {
  voucherIds: number[];
}

export interface BookkeepingResult extends OperationResult {
  affectedCount: number;
}

export interface VoucherMutationResult extends OperationResult {
  voucherId?: number;
}

export interface BooksetOperationResult {
  ok: boolean;
  message: string;
  bookset?: BooksetSummary;
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
  listBooksets: () => Promise<BooksetSummary[]>;
  createBookset: (payload: CreateBooksetPayload) => Promise<BooksetOperationResult>;
  getBooksetSettings: () => Promise<BooksetSettings | null>;
  saveBooksetSettings: (payload: SaveBooksetSettingsPayload) => Promise<OperationResult>;
  updateFiscalPeriod: (payload: UpdateFiscalPeriodPayload) => Promise<OperationResult>;
  addFiscalYear: (year: number) => Promise<OperationResult>;
  closeFiscalPeriod: (year: number, periodNo: number) => Promise<OperationResult>;
  reinitializeBookset: () => Promise<OperationResult>;
  openBookset: (payload: OpenBooksetByIdPayload) => Promise<BooksetOperationResult>;
  closeBookset: () => Promise<BooksetOperationResult>;
  importBooksetPackage: (payload: ImportBooksetPackagePayload) => Promise<BooksetOperationResult>;
  exportBooksetPackage: (payload: ExportBooksetPackagePayload) => Promise<BooksetOperationResult>;
  backupBookset: (payload: BackupBooksetPayload) => Promise<BooksetOperationResult>;
  restoreBooksetBackup: (payload: RestoreBooksetBackupPayload) => Promise<BooksetOperationResult>;
  pickDirectory: () => Promise<string | null>;
  pickPackageFile: () => Promise<string | null>;
  pickPackageSavePath: (defaultFileName: string) => Promise<string | null>;
  getRecentBooksets: () => Promise<RecentBookset[]>;
  listVoucherAccounts: (keyword?: string) => Promise<VoucherAccountOption[]>;
  getVoucherDetailSuggestions: (accountCode: string) => Promise<string[]>;
  pickVoucherAttachments: () => Promise<VoucherAttachmentInput[]>;
  searchVouchers: (payload: VoucherSearchPayload) => Promise<VoucherRecord[]>;
  getVoucher: (voucherId: number) => Promise<VoucherRecord | null>;
  saveVoucher: (payload: VoucherInput, confirmUnpost?: boolean) => Promise<VoucherMutationResult>;
  deleteVoucher: (voucherId: number, confirmUnpost?: boolean) => Promise<OperationResult>;
  postVouchers: (payload: BookkeepingPayload) => Promise<BookkeepingResult>;
}
