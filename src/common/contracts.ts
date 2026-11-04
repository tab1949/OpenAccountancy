export interface RecentBookset {
  id: number;
  name: string;
  period: string;
  status: "open" | "closed";
  lastOpenedAt: string;
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
}

export interface OpenAccountancyApi {
  ping: () => Promise<string>;
  getSystemEntryState: () => Promise<SystemEntryState>;
  getShellState: () => Promise<AppShellState>;
  openMockBookset: (payload: OpenBooksetPayload) => Promise<AppShellState>;
  closeBookset: () => Promise<AppShellState>;
  getRecentBooksets: () => Promise<RecentBookset[]>;
}
