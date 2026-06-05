/**
 * SQLite 数据库适配器
 *
 * 替代 @neondatabase/serverless，使用本地 SQLite 文件数据库。
 * 兼容项目中现有的 tagged template 和 .query() 两种调用方式。
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// ===== 单例 DB 实例 =====
let dbInstance: Database.Database | null = null;

function getOrCreateDb(): Database.Database {
  if (dbInstance) return dbInstance;

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "app.db");
  dbInstance = new Database(dbPath);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.pragma("foreign_keys = ON");

  initTables(dbInstance);
  return dbInstance;
}

// ===== 自动建表 =====
function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      external_code TEXT DEFAULT '',
      receiver_store TEXT DEFAULT '',
      receiver_name TEXT DEFAULT '',
      receiver_phone TEXT DEFAULT '',
      receiver_address TEXT DEFAULT '',
      sku_code TEXT NOT NULL DEFAULT '',
      sku_name TEXT NOT NULL DEFAULT '',
      sku_qty REAL NOT NULL DEFAULT 0,
      sku_spec TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      batch_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS parse_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      file_types TEXT DEFAULT '["xlsx"]',
      config TEXT NOT NULL DEFAULT '{}',
      is_ai_generated INTEGER DEFAULT 0,
      used_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // 索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_parse_rules_rule_id ON parse_rules(rule_id)
  `);
}

// ===== SQL 方言转换（PostgreSQL → SQLite） =====
function translateSQL(sql: string): string {
  return (
    sql
      // ILIKE → LIKE (SQLite LIKE 对 ASCII 默认大小写不敏感)
      .replace(/\bILIKE\b/gi, "LIKE")
      // ::type 类型转换（PostgreSQL 方言）
      .replace(/::\w+(?:\[\])?/g, "")
      // NOW() → datetime('now')
      .replace(/\bNOW\(\)/gi, "datetime('now')")
      // BOOLEAN → INTEGER
      .replace(/\bBOOLEAN\b/gi, "INTEGER")
      // JSONB → TEXT
      .replace(/\bJSONB\b/gi, "TEXT")
      // TEXT[] → TEXT
      .replace(/\bTEXT\[\]\b/gi, "TEXT")
      // SERIAL → INTEGER
      .replace(/\bSERIAL\b/gi, "INTEGER")
      // = ANY(?) → IN (?)
      .replace(/=\s*ANY\s*\(/gi, "IN (")
      // $N 参数占位符 → ? (PostgreSQL 风格 → SQLite 风格)
      .replace(/\$\d+/g, "?")
  );
}

// ===== SQLite 查询接口 =====

interface SqlQueryFn {
  (strings: TemplateStringsArray, ...values: unknown[]): unknown[];
  query: (sql: string, values?: unknown[]) => unknown[];
}

/**
 * 创建兼容 neon 接口的 SQLite 查询函数
 *
 * 支持两种调用方式:
 * 1. sql\`SELECT * FROM table WHERE id = ${id}\`  (tagged template)
 * 2. sql.query("SELECT * FROM table WHERE id = ?", [id])  (.query 方法)
 */
function createSqlInterface(): SqlQueryFn {
  const db = getOrCreateDb();

  // 1. Tagged template 调用方式
  const sqlFn = function (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): unknown[] {
    // 构建 SQL
    let sql = strings[0];
    const flatValues: unknown[] = [];

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (Array.isArray(val)) {
        // 数组展开为多个占位符（用于 IN 子句）
        const placeholders = val.map(() => "?").join(",");
        sql += placeholders;
        flatValues.push(...val);
      } else {
        sql += "?";
        flatValues.push(val);
      }
      sql += strings[i + 1];
    }

    return executeQuery(db, sql, flatValues);
  };

  // 2. .query() 方法调用方式
  (sqlFn as unknown as { query: (sql: string, values?: unknown[]) => unknown[] }).query = (
    sql: string,
    values: unknown[] = []
  ): unknown[] => {
    return executeQuery(db, sql, values);
  };

  return sqlFn as unknown as SqlQueryFn;
}

/**
 * 执行 SQL 查询，返回行数组
 * - SELECT 返回行数组
 * - INSERT/UPDATE/DELETE 返回 { changes }
 */
function executeQuery(
  db: Database.Database,
  sql: string,
  values: unknown[]
): unknown[] {
  const translatedSql = translateSQL(sql);
  const upper = translatedSql.trim().toUpperCase();

  // 对于 INSERT ... RETURNING，需要特殊处理（SQLite 不支持 RETURNING 子句）
  if (upper.startsWith("INSERT") && translatedSql.toUpperCase().includes("RETURNING")) {
    // 去掉 RETURNING 部分，改用更简单的做法
    const insertSql = translatedSql.replace(/\s+RETURNING\s+\w+/i, "");
    const stmt = db.prepare(insertSql);
    const info = stmt.run(...values);
    // 返回最后插入的 ID
    return [{ id: Number(info.lastInsertRowid) }];
  }

  const stmt = db.prepare(translatedSql);

  if (
    upper.startsWith("SELECT") ||
    upper.startsWith("WITH") ||
    upper.startsWith("PRAGMA")
  ) {
    const rows = stmt.all(...values) as Record<string, unknown>[];
    return rows;
  } else {
    const info = stmt.run(...values);
    return [{ changes: info.changes }];
  }
}

// ===== 导出 =====

export function getDb(): SqlQueryFn {
  return createSqlInterface();
}

export function safeGetDb(): SqlQueryFn | null {
  try {
    return createSqlInterface();
  } catch {
    return null;
  }
}

// 进程退出时关闭 DB
process.on("exit", () => {
  dbInstance?.close();
});
