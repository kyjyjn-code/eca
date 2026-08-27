// compute-kpi.js — 자기진화의 계측부 (설계서 7.5단계)
// - 숫자는 이 스크립트가 재고, 회고 에이전트는 해석만 한다.
//   에이전트가 자기 성적표를 스스로 매기지 못하게 하는 것이 원칙이다.
// - data/retro/kpi.json 에 당월 레코드를 upsert 한다(append 가 아니다 — 소급 실행을
//   여러 번 돌려도 중복이 쌓이지 않아야 한다).
// - 산출할 수 없는 지표는 0 이 아니라 null 로 둔다. "0건"과 "못 쟀다"는 다르다.
const fs = require('fs');
const path = require('path');
const { P, readJson, writeJson, ensureDir, month, today, args, log } = require('./lib');
const { loadSeeds, isMissing } = require('./seeds');

const 대분류 = ['과학·공학·수학생명·AI', '국제·리더십·사회참여', '글쓰기·논문·인문사회', '스포츠·문화·봉사', '환경·예술·공익'];
const 학년대 = ['초', '중', '고'];

// 대분류 × 학년대 × 유형(선발형/상시형/미상) 매트릭스.
// 선발성 칸이 아직 없는 회차에서는 전부 '미상'으로 떨어진다 — 스키마 도입 전에도 깨지지 않는다.
// 모든 칸을 채우는 것이 목표는 아니다. 학생 유형별 주요 칸이 비지 않는 것이 목표다.
function 커버리지매트릭스(게시목록) {
  const mx = {};
  for (const 분야 of 대분류) {
    mx[분야] = {};
    for (const g of 학년대) mx[분야][g] = { 선발형: 0, 상시형: 0, 미상: 0 };
  }
  for (const it of 게시목록) {
    const 분야 = mx[it.분야];
    if (!분야) continue;
    const 유형 = (it.선발성 === true) ? '선발형' : (it.선발성 === false) ? '상시형' : '미상';
    for (const g of (it.대상_학년 || [])) if (분야[g]) 분야[g][유형] += 1;
  }
  return mx;
}

function 빈칸수(mx) {
  let n = 0;
  for (const 분야 of Object.keys(mx)) {
    for (const g of Object.keys(mx[분야])) {
      const c = mx[분야][g];
      if ((c.선발형 + c.상시형 + c.미상) === 0) n += 1;
    }
  }
  return n;
}

function 분포(목록, 키) {
  const out = {};
  for (const x of 목록) {
    const v = typeof 키 === 'function' ? 키(x) : x[키];
    const k = (v === undefined || v === null || v === '') ? '미상' : String(v);
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

// 근거_원문 끝의 [확인수준: X]
function 확인수준(근거) {
  const t = String(근거 || '');
  const i = t.lastIndexOf('[확인수준:');
  if (i === -1) return null;
  const j = t.indexOf(']', i);
  return j === -1 ? null : t.slice(i + '[확인수준:'.length, j).trim();
}

function 집계(입력) {
  const { 회차, 기준일, master, raw, coverage, targets, links, merge, seeds } = 입력;
  const 게시 = master.filter((x) => typeof x.게시상태 === 'string' && x.게시상태.startsWith('게시'));
  const masterIds = master.map((x) => x.id);

  // 신규 발굴 수 — 수집월이 당월인 마스터 항목.
  // "당월 raw 대 전월 master 대조"는 불가능하다: 마스터는 제자리 변경돼 전월 상태가 남지 않는다.
  const 신규발굴 = master.filter((x) => x.수집월 === 회차).length;

  // 씨앗 커버리지 — 탐색범주를 뺀 씨앗 중 수록된 비율
  let 씨앗커버리지 = null;
  if (seeds && seeds.length) {
    const 대상 = seeds.filter((s) => s.유형 !== '탐색범주' && s.canonical_slug);
    const 수록 = 대상.filter((s) => !isMissing(s, masterIds, 회차)).length;
    씨앗커버리지 = { 수록, 전체: 대상.length, 비율: 대상.length ? Number((수록 / 대상.length).toFixed(3)) : null };
  }

  // 타깃 처리율
  let 타깃처리율 = null;
  if (coverage && targets) {
    const 필요 = ['A_미수록_씨앗', 'B_시즌캘린더_당월', 'C_순회소스', 'E_재확인_마감임박', 'F_재확인_제외복구', 'G_교사제보']
      .reduce((n, k) => n + ((targets[k] || []).length), 0)
      + (((targets.D_쿼리세트 || {}).국문 || []).length) + (((targets.D_쿼리세트 || {}).영문 || []).length);
    const 처리 = (coverage.타깃처리 || []).length + (coverage.쿼리로그 || []).length + (coverage.순회소스 || []).length;
    타깃처리율 = { 처리, 필요, 비율: 필요 ? Number((처리 / 필요).toFixed(3)) : null };
  }

  // 근거·확인수준 충족률 + 분포
  let 확인수준충족 = null, 확인수준분포 = null;
  if (raw && raw.length) {
    const 표기된 = raw.filter((x) => 확인수준(x.근거_원문) !== null);
    확인수준충족 = { 표기: 표기된.length, 전체: raw.length, 비율: Number((표기된.length / raw.length).toFixed(3)) };
    확인수준분포 = 분포(raw, (x) => 확인수준(x.근거_원문));
  }

  // 링크
  const 링크 = links ? {
    검사수: links.검사수 ?? null,
    제외: (links.제외 || []).length,
    복구: (links.복구후보 || []).length,
    확인필요: (links.확인필요 || []).length,
    생존율: links.검사수 ? Number(((links.검사수 - (links.제외 || []).length) / links.검사수).toFixed(3)) : null,
  } : null;

  // 별점 분포
  const 별점분포 = 분포(게시, 'SDC_적합도');
  const 최대밴드 = Object.values(별점분포).length ? Math.max(...Object.values(별점분포)) : 0;
  const 최대밴드비중 = 게시.length ? Number((최대밴드 / 게시.length).toFixed(3)) : null;

  // 선발형 : 상시형 (선발성 칸이 없으면 null)
  const 선발성있음 = 게시.filter((x) => typeof x.선발성 === 'boolean');
  const 선발형비율 = 선발성있음.length
    ? { 선발형: 선발성있음.filter((x) => x.선발성).length, 상시형: 선발성있음.filter((x) => !x.선발성).length, 판정됨: 선발성있음.length, 전체: 게시.length }
    : null;

  // coverage 유래 지표
  let 필터별배제 = null, 쿼리수확 = null, 도메인수확 = null;
  if (coverage) {
    const 배제 = [
      ...(coverage.배제후보 || []).map((b) => b.탈락필터),
      ...(coverage.타깃처리 || []).filter((r) => r.결과 === '배제').map((r) => r.탈락필터),
    ].filter(Boolean);
    필터별배제 = 분포(배제.map((f) => ({ f })), 'f');

    const 로그 = coverage.쿼리로그 || [];
    const 수확 = 로그.map((q) => ({ 쿼리: String(q.targets_id || '').replace('D:', ''), 후보수: q.후보수 || 0 }));
    쿼리수확 = {
      상위: 수확.slice().sort((a, b) => b.후보수 - a.후보수).slice(0, 5),
      영건_쿼리: 수확.filter((q) => !q.후보수).map((q) => q.쿼리),
      실행: 로그.filter((q) => q.실행).length,
      전체: 로그.length,
    };

    const dom = {};
    for (const q of 로그) for (const d of (q.출처도메인 || [])) dom[d] = (dom[d] || 0) + 1;
    for (const b of (coverage.배제후보 || [])) if (b.출처도메인) dom[b.출처도메인] = (dom[b.출처도메인] || 0) + 1;
    도메인수확 = dom;
  }

  const mx = 커버리지매트릭스(게시);

  return {
    회차,
    산출일: 기준일,
    게시건수: 게시.length,
    마스터건수: master.length,
    신규발굴, 씨앗커버리지, 타깃처리율,
    확인수준충족, 확인수준분포,
    링크: 링크,
    별점분포, 최대밴드비중,
    선발형비율,
    미국입시_높음_비중: 게시.length ? Number((게시.filter((x) => x.미국입시_관련도 === '높음').length / 게시.length).toFixed(3)) : null,
    필터별배제, 쿼리수확, 도메인수확,
    커버리지_매트릭스: mx,
    매트릭스_빈칸수: 빈칸수(mx),
    병합: merge ? { 신규: (merge.신규 || []).length, 갱신: (merge.갱신 || []).length, 제거: (merge.제거_마감경과 || []).length } : null,
    coverage_있음: !!coverage,
  };
}

function main() {
  const 회차 = args().month || month();
  const 기준일 = today();

  const master = readJson(P.master, []);
  const raw = readJson(path.join(P.raw, 회차 + '.json'), null);
  const coverage = readJson(path.join(P.raw, 회차 + '.coverage.json'), null);
  const targets = readJson(path.join(P.raw, 회차 + '.targets.json'), null);
  const links = readJson(path.join(P.reports, 'links-' + 회차 + '.json'), null);
  const merge = readJson(path.join(P.reports, 'merge-' + 회차 + '.json'), null);
  const sources = readJson(path.join(P.data, 'sources.json'), {});
  const seeds = loadSeeds(sources);

  const rec = 집계({ 회차, 기준일, master, raw, coverage, targets, links, merge, seeds });

  const kpiPath = path.join(P.data, 'retro', 'kpi.json');
  ensureDir(path.dirname(kpiPath));
  const all = readJson(kpiPath, []);
  const i = all.findIndex((x) => x && x.회차 === 회차);
  if (i === -1) all.push(rec); else all[i] = rec;
  all.sort((a, b) => String(a.회차).localeCompare(String(b.회차)));
  writeJson(kpiPath, all);

  const 못잼 = ['확인수준충족', '타깃처리율', '링크', '선발형비율'].filter((k) => rec[k] === null);
  log('계측 완료 — 회차 ' + 회차 + ' / 게시 ' + rec.게시건수 + '건 · 신규발굴 ' + rec.신규발굴 +
      '건 · 씨앗 커버리지 ' + (rec.씨앗커버리지 ? rec.씨앗커버리지.수록 + '/' + rec.씨앗커버리지.전체 : '-') +
      ' · 매트릭스 빈칸 ' + rec.매트릭스_빈칸수 + '/' + (대분류.length * 학년대.length) +
      (못잼.length ? ' · 산출불가(null) ' + 못잼.join(',') : ''));
  if (rec.신규발굴 === 0) log('  경고: 신규 발굴 0건 — 회고에서 원인을 다룰 것');
}

if (require.main === module) main();
module.exports = { 집계, 커버리지매트릭스, 빈칸수, 확인수준, 대분류, 학년대 };
