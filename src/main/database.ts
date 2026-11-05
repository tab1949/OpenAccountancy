import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import type {
  CreateUserPayload,
  InitSystemPayload,
  PermissionCode,
  PermissionDefinition,
  RecentBookset,
  RecoverAccountPayload,
  SecurityQuestionView,
  UpdateUserPayload,
  UserRole,
  UserSummary
} from "../common/contracts";

interface DbUserRow {
  user_id: number;
  user_name: string;
  display_name: string;
  role: UserRole;
  is_active: number;
  managed_by_user_id: number | null;
  created_at: string;
}

interface AuthenticatedUser {
  userId: number;
  userName: string;
  displayName: string;
  role: UserRole;
  permissions: PermissionCode[];
}

interface LoginOutcome {
  ok: boolean;
  message: string;
  remainingAttempts: number;
  user?: AuthenticatedUser;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { code: "create_supervisor", name: "新建主管账户", description: "创建账务主管账户" },
  { code: "update_supervisor", name: "修改主管账户", description: "修改账务主管账户" },
  { code: "delete_supervisor", name: "删除主管账户", description: "删除账务主管账户" },
  { code: "create_bookkeeper", name: "新建记账员账户", description: "创建记账员账户" },
  { code: "update_bookkeeper", name: "修改记账员账户", description: "修改记账员账户" },
  { code: "delete_bookkeeper", name: "删除记账员账户", description: "删除记账员账户" },
  { code: "create_voucher", name: "新建凭证", description: "新建凭证" },
  { code: "update_voucher", name: "修改凭证", description: "修改凭证" },
  { code: "query_voucher", name: "查询凭证", description: "查询凭证" },
  { code: "delete_voucher", name: "删除凭证", description: "删除凭证" }
];

export class DatabaseService {
  private db: Database.Database;

  public constructor(dbFilePath: string) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.db = new Database(dbFilePath);
    this.bootstrap();
  }

  private bootstrap(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        user_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'bookkeeper')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        managed_by_user_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (managed_by_user_id) REFERENCES users(user_id)
      );

      CREATE TABLE IF NOT EXISTS user_credentials (
        user_id INTEGER PRIMARY KEY,
        password_hash_sha512 TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_security_questions (
        question_id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
        question_text TEXT NOT NULL,
        answer_hash_sha512 TEXT NOT NULL,
        answer_salt TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (user_id, ordinal),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS permission_definitions (
        permission_code TEXT PRIMARY KEY,
        permission_name TEXT NOT NULL,
        description TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_permissions (
        user_id INTEGER NOT NULL,
        permission_code TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        PRIMARY KEY (user_id, permission_code),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (permission_code) REFERENCES permission_definitions(permission_code)
      );

      CREATE TABLE IF NOT EXISTS login_attempt_daily (
        user_id INTEGER NOT NULL,
        attempt_date TEXT NOT NULL,
        failed_count INTEGER NOT NULL DEFAULT 0,
        last_failed_at TEXT,
        PRIMARY KEY (user_id, attempt_date),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS recent_booksets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        period TEXT NOT NULL,
        status TEXT NOT NULL,
        last_opened_at TEXT NOT NULL
      );
    `);

    const nowIso = new Date().toISOString();
    this.db
      .prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)")
      .run("initialized_at", nowIso);

    this.db
      .prepare("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)")
      .run("db_storage_path", "");

    const insertPermissionStmt = this.db.prepare(
      "INSERT OR IGNORE INTO permission_definitions (permission_code, permission_name, description) VALUES (?, ?, ?)"
    );

    for (const permission of PERMISSION_DEFINITIONS) {
      insertPermissionStmt.run(permission.code, permission.name, permission.description);
    }
  }

  private now(): string {
    return new Date().toISOString();
  }

  private dateKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private hashWithSalt(raw: string, salt: string): string {
    return createHash("sha512").update(`${raw}::${salt}`).digest("hex");
  }

  private buildHash(raw: string): { hash: string; salt: string } {
    const salt = randomBytes(16).toString("hex");
    return {
      salt,
      hash: this.hashWithSalt(raw, salt)
    };
  }

  private getPermissionsByUserId(userId: number): PermissionCode[] {
    const rows = this.db
      .prepare(
        "SELECT permission_code FROM user_permissions WHERE user_id = ? ORDER BY permission_code"
      )
      .all(userId) as Array<{ permission_code: PermissionCode }>;

    return rows.map((item) => item.permission_code);
  }

  private getUserByUserName(userName: string): DbUserRow | undefined {
    return this.db
      .prepare(
        `
          SELECT user_id, user_name, display_name, role, is_active, managed_by_user_id, created_at
          FROM users
          WHERE user_name = ?
        `
      )
      .get(userName) as DbUserRow | undefined;
  }

  private getUserById(userId: number): DbUserRow | undefined {
    return this.db
      .prepare(
        `
          SELECT user_id, user_name, display_name, role, is_active, managed_by_user_id, created_at
          FROM users
          WHERE user_id = ?
        `
      )
      .get(userId) as DbUserRow | undefined;
  }

  public isInitialized(): boolean {
    const row = this.db
      .prepare("SELECT COUNT(1) AS count_value FROM users WHERE role = 'admin'")
      .get() as { count_value: number };
    return row.count_value > 0;
  }

  public getConfiguredStoragePath(): string {
    const row = this.db
      .prepare("SELECT value FROM app_meta WHERE key = 'db_storage_path'")
      .get() as { value: string } | undefined;
    return row?.value ?? "";
  }

  public initSystem(payload: InitSystemPayload): { ok: boolean; message: string } {
    if (this.isInitialized()) {
      return { ok: false, message: "系统已初始化，无需重复初始化。" };
    }

    if (payload.securityQuestions.length !== 3) {
      return { ok: false, message: "必须提供 3 个密保问题。" };
    }

    const now = this.now();
    const passwordDigest = this.buildHash(payload.adminPassword);

    const tx = this.db.transaction(() => {
      const insertUserStmt = this.db.prepare(
        `
          INSERT INTO users (user_name, display_name, role, is_active, managed_by_user_id, created_at, updated_at)
          VALUES (?, ?, 'admin', 1, NULL, ?, ?)
        `
      );

      const userResult = insertUserStmt.run(payload.adminUserName, payload.adminUserName, now, now);
      const adminUserId = Number(userResult.lastInsertRowid);

      this.db
        .prepare(
          `
            INSERT INTO user_credentials (user_id, password_hash_sha512, password_salt, updated_at)
            VALUES (?, ?, ?, ?)
          `
        )
        .run(adminUserId, passwordDigest.hash, passwordDigest.salt, now);

      const insertQuestionStmt = this.db.prepare(
        `
          INSERT INTO user_security_questions
          (user_id, ordinal, question_text, answer_hash_sha512, answer_salt, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      );

      payload.securityQuestions.forEach((item, index) => {
        const answerDigest = this.buildHash(item.answer);
        insertQuestionStmt.run(
          adminUserId,
          index + 1,
          item.question,
          answerDigest.hash,
          answerDigest.salt,
          now
        );
      });

      this.db
        .prepare("UPDATE app_meta SET value = ? WHERE key = 'db_storage_path'")
        .run(payload.dbStoragePath);
    });

    tx();
    return { ok: true, message: "系统初始化完成。" };
  }

  public getRecoverSecurityQuestions(): SecurityQuestionView[] {
    return this.db
      .prepare(
        `
          SELECT ordinal, question_text AS question
          FROM user_security_questions
          WHERE user_id = (
            SELECT user_id FROM users WHERE role = 'admin' ORDER BY user_id ASC LIMIT 1
          )
          ORDER BY ordinal
        `
      )
      .all() as SecurityQuestionView[];
  }

  public recoverAccount(payload: RecoverAccountPayload): {
    ok: boolean;
    message: string;
    userName?: string;
  } {
    if (payload.answers.length !== 3) {
      return { ok: false, message: "请填写 3 个密保问题答案。" };
    }

    const users = this.db
      .prepare("SELECT user_id, user_name FROM users WHERE is_active = 1 ORDER BY user_id")
      .all() as Array<{ user_id: number; user_name: string }>;

    for (const user of users) {
      const qs = this.db
        .prepare(
          `
            SELECT ordinal, answer_hash_sha512, answer_salt
            FROM user_security_questions
            WHERE user_id = ?
            ORDER BY ordinal
          `
        )
        .all(user.user_id) as Array<{
        ordinal: number;
        answer_hash_sha512: string;
        answer_salt: string;
      }>;

      if (qs.length !== 3) {
        continue;
      }

      const matched = qs.every((item, idx) => {
        const digest = this.hashWithSalt(payload.answers[idx] ?? "", item.answer_salt);
        return digest === item.answer_hash_sha512;
      });

      if (!matched) {
        continue;
      }

      const now = this.now();
      const pwdDigest = this.buildHash(payload.newPassword);
      this.db
        .prepare(
          `
            UPDATE user_credentials
            SET password_hash_sha512 = ?, password_salt = ?, updated_at = ?
            WHERE user_id = ?
          `
        )
        .run(pwdDigest.hash, pwdDigest.salt, now, user.user_id);

      return { ok: true, message: "密码重置成功。", userName: user.user_name };
    }

    return { ok: false, message: "密保答案不正确。" };
  }

  public changeOwnPassword(userId: number, oldPassword: string, newPassword: string): { ok: boolean; message: string } {
    const user = this.getUserById(userId);
    if (!user || user.is_active !== 1) {
      return { ok: false, message: "用户不存在或已禁用。" };
    }

    if (!oldPassword.trim() || !newPassword.trim()) {
      return { ok: false, message: "旧密码和新密码不能为空。" };
    }

    const credential = this.db
      .prepare(
        "SELECT password_hash_sha512, password_salt FROM user_credentials WHERE user_id = ?"
      )
      .get(userId) as { password_hash_sha512: string; password_salt: string } | undefined;

    if (!credential) {
      return { ok: false, message: "账户凭据异常。" };
    }

    const oldDigest = this.hashWithSalt(oldPassword, credential.password_salt);
    if (oldDigest !== credential.password_hash_sha512) {
      return { ok: false, message: "旧密码不正确。" };
    }

    const nextDigest = this.buildHash(newPassword);
    this.db
      .prepare(
        `
          UPDATE user_credentials
          SET password_hash_sha512 = ?, password_salt = ?, updated_at = ?
          WHERE user_id = ?
        `
      )
      .run(nextDigest.hash, nextDigest.salt, this.now(), userId);

    return { ok: true, message: "密码修改成功。" };
  }

  public login(userName: string, password: string): LoginOutcome {
    const user = this.getUserByUserName(userName);
    if (!user || user.is_active !== 1) {
      return { ok: false, message: "用户名或密码错误。", remainingAttempts: 0 };
    }

    const today = this.dateKey();
    const attemptRow = this.db
      .prepare(
        `
          SELECT failed_count
          FROM login_attempt_daily
          WHERE user_id = ? AND attempt_date = ?
        `
      )
      .get(user.user_id, today) as { failed_count: number } | undefined;

    const failedCount = attemptRow?.failed_count ?? 0;
    if (failedCount >= 5) {
      return { ok: false, message: "今日登录尝试已达上限。", remainingAttempts: 0 };
    }

    const credential = this.db
      .prepare(
        "SELECT password_hash_sha512, password_salt FROM user_credentials WHERE user_id = ?"
      )
      .get(user.user_id) as { password_hash_sha512: string; password_salt: string } | undefined;

    if (!credential) {
      return { ok: false, message: "账户凭据异常。", remainingAttempts: 0 };
    }

    const pwdDigest = this.hashWithSalt(password, credential.password_salt);
    if (pwdDigest !== credential.password_hash_sha512) {
      const nextFailedCount = failedCount + 1;
      this.db
        .prepare(
          `
            INSERT INTO login_attempt_daily (user_id, attempt_date, failed_count, last_failed_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, attempt_date)
            DO UPDATE SET failed_count = excluded.failed_count, last_failed_at = excluded.last_failed_at
          `
        )
        .run(user.user_id, today, nextFailedCount, this.now());

      return {
        ok: false,
        message: "用户名或密码错误。",
        remainingAttempts: Math.max(0, 5 - nextFailedCount)
      };
    }

    this.db
      .prepare(
        `
          INSERT INTO login_attempt_daily (user_id, attempt_date, failed_count, last_failed_at)
          VALUES (?, ?, 0, NULL)
          ON CONFLICT(user_id, attempt_date)
          DO UPDATE SET failed_count = 0, last_failed_at = NULL
        `
      )
      .run(user.user_id, today);

    const permissions = this.getPermissionsByUserId(user.user_id);

    return {
      ok: true,
      message: "登录成功。",
      remainingAttempts: 5,
      user: {
        userId: user.user_id,
        userName: user.user_name,
        displayName: user.display_name,
        role: user.role,
        permissions
      }
    };
  }

  public listPermissionDefinitions(): PermissionDefinition[] {
    return this.db
      .prepare(
        "SELECT permission_code AS code, permission_name AS name, description FROM permission_definitions ORDER BY permission_code"
      )
      .all() as PermissionDefinition[];
  }

  private canManageTarget(
    actor: AuthenticatedUser,
    permission: PermissionCode,
    targetRole: UserRole,
    targetManagedByUserId: number | null,
    action: "create" | "update" | "delete"
  ): boolean {
    if (actor.role === "admin") {
      return true;
    }

    if (!actor.permissions.includes(permission)) {
      return false;
    }

    if (actor.role === "supervisor") {
      if (targetRole !== "bookkeeper") {
        return false;
      }

      if (action === "create") {
        return true;
      }

      return targetManagedByUserId === actor.userId;
    }

    return false;
  }

  private ensurePermissionsExist(permissions: PermissionCode[]): void {
    if (permissions.length === 0) {
      return;
    }

    const rows = this.db
      .prepare(
        `
          SELECT permission_code
          FROM permission_definitions
          WHERE permission_code IN (${permissions.map(() => "?").join(",")})
        `
      )
      .all(...permissions) as Array<{ permission_code: PermissionCode }>;

    if (rows.length !== permissions.length) {
      throw new Error("包含未知权限编码。请刷新后重试。");
    }
  }

  public listUsers(): UserSummary[] {
    const users = this.db
      .prepare(
        `
          SELECT user_id, user_name, display_name, role, is_active, managed_by_user_id, created_at
          FROM users
          ORDER BY role, user_id
        `
      )
      .all() as DbUserRow[];

    return users.map((user) => ({
      userId: user.user_id,
      userName: user.user_name,
      displayName: user.display_name,
      role: user.role,
      isActive: user.is_active === 1,
      managedByUserId: user.managed_by_user_id,
      permissions: this.getPermissionsByUserId(user.user_id),
      createdAt: user.created_at
    }));
  }

  public createUser(actor: AuthenticatedUser, payload: CreateUserPayload): { ok: boolean; message: string } {
    const permission: PermissionCode = payload.role === "supervisor" ? "create_supervisor" : "create_bookkeeper";

    if (!this.canManageTarget(actor, permission, payload.role, actor.userId, "create")) {
      return { ok: false, message: "当前账号无权创建该类型用户。" };
    }

    try {
      this.ensurePermissionsExist(payload.permissions);
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }

    if (this.getUserByUserName(payload.userName)) {
      return { ok: false, message: "用户名已存在。" };
    }

    const now = this.now();
    const digest = this.buildHash(payload.password);

    const tx = this.db.transaction(() => {
      const result = this.db
        .prepare(
          `
            INSERT INTO users (user_name, display_name, role, is_active, managed_by_user_id, created_at, updated_at)
            VALUES (?, ?, ?, 1, ?, ?, ?)
          `
        )
        .run(
          payload.userName,
          payload.displayName || payload.userName,
          payload.role,
          actor.role === "supervisor" ? actor.userId : actor.userId,
          now,
          now
        );

      const newUserId = Number(result.lastInsertRowid);

      this.db
        .prepare(
          "INSERT INTO user_credentials (user_id, password_hash_sha512, password_salt, updated_at) VALUES (?, ?, ?, ?)"
        )
        .run(newUserId, digest.hash, digest.salt, now);

      const insertPermissionStmt = this.db.prepare(
        "INSERT INTO user_permissions (user_id, permission_code, granted_at) VALUES (?, ?, ?)"
      );

      payload.permissions.forEach((code) => {
        insertPermissionStmt.run(newUserId, code, now);
      });
    });

    tx();
    return { ok: true, message: "用户创建成功。" };
  }

  public updateUser(actor: AuthenticatedUser, payload: UpdateUserPayload): { ok: boolean; message: string } {
    const target = this.getUserById(payload.userId);
    if (!target) {
      return { ok: false, message: "目标用户不存在。" };
    }

    const permission: PermissionCode =
      target.role === "supervisor" ? "update_supervisor" : "update_bookkeeper";

    if (!this.canManageTarget(actor, permission, target.role, target.managed_by_user_id, "update")) {
      return { ok: false, message: "当前账号无权修改该用户。" };
    }

    if (payload.permissions) {
      try {
        this.ensurePermissionsExist(payload.permissions);
      } catch (error) {
        return { ok: false, message: (error as Error).message };
      }
    }

    const now = this.now();
    const tx = this.db.transaction(() => {
      if (payload.displayName !== undefined || payload.isActive !== undefined) {
        this.db
          .prepare(
            `
              UPDATE users
              SET display_name = ?, is_active = ?, updated_at = ?
              WHERE user_id = ?
            `
          )
          .run(
            payload.displayName ?? target.display_name,
            payload.isActive === undefined ? target.is_active : payload.isActive ? 1 : 0,
            now,
            payload.userId
          );
      }

      if (payload.password && payload.password.trim() !== "") {
        const digest = this.buildHash(payload.password);
        this.db
          .prepare(
            `
              UPDATE user_credentials
              SET password_hash_sha512 = ?, password_salt = ?, updated_at = ?
              WHERE user_id = ?
            `
          )
          .run(digest.hash, digest.salt, now, payload.userId);
      }

      if (payload.permissions) {
        this.db.prepare("DELETE FROM user_permissions WHERE user_id = ?").run(payload.userId);
        const insertPermissionStmt = this.db.prepare(
          "INSERT INTO user_permissions (user_id, permission_code, granted_at) VALUES (?, ?, ?)"
        );
        payload.permissions.forEach((code) => insertPermissionStmt.run(payload.userId, code, now));
      }
    });

    tx();
    return { ok: true, message: "用户信息更新成功。" };
  }

  public deleteUser(actor: AuthenticatedUser, userId: number): { ok: boolean; message: string } {
    const target = this.getUserById(userId);
    if (!target) {
      return { ok: false, message: "目标用户不存在。" };
    }

    if (target.role === "admin") {
      return { ok: false, message: "管理员账户不允许删除。" };
    }

    if (actor.userId === userId) {
      return { ok: false, message: "不能删除当前登录账户。" };
    }

    const permission: PermissionCode =
      target.role === "supervisor" ? "delete_supervisor" : "delete_bookkeeper";

    if (!this.canManageTarget(actor, permission, target.role, target.managed_by_user_id, "delete")) {
      return { ok: false, message: "当前账号无权删除该用户。" };
    }

    this.db.prepare("DELETE FROM users WHERE user_id = ?").run(userId);
    return { ok: true, message: "用户删除成功。" };
  }

  public addRecentBookset(name: string, period: string): void {
    this.db
      .prepare(
        `
          INSERT INTO recent_booksets (name, period, status, last_opened_at)
          VALUES (?, ?, 'open', ?)
        `
      )
      .run(name, period, new Date().toISOString());
  }

  public listRecentBooksets(limit = 10): RecentBookset[] {
    return this.db
      .prepare(
        `
          SELECT
            id,
            name,
            period,
            status,
            last_opened_at AS lastOpenedAt
          FROM recent_booksets
          ORDER BY datetime(last_opened_at) DESC
          LIMIT ?
        `
      )
      .all(limit) as RecentBookset[];
  }
}
