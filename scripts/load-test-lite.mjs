#!/usr/bin/env node

/**
 * Load test leve para validar latência (avg/p95) com múltiplos usuários.
 *
 * Uso (PowerShell):
 * $env:LOADTEST_API_BASE="https://seu-backend.onrender.com"
 * $env:LOADTEST_USERS_JSON='[{"email":"admin@x.com","password":"123456"},{"email":"consultor@x.com","password":"123456"}]'
 * $env:LOADTEST_CONCURRENCY="15"
 * $env:LOADTEST_DURATION_SEC="60"
 * npm run load:test:lite
 */

const API_BASE = (process.env.LOADTEST_API_BASE || "http://localhost:4000").replace(/\/$/, "");
const CONCURRENCY = Number(process.env.LOADTEST_CONCURRENCY || 15);
const DURATION_SEC = Number(process.env.LOADTEST_DURATION_SEC || 60);
const THINK_MS_MIN = Number(process.env.LOADTEST_THINK_MS_MIN || 50);
const THINK_MS_MAX = Number(process.env.LOADTEST_THINK_MS_MAX || 250);

function parseUsers() {
  const raw = process.env.LOADTEST_USERS_JSON;
  if (!raw) {
    throw new Error("Defina LOADTEST_USERS_JSON com ao menos um usuário.");
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("LOADTEST_USERS_JSON inválido: informe um array com usuários.");
  }
  for (const u of parsed) {
    if (!u?.email || !u?.password) {
      throw new Error("Cada usuário em LOADTEST_USERS_JSON precisa de email e password.");
    }
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const idx = Math.min(sortedValues.length - 1, Math.ceil((p / 100) * sortedValues.length) - 1);
  return sortedValues[idx];
}

async function loginUser(user) {
  const started = performance.now();
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const elapsed = performance.now() - started;
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.token) {
    throw new Error(
      `Falha no login (${user.email}) status=${res.status} body=${JSON.stringify(payload).slice(0, 300)}`,
    );
  }
  return { token: payload.token, loginMs: elapsed, user: payload.user || null };
}

function createStats() {
  return {
    total: 0,
    ok: 0,
    fail: 0,
    latencies: [],
    byRoute: new Map(),
    statusCounts: new Map(),
  };
}

function pushMetric(stats, routeKey, status, ms, ok) {
  stats.total += 1;
  if (ok) stats.ok += 1;
  else stats.fail += 1;
  stats.latencies.push(ms);
  stats.statusCounts.set(status, (stats.statusCounts.get(status) || 0) + 1);

  if (!stats.byRoute.has(routeKey)) {
    stats.byRoute.set(routeKey, { total: 0, ok: 0, fail: 0, latencies: [] });
  }
  const route = stats.byRoute.get(routeKey);
  route.total += 1;
  if (ok) route.ok += 1;
  else route.fail += 1;
  route.latencies.push(ms);
}

function normalizeProjects(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => p && typeof p.id === "string");
}

async function callApi(token, path) {
  const started = performance.now();
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    const elapsed = performance.now() - started;
    return { ok: false, status: "NETWORK_ERROR", ms: elapsed, data: null, error: String(err) };
  }

  const elapsed = performance.now() - started;
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: String(res.status), ms: elapsed, data, error: null };
}

async function workerLoop(workerId, session, endAt, stats) {
  let projectsCache = [];
  const nowIso = new Date();
  const endDate = nowIso.toISOString().slice(0, 10);
  const startDate = new Date(nowIso.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  while (Date.now() < endAt) {
    const scenarios = [
      { key: "GET /api/auth/me", path: "/api/auth/me" },
      { key: "GET /api/projects", path: "/api/projects" },
      { key: "GET /api/tickets", path: "/api/tickets" },
      { key: "GET /api/time-entries", path: `/api/time-entries?start=${startDate}&end=${endDate}` },
    ];

    if (projectsCache.length > 0) {
      const project = projectsCache[randomBetween(0, projectsCache.length - 1)];
      scenarios.push({
        key: "GET /api/tickets?projectId",
        path: `/api/tickets?projectId=${project.id}`,
      });
      scenarios.push({
        key: "GET /api/time-entries?projectId",
        path: `/api/time-entries?projectId=${project.id}&view=project`,
      });
    }

    const scenario = scenarios[randomBetween(0, scenarios.length - 1)];
    const result = await callApi(session.token, scenario.path);
    pushMetric(stats, scenario.key, result.status, result.ms, result.ok);

    if (scenario.key === "GET /api/projects" && result.ok) {
      projectsCache = normalizeProjects(result.data);
    }

    await sleep(randomBetween(THINK_MS_MIN, THINK_MS_MAX));
  }

  return { workerId };
}

function summarize(stats, totalSec) {
  const allLat = [...stats.latencies].sort((a, b) => a - b);
  const avg = allLat.length ? allLat.reduce((a, b) => a + b, 0) / allLat.length : 0;
  const p95 = percentile(allLat, 95);
  const rps = stats.total / totalSec;
  const errorRate = stats.total ? (stats.fail / stats.total) * 100 : 0;

  console.log("\n=== Resultado Geral ===");
  console.log(`Total requests: ${stats.total}`);
  console.log(`Sucesso: ${stats.ok} | Falha: ${stats.fail} (${errorRate.toFixed(2)}%)`);
  console.log(`RPS médio: ${rps.toFixed(2)}`);
  console.log(`Latência média: ${avg.toFixed(1)}ms`);
  console.log(`Latência p95: ${p95.toFixed(1)}ms`);

  console.log("\n=== Por rota ===");
  for (const [routeKey, route] of stats.byRoute.entries()) {
    const lat = [...route.latencies].sort((a, b) => a - b);
    const routeAvg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0;
    const routeP95 = percentile(lat, 95);
    const routeErr = route.total ? (route.fail / route.total) * 100 : 0;
    console.log(
      `${routeKey.padEnd(32)} | total=${String(route.total).padStart(4)} | fail=${routeErr.toFixed(1)}% | avg=${routeAvg.toFixed(1)}ms | p95=${routeP95.toFixed(1)}ms`,
    );
  }

  console.log("\n=== HTTP status ===");
  for (const [status, count] of stats.statusCounts.entries()) {
    console.log(`${status}: ${count}`);
  }
}

async function main() {
  const users = parseUsers();
  console.log("Iniciando teste leve...");
  console.log(`API: ${API_BASE}`);
  console.log(`Concorrência: ${CONCURRENCY}`);
  console.log(`Duração: ${DURATION_SEC}s`);
  console.log(`Usuários informados: ${users.length}`);

  const sessions = [];
  for (let i = 0; i < CONCURRENCY; i += 1) {
    const u = users[i % users.length];
    const session = await loginUser(u);
    sessions.push(session);
  }
  const avgLoginMs = sessions.reduce((sum, s) => sum + s.loginMs, 0) / sessions.length;
  console.log(`Sessões autenticadas: ${sessions.length} (login médio ${avgLoginMs.toFixed(1)}ms)`);

  const stats = createStats();
  const endAt = Date.now() + DURATION_SEC * 1000;

  await Promise.all(
    sessions.map((session, idx) => workerLoop(idx + 1, session, endAt, stats)),
  );

  summarize(stats, DURATION_SEC);
}

main().catch((err) => {
  console.error("Falha no load test:", err.message || err);
  process.exit(1);
});
