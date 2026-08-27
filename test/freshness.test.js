// 데드맨 스위치 판정 — 지시서 §V-6.
// 워크플로에서 Issue 를 실제로 만들어 보는 대신 판정 로직을 단위 테스트한다.
// (YAML 안에 로직이 있으면 이 시험 자체가 불가능하다 — 그래서 스크립트로 뺐다)
const test = require('node:test');
const assert = require('node:assert/strict');
const { 판정, 이전달, 일수차 } = require('../scripts/check-freshness');

const 기본 = {
  오늘: '2026-09-20', 회차: '2026-09',
  raw파일들: ['2026-09.json'], retro파일들: [], kpi회차들: [], 열린PR들: [], 기존이슈제목들: [],
};

test('당월 회차가 돌았으면 조용하다', () => {
  assert.deepEqual(판정(기본), []);
});

test('검사1 — 당월 raw 가 없으면 미실행 이슈', () => {
  const r = 판정({ ...기본, raw파일들: ['2026-08.json'] });
  assert.equal(r.length, 1);
  assert.equal(r[0].제목, '[freshness] 2026-09 회차 미실행');
});

test('검사2 — 7일 이상 갱신 없는 열린 PR 은 방치로 본다', () => {
  const r = 판정({ ...기본, 열린PR들: [{ number: 12, title: 'ECA 9월', updatedAt: '2026-09-01T00:00:00Z' }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].제목, '[freshness] 머지 대기 PR 방치');
  assert.match(r[0].본문, /#12/);
});

test('검사2 — 엿새 된 PR 은 아직 방치가 아니다', () => {
  const r = 판정({ ...기본, 열린PR들: [{ number: 12, updatedAt: '2026-09-14T00:00:00Z' }] });
  assert.deepEqual(r, []);
});

test('검사3 — 회고를 한 번도 안 썼으면 잔소리하지 않는다', () => {
  // 습관이 시작되기 전에는 감시하지 않는다
  const r = 판정({ ...기본, kpi회차들: ['2026-08'], retro파일들: [] });
  assert.deepEqual(r, []);
});

test('검사3 — 회고 습관이 있는데 전월 것만 빠졌으면 잡는다', () => {
  const r = 판정({ ...기본, kpi회차들: ['2026-07', '2026-08'], retro파일들: ['2026-07.md', 'kpi.json'] });
  assert.equal(r.length, 1);
  assert.equal(r[0].제목, '[freshness] 2026-08 회고 미작성');
});

test('검사3 — 전월 회고가 있으면 조용하다', () => {
  const r = 판정({ ...기본, kpi회차들: ['2026-08'], retro파일들: ['2026-07.md', '2026-08.md'] });
  assert.deepEqual(r, []);
});

test('같은 제목의 열린 이슈가 있으면 중복 생성하지 않는다', () => {
  const r = 판정({
    ...기본, raw파일들: [],
    기존이슈제목들: ['[freshness] 2026-09 회차 미실행'],
  });
  assert.deepEqual(r, []);
});

test('여러 검사가 동시에 걸릴 수 있다', () => {
  const r = 판정({
    ...기본, raw파일들: [],
    열린PR들: [{ number: 9, updatedAt: '2026-08-01T00:00:00Z' }],
  });
  assert.equal(r.length, 2);
});

test('이전달 계산은 연도를 넘는다', () => {
  assert.equal(이전달('2026-09'), '2026-08');
  assert.equal(이전달('2026-01'), '2025-12');
});

test('일수차', () => {
  assert.equal(일수차('2026-09-01T00:00:00Z', '2026-09-20'), 19);
  assert.equal(일수차('잘못된 날짜', '2026-09-20'), null);
});
