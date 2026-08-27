// 씨앗 미수록 판정 — 지시서 P0-1 수용 기준 ①②③ + 실데이터에서 나온 함정
// 순수 함수만 부르므로 파일·픽스처가 필요 없다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isMissing, recordedYears, seasonYear, upcomingFor, isSafeUrl, 분류라벨 } = require('../scripts/seeds');

const 마스터 = ['amc-2026', 'wharton-investment-competition-2027', 'iearn', '1365-volunteer-portal', 'the-concord-review-2026'];
const 씨앗 = (slug, 유형, 예상_공고월) => ({ canonical_slug: slug, 유형, 활동명: slug, 분류: '테스트', 예상_공고월 });

test('① 마스터에 없는 회차형 씨앗은 미수록이다', () => {
  assert.equal(isMissing(씨앗('kmo', '회차형'), 마스터, '2026-09'), true);
  assert.equal(isMissing(씨앗('john-locke', '회차형'), 마스터, '2026-09'), true);
  assert.equal(isMissing(씨앗('rsi', '회차형'), 마스터, '2026-09'), true);
});

test('② 이번 시즌 회차가 이미 있으면 미수록이 아니다', () => {
  assert.equal(isMissing(씨앗('amc', '회차형'), 마스터, '2026-09'), false);
});

test('③ 시즌이 넘어가면 같은 씨앗이 다시 미수록이 된다', () => {
  assert.equal(isMissing(씨앗('amc', '회차형'), 마스터, '2027-01'), true);
});

test('④ 개최연도가 달력연도보다 앞선 회차도 수록으로 본다 (실데이터: Wharton 2027)', () => {
  // 2026-09 시점에 마스터에는 wharton-...-2027 만 있다.
  // 달력연도로 단순 비교하면 이 항목을 미수록으로 오판한다.
  assert.equal(isMissing(씨앗('wharton-investment-competition', '회차형'), 마스터, '2026-09'), false);
});

test('⑤ 상시형은 slug 완전일치로 판정한다', () => {
  assert.equal(isMissing(씨앗('iearn', '상시형'), 마스터, '2026-09'), false);
  assert.equal(isMissing(씨앗('ymca-youth-leadership', '상시형'), 마스터, '2026-09'), true);
});

test('⑥ 탐색범주는 판정 대상이 아니다', () => {
  assert.equal(isMissing(씨앗('gov-public-open-calls', '탐색범주'), 마스터, '2026-09'), false);
});

test('slug 접두가 겹쳐도 다른 씨앗을 집지 않는다', () => {
  // 'amc' 가 'amc-extra-2026' 을 잘못 집으면 안 된다
  assert.deepEqual(recordedYears('amc', ['amc-2026', 'amc-extra-2026']), [2026]);
  assert.deepEqual(recordedYears('없는슬러그', 마스터), []);
});

test('seasonYear 는 회차의 연도다', () => {
  assert.equal(seasonYear('2026-09'), 2026);
  assert.equal(seasonYear('2027-01'), 2027);
});

test('예정 카드는 미수록 + 예상_공고월이 있는 것만, 네 칸만 나간다', () => {
  const seeds = [
    씨앗('rsi', '회차형', [11]),                          // 미수록 → 나온다
    씨앗('amc', '회차형', [2]),                           // 수록 → 안 나온다
    씨앗('kpho', '회차형', null),                          // 공고월 미상 → 안 나온다
  ];
  const out = upcomingFor(seeds, 마스터, '2026-09');
  assert.equal(out.length, 1);
  assert.deepEqual(Object.keys(out[0]).sort(), ['분야', '예상_공고월', '웹사이트', '활동명'].sort());
});

test('예정 카드의 링크는 http(s) 만 통과한다', () => {
  assert.equal(isSafeUrl('https://example.kr/a'), true);
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('https://x.kr/"onload="'), false);
  assert.equal(isSafeUrl(undefined), false);
});

test('분류 라벨은 괄호 안 내부 메모를 떼고 낸다', () => {
  assert.equal(분류라벨('선발형 여름 프로그램 (키워드 여름프로그램)'), '선발형 여름 프로그램');
  assert.equal(분류라벨('환경·예술·공익'), '환경·예술·공익');
});
