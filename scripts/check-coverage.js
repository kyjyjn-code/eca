// check-coverage.js — 리서치 기록 누락을 잡아 파이프라인을 멈춘다 (설계서 1.5단계)
// - 정본은 리서처가 쓰는 data/raw/YYYY-MM.coverage.json 이고,
//   사람이 읽는 data/raw/YYYY-MM.coverage.md 는 검증을 통과한 뒤 이 스크립트가 렌더한다.
//   두 파일을 각각 쓰게 하면 서로 어긋나는 실패 모드가 새로 생기고, 기계는 어느 쪽이 맞는지 모른다.
// - 게시 직전(9단계)이 아니라 리서치 직후(1.5단계)에 두는 이유는 실패 비용을 줄이기 위해서다.
//   여기서 멈추면 큐레이션 이후 단계를 헛돌지 않는다.
const fs = require('fs');
const path = require('path');
const { P, readJson, month, args, log } = require('./lib');

const 확인수준_열거 = ['요강원문', '공고요약', '연도불명'];
const 결과_열거 = ['수록', '배제', '시즌아님', '확인불가'];
const 탈락필터_열거 = ['주최성', '지원자격', '학교단위접수', '규모·역사', '상업성', '출처', '만료', '중복'];
const 포스터_열거 = ['있음', '없음'];

// 근거_원문 끝의 [확인수준: X] 를 뽑는다. 없으면 null.
function 확인수준(근거) {
  const t = String(근거 || '');
  const i = t.lastIndexOf('[확인수준:');
  if (i === -1) return null;
  const j = t.indexOf(']', i);
  if (j === -1) return null;
  return t.slice(i + '[확인수준:'.length, j).trim();
}

// targets 의 모든 항목이 coverage 에 처리 결과로 돌아왔는가.
// targets_id 로 집합 차집합만 계산한다 — 이름 유사도 매칭을 쓰지 않는 이유가 이것이다.
function 처리누락(targets, coverage) {
  const 처리됨 = new Set();
  for (const key of ['타깃처리', '쿼리로그', '순회소스']) {
    for (const r of coverage[key] || []) if (r && r.targets_id) 처리됨.add(r.targets_id);
  }
  const 필요 = [];
  const 담기 = (arr) => (arr || []).forEach((x) => { if (x && x.targets_id) 필요.push(x.targets_id); });
  담기(targets.A_미수록_씨앗); 담기(targets.B_시즌캘린더_당월); 담기(targets.C_순회소스);
  담기(targets.E_재확인_마감임박); 담기(targets.F_재확인_제외복구); 담기(targets.G_교사제보);
  담기((targets.D_쿼리세트 || {}).국문); 담기((targets.D_쿼리세트 || {}).영문);
  return 필요.filter((id) => !처리됨.has(id));
}

// 순수 검증 함수 — 테스트가 파일 없이 바로 부른다. 반환: 실패 메시지 배열(빈 배열이면 통과)
function validate(coverage, targets, raw) {
  const fails = [];
  if (!coverage) { fails.push('① coverage.json 이 없습니다.'); return fails; }

  const 누락 = 처리누락(targets || {}, coverage);
  if (누락.length) {
    fails.push('② targets 항목 ' + 누락.length + '건의 처리 결과가 없습니다: ' +
      누락.slice(0, 8).join(', ') + (누락.length > 8 ? ' 외 ' + (누락.length - 8) + '건' : ''));
  }

  const 수록수 = (coverage.타깃처리 || []).filter((r) => r && r.결과 === '수록').length;
  if (수록수 === 0 && !String(coverage.신규0건_사유 || '').trim()) {
    fails.push('③ 신규 수록이 0건인데 신규0건_사유가 비어 있습니다. 쿼리·소스별로 무엇을 확인했고 왜 후보가 없었는지 적으세요.');
  }

  const 무표기 = [], 잘못된값 = [];
  for (const it of raw || []) {
    const lv = 확인수준(it && it.근거_원문);
    if (lv === null) 무표기.push((it && it.id) ? it.id : '(id 없음)');
    else if (!확인수준_열거.includes(lv)) 잘못된값.push((it.id || '?') + ' → "' + lv + '"');
  }
  if (무표기.length) {
    fails.push('④ 근거_원문에 [확인수준: …] 표기가 없는 항목 ' + 무표기.length + '건: ' + 무표기.slice(0, 8).join(', '));
  }
  if (잘못된값.length) {
    fails.push('④ 확인수준 값이 열거 밖입니다 (' + 확인수준_열거.join('/') + '): ' + 잘못된값.slice(0, 5).join(', '));
  }

  // 빈 배열로는 "볼 게 없었다"와 "안 썼다"를 가릴 수 없어 요약 문자열을 필수로 둔다.
  if (!coverage.소스관찰 || !String(coverage.소스관찰.요약 || '').trim()) {
    fails.push('⑤ 소스관찰.요약이 비어 있습니다. 특이사항이 없으면 "특이사항 없음"이라고 적으세요 — 빈칸과 미작성을 구분해야 합니다.');
  }
  if (!coverage.시즌점검 || !String(coverage.시즌점검.요약 || '').trim()) {
    fails.push('⑤ 시즌점검.요약이 비어 있습니다. 특이사항이 없으면 "특이사항 없음"이라고 적으세요.');
  }

  const 위반 = [];
  for (const r of coverage.타깃처리 || []) {
    if (r.결과 && !결과_열거.includes(r.결과)) 위반.push('타깃처리 ' + r.targets_id + '.결과=' + r.결과);
    if (r.탈락필터 && !탈락필터_열거.includes(r.탈락필터)) 위반.push('타깃처리 ' + r.targets_id + '.탈락필터=' + r.탈락필터);
    if (r.포스터 && !포스터_열거.includes(r.포스터)) 위반.push('타깃처리 ' + r.targets_id + '.포스터=' + r.포스터);
  }
  for (const b of coverage.배제후보 || []) {
    if (b.탈락필터 && !탈락필터_열거.includes(b.탈락필터)) {
      위반.push('배제후보 ' + (b.활동명 || '?') + '.탈락필터=' + b.탈락필터);
    }
  }
  if (위반.length) {
    fails.push('⑥ 열거값 위반 ' + 위반.length + '건 (허용: 결과=' + 결과_열거.join('/') +
      ' · 탈락필터=' + 탈락필터_열거.join('/') + '): ' + 위반.slice(0, 5).join(', '));
  }
  return fails;
}

// 사람이 읽는 coverage.md 를 렌더한다. 지시서의 필수 섹션 ①~⑦ 구조 그대로.
// 배제-학교단위접수 같은 복합 표기는 여기서 되살린다(정본은 결과+탈락필터 두 칸으로 나뉘어 있다).
function renderMd(coverage) {
  const L = [];
  const 표기 = (r) => (r.결과 === '배제' && r.탈락필터) ? '배제-' + r.탈락필터 : (r.결과 || '');
  L.push('<!-- 이 파일은 ' + coverage.회차 + '.coverage.json 에서 자동 생성됩니다. 직접 고치지 마세요. -->');
  L.push('# ' + coverage.회차 + ' 리서치 커버리지');
  L.push('');
  L.push('- 기준일: ' + (coverage.기준일 || '-'));
  L.push('- 대상 목록: ' + (coverage.targets파일 || '-'));
  L.push('');
  L.push('## ① 타깃 처리 결과');
  L.push('');
  L.push('| 대상 | 이름 | 처리 결과 | 수록 id / 사유 | 포스터 |');
  L.push('|---|---|---|---|---|');
  for (const r of coverage.타깃처리 || []) {
    L.push('| ' + r.targets_id + ' | ' + (r.이름 || '') + ' | ' + 표기(r) + ' | ' +
      (r.id || r.사유 || '') + ' | ' + (r.포스터 || '') + ' |');
  }
  L.push('');
  L.push('## ② 쿼리 실행 로그');
  L.push('');
  L.push('| 쿼리 | 실행 | 후보 수 | 발견 출처 도메인 |');
  L.push('|---|---|---|---|');
  for (const q of coverage.쿼리로그 || []) {
    L.push('| ' + String(q.targets_id || '').replace('D:', '') + ' | ' + (q.실행 ? '○' : '×') +
      ' | ' + (q.후보수 || 0) + ' | ' + (q.출처도메인 || []).join(', ') + ' |');
  }
  L.push('');
  L.push('## ③ 순회 소스 방문 로그');
  L.push('');
  L.push('| 소스 | 방문 | 발견 수 |');
  L.push('|---|---|---|');
  for (const c of coverage.순회소스 || []) {
    L.push('| ' + String(c.targets_id || '').replace('C:', '') + ' | ' + (c.방문 ? '○' : '×') +
      ' | ' + (c.발견수 || 0) + ' |');
  }
  L.push('');
  L.push('## ④ 배제 후보 기록');
  L.push('');
  if (!(coverage.배제후보 || []).length) {
    L.push('_없음_');
  } else {
    L.push('| 활동명 | 탈락 필터 | 근거 | 출처 도메인 |');
    L.push('|---|---|---|---|');
    for (const b of coverage.배제후보) {
      L.push('| ' + (b.활동명 || '') + ' | ' + (b.탈락필터 || '') + ' | ' +
        (b.사유 || '') + ' | ' + (b.출처도메인 || '') + ' |');
    }
  }
  L.push('');
  L.push('## ⑤ 시즌 점검');
  L.push('');
  L.push((coverage.시즌점검 && coverage.시즌점검.요약) || '-');
  const 누락 = (coverage.시즌점검 && coverage.시즌점검.누락) || [];
  if (누락.length) { L.push(''); 누락.forEach((x) => L.push('- ' + x)); }
  L.push('');
  L.push('## ⑥ 신규 0건 사유');
  L.push('');
  L.push(String(coverage.신규0건_사유 || '').trim() || '_해당 없음_');
  L.push('');
  L.push('## ⑦ 소스 관찰 로그');
  L.push('');
  L.push((coverage.소스관찰 && coverage.소스관찰.요약) || '-');
  const 관찰항목 = (coverage.소스관찰 && coverage.소스관찰.항목) || [];
  if (관찰항목.length) {
    L.push('');
    L.push('| 구분 | 도메인 | 발견 활동 | 공신력 단서 |');
    L.push('|---|---|---|---|');
    for (const o of 관찰항목) {
      L.push('| ' + (o.구분 || '') + ' | ' + (o.도메인 || '') + ' | ' +
        (o.발견활동 || '') + ' | ' + (o.공신력단서 || '') + ' |');
    }
  }
  if (String(coverage.총평 || '').trim()) {
    L.push('');
    L.push('## 총평');
    L.push('');
    L.push(coverage.총평);
  }
  L.push('');
  return L.join('\n');
}

function main() {
  const 회차 = args().month || month();
  const covPath = path.join(P.raw, 회차 + '.coverage.json');
  const coverage = fs.existsSync(covPath) ? readJson(covPath, null) : null;
  const targets = readJson(path.join(P.raw, 회차 + '.targets.json'), {});
  const raw = readJson(path.join(P.raw, 회차 + '.json'), []);

  const fails = validate(coverage, targets, raw);
  if (fails.length) {
    log('기록 검증 실패 ' + fails.length + '건 — 회차 ' + 회차);
    fails.forEach((m) => log('  ✗ ' + m));
    log('리서치 기록을 보완한 뒤 다시 실행하세요. 기록이 없으면 무엇을 왜 안 했는지 아무도 알 수 없습니다.');
    process.exit(1);
  }
  fs.writeFileSync(path.join(P.raw, 회차 + '.coverage.md'), renderMd(coverage), 'utf8');
  log('기록 검증 통과 — 타깃 ' + (coverage.타깃처리 || []).length + '건 처리 · 쿼리 ' +
      (coverage.쿼리로그 || []).length + '건 · 배제후보 ' + (coverage.배제후보 || []).length +
      '건 → ' + 회차 + '.coverage.md 렌더');
}

if (require.main === module) main();
module.exports = {
  validate, renderMd, 확인수준, 처리누락,
  확인수준_열거, 결과_열거, 탈락필터_열거, 포스터_열거,
};
