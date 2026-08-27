// make-targets.js — 이번 회차에 리서처가 처리할 대상을 결정적 스크립트가 열거한다 (설계서 0.5단계)
// - 출력: data/raw/YYYY-MM.targets.json
// - 날짜 연산과 대상 산정을 LLM 에서 완전히 제거한다. 리서처는 "판단"만 하고 "목록"은 받는다.
// - 8월 회차에서 신규 발굴이 0건이었던 원인이 여기다 — 기계가 열거하는 재확인은 완벽히 수행됐고,
//   열거 목록이 없는 개방형 과제(신규 발굴)만 통째로 증발했다.
// - 모든 항목에 targets_id 를 붙인다. check-coverage.js 가 이 키로 집합 차집합만 계산해
//   처리 누락을 잡는다(이름 유사도 매칭을 쓰지 않는다).
const fs = require('fs');
const path = require('path');
const { P, readJson, writeJson, ensureDir, month, today, args, isExpired, daysBetween, log } = require('./lib');
const { loadSeeds, isMissing, targetsId } = require('./seeds');

const 임박_일수 = 30;          // 마감 N일 이내면 요강 변경 가능성이 있어 재확인한다
const 분기월 = [1, 4, 7, 10];  // 전량 재검증 + 소스탐색 쿼리를 도는 달
const 신규_선발형_최소 = 3;

// 리서처가 coverage.json 에 쓸 수 있는 열거값. check-coverage.js 가 같은 목록으로 검증한다.
// targets 에 실어 보내는 이유: 리서처는 어차피 이 파일을 읽으므로, 계약을 항상 같은 곳에서 받게 된다.
const 기록규약 = {
  설명: 'coverage.json 에는 아래 열거값만 쓴다. check-coverage.js 가 같은 목록으로 기계 검증한다.',
  결과: ['수록', '배제', '시즌아님', '확인불가'],
  탈락필터: ['주최성', '지원자격', '학교단위접수', '규모·역사', '상업성', '출처', '만료', '중복'],
  포스터: ['있음', '없음'],
  확인수준: ['요강원문', '공고요약', '연도불명'],
};

// 쿼리의 YYYY 를 실제 연도로 치환한다. 겨울(11~2월)에는 차년도분도 함께 낸다.
function 연도치환(쿼리, 회차) {
  const y = Number(회차.slice(0, 4));
  const m = Number(회차.slice(5, 7));
  if (!쿼리.includes('YYYY')) return [쿼리];
  const 연도들 = (m >= 11 || m <= 2) ? [y, y + 1] : [y];
  return 연도들.map((yy) => 쿼리.split('YYYY').join(String(yy)));
}

// kpi.json 의 최신 커버리지 매트릭스에서 빈 칸이 많은 대분류를 앞에 둔다.
// 매트릭스가 없으면(첫 실행) 원래 순서를 유지한다.
function 우선순위(대분류들, kpi) {
  const rec = Array.isArray(kpi) && kpi.length ? kpi[kpi.length - 1] : null;
  const mx = rec && rec.커버리지_매트릭스;
  if (!mx) return 대분류들;
  const 빈칸수 = (분야) => {
    const cells = mx[분야];
    if (!cells) return 0;
    return Object.values(cells).filter((v) => !v).length;
  };
  return 대분류들.slice().sort((a, b) => 빈칸수(b) - 빈칸수(a));
}

function main() {
  const 회차 = args().month || month();
  const 기준일 = today();
  const 당월 = Number(회차.slice(5, 7));
  const 분기 = 분기월.includes(당월);

  const sources = readJson(path.join(P.data, 'sources.json'), {});
  const master = readJson(P.master, []);
  const inbox = readJson(path.join(P.data, 'inbox.json'), []);
  const kpi = readJson(path.join(P.data, 'retro', 'kpi.json'), []);

  const masterIds = master.map((x) => x.id);
  const seeds = loadSeeds(sources);
  const 경고 = [];

  // A — 미수록 씨앗
  const A = [];
  for (const s of seeds) {
    if (!s.canonical_slug) { 경고.push('canonical_slug 없는 씨앗: ' + s.활동명); continue; }
    if (s.유형 === '탐색범주') continue;
    if (!isMissing(s, masterIds, 회차)) continue;
    A.push({
      targets_id: targetsId('A', s.canonical_slug),
      canonical_slug: s.canonical_slug,
      이름: s.활동명, 유형: s.유형, 분류: s.분류,
      주최: s.주최 || '', url: s.url || '',
      예상_공고월: s.예상_공고월 || null,
      이번달_공고예상: Array.isArray(s.예상_공고월) ? s.예상_공고월.includes(당월) : false,
      확인필요: !!s.확인필요, 비고: s.비고 || '',
    });
  }
  // 이번 달 공고가 예상되는 것을 앞으로
  A.sort((a, b) => (b.이번달_공고예상 - a.이번달_공고예상) || a.이름.localeCompare(b.이름, 'ko'));

  // B — 시즌 캘린더가 이번 달에 지목한 것
  const 월별 = (sources.시즌_캘린더 && sources.시즌_캘린더.월별_주의) || {};
  const B = (월별[String(당월)] || []).map((항목, i) => ({
    targets_id: targetsId('B', 당월 + '-' + (i + 1)), 항목,
  }));

  // C — 정기 순회 소스
  const 순회 = (sources.발굴소스_2층 && sources.발굴소스_2층.정기순회_소스 && sources.발굴소스_2층.정기순회_소스.채널) || [];
  const C = 순회.map((c) => ({ targets_id: targetsId('C', c.이름), 이름: c.이름, url: c.url, 용도: c.용도 }));

  // D — 검색 쿼리 (연도 치환 완료)
  const 쿼리세트 = (sources.발굴소스_2층 && sources.발굴소스_2층.검색쿼리_세트) || {};
  const 대분류별 = 쿼리세트.대분류별 || {};
  const 순서 = 우선순위(Object.keys(대분류별), kpi);
  const D = { 국문: [], 영문: [] };
  for (const 대분류 of 순서) {
    for (const q of 대분류별[대분류] || []) {
      const 언어 = /[가-힣]/.test(q) ? '국문' : '영문';
      for (const 실쿼리 of 연도치환(q, 회차)) {
        D[언어].push({ targets_id: targetsId('D', 언어 + ':' + 실쿼리), 쿼리: 실쿼리, 대분류, 언어 });
      }
    }
  }
  // 분기월에는 소스탐색 소그룹을 더한다 (결과는 활동 수집이 아니라 소스 관찰 기록 전용)
  if (분기 && Array.isArray(쿼리세트.소스탐색)) {
    for (const q of 쿼리세트.소스탐색) {
      const 언어 = /[가-힣]/.test(q) ? '국문' : '영문';
      for (const 실쿼리 of 연도치환(q, 회차)) {
        D[언어].push({ targets_id: targetsId('D', 언어 + ':' + 실쿼리), 쿼리: 실쿼리, 대분류: '소스탐색', 언어, 소스탐색: true });
      }
    }
  }

  // E — 재확인(마감 임박). 분기월에는 마스터 전 항목.
  const E = [];
  for (const it of master) {
    const 게시중 = typeof it.게시상태 === 'string' && it.게시상태.startsWith('게시');
    if (!게시중) continue;
    let 사유 = null;
    if (분기) 사유 = '분기 전량 재검증';
    else if (it.마감일 && !isExpired(it.마감일, 기준일) && daysBetween(기준일, it.마감일) <= 임박_일수) 사유 = '마감 ' + 임박_일수 + '일 이내';
    if (!사유) continue;
    E.push({ targets_id: targetsId('E', it.id), id: it.id, 활동명: it.활동명, 마감일: it.마감일 ?? null, 사유 });
  }

  // F — 재확인(제외 복구·확인 필요)
  const F = [];
  for (const it of master) {
    const 제외 = typeof it.게시상태 === 'string' && it.게시상태.startsWith('제외');
    const 확인 = !!it._링크확인필요;
    if (!제외 && !확인) continue;
    F.push({ targets_id: targetsId('F', it.id), id: it.id, 활동명: it.활동명,
      게시상태: it.게시상태 || '', 사유: 제외 ? '게시 제외 상태' : ('링크 확인 필요: ' + it._링크확인필요) });
  }

  // G — 교사 제보 (상태가 "대기"인 것만)
  const G = (Array.isArray(inbox) ? inbox : []).map((x, i) => ({ ...x, _i: i }))
    .filter((x) => (x.상태 || '대기') === '대기')
    .map((x) => ({ targets_id: targetsId('G', String(x._i)), 활동명: x.활동명 || '', url: x.url || '',
      메모: x.메모 || '', 제보자: x.제보자 || '', 날짜: x.날짜 || '' }));

  const out = {
    회차, 기준일, 분기월_여부: 분기, 기록규약,
    A_미수록_씨앗: A, B_시즌캘린더_당월: B, C_순회소스: C, D_쿼리세트: D,
    E_재확인_마감임박: E, F_재확인_제외복구: F, G_교사제보: G,
    목표: {
      신규_선발형_최소,
      주의: '목표 미달은 실패가 아니다. 검증 필터를 완화해 목표를 채우는 것을 금지한다. 근거 없는 1건은 0건보다 나쁘다. 미달 시 coverage.json 의 신규0건_사유 또는 총평에 사유를 남기는 것으로 갈음한다.',
    },
    _경고: 경고,
  };

  ensureDir(P.raw);
  writeJson(path.join(P.raw, 회차 + '.targets.json'), out);
  log('대상 열거 완료 — 회차 ' + 회차 + (분기 ? ' (분기 전량 재검증)' : '') +
      ' / 미수록 씨앗 ' + A.length + ' · 시즌 ' + B.length + ' · 순회 ' + C.length +
      ' · 쿼리 ' + (D.국문.length + D.영문.length) + ' · 마감임박 ' + E.length +
      ' · 제외복구 ' + F.length + ' · 교사제보 ' + G.length +
      (경고.length ? ' · 경고 ' + 경고.length : ''));
  경고.forEach((w) => log('  경고: ' + w));
}

if (require.main === module) main();
module.exports = { 연도치환, 우선순위, 기록규약 };
