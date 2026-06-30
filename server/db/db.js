import pg from 'pg';

const { Pool } = pg;

let pool = null;

export async function initDB() {
  if (pool) return pool;

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Supabase (y la mayoría de proveedores gestionados de Postgres) requieren SSL.
    // Se desactiva la verificación del certificado porque Supabase usa certificados
    // gestionados que no siempre validan con la CA por defecto de Node.
    ssl: process.env.DATABASE_URL?.includes('sslmode=disable')
      ? false
      : { rejectUnauthorized: false },
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    // Evita que un error en una conexión idle del pool tire abajo el proceso entero.
    console.error('[DB POOL ERROR]', err.message);
  });

  // Solo testeamos la conexión. El schema ya vive en Supabase (supabase/migrations/).
  await pool.query('SELECT 1');
  console.log('✅ Conexión a PostgreSQL verificada');

  return pool;
}

function getPool() {
  if (!pool) throw new Error('DB not initialized. Call initDB() first.');
  return pool;
}

/**
 * Convierte queries escritas con params nombrados estilo SQLite (@nombre o $nombre)
 * al formato posicional de PostgreSQL ($1, $2...).
 *
 * - WHERE id = @id            -> WHERE id = $1   con values = [params.id]
 * - WHERE id = $id            -> idem (alias soportado por compatibilidad)
 * - Si `params` ya es un array, se asume que la query ya usa $1, $2... y se devuelve tal cual.
 * - Si un mismo nombre aparece varias veces en la query, reutiliza el mismo índice posicional.
 */
function convertParams(sql, params) {
  if (Array.isArray(params)) {
    return { text: sql, values: params };
  }

  if (!params || typeof params !== 'object' || Object.keys(params).length === 0) {
    return { text: sql, values: [] };
  }

  const indexByName = new Map();
  const values = [];

  // Une @nombre y $nombre (pero no $1, $2... que ya son posicionales de PG)
  const text = sql.replace(/[@$]([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, name) => {
    if (indexByName.has(name)) {
      return `$${indexByName.get(name)}`;
    }

    const rawVal = params[name];
    const val = rawVal === undefined ? null : rawVal;
    values.push(val);
    const idx = values.length;
    indexByName.set(name, idx);
    return `$${idx}`;
  });

  return { text, values };
}

export async function all(sql, params = {}) {
  const { text, values } = convertParams(sql, params);
  try {
    const result = await getPool().query(text, values);
    return result.rows;
  } catch (err) {
    console.error('SQL Error:', err.message, 'SQL:', sql.substring(0, 120));
    throw err;
  }
}

export async function get(sql, params = {}) {
  const rows = await all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function run(sql, params = {}) {
  const { text, values } = convertParams(sql, params);
  try {
    const result = await getPool().query(text, values);
    return { changes: result.rowCount, rows: result.rows, lastID: result.rows?.[0]?.id };
  } catch (err) {
    console.error('SQL Error:', err.message, 'SQL:', sql.substring(0, 120));
    throw err;
  }
}

/**
 * Ejecuta `fn` dentro de una transacción real usando un único client del pool.
 * `fn` recibe un objeto { all, get, run } que ejecuta las queries DENTRO de esa
 * misma transacción (BEGIN/COMMIT/ROLLBACK) — no usar los `all/get/run` globales
 * dentro de una transacción, porque usarían conexiones distintas del pool.
 *
 * Uso:
 *   await transaction(async (tx) => {
 *     await tx.run('UPDATE agencies SET plan = @plan WHERE id = @id', { plan, id })
 *     await tx.run('INSERT INTO activities (...) VALUES (...)', { ... })
 *   })
 */
export async function transaction(fn) {
  const client = await getPool().connect();
  const tx = {
    all: async (sql, params = {}) => {
      const { text, values } = convertParams(sql, params);
      const result = await client.query(text, values);
      return result.rows;
    },
    get: async (sql, params = {}) => {
      const rows = await tx.all(sql, params);
      return rows.length > 0 ? rows[0] : null;
    },
    run: async (sql, params = {}) => {
      const { text, values } = convertParams(sql, params);
      const result = await client.query(text, values);
      return { changes: result.rowCount, rows: result.rows, lastID: result.rows?.[0]?.id };
    },
  };

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[DB] Error en ROLLBACK:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

// saveDB ya no existe con PostgreSQL (no hay export/import de buffer en memoria).
// Se mantiene como no-op para no romper imports existentes (`import { saveDB } ...`).
export function saveDB() {}

export { initDB as default };
