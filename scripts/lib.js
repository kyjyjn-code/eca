// 공용 유틸리티 — 스크립트 5종이 공유하는 경로/입출력/날짜 헬퍼
const fs = require('fs');
const path = require('path');

// 저장소 루트. 테스트가 픽스처 폴더로 갈아끼울 수 있게 SDC_ROOT 를 허용한다
// (SDC_TODAY·SDC_MONTH 와 같은 관례). 실운영에서 잘못 켜지면 아래 경고로 즉시 보인다.
const ROOT = path.resolve(process.env.SDC_ROOT || path.join(__dirname, '..'));
if (process.env.SDC_ROOT) console.log('[lib.js] 경고: SDC_ROOT 로 루트가 재지정됨 —', ROOT);
const P = {
  root: ROOT,
  data: path.join(ROOT, 'data'),
  master: path.join(ROOT, 'data', 'master.json'),
  raw: path.join(ROOT, 'data', 'raw'),
  curated: path.join(ROOT, 'data', 'curated'),
  reports: path.join(ROOT, 'data', 'reports'),
  records: path.join(ROOT, 'records'),
  docs: path.join(ROOT, 'docs'),
  posters: path.join(ROOT, 'docs', 'posters'),
  archive: path.join(ROOT, 'docs', 'archive'),
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// 오늘 날짜 (YYYY-MM-DD). 테스트/재현용으로 SDC_TODAY 환경변수로 고정 가능.
function today() {
  if (process.env.SDC_TODAY) return process.env.SDC_TODAY;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 이번 달 (YYYY-MM). SDC_MONTH 환경변수로 고정 가능.
function month() {
  if (process.env.SDC_MONTH) return process.env.SDC_MONTH;
  return today().slice(0, 7);
}

// 명령행 인자 파싱: --key value / --flag
function args() {
  const out = {};
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const key = a[i].slice(2);
      const next = a[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

// 마감일이 기준일(today)보다 과거인가. null/빈값은 false(만료 아님).
function isExpired(deadline, ref) {
  if (!deadline) return false;
  return String(deadline) < (ref || today());
}

// 날짜 차이(일). a,b는 YYYY-MM-DD. b-a.
function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z');
  const db = new Date(b + 'T00:00:00Z');
  return Math.round((db - da) / 86400000);
}

const log = (...m) => console.log('[' + path.basename(process.argv[1] || 'script') + ']', ...m);

module.exports = { P, ensureDir, readJson, writeJson, today, month, args, isExpired, daysBetween, log };
