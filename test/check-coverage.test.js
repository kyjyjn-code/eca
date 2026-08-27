// 기록 검증 게이트 — 지시서 §V-2 "실패 5종을 각각 인위 재현해 exit 1 을 확인한다"
// 통과할 입력만 넣어 보면 아무것도 안 잡는 검사를 "작동한다"고 보고하게 된다.
// 그래서 이 파일의 대부분은 "실패해야 하는 입력"이다.
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate, renderMd, 확인수준 } = require('../scripts/check-coverage');

const targets = {
  A_미수록_씨앗: [{ targets_id: 'A:kmo' }],
  C_순회소스: [{ targets_id: 'C:e청소년' }],
  D_쿼리세트: { 국문: [{ targets_id: 'D:국문:q1' }], 영문: [] },
};

const 온전한기록 = () => ({
  회차: '2026-09', 기준일: '2026-09-01', targets파일: '2026-09.targets.json',
  타깃처리: [{ targets_id: 'A:kmo', 이름: 'KMO', 결과: '수록', id: 'kmo-2026', 포스터: '있음' }],
  쿼리로그: [{ targets_id: 'D:국문:q1', 실행: true, 후보수: 1, 출처도메인: ['kms.or.kr'] }],
  순회소스: [{ targets_id: 'C:e청소년', 방문: true, 발견수: 0 }],
  배제후보: [],
  시즌점검: { 요약: '특이사항 없음', 누락: [] },
  신규0건_사유: null,
  소스관찰: { 요약: '특이사항 없음', 항목: [] },
  총평: '',
});
const 온전한raw = () => ([{ id: 'kmo-2026', 근거_원문: '접수 2026년 9월 [확인수준: 요강원문]' }]);

test('온전한 기록은 통과한다', () => {
  assert.deepEqual(validate(온전한기록(), targets, 온전한raw()), []);
});

test('실패① coverage.json 부재', () => {
  const f = validate(null, targets, 온전한raw());
  assert.equal(f.length, 1);
  assert.match(f[0], /coverage.json 이 없습니다/);
});

test('실패② targets 항목의 처리 결과 누락', () => {
  const c = 온전한기록();
  c.타깃처리 = [];
  c.신규0건_사유 = '쿼리 전부 실행했으나 자격 요건 미달로 후보 없음';
  const f = validate(c, targets, 온전한raw());
  assert.ok(f.some((m) => m.includes('A:kmo')), '누락된 targets_id 를 지목해야 한다');
});

test('실패③ 신규 수록 0건인데 사유가 없음', () => {
  const c = 온전한기록();
  c.타깃처리[0].결과 = '배제';
  c.타깃처리[0].탈락필터 = '주최성';
  const f = validate(c, targets, 온전한raw());
  assert.ok(f.some((m) => m.includes('신규0건_사유')));
});

test('실패③ 사유를 적으면 0건이어도 통과한다', () => {
  const c = 온전한기록();
  c.타깃처리[0].결과 = '배제';
  c.타깃처리[0].탈락필터 = '주최성';
  c.신규0건_사유 = '순회 소스 5곳 방문, 신규 공고 없음. 쿼리 19건 중 유효 후보 0건.';
  assert.deepEqual(validate(c, targets, 온전한raw()), []);
});

test('실패④ 근거_원문에 확인수준 표기가 없음', () => {
  const f = validate(온전한기록(), targets, [{ id: 'x-2026', 근거_원문: '표기가 없는 근거' }]);
  assert.ok(f.some((m) => m.includes('확인수준')));
});

test('실패④ 확인수준 값이 열거 밖', () => {
  const f = validate(온전한기록(), targets, [{ id: 'x-2026', 근거_원문: '근거 [확인수준: 대충봄]' }]);
  assert.ok(f.some((m) => m.includes('열거 밖')));
});

test('실패⑤ 소스관찰 요약 미작성 — 빈 배열로는 갈음되지 않는다', () => {
  const c = 온전한기록();
  c.소스관찰 = { 요약: '', 항목: [] };
  const f = validate(c, targets, 온전한raw());
  assert.ok(f.some((m) => m.includes('소스관찰')));
});

test('실패⑤ "특이사항 없음" 한 줄이면 충족이다', () => {
  const c = 온전한기록();
  c.소스관찰 = { 요약: '특이사항 없음', 항목: [] };
  assert.deepEqual(validate(c, targets, 온전한raw()), []);
});

test('실패⑥ 열거값 위반', () => {
  const c = 온전한기록();
  c.타깃처리[0].결과 = '보류';
  const f = validate(c, targets, 온전한raw());
  assert.ok(f.some((m) => m.includes('열거값 위반')));
});

test('배제-학교단위접수는 두 칸으로 기록하고, md 에서 한 덩어리로 되살린다', () => {
  const c = 온전한기록();
  c.타깃처리[0].결과 = '배제';
  c.타깃처리[0].탈락필터 = '학교단위접수';
  c.신규0건_사유 = '해당 회차 신규 없음';
  assert.deepEqual(validate(c, targets, 온전한raw()), []);
  assert.ok(renderMd(c).includes('배제-학교단위접수'));
});

test('확인수준 추출', () => {
  assert.equal(확인수준('원문 [확인수준: 요강원문]'), '요강원문');
  assert.equal(확인수준('표기 없음'), null);
  assert.equal(확인수준(null), null);
});

test('렌더된 md 는 자동 생성 경고와 필수 섹션 7개를 담는다', () => {
  const md = renderMd(온전한기록());
  assert.ok(md.includes('직접 고치지 마세요'));
  for (const s of ['① 타깃 처리 결과', '② 쿼리 실행 로그', '③ 순회 소스 방문 로그',
    '④ 배제 후보 기록', '⑤ 시즌 점검', '⑥ 신규 0건 사유', '⑦ 소스 관찰 로그']) {
    assert.ok(md.includes(s), s + ' 섹션이 있어야 한다');
  }
});
