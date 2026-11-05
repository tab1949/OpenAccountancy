import { Navigate } from "react-router-dom";
import type { SystemEntryState } from "@common/contracts";

export function EntryRoute({ mode }: { mode: SystemEntryState["mode"] }): JSX.Element {
  const target = mode === "init" ? "/auth/init" : "/auth/login";
  return <Navigate to={target} replace />;
}
