// score.js — 별점(SDC_적합도) 계산 (설계서 4장 A안)
// - 네 축이 전부 데이터 칸이 되면서 별점은 순수 함수가 됐다. 숫자는 스크립트가 잰다.
//   큐레이터가 매긴 값은 자문이고, 계산값과 다르면 병합 리포트에 남아 사람이 본다.
// - 파이프라인을 세우지 않는다. 불일치는 실패가 아니라 보고 대상이다
//   (큐레이터의 산수 실수 하나로 그 달 회차가 죽으면 안 된다).
//
// CLI
//   node scripts/score.js --check                     마스터 전수 대조, 불일치 표만 출력
//   node scripts/score.js --export-pending            판정용 작업 파일 생성(사실 칸만 담는다)
//   node scripts/score.js --apply --from <파일>        판정 결과를 마스터에 반영 + 별점 재계산
const fs = require('fs');
const path = require('path');
const { P, readJson, writeJson, ensureDir, today, args, log } = require('./lib');

const 무료급 = ['무료', '소액'];

// 축별 점수. 값이 없으면 null 을 돌려 "못 쟀다"를 0 과 구분한다.
function 축점수(item) {
  const 관련도 = item.미국입시_관련도;
  const 입시 = 관련도 === '높음' ? 2 : 관련도 === '보통' ? 1 : 관련도 === '낮음' ? 0 : null;
  const 선발 = typeof item.선발성 === 'boolean' ? (item.선발성 ? 1 : 0) : null;
  const 국제 = typeof item.국제성 === 'boolean' ? (item.국제성 ? 1 : 0) : null;
  const 비용 = item.비용_구분 ? (무료급.includes(item.비용_구분) ? 1 : 0) : null;
  return { 미국입시: 입시, 선발성: 선발, 국제성: 국제, 비용: 비용 };
}

// 별점 계산. 미판정 축이 하나라도 있으면 점수를 내지 않는다(null).
// 이것이 "스키마만 있고 데이터가 없는 상태에서 별점이 일괄 하락"하는 사고를 막는 안전판이다.
function score(item) {
  const 축 = 축점수(item);
  const 미판정축 = Object.keys(축).filter((k) => 축[k] === null);
  if (미판정축.length) return { 점수: null, 축, 미판정축 };
  const 합 = 축.미국입시 + 축.선발성 + 축.국제성 + 축.비용;
  return { 점수: Math.max(1, 합), 축, 미판정축: [] };
}

// 마스터 한 항목에 별점을 적용한다. 반환: { 변경됨, 이전, 이후, 축, 미판정축 }
function apply(item) {
  const r = score(item);
  const 이전 = item.SDC_적합도;
  if (r.점수 === null) return { 변경됨: false, 이전, 이후: 이전, 축: r.축, 미판정축: r.미판정축 };
  item.SDC_적합도 = r.점수;
  return { 변경됨: 이전 !== r.점수, 이전, 이후: r.점수, 축: r.축, 미판정축: [] };
}

// 마스터 전수 대조 — 저장하지 않는다
function check(master) {
  const 불일치 = [], 미판정 = [];
  for (const it of master) {
    const r = score(it);
    if (r.점수 === null) { 미판정.push({ id: it.id, 활동명: it.활동명, 미판정축: r.미판정축 }); continue; }
    if (it.SDC_적합도 !== r.점수) {
      불일치.push({ id: it.id, 활동명: it.활동명, 기록값: it.SDC_적합도, 계산값: r.점수, 축: r.축 });
    }
  }
  return { 불일치, 미판정 };
}

// 판정용 작업 파일 — 사실 칸만 담는다.
// 판정 근거를 사실 칸 밖에서 끌어오지 못하게 파일 구조가 강제한다.
// (웹 접근 금지도 자동으로 지켜진다 — 이 파일 안에 웹이 없다)
const 사실칸 = ['id', '활동명', '분야', '주최', '대상_원문', '지원자격_확인',
  '신청기간_원문', '근거_원문', '비용_원문', '비용_구분', '핵심내용', '미국입시_관련도', 'SDC_적합도'];

function exportPending(master) {
  return master.map((it) => {
    const o = {};
    for (const f of 사실칸) if (it[f] !== undefined) o[f] = it[f];
    o.선발성 = (typeof it.선발성 === 'boolean') ? it.선발성 : null;
    o.국제성 = (typeof it.국제성 === 'boolean') ? it.국제성 : null;
    o.판정근거 = '';
    o.플래그 = [];
    return o;
  });
}

function main() {
  const a = args();
  const master = readJson(P.master, []);

  if (a.check) {
    const { 불일치, 미판정 } = check(master);
    log('별점 대조 — 마스터 ' + master.length + '건 / 불일치 ' + 불일치.length + '건 · 미판정 ' + 미판정.length + '건');
    불일치.forEach((x) => log('  ≠ ' + x.활동명.slice(0, 34) + ' : 기록 ' + x.기록값 + ' → 계산 ' + x.계산값 +
      ' [입시' + x.축.미국입시 + '+선발' + x.축.선발성 + '+국제' + x.축.국제성 + '+비용' + x.축.비용 + ']'));
    미판정.forEach((x) => log('  ? ' + x.활동명.slice(0, 34) + ' : ' + x.미판정축.join(',') + ' 미판정'));
    return;
  }

  if (a['export-pending']) {
    const out = path.join(P.data, 'review', '별점재산정-' + today() + '.json');
    ensureDir(path.dirname(out));
    writeJson(out, exportPending(master));
    log('판정용 작업 파일 생성 — ' + path.relative(P.root, out).replace(/\\/g, '/') + ' (' + master.length + '건)');
    log('  선발성·국제성 두 칸과 판정근거를 채운 뒤 --apply --from 으로 반영하세요.');
    return;
  }

  if (a.apply) {
    const from = a.from;
    if (from) {
      const 판정 = readJson(from, []);
      const byId = new Map(판정.map((x) => [x.id, x]));
      for (const it of master) {
        const j = byId.get(it.id);
        if (!j) continue;
        if (typeof j.선발성 === 'boolean') it.선발성 = j.선발성;
        if (typeof j.국제성 === 'boolean') it.국제성 = j.국제성;
        if (j.판정근거) it._판정근거 = j.판정근거;
        if (Array.isArray(j.플래그) && j.플래그.length) it._재검증필요 = j.플래그;
      }
    }
    const 표 = [];
    for (const it of master) {
      const r = apply(it);
      표.push({ id: it.id, 활동명: it.활동명, 이전: r.이전, 이후: r.이후, 변경됨: r.변경됨, 축: r.축, 미판정축: r.미판정축 });
      if (r.변경됨) it.갱신일 = today();
    }
    writeJson(P.master, master);
    const 리포트 = path.join(P.reports, 'score-' + today() + '.json');
    ensureDir(path.dirname(리포트));
    writeJson(리포트, { 기준일: today(), 항목: 표 });

    const 바뀜 = 표.filter((x) => x.변경됨);
    const 보존 = 표.filter((x) => x.미판정축.length);
    log('별점 재산정 — ' + master.length + '건 중 변경 ' + 바뀜.length + '건 · 미판정 보존 ' + 보존.length + '건');
    바뀜.forEach((x) => log('  ★' + x.이전 + ' → ★' + x.이후 + '  ' + x.활동명.slice(0, 38)));
    보존.forEach((x) => log('  보존 ' + x.활동명.slice(0, 38) + ' (' + x.미판정축.join(',') + ' 미판정)'));
    return;
  }

  log('사용법: --check | --export-pending | --apply [--from <파일>]');
}

if (require.main === module) main();
module.exports = { score, 축점수, apply, check, exportPending, 사실칸 };
