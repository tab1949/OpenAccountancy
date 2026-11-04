import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { RecentBookset } from "../common/contracts";

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
