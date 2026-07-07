// check-links.js — 병합 후 마스터 전체의 링크 생존 확인 (설계서 4.4)
// - 웹사이트/포스터_url 에 HTTP 요청 → 응답 이상(404·도메인 소멸·타임아웃 등)이면 게시상태를 "제외(링크오류)"로 변경
// - 데이터를 삭제하지 않으므로, 게시 시 오탐이면 되돌릴 수 있음
// - 실패 시 1회 재시도, 제외 목록·사유를 리포트로 남겨 PR 요약에 포함
// - QA 체크리스트의 "링크 생존" 항목을 자동화
const path = require('path');
const { P, readJson, writeJson, ensureDir, month, today, log } = require('./lib');

const TIMEOUT_MS = 12000;
const RETRIES = 1; // 실패 시 추가 1회 재시도

async function checkUrl(url) {
  if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'URL 형식 아님' };
  }
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // 일부 서버가 HEAD 를 막으므로 GET 으로 확인 (본문은 읽지 않고 즉시 중단)
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SDC-ECA-linkcheck/1.0)' },
      });
      clearTimeout(t);
      if (res.status >= 200 && res.status < 400) return { ok: true, status: res.status };
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { ok: false, reason: `HTTP ${res.status}`, status: res.status };
      }
      // 5xx/429 는 일시 오류로 보고 재시도
      if (attempt === RETRIES) return { ok: false, reason: `HTTP ${res.status}`, status: res.status };
    } catch (e) {
      clearTimeout(t);
      if (attempt === RETRIES) {
        const reason = e.name === 'AbortError' ? '타임아웃' : (e.cause && e.cause.code) || e.message || '연결 실패';
        return { ok: false, reason: String(reason) };
      }
    }
  }
  return { ok: false, reason: '알 수 없음' };
}

async function main() {
  const m = month();
  const master = readJson(P.master, []);
  const report = { 기준일: today(), 월: m, 검사수: 0, 제외: [], 복구후보: [] };

  for (const item of master) {
    report.검사수++;
    const web = await checkUrl(item.웹사이트);
    let posterBad = null;
    if (item.포스터_url) {
      const pr = await checkUrl(item.포스터_url);
      if (!pr.ok) posterBad = pr.reason;
    }

    const prevExcluded = typeof item.게시상태 === 'string' && item.게시상태.startsWith('제외');
    const linkAutoExcluded = prevExcluded && item.게시상태.includes('링크오류');

    if (!web.ok) {
      item.게시상태 = `제외(링크오류: ${web.reason})`;
      report.제외.push({ id: item.id, 활동명: item.활동명, 웹사이트: item.웹사이트, 사유: web.reason });
    } else {
      // 웹사이트가 살아있는데 이전에 링크오류로 자동 제외돼 있었다면 게시로 복구
      if (linkAutoExcluded) {
        item.게시상태 = '게시';
        report.복구후보.push({ id: item.id, 활동명: item.활동명 });
      } else if (!item.게시상태) {
        item.게시상태 = '게시';
      }
      // 포스터 링크만 죽은 경우: 활동은 게시 유지, 포스터_url 만 비워 기본 카드로
      if (posterBad) {
        item._포스터링크오류 = posterBad;
        item.포스터_url = '';
      }
    }
  }

  writeJson(P.master, master);
  ensureDir(P.reports);
  writeJson(path.join(P.reports, `links-${m}.json`), report);

  log(`링크 검증 완료 — 검사 ${report.검사수}건 / 제외 ${report.제외.length}건 / 복구 ${report.복구후보.length}건`);
}

main();
