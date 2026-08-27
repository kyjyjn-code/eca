// 계측 — 커버리지 매트릭스와 연도 치환.
// 숫자를 스크립트가 재는 이상, 그 산수 자체가 맞는지는 테스트가 지킨다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { 집계, 커버리지매트릭스, 빈칸수, 대분류, 학년대 } = require('../scripts/compute-kpi');
const { 연도치환 } = require('../scripts/make-targets');

const 항목 = (o) => Object.assign({
  id: 'x', 분야: '과학·공학·수학생명·AI', 대상_학년: ['고'], 게시상태: '게시',
  SDC_적합도: 3, 미국입시_관련도: '보통', 수집월: '2026-09',
}, o);

test('매트릭스는 대분류 5 × 학년대 3 을 모두 만든다', () => {
  const mx = 커버리지매트릭스([]);
  assert.equal(Object.keys(mx).length, 대분류.length);
  assert.equal(Object.keys(mx[대분류[0]]).length, 학년대.length);
  assert.equal(빈칸수(mx), 대분류.length * 학년대.length, '빈 마스터면 전 칸이 비어 있다');
});

test('선발성 칸이 없으면 미상 버킷으로 떨어진다 (스키마 도입 전에도 안 깨진다)', () => {
  const mx = 커버리지매트릭스([항목({})]);
  assert.equal(mx['과학·공학·수학생명·AI']['고'].미상, 1);
  assert.equal(mx['과학·공학·수학생명·AI']['고'].선발형, 0);
});

test('선발성이 채워지면 선발형·상시형으로 갈린다', () => {
  const mx = 커버리지매트릭스([항목({ 선발성: true }), 항목({ id: 'y', 선발성: false })]);
  const c = mx['과학·공학·수학생명·AI']['고'];
  assert.deepEqual([c.선발형, c.상시형, c.미상], [1, 1, 0]);
});

test('한 활동이 여러 학년대에 걸치면 각 칸에 센다', () => {
  const mx = 커버리지매트릭스([항목({ 대상_학년: ['초', '중', '고'] })]);
  for (const g of 학년대) assert.equal(mx['과학·공학·수학생명·AI'][g].미상, 1);
});

test('신규 발굴 수는 수집월 기준이다 (전월 마스터는 복원 불가하므로)', () => {
  const r = 집계({
    회차: '2026-09', 기준일: '2026-09-01',
    master: [항목({ id: 'a', 수집월: '2026-09' }), 항목({ id: 'b', 수집월: '2026-07' })],
    raw: null, coverage: null, targets: null, links: null, merge: null, seeds: [],
  });
  assert.equal(r.신규발굴, 1);
});

test('산출할 수 없는 지표는 0 이 아니라 null 이다', () => {
  const r = 집계({
    회차: '2026-09', 기준일: '2026-09-01', master: [항목({})],
    raw: null, coverage: null, targets: null, links: null, merge: null, seeds: [],
  });
  assert.equal(r.확인수준충족, null);
  assert.equal(r.타깃처리율, null);
  assert.equal(r.링크, null);
  assert.equal(r.선발형비율, null, '선발성 칸이 없으면 비율을 지어내지 않는다');
});

test('쿼리 연도 치환 — 평월은 당해, 겨울은 차년도까지', () => {
  assert.deepEqual(연도치환('YYYY 청소년 대회', '2026-09'), ['2026 청소년 대회']);
  assert.deepEqual(연도치환('YYYY 청소년 대회', '2026-12'), ['2026 청소년 대회', '2027 청소년 대회']);
  assert.deepEqual(연도치환('YYYY 청소년 대회', '2027-01'), ['2027 청소년 대회', '2028 청소년 대회']);
  assert.deepEqual(연도치환('연도 없는 쿼리', '2026-09'), ['연도 없는 쿼리']);
});

test('우선 배치의 빈칸수는 compute-kpi 의 판정과 같아야 한다', () => {
  // 예전 구현은 Object.values(cells) 가 객체 배열이라 항상 truthy → 전 대분류 0 →
  // 커버리지 빈 칸 기반 우선 배치가 조용히 아무 일도 하지 않았다.
  const { 우선순위 } = require('../scripts/make-targets');
  const mx = 커버리지매트릭스([항목({ 분야: '과학·공학·수학생명·AI', 대상_학년: ['초', '중', '고'] })]);
  // 과학 계열만 다 찼고 나머지 4개 대분류는 전부 비어 있다 → 과학이 맨 뒤로 밀려야 한다
  const kpi = [{ 회차: '2026-09', 커버리지_매트릭스: mx }];
  const 순서 = 우선순위(대분류.slice(), kpi);
  assert.equal(순서[순서.length - 1], '과학·공학·수학생명·AI', '빈 칸이 없는 대분류가 맨 뒤로 가야 한다');
  assert.equal(빈칸수(mx), (대분류.length - 1) * 학년대.length, '나머지 4개 대분류 × 3 학년대가 빈 칸');
});
