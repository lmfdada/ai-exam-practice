/**
 * 数据库适配器 — 支持 SQLite（本地）和 PostgreSQL（Neon/Supabase/Vercel）
 *
 * 自动检测：
 * - 存在 DATABASE_URL → PostgreSQL 模式（@neondatabase/serverless）
 * - 不存在 DATABASE_URL → SQLite 模式（better-sqlite3）
 *
 * 两种模式暴露相同的接口：
 *   sql`SELECT * FROM table WHERE id = ${id}`  (tagged template)
 *   sql.query("SELECT ...", [values])            (.query 方法)
 *
 * 返回值均为 Promise<unknown[]>。
 */

// ===== 公共接口 =====

interface DbQueryFn {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  query: (sql: string, values?: unknown[]) => Promise<unknown[]>;
}

// ===== 实例缓存 =====
let dbInstance: DbQueryFn | null = null;

// ===== PostgreSQL 建表 SQL =====

const PG_CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  external_code TEXT DEFAULT '',
  receiver_store TEXT DEFAULT '',
  receiver_name TEXT DEFAULT '',
  receiver_phone TEXT DEFAULT '',
  receiver_address TEXT DEFAULT '',
  sku_code TEXT NOT NULL DEFAULT '',
  sku_name TEXT NOT NULL DEFAULT '',
  sku_qty REAL NOT NULL DEFAULT 0,
  sku_spec TEXT DEFAULT '',
  temperature_layer TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  batch_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parse_rules (
  id SERIAL PRIMARY KEY,
  rule_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_types TEXT DEFAULT '["xlsx"]',
  config TEXT NOT NULL DEFAULT '{}',
  is_ai_generated INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_parse_rules_rule_id ON parse_rules(rule_id);
`;

// ===== SQLite 建表 SQL =====

const SQLITE_CREATE_TABLES_SQL = `
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
  temperature_layer TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  batch_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

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
);

CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_code);
CREATE INDEX IF NOT EXISTS idx_orders_batch_id ON orders(batch_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_parse_rules_rule_id ON parse_rules(rule_id);
`;

// ===== MODE 1: PostgreSQL（Neon / Supabase / Vercel Postgres） =====

function createPgInterface(): DbQueryFn {
  const { neon } = require("@neondatabase/serverless") as typeof import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);

  // 初始化建表 — 逐条执行（Neon 不支持多语句单次执行）
  const statements = PG_CREATE_TABLES_SQL
    .split(";")
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    sql.query(stmt + ";", []).catch((err: any) => {
      // IF NOT EXISTS 表已存在时忽略
      if (!err.message?.includes("already exists")) {
        console.warn("[db] PostgreSQL 建表:", err.message);
      }
    });
  }

  // 自动迁移：添加 temperature_layer 列（兼容已有数据库）
  sql.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS temperature_layer TEXT DEFAULT ''`, []).catch((err: any) => {
    if (!err.message?.includes("already exists")) {
      console.warn("[db] 迁移 temperature_layer:", err.message);
    }
  });

  const queryFn = async (
    strings: TemplateStringsArray | string,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    // 兼容 sql.query() 调用
    if (typeof strings === "string") {
      const result = await sql.query(strings, values as any[]);
      return result as unknown as unknown[];
    }

    // Tagged template 调用 — 直接用 Neon 的 tagged template
    // 将参数转换为 $N 格式（Neon 的 tagged template 自动处理）
    const result = await sql(strings, ...values);
    return result as unknown as unknown[];
  };

  (queryFn as any).query = async (
    sqlStr: string,
    values: unknown[] = []
  ): Promise<unknown[]> => {
    // 使用 Neon 的 query 方法处理参数化查询
    const result = await sql.query(sqlStr, values as any[]);
    return result as unknown as unknown[];
  };

  return queryFn as unknown as DbQueryFn;
}

// ===== MODE 2: SQLite（better-sqlite3） =====

function createSQLiteInterface(): DbQueryFn {
  const Database = require("better-sqlite3") as typeof import("better-sqlite3");
  const path = require("path") as typeof import("path");
  const fs = require("fs") as typeof import("fs");

  const isVercel = process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
  const dbDir = isVercel ? "/tmp/data" : path.join(process.cwd(), "data");

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const dbPath = path.join(dbDir, "app.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // 初始化建表
  db.exec(SQLITE_CREATE_TABLES_SQL);

  // 自动迁移：添加 temperature_layer 列（兼容已有数据库）
  try { db.exec(`ALTER TABLE orders ADD COLUMN temperature_layer TEXT DEFAULT ''`); } catch {}

  /** PostgreSQL → SQLite 方言转换 */
  function translateSQL(sql: string): string {
    return sql
      .replace(/\bILIKE\b/gi, "LIKE")
      .replace(/::\w+(?:\[\])?/g, "")
      .replace(/\bNOW\(\)/gi, "datetime('now')")
      .replace(/\bBOOLEAN\b/gi, "INTEGER")
      .replace(/\bJSONB\b/gi, "TEXT")
      .replace(/\bTEXT\[\]\b/gi, "TEXT")
      .replace(/\bSERIAL\b/gi, "INTEGER")
      .replace(/=\s*ANY\s*\(/gi, "IN (")
      .replace(/\$\d+/g, "?");
  }

  function executeQuery(sql: string, values: unknown[]): unknown[] {
    const translated = translateSQL(sql);
    const upper = translated.trim().toUpperCase();

    if (upper.startsWith("INSERT") && translated.toUpperCase().includes("RETURNING")) {
      const insertSql = translated.replace(/\s+RETURNING\s+\w+/i, "");
      const stmt = db.prepare(insertSql);
      const info = stmt.run(...values);
      return [{ id: Number(info.lastInsertRowid) }];
    }

    const stmt = db.prepare(translated);

    if (upper.startsWith("SELECT") || upper.startsWith("WITH") || upper.startsWith("PRAGMA")) {
      return stmt.all(...values) as Record<string, unknown>[];
    } else {
      const info = stmt.run(...values);
      return [{ changes: info.changes }];
    }
  }

  const queryFn = async (
    strings: TemplateStringsArray | string,
    ...values: unknown[]
  ): Promise<unknown[]> => {
    // 兼容 sql.query() 调用
    if (typeof strings === "string") {
      return executeQuery(strings, values);
    }

    // Tagged template 调用
    let sql = strings[0];
    const flatValues: unknown[] = [];

    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      if (Array.isArray(val)) {
        const placeholders = val.map(() => "?").join(",");
        sql += placeholders;
        flatValues.push(...val);
      } else {
        sql += "?";
        flatValues.push(val);
      }
      sql += strings[i + 1];
    }

    return executeQuery(sql, flatValues);
  };

  (queryFn as any).query = async (
    sqlStr: string,
    values: unknown[] = []
  ): Promise<unknown[]> => {
    return executeQuery(sqlStr, values);
  };

  // 进程退出时关闭 DB
  process.on("exit", () => db.close());

  return queryFn as unknown as DbQueryFn;
}

// ===== 对外接口 =====

function getOrCreateDb(): DbQueryFn {
  if (dbInstance) return dbInstance;

  const usePostgres = !!process.env.DATABASE_URL;

  if (usePostgres) {
    console.log("[db] 使用 PostgreSQL 模式 (DATABASE_URL 已配置)");
    dbInstance = createPgInterface();
  } else {
    console.log("[db] 使用 SQLite 模式 (未配置 DATABASE_URL)");
    dbInstance = createSQLiteInterface();
  }

  return dbInstance;
}

/** 获取数据库实例（数据库不存在时会自动创建 + 建表） */
export function getDb(): DbQueryFn {
  return getOrCreateDb();
}

/** 安全的获取方式，失败返回 null（不会抛出异常） */
export function safeGetDb(): DbQueryFn | null {
  try {
    return getOrCreateDb();
  } catch {
    return null;
  }
}
