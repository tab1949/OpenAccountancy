import type { AuthSession, PermissionCode, UserSummary } from "@common/contracts";

const navPermissionMap: Partial<Record<string, PermissionCode[]>> = {
  "/app/voucher/fill": ["create_voucher"],
  "/app/voucher/query": ["query_voucher"],
  "/app/voucher/review": ["query_voucher"],
  "/app/voucher/post": ["update_voucher"]
};

export function hasPermission(authSession: AuthSession, permission: PermissionCode): boolean {
  if (authSession.role === "admin") {
    return true;
  }

  return authSession.permissions.includes(permission);
}

export function canAccessPath(authSession: AuthSession, path: string): boolean {
  const requiredPermissions = navPermissionMap[path];
  if (!requiredPermissions || requiredPermissions.length === 0) {
    return true;
  }

  return requiredPermissions.some((permission) => hasPermission(authSession, permission));
}

export function canManageTargetUser(
  authSession: AuthSession,
  target: Pick<UserSummary, "role" | "managedByUserId">,
  action: "update" | "delete"
): boolean {
  if (authSession.role === "admin") {
    return true;
  }

  if (authSession.role !== "supervisor") {
    return false;
  }

  if (target.role !== "bookkeeper") {
    return false;
  }

  const neededPermission: PermissionCode = action === "update" ? "update_bookkeeper" : "delete_bookkeeper";
  if (!hasPermission(authSession, neededPermission)) {
    return false;
  }

  return target.managedByUserId === authSession.userId;
}
