// update-review-queue.js — 기관 접수 검토 큐를 쌓는다 (설계서 1.6단계)
// - 학교 단위 접수만 받는 대회는 검정고시·대안경로 학생에게 구조적 장벽이다.
//   배제로 끝내지 않고 "기관 접수로 열 수 있는가"라는 기회로 추적한다.
// - 배제 목록은 "현재 지원 불가"라는 사실을, 이 큐는 그 기회를 각각 추적한다. 둘은 다른 것이다.
// - 리서처의 쓰기 권한(data/raw/ 한정)을 넓히지 않기 위해 큐 파일 갱신은 이 스크립트가 맡는다.
const fs = require('fs');
const path = require('path');
const { P, readJson, ensureDir, month, today, args, log } = require('./lib');

const 큐파일 = () => path.join(P.data, 'review', '기관접수검토.md');
const 헤더 = ['활동명', '주최', '접수 규정 요지', '공식 URL', '등재일', '검토 상태'];

// coverage.json 에서 학교단위접수로 걸러진 항목을 뽑는다.
// 두 곳을 본다 — targets 에 있던 씨앗(타깃처리)과, 쿼리로 발굴돼 targets 에 없던 후보(배제후보).
// 후자를 빠뜨리면 새로 발견한 학교접수 대회가 조용히 새어 나간다.
function 추출(coverage) {
  if (!coverage) return [];
  const out = [];
  for (const r of coverage.타깃처리 || []) {
    if (r && r.결과 === '배제' && r.탈락필터 === '학교단위접수') {
      out.push({ 활동명: r.이름 || '', 주최: r.주최 || '', 규정: r.사유 || '', url: r.url || '' });
    }
  }
  for (const b of coverage.배제후보 || []) {
    if (b && b.탈락필터 === '학교단위접수') {
      out.push({ 활동명: b.활동명 || '', 주최: b.주최 || '', 규정: b.접수규정_원문 || b.사유 || '', url: b.url || '' });
    }
  }
  return out.filter((x) => x.활동명);
}

// 기존 표에서 이미 등재된 활동명을 읽는다(중복 제거용).
function 기존활동명(md) {
  const names = [];
  for (const line of String(md || '').split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|') || t.startsWith('|---') || t.startsWith('| ---')) continue;
    const cells = t.split('|').map((c) => c.trim());
    const first = cells[1];
    if (!first || first === 헤더[0]) continue;
    names.push(first.replace(/^`|`$/g, ''));
  }
  return names;
}

function 초기표() {
  return [
    '# 기관 접수 검토 큐',
    '',
    '학교 단위 접수만 받아 개인 지원이 불가한 대회를 모은다.',
    '**배제 목록(`data/sources.json`)이 "현재 지원 불가"라는 사실을 적는 곳이라면, 여기는',
    '"기관 접수로 열 수 있는가"라는 기회를 추적하는 곳이다.** 둘은 다른 것이며 함께 등재한다.',
    '',
    '이 표는 `scripts/update-review-queue.js` 가 매월 커버리지 기록에서 자동으로 쌓는다.',
    '검토 상태만 사람이 손으로 갱신한다.',
    '',
    '| ' + 헤더.join(' | ') + ' |',
    '|' + 헤더.map(() => '---').join('|') + '|',
    '',
  ].join('\n');
}

function 행(x, 등재일) {
  const 셀 = [x.활동명, x.주최 || '-', (x.규정 || '-').replace(/\|/g, '/'), x.url || '-', 등재일, '미검토'];
  return '| ' + 셀.join(' | ') + ' |';
}

function main() {
  const 회차 = args().month || month();
  const 등재일 = today();
  const coverage = readJson(path.join(P.raw, 회차 + '.coverage.json'), null);
  const 후보 = 추출(coverage);

  const f = 큐파일();
  ensureDir(path.dirname(f));
  let md = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : 초기표();

  const 이미 = 기존활동명(md);
  const 신규 = [];
  for (const x of 후보) {
    if (이미.includes(x.활동명) || 신규.some((y) => y.활동명 === x.활동명)) continue;
    신규.push(x);
  }

  if (신규.length) {
    // 표 마지막 행 뒤에 붙인다. 표 아래 설명이 있어도 표를 깨지 않도록 마지막 표 행을 찾는다.
    const lines = md.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (lines[i].trim().startsWith('|')) last = i;
    const 추가 = 신규.map((x) => 행(x, 등재일));
    lines.splice(last + 1, 0, ...추가);
    md = lines.join('\n');
  }

  fs.writeFileSync(f, md, 'utf8');
  log('기관 접수 검토 큐 — 회차 ' + 회차 + ' / 후보 ' + 후보.length + '건 중 신규 등재 ' + 신규.length + '건' +
      (coverage ? '' : ' (coverage.json 없음 — 큐 파일만 확인)'));
  신규.forEach((x) => log('  + ' + x.활동명));
}

if (require.main === module) main();
module.exports = { 추출, 기존활동명, 초기표, 행, 헤더 };
