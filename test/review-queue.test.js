// 기관 접수 검토 큐 — 학교 단위 접수 대회를 배제로 끝내지 않고 기회로 추적한다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { 추출, 기존활동명, 초기표, 행 } = require('../scripts/update-review-queue');

test('타깃처리와 배제후보 두 곳에서 모두 뽑는다', () => {
  // 쿼리로 발굴돼 targets 에 없던 후보(배제후보)를 빠뜨리면 새로 발견한 대회가 조용히 샌다
  const cov = {
    타깃처리: [
      { targets_id: 'A:ukmt', 이름: 'UKMT', 결과: '배제', 탈락필터: '학교단위접수', 사유: '학교 일괄 접수', 주최: 'UK Maths Trust' },
      { targets_id: 'A:kmo', 이름: 'KMO', 결과: '배제', 탈락필터: '주최성' },
      { targets_id: 'A:amc', 이름: 'AMC', 결과: '수록' },
    ],
    배제후보: [
      { 활동명: '어떤 교내 대회', 탈락필터: '학교단위접수', 접수규정_원문: 'Entries must be made by schools.', url: 'https://x.kr' },
      { 활동명: '상업 캠프', 탈락필터: '상업성' },
    ],
  };
  const r = 추출(cov);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((x) => x.활동명).sort(), ['UKMT', '어떤 교내 대회'].sort());
});

test('coverage 가 없으면 빈 배열', () => {
  assert.deepEqual(추출(null), []);
  assert.deepEqual(추출({}), []);
});

test('활동명이 비면 버린다', () => {
  assert.deepEqual(추출({ 배제후보: [{ 활동명: '', 탈락필터: '학교단위접수' }] }), []);
});

test('기존 표에서 등재된 활동명을 읽어 중복을 막는다', () => {
  const md = 초기표() + 행({ 활동명: 'UKMT (영국 수학 경시대회)', 주최: 'X', 규정: 'Y', url: 'Z' }, '2026-08-27') + '\n';
  const names = 기존활동명(md);
  assert.ok(names.includes('UKMT (영국 수학 경시대회)'));
  assert.ok(!names.includes('활동명'), '헤더 행은 세지 않는다');
  assert.ok(!names.some((n) => n.startsWith('---')), '구분선도 세지 않는다');
});

test('규정 원문에 파이프가 있어도 표가 깨지지 않는다', () => {
  const r = 행({ 활동명: 'A', 주최: 'B', 규정: '가 | 나', url: 'https://x' }, '2026-08-27');
  assert.equal(r.split('|').length - 1, 7, '셀 경계 파이프만 남아야 한다');
  assert.ok(r.includes('가 / 나'));
});

test('빈 값은 하이픈으로 채운다 — 빈칸과 미확인을 구분하기 위해', () => {
  const r = 행({ 활동명: 'A' }, '2026-08-27');
  assert.ok(r.includes('| - |'));
  assert.ok(r.endsWith('| 미검토 |'));
});
