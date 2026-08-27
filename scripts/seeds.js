// seeds.js — 씨앗 목록 적재와 "미수록" 판정 (설계서 6장 1층)
// - make-targets.js(대상 열거)와 build.js(연간 캘린더 예정 카드)가 이 판정을 공유한다.
//   같은 규칙을 두 곳에 복사하면 "사이트는 공고 예정이라는데 이미 수록된" 어긋남이 반드시 생긴다.
// - 순수 함수만 둔다. 파일을 읽지 않으므로 테스트가 픽스처 없이 바로 부를 수 있다.

// 씨앗 유형
//   회차형   — 매년(또는 매 회차) 다시 열린다. id 는 `slug-개최연도`.
//   상시형   — 연중 열려 있다. id 는 `slug`.
//   탐색범주 — "정부·부처 공모" 처럼 개별 활동이 아니라 검색 방향을 가리키는 항목.
//              미수록 판정 대상이 아니다(개별 대회가 아니므로 "수록"이라는 상태가 없다).
const SEED_TYPES = ['회차형', '상시형', '탐색범주'];

// sources.json 의 핵심소스_1층을 평평한 배열로 편다. 분류(카테고리명)를 각 항목에 붙인다.
function loadSeeds(sources) {
  const out = [];
  const cats = (sources && sources.핵심소스_1층) || {};
  for (const [분류, list] of Object.entries(cats)) {
    for (const s of list || []) out.push({ ...s, 분류 });
  }
  return out;
}

// 회차의 연도. 2026-09 → 2026, 2027-01 → 2027.
function seasonYear(회차) {
  return Number(String(회차).slice(0, 4));
}

// 마스터에서 이 슬러그로 수록된 개최연도들을 모은다.
// `amc` → ['amc-2026'] 이면 [2026]. 상시형(`iearn`)은 연도가 없으므로 빈 배열.
function recordedYears(slug, masterIds) {
  const prefix = slug + '-';
  const years = [];
  for (const id of masterIds) {
    if (typeof id !== 'string' || !id.startsWith(prefix)) continue;
    const tail = id.slice(prefix.length);
    if (tail.length === 4 && Number.isInteger(Number(tail))) years.push(Number(tail));
  }
  return years.sort((a, b) => a - b);
}

// 미수록인가 — 이번 회차에 리서처가 조사해야 할 씨앗인가.
//
// 회차형: 수록된 개최연도 중 가장 큰 값이 이번 시즌연도보다 작으면 미수록이다.
//   · 2026-09 의 amc → amc-2026 이 있으므로 수록 (2026 >= 2026)
//   · 2027-01 의 amc → amc-2026 뿐이므로 미수록 (2026 < 2027)
//   · 2026-09 의 wharton-investment-competition → 2027 회차가 이미 있으므로 수록 (2027 >= 2026)
//     달력 연도로 단순 비교하면 이 항목을 미수록으로 오판한다. 실제 마스터에 있는 사례다.
// 상시형: slug 와 완전히 같은 id 가 있으면 수록.
// 탐색범주: 판정 대상이 아니다(항상 false).
function isMissing(seed, masterIds, 회차) {
  const ids = masterIds instanceof Set ? masterIds : new Set(masterIds);
  const slug = seed.canonical_slug;
  if (!slug) return false; // 슬러그가 없으면 판정할 수 없다 — 호출부가 경고로 처리한다
  if (seed.유형 === '탐색범주') return false;
  if (seed.유형 === '상시형') return !ids.has(slug);
  const years = recordedYears(slug, ids);
  if (!years.length) return true;
  return years[years.length - 1] < seasonYear(회차);
}

// 공개 화면에 내보내도 되는 링크인가. 계약의 `웹사이트` 규칙과 같다 — http(s) 만, 꺾쇠·따옴표 불가.
function isSafeUrl(u) {
  if (typeof u !== 'string') return false;
  const lower = u.toLowerCase();
  if (!(lower.startsWith('http://') || lower.startsWith('https://'))) return false;
  return !(u.includes('<') || u.includes('>') || u.includes('"'));
}

// 연간 캘린더의 "공고 예정" 카드 대상.
// 미수록이면서 예상_공고월이 있는 씨앗만. 표시 정보는 네 칸으로 제한한다 —
// 근거_원문이 확보되지 않은 마감일·자격·비용은 원리적으로 나갈 수 없게 스크립트가 자른다.
function upcomingFor(seeds, masterIds, 회차) {
  const out = [];
  for (const s of seeds) {
    if (!Array.isArray(s.예상_공고월) || !s.예상_공고월.length) continue;
    if (!isMissing(s, masterIds, 회차)) continue;
    const url = isSafeUrl(s.url) ? s.url : '';
    out.push({ 활동명: s.활동명, 분야: 분류라벨(s.분류), 예상_공고월: s.예상_공고월.slice(), 웹사이트: url });
  }
  return out.sort((a, b) => (a.예상_공고월[0] - b.예상_공고월[0]) || a.활동명.localeCompare(b.활동명, 'ko'));
}

// 씨앗 카테고리명을 화면용으로 다듬는다.
// sources.json 의 카테고리에는 내부 메모가 괄호로 붙어 있다
// (예: "선발형 여름 프로그램 (키워드 여름프로그램)"). 공개 화면에는 앞부분만 낸다.
function 분류라벨(분류) {
  const s = String(분류 || '');
  const i = s.indexOf('(');
  return (i === -1 ? s : s.slice(0, i)).trim();
}

// targets.json 의 안정 키. coverage 가 이 키로 처리 결과를 되돌려 주면
// check-coverage 가 이름 유사도 없이 집합 차집합만으로 누락을 잡는다.
function targetsId(섹션, 키) {
  return 섹션 + ':' + 키;
}

module.exports = { SEED_TYPES, loadSeeds, seasonYear, recordedYears, isMissing, upcomingFor, targetsId, isSafeUrl, 분류라벨 };
