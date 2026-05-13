import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DB_DIR, 'crm.db');

let db = null;

export async function initDB() {
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.run('PRAGMA foreign_keys = ON;');
  db.run(schema);

  saveDB();
  return db;
}

function saveDB() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

export function all(sql, params = {}) {
  if (!db) throw new Error('DB not initialized. Call initDB() first.');
  const nparams = normalizeParams(params);
  const stmt = db.prepare(sql);
  const paramKeys = Object.keys(nparams);
  if (paramKeys.length > 0) {
    stmt.bind(nparams);
  }
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

export function get(sql, params = {}) {
  const rows = all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function normalizeParams(params) {
  if (Array.isArray(params)) return params;
  if (!params || typeof params !== 'object') return params;
  const normalized = {};
  for (const [key, val] of Object.entries(params)) {
    if (key.startsWith('@') || key.startsWith('$') || key.startsWith(':')) {
      normalized[key] = val;
    } else {
      normalized['@' + key] = val;
    }
  }
  return normalized;
}

export function run(sql, params = {}) {
  if (!db) throw new Error('DB not initialized. Call initDB() first.');
  try {
    const nparams = normalizeParams(params);
    db.run(sql, nparams);
    saveDB();
    return { changes: db.getRowsModified() };
  } catch (err) {
    console.error('SQL Error:', err.message, 'SQL:', sql.substring(0, 80));
    throw err;
  }
}

export function transaction(fn) {
  return function(...args) {
    try {
      db.run('BEGIN TRANSACTION');
      const result = fn(...args);
      db.run('COMMIT');
      saveDB();
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      throw err;
    }
  };
}

export { initDB as default, saveDB };
