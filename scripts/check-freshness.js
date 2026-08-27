// check-freshness.js — 데드맨 스위치의 판정부 (freshness.yml 이 매월 20일에 호출)
// - "사람이 잊으면 그 달을 통째로 건너뛴다"를 "잊으면 알림이 온다"로 바꾼다.
//   실제로 7월 갱신분과 8월 회차가 한 달 넘게 게시되지 않은 채 있었다.
// - LLM 을 전혀 쓰지 않는다. 키리스 운영 원칙과 무관하며 비용이 0이다.
// - 판정을 워크플로 YAML 이 아니라 여기에 두는 이유: YAML 안의 로직은 단위 테스트가 불가능하다.
//   워크플로는 이 스크립트가 낸 JSON 을 받아 Issue 를 만들기만 하는 껍데기다.
const fs = require('fs');
const path = require('path');
const { P, readJson, today, args, log } = require('./lib');

const 방치_일수 = 7;

function 이전달(회차) {
  const y = Number(회차.slice(0, 4));
  const m = Number(회차.slice(5, 7));
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return py + '-' + String(pm).padStart(2, '0');
}

function 일수차(a, b) {
  const ms = Date.parse(b) - Date.parse(a);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

// 순수 판정 — 파일을 읽지 않으므로 테스트가 바로 부른다.
// 입력: { 오늘, 회차, raw파일들, retro파일들, kpi회차들, 열린PR들, 기존이슈제목들 }
// 반환: [{ 제목, 본문 }]
function 판정(입력) {
  const { 오늘, 회차, raw파일들 = [], retro파일들 = [], kpi회차들 = [], 열린PR들 = [], 기존이슈제목들 = [] } = 입력;
  const 결과 = [];

  // 검사 1 — 당월 회차가 아직 안 돌았다
  if (!raw파일들.includes(회차 + '.json')) {
    결과.push({
      제목: '[freshness] ' + 회차 + ' 회차 미실행',
      본문: [
        '이번 달(' + 회차 + ') 리서치 산출물 `data/raw/' + 회차 + '.json` 이 아직 없습니다.',
        '',
        '기준일: ' + 오늘,
        '',
        '월간 세션을 실행하거나, 이번 달은 건너뛰기로 했다면 이 이슈를 닫아 주세요.',
      ].join('\n'),
    });
  }

  // 검사 2 — 머지 대기 PR 방치
  const 방치 = 열린PR들.filter((pr) => {
    const d = 일수차(pr.updatedAt, 오늘);
    return d !== null && d >= 방치_일수;
  });
  if (방치.length) {
    결과.push({
      제목: '[freshness] 머지 대기 PR 방치',
      본문: [
        방치_일수 + '일 이상 갱신이 없는 열린 PR 이 ' + 방치.length + '건 있습니다.',
        '파이프라인이 정상으로 돌아도 머지가 안 되면 사이트에는 아무것도 반영되지 않습니다.',
        '',
        ...방치.map((pr) => '- #' + pr.number + ' ' + (pr.title || '') + ' (마지막 갱신 ' + String(pr.updatedAt).slice(0, 10) + ')'),
        '',
        '기준일: ' + 오늘,
      ].join('\n'),
    });
  }

  // 검사 3 — 회고 미작성
  // 회고를 한 번이라도 쓴 뒤에만 감시한다. 습관이 시작되기 전에 잔소리하지 않기 위해서다.
  const 회고습관 = retro파일들.some((f) => /^\d{4}-\d{2}\.md$/.test(f));
  const 전월 = 이전달(회차);
  if (회고습관 && kpi회차들.includes(전월) && !retro파일들.includes(전월 + '.md')) {
    결과.push({
      제목: '[freshness] ' + 전월 + ' 회고 미작성',
      본문: [
        전월 + ' 회차는 계측(`data/retro/kpi.json`)까지 끝났는데 회고 `data/retro/' + 전월 + '.md` 가 없습니다.',
        '',
        '계측만 하고 해석하지 않으면 개선 루프가 돌지 않습니다.',
        '',
        '기준일: ' + 오늘,
      ].join('\n'),
    });
  }

  // 같은 제목의 열린 이슈가 이미 있으면 중복 생성하지 않는다
  return 결과.filter((r) => !기존이슈제목들.includes(r.제목));
}

function 목록(dir, 조건) {
  try {
    return fs.readdirSync(dir).filter(조건 || (() => true));
  } catch { return []; }
}

function main() {
  const a = args();
  const 오늘 = today();
  const 회차 = a.month || 오늘.slice(0, 7);

  const 열린PR들 = a.prs ? readJson(a.prs, []) : [];
  const 기존이슈 = a.issues ? readJson(a.issues, []) : [];
  const 기존이슈제목들 = (Array.isArray(기존이슈) ? 기존이슈 : []).map((x) => (typeof x === 'string' ? x : x.title));

  const 결과 = 판정({
    오늘, 회차,
    raw파일들: 목록(P.raw),
    retro파일들: 목록(path.join(P.data, 'retro')),
    kpi회차들: readJson(path.join(P.data, 'retro', 'kpi.json'), []).map((x) => x && x.회차).filter(Boolean),
    열린PR들: Array.isArray(열린PR들) ? 열린PR들 : [],
    기존이슈제목들,
  });

  // 워크플로가 받아 갈 JSON 은 stdout 으로. 로그는 stderr 로 보내 섞이지 않게 한다.
  process.stdout.write(JSON.stringify({ 이슈필요: 결과 }, null, 2) + '\n');
  process.stderr.write('[check-freshness.js] 회차 ' + 회차 + ' — 생성할 이슈 ' + 결과.length + '건\n');
}

if (require.main === module) main();
module.exports = { 판정, 이전달, 일수차, 방치_일수 };
