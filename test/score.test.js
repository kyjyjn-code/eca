// 별점 4축 계산 — 숫자를 스크립트가 재는 이상, 그 산수를 지키는 것은 테스트다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { score, 축점수, apply, check } = require('../scripts/score');

const it = (o) => Object.assign({
  id: 'x', 활동명: 'X', 미국입시_관련도: '보통', 선발성: false, 국제성: false, 비용_구분: '무료', SDC_적합도: 2,
}, o);

test('네 축이 그대로 더해진다', () => {
  assert.equal(score(it({ 미국입시_관련도: '높음', 선발성: true, 국제성: true, 비용_구분: '무료' })).점수, 5);
  assert.equal(score(it({ 미국입시_관련도: '낮음', 선발성: false, 국제성: false, 비용_구분: '유료' })).점수, 1, '합계 0 이어도 최소 ★1');
  assert.equal(score(it({ 미국입시_관련도: '보통', 선발성: true, 국제성: false, 비용_구분: '유료' })).점수, 2);
});

test('소액은 무료와 같이 1점이다', () => {
  assert.equal(축점수(it({ 비용_구분: '소액' })).비용, 1);
  assert.equal(축점수(it({ 비용_구분: '무료' })).비용, 1);
  assert.equal(축점수(it({ 비용_구분: '유료' })).비용, 0);
});

test('미판정 축이 하나라도 있으면 점수를 내지 않는다', () => {
  // 스키마만 있고 데이터가 없는 중간 상태에서 별점이 일괄 하락하는 것을 막는 안전판
  const r = score(it({ 선발성: undefined }));
  assert.equal(r.점수, null);
  assert.deepEqual(r.미판정축, ['선발성']);
});

test('미판정이면 apply 가 기존 별점을 보존한다', () => {
  const x = it({ 선발성: undefined, 국제성: undefined, SDC_적합도: 4 });
  const r = apply(x);
  assert.equal(r.변경됨, false);
  assert.equal(x.SDC_적합도, 4, '건드리지 않는다');
  assert.deepEqual(r.미판정축, ['선발성', '국제성']);
});

test('apply 는 계산값으로 덮고 변경 여부를 알려 준다', () => {
  const x = it({ 미국입시_관련도: '높음', 선발성: true, 국제성: true, 비용_구분: '무료', SDC_적합도: 3 });
  const r = apply(x);
  assert.equal(r.변경됨, true);
  assert.equal(r.이전, 3);
  assert.equal(r.이후, 5);
  assert.equal(x.SDC_적합도, 5);
});

test('알 수 없는 관련도·비용은 미판정으로 본다 (0 으로 밀지 않는다)', () => {
  assert.equal(축점수(it({ 미국입시_관련도: '' })).미국입시, null);
  assert.equal(축점수(it({ 비용_구분: undefined })).비용, null);
});

test('check 는 저장하지 않고 불일치와 미판정을 갈라 준다', () => {
  const master = [
    it({ id: 'a', 미국입시_관련도: '높음', 선발성: true, 국제성: true, 비용_구분: '무료', SDC_적합도: 3 }), // 계산 5
    it({ id: 'b', 미국입시_관련도: '보통', 선발성: false, 국제성: false, 비용_구분: '무료', SDC_적합도: 2 }), // 계산 2, 일치
    it({ id: 'c', 선발성: undefined }),
  ];
  const r = check(master);
  assert.equal(r.불일치.length, 1);
  assert.equal(r.불일치[0].id, 'a');
  assert.equal(r.불일치[0].계산값, 5);
  assert.equal(r.미판정.length, 1);
  assert.equal(r.미판정[0].id, 'c');
  assert.equal(master[0].SDC_적합도, 3, 'check 는 값을 바꾸지 않는다');
});

test('실제 판정 사례 — 기준 달성형 포상은 선발성 0 이다', () => {
  // 국제청소년성취포상제: 등급별 기준 달성형이라 경쟁 선발이 아니다 (curator.md 엣지 케이스)
  const duke = it({ 미국입시_관련도: '보통', 선발성: false, 국제성: true, 비용_구분: '소액' });
  assert.equal(score(duke).점수, 3);
});

test('실제 판정 사례 — 국내 공모전은 국제성 0 이다', () => {
  const 환경사랑 = it({ 미국입시_관련도: '낮음', 선발성: true, 국제성: false, 비용_구분: '무료' });
  assert.equal(score(환경사랑).점수, 2);
});
