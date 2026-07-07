// merge.js — 당월 curated 를 동적 마스터(master.json)에 병합 (설계서 4.3)
// - 신규 id → 추가
// - 기존 id → 필드 갱신(최신 수집분 우선), 갱신일 기록
// - 마감일이 지난 항목 → 마스터에서 제거 (아카이브에는 남김)
// - 마감일 null 항목 → 자동 제거하지 않음 (링크 검증이 생존 관리)
// - 병합 리포트(신규/갱신/제거)를 파일로 남겨 게시 에이전트가 PR 요약에 사용
const fs = require('fs');
const path = require('path');
const { P, readJson, writeJson, ensureDir, today, month, args, isExpired, log } = require('./lib');

function pickCuratedFile() {
  const a = args();
  const m = a.month || month();
  const byMonth = path.join(P.curated, `${m}.json`);
  if (fs.existsSync(byMonth)) return byMonth;
  // 지정 월 파일이 없으면 curated 폴더에서 가장 최근 파일
  if (!fs.existsSync(P.curated)) return null;
  const files = fs.readdirSync(P.curated).filter((f) => f.endsWith('.json')).sort();
  return files.length ? path.join(P.curated, files[files.length - 1]) : null;
}

function main() {
  const ref = today();
  const m = month();
  const curatedFile = pickCuratedFile();

  const master = readJson(P.master, []);
  const masterById = new Map(master.map((x) => [x.id, x]));

  const report = { 기준일: ref, 월: m, curated파일: curatedFile ? path.basename(curatedFile) : null,
    신규: [], 갱신: [], 제거_마감경과: [] };

  // 1) 당월 curated 병합
  const curated = curatedFile ? readJson(curatedFile, []) : [];
  for (const item of curated) {
    if (!item || !item.id) { log('경고: id 없는 항목 건너뜀'); continue; }
    if (masterById.has(item.id)) {
      // 기존 갱신: 새 수집분을 덮되, 이미 내려받은 포스터 로컬 경로는 보존
      const prev = masterById.get(item.id);
      const merged = { ...prev, ...item };
      if (!item.포스터 && prev.포스터) merged.포스터 = prev.포스터;
      merged.수집월 = prev.수집월 || item.수집월; // 최초 수집월 유지
      merged.갱신일 = ref;
      masterById.set(item.id, merged);
      report.갱신.push({ id: item.id, 활동명: item.활동명 });
    } else {
      const added = { ...item };
      added.수집월 = item.수집월 || m;
      added.갱신일 = ref;
      if (!added.게시상태) added.게시상태 = '게시';
      masterById.set(item.id, added);
      report.신규.push({ id: added.id, 활동명: added.활동명, 주최: added.주최 || '', 마감일: added.마감일 ?? null });
    }
  }

  // 2) 마감 경과 제거 (마감일 null 은 유지)
  const kept = [];
  const removed = [];
  for (const item of masterById.values()) {
    if (isExpired(item.마감일, ref)) {
      removed.push(item);
      report.제거_마감경과.push({ id: item.id, 활동명: item.활동명, 마감일: item.마감일 });
    } else {
      kept.push(item);
    }
  }

  // 3) 정렬: 마감일 오름차순, null(상시)은 맨 뒤, 그다음 활동명
  kept.sort((x, y) => {
    const dx = x.마감일 || '9999-99-99';
    const dy = y.마감일 || '9999-99-99';
    if (dx !== dy) return dx < dy ? -1 : 1;
    return String(x.활동명 || '').localeCompare(String(y.활동명 || ''), 'ko');
  });

  writeJson(P.master, kept);

  // 4) 제거분 아카이브 (마감경과 항목 보존)
  if (removed.length) {
    const archiveDir = path.join(P.archive, m);
    ensureDir(archiveDir);
    writeJson(path.join(archiveDir, 'removed-expired.json'), removed);
  }

  // 5) 리포트 저장
  ensureDir(P.reports);
  writeJson(path.join(P.reports, `merge-${m}.json`), report);

  log(`병합 완료 — 신규 ${report.신규.length} / 갱신 ${report.갱신.length} / 제거(마감경과) ${report.제거_마감경과.length} / 마스터 총 ${kept.length}건`);
}

main();
