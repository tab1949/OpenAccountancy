import type { AppShellState, AuthSession, RecentBookset } from "@common/contracts";

export interface ShellContextState {
  shellState: AppShellState;
  recentBooksets: RecentBookset[];
  refreshShellData: () => Promise<void>;
  authSession: AuthSession;
}
