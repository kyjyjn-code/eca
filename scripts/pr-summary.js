// pr-summary.js — merge/links 리포트를 읽어 사람이 읽는 PR 변경 요약(마크다운)을 표준출력으로 낸다.
// GitHub Actions 에서 이 출력을 PR 본문으로 사용한다. (결정적 — 매월 동일 형식)
const path = require('path');
const { P, readJson, month, today } = require('./lib');

const m = month();
const master = readJson(P.master, []);
const published = master.filter((x) => typeof x.게시상태 === 'string' && x.게시상태.startsWith('게시'));
const merge = readJson(path.join(P.reports, `merge-${m}.json`), { 신규: [], 갱신: [], 제거_마감경과: [], 별점_보정: [], 별점_미판정: [] });
const kpiAll = readJson(path.join(P.data, 'retro', 'kpi.json'), []);
const kpi = kpiAll.find((x) => x && x.회차 === m) || null;
const links = readJson(path.join(P.reports, `links-${m}.json`), { 제외: [], 복구후보: [], 확인필요: [] });

const GATE = 10;
const out = [];
out.push(`# ECA 월간 업데이트 — ${m}`);
out.push('');
out.push(`- 기준일: ${today()}`);
out.push(`- **게시 총 ${published.length}건**` + (published.length < GATE ? ` ⚠️ 게시 기준(${GATE}건) 미만 — 검토 필요` : ''));
out.push('');

out.push(`## 🆕 신규 ${merge.신규.length}건`);
if (merge.신규.length) {
  out.push('| 활동명 | 주최 | 마감일 |');
  out.push('|---|---|---|');
  for (const x of merge.신규) out.push(`| ${x.활동명 || ''} | ${x.주최 || ''} | ${x.마감일 || '상시'} |`);
} else out.push('_없음_');
out.push('');

out.push(`## 🗑️ 마감 경과로 제거 ${merge.제거_마감경과.length}건`);
if (merge.제거_마감경과.length) for (const x of merge.제거_마감경과) out.push(`- ${x.활동명} (마감 ${x.마감일})`);
else out.push('_없음_');
out.push('');

out.push(`## 🔗 링크 이상으로 게시 제외 ${links.제외.length}건`);
out.push('_(삭제가 아니라 게시상태만 변경 — 오탐이면 다음 실행에서 자동 복구됩니다.)_');
if (links.제외.length) for (const x of links.제외) out.push(`- ${x.활동명} — ${x.사유}`);
else out.push('_없음_');
out.push('');

out.push(`## ⚠️ 링크 확인 필요 ${(links.확인필요 || []).length}건`);
out.push('_(신뢰 도메인이라 게시는 유지했으나 접속 확인이 안 됨 — 봇 차단·일시 오류일 수 있음. 담당자 눈으로 확인 권장.)_');
if ((links.확인필요 || []).length) for (const x of links.확인필요) out.push(`- ${x.활동명} — ${x.사유} (${x.웹사이트})`);
else out.push('_없음_');
out.push('');

out.push(`## ♻️ 기존 항목 갱신 ${merge.갱신.length}건`);
if (merge.갱신.length) for (const x of merge.갱신) out.push(`- ${x.활동명}`);
else out.push('_없음_');
out.push('');

// 별점은 스크립트가 계산한다. 큐레이터 값과 다르면 여기 표로 실어 사람이 본다.
const 보정 = merge.별점_보정 || [];
out.push(`## ⭐ 별점 보정 ${보정.length}건`);
if (보정.length) {
  out.push('_큐레이터가 매긴 값과 4축 계산값이 다른 항목입니다. 계산값을 적용했습니다._');
  out.push('');
  out.push('| 활동명 | 큐레이터 | 계산 | 입시 | 선발 | 국제 | 비용 |');
  out.push('|---|---|---|---|---|---|---|');
  for (const x of 보정) {
    const a = x.축 || {};
    out.push(`| ${x.활동명} | ★${x.큐레이터} | **★${x.계산}** | ${a.미국입시} | ${a.선발성} | ${a.국제성} | ${a.비용} |`);
  }
} else out.push('_없음 — 큐레이터 판정과 계산이 일치합니다._');
out.push('');

const 미판정 = merge.별점_미판정 || [];
if (미판정.length) {
  out.push(`## ❔ 별점 미판정 ${미판정.length}건`);
  out.push('_선발성·국제성 근거가 없어 재산정하지 않고 기존 별점을 보존했습니다._');
  for (const x of 미판정) out.push(`- ${x.활동명} — ${(x.미판정축 || []).join(', ')} 미판정`);
  out.push('');
}

if (kpi) {
  out.push('## 📊 이번 회차 지표');
  out.push('');
  out.push('| 지표 | 값 |');
  out.push('|---|---|');
  out.push(`| 신규 발굴 | **${kpi.신규발굴}건**${kpi.신규발굴 === 0 ? ' ⚠️ 0건 — 회고에서 원인을 다룰 것' : ''} |`);
  if (kpi.씨앗커버리지) out.push(`| 씨앗 커버리지 | ${kpi.씨앗커버리지.수록}/${kpi.씨앗커버리지.전체} |`);
  if (kpi.타깃처리율) out.push(`| 타깃 처리율 | ${kpi.타깃처리율.처리}/${kpi.타깃처리율.필요} |`);
  if (kpi.확인수준충족) out.push(`| 확인수준 표기 | ${kpi.확인수준충족.표기}/${kpi.확인수준충족.전체} |`);
  if (kpi.최대밴드비중 !== null) out.push(`| 별점 최대 밴드 비중 | ${Math.round(kpi.최대밴드비중 * 100)}%${kpi.최대밴드비중 > 0.6 ? ' ⚠️ 60% 초과 — 배점 보정 검토' : ''} |`);
  if (kpi.선발형비율) out.push(`| 선발형 : 상시형 | ${kpi.선발형비율.선발형} : ${kpi.선발형비율.상시형} |`);
  out.push(`| 커버리지 매트릭스 빈 칸 | ${kpi.매트릭스_빈칸수}/15 |`);
  out.push('');
}

out.push('---');
out.push('_승인(머지)하면 GitHub Pages 사이트에 반영됩니다. 최종 확인: 금칙 브랜드명 미포함 · "참고용" 고지 노출 · 별점 타당성._');

process.stdout.write(out.join('\n') + '\n');
