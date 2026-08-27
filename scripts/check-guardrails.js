// 게시 직전 가드레일 검사 — CLAUDE.md 0장의 절대 원칙을 게시 산출물에서 확인한다.
// 빌드(build.js) 다음, PR 생성 전에 돌린다. 하나라도 걸리면 exit 1 로 파이프라인을 멈춘다.
//   node scripts/check-guardrails.js            엄격 (기본, CI용)
//   node scripts/check-guardrails.js --warn-only  보고만 하고 통과
const fs = require('fs');
const path = require('path');
const { P, readJson, log } = require('./lib');

// 1. 금칙 명칭 — 화면·코드·주석 어디에도 등장 불가. 단어 경계로 잡아 오탐을 막는다.
const FORBIDDEN = [
  { name: 'HSS', re: /\bHSS\b/i },
  { name: 'ATSS', re: /\bATSS\b/i },
  { name: 'Holyseas', re: /holyseas/i },
];

// 2. 결과 보장 표현. "합격·수상 보장이 아닌"처럼 부정하는 고지 문구는 제외한다.
// 한글은 완성형 한 글자가 한 코드포인트라 "아니"로는 "아닌"이 잡히지 않는다. 종성까지 나열한다.
const NOT_GUARANTEE = String.raw`(?!\s*(?:이|은|는)?\s*아[니닌님냐]|\s*하지\s*않|\s*되지\s*않|\s*없)`;
const GUARANTEE = [
  { name: '보장 표현', re: new RegExp(String.raw`(합격|수상|입상|점수)[^\n]{0,6}보장${NOT_GUARANTEE}`) },
  { name: '무조건', re: /무조건/ },
  { name: '100% 합격/수상', re: /100\s*%\s*(합격|수상|입상)/ },
  { name: '단정 표현', re: /(반드시|전원|확실히)\s*(합격|수상|입상)/ },
];

const fails = [];
const fail = (msg) => fails.push(msg);

function textOf(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    return null;
  }
}

function scan(file, rules, kind) {
  const t = textOf(file);
  if (t === null) return;
  const rel = path.relative(P.root, file).replace(/\\/g, '/');
  for (const r of rules) {
    const m = t.match(r.re);
    if (!m) continue;
    const at = t.indexOf(m[0]);
    const around = t.slice(Math.max(0, at - 40), at + m[0].length + 40).replace(/\s+/g, ' ');
    fail(`${kind}: ${rel} 에 "${r.name}" — …${around}…`);
  }
}

// 게시되는 산출물만 본다. 설계 문서·에이전트 지시문은 대상이 아니다.
const TARGETS = [
  path.join(P.docs, 'data.json'),
  path.join(P.docs, 'upcoming.json'),
  path.join(P.docs, 'index.html'),
  P.master,
  path.join(P.root, 'pr-body.md'),
];

for (const f of TARGETS) {
  scan(f, FORBIDDEN, '금칙 명칭');
  scan(f, GUARANTEE, '보장 표현');
}

// 3. 게시 제외된 항목이 사이트로 되살아나지 않았는지 (publisher.md 4번 점검을 코드로 옮긴 것)
const master = readJson(P.master, []);
const published = readJson(path.join(P.docs, 'data.json'), []);
const excluded = new Map(
  master.filter((x) => String(x.게시상태 || '').startsWith('제외')).map((x) => [x.id, x.게시상태])
);
for (const item of published) {
  if (excluded.has(item.id)) {
    fail(`제외 항목 누출: "${item.활동명}" (${item.id}) — 마스터 상태 "${excluded.get(item.id)}" 인데 docs/data.json 에 있음`);
  }
}

// 4. "참고용" 고지가 사이트에 노출되는지
const html = textOf(path.join(P.docs, 'index.html')) || '';
if (!/참고용/.test(html)) {
  fail('고지 누락: docs/index.html 에 "참고용" 표기가 없음 (별점·관련도는 참고용임을 밝혀야 함)');
}

// 5. 공고 예정 고지 (P3-1) — 검사 추가는 허용 원칙에 부합한다(완화·삭제가 아니다).
// 예정 정보는 씨앗 메타데이터의 추정이지 확인된 사실이 아니다.
// 어느 공개 산출물이든 "공고 예정" 표시가 있으면 두 고지가 함께 있어야 통과한다.
for (const f of TARGETS) {
  const t = textOf(f);
  if (t === null) continue;
  if (!/공고\s*예정/.test(t)) continue;
  const rel = path.relative(P.root, f).split(path.sep).join('/');
  if (!/전년도\s*기준/.test(t) || !/확정\s*전/.test(t)) {
    fail(`예정 고지 누락: ${rel} 에 "공고 예정" 표시가 있는데 "전년도 기준"·"확정 전" 고지가 없음`);
  }
}

// --- 결과 ---
const warnOnly = process.argv.includes('--warn-only');
log(`검사 대상 ${TARGETS.filter((f) => fs.existsSync(f)).length}개 파일 · 마스터 ${master.length}건 · 게시 ${published.length}건`);

if (fails.length === 0) {
  log('통과 — 금칙 명칭 없음, 보장 표현 없음, 제외 항목 누출 없음, 참고용·예정 고지 있음.');
  process.exit(0);
}

log(`실패 ${fails.length}건:`);
fails.forEach((m) => log('  ✗ ' + m));
if (warnOnly) {
  log('--warn-only 라 통과 처리합니다.');
  process.exit(0);
}
log('게시를 중단합니다. 위 항목을 고친 뒤 다시 실행하세요.');
process.exit(1);
