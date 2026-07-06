/**
 * Test runner: arranca el servidor en puerto temporal, ejecuta los tests, lo cierra.
 * Uso: node tests/run-tests.mjs
 */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverDir = join(__dirname, '..');

// Encontrar puerto libre
async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/api/health`);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

const port = await getFreePort();
console.log(`[Test Runner] Puerto asignado: ${port}`);

// Arrancar servidor con PORT sobreescrito (sin que dotenv lo pise)
// Estrategia: pasar PORT como variable de entorno antes de que dotenv cargue.
// dotenv/config por defecto no sobreescribe si la variable ya existe en process.env.
// PERO `import 'dotenv/config'` SÍ sobreescribe. Workaround: usamos --env-file
// de Node 20+ que tiene menor precedencia que process.env.

const serverEnv = {
  ...process.env,
  PORT: String(port),
  NODE_ENV: 'test',
};

// Sobrescribir el .env en memoria escribiendo una copia temporal
const { readFileSync, writeFileSync, unlinkSync } = await import('node:fs');
const envPath = join(serverDir, '.env');
const envTestPath = join(serverDir, '.env.test');
let originalEnv = '';
try { originalEnv = readFileSync(envPath, 'utf8'); } catch {}

// Escribir .env.test con PORT correcto
const newEnv = originalEnv
  .split('\n')
  .filter(l => !l.startsWith('PORT='))
  .concat(`PORT=${port}`)
  .join('\n');
writeFileSync(envTestPath, newEnv);

// Arrancar servidor apuntando al .env.test
const srv = spawn('node', ['--env-file=.env.test', 'index.js'], {
  cwd: serverDir,
  env: serverEnv,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let srvLog = '';
srv.stdout.on('data', d => { srvLog += d; process.stdout.write(d); });
srv.stderr.on('data', d => { srvLog += d; });

srv.on('exit', (code, sig) => {
  if (code !== 0 && !sig) {
    console.error('[Test Runner] Servidor terminó inesperadamente:', code);
  }
});

const ready = await waitForServer(port);
if (!ready) {
  console.error('[Test Runner] Servidor no arrancó. Log:\n', srvLog);
  srv.kill();
  try { unlinkSync(envTestPath); } catch {}
  process.exit(1);
}

console.log(`[Test Runner] Servidor listo en :${port} — ejecutando tests...\n`);

// Ejecutar tests
const tests = spawn('node', ['tests/api.test.js'], {
  cwd: serverDir,
  env: { ...serverEnv, BASE_URL: `http://localhost:${port}` },
  stdio: 'inherit',
});

tests.on('exit', (code) => {
  srv.kill('SIGTERM');
  try { unlinkSync(envTestPath); } catch {}
  process.exit(code ?? 0);
});
