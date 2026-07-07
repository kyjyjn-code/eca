// export-excel.js — 마스터를 사람이 이동하기 좋은 엑셀 기록으로 변환 (설계서 4.6)
// records/YYYY-MM_ECA_기록.xlsx 저장 + docs/archive/YYYY-MM/ 에 사본 복사.
// 시트: ① 당월 전체 게시목록(정렬, 마감 임박순) ② 당월 신규 ③ 제거·제외 목록(사유) ④ 분야·별점 분포 요약
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { P, readJson, ensureDir, month, today, daysBetween, log } = require('./lib');

const HEADERS = ['id', '활동명', '분야', '과목태그', '대상_원문', '주최', '마감일',
  '비용_구분', '미국입시_관련도', 'SDC_적합도', '키워드', '웹사이트', '핵심내용', '게시상태'];

function rowFrom(item) {
  return HEADERS.map((h) => {
    const v = item[h];
    if (Array.isArray(v)) return v.join(', ');
    if (h === '마감일') return v || '상시';
    if (h === 'SDC_적합도') return typeof v === 'number' ? '★'.repeat(v) : (v || '');
    return v == null ? '' : v;
  });
}

function styleHeader(sheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B5BA5' } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.height = 22;
  sheet.views = [{ state: 'frozen', ySplit: 1 }]; // 헤더 고정
}

function autoWidth(sheet) {
  sheet.columns.forEach((col) => {
    let max = 10;
    col.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value == null ? '' : cell.value).length;
      // 한글은 폭이 넓어 가중치
      const w = String(cell.value == null ? '' : cell.value).replace(/[^\x00-\x7F]/g, 'xx').length;
      max = Math.max(max, w, len);
    });
    col.width = Math.min(60, max + 2);
  });
}

function addTable(wb, name, items, { highlightSoon = false } = {}) {
  const sheet = wb.addWorksheet(name);
  sheet.addRow(HEADERS);
  const ref = today();
  for (const item of items) {
    const r = sheet.addRow(rowFrom(item));
    if (highlightSoon && item.마감일) {
      const d = daysBetween(ref, item.마감일);
      if (d >= 0 && d <= 14) { // 마감 2주 이내 강조
        r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }; });
      }
    }
  }
  styleHeader(sheet);
  autoWidth(sheet);
  return sheet;
}

function main() {
  const m = month();
  const master = readJson(P.master, []);
  const published = master.filter((x) => typeof x.게시상태 === 'string' && x.게시상태.startsWith('게시'));
  const excluded = master.filter((x) => typeof x.게시상태 === 'string' && x.게시상태.startsWith('제외'));
  const 신규 = published.filter((x) => x.수집월 === m);

  // 제거(마감경과)는 병합 리포트에서 가져옴
  const mergeReport = readJson(path.join(P.reports, `merge-${m}.json`), { 제거_마감경과: [] });
  const removedRows = (mergeReport.제거_마감경과 || []);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SDC ECA';
  wb.created = new Date(today() + 'T00:00:00');

  addTable(wb, '① 전체 게시목록', published, { highlightSoon: true });
  addTable(wb, '② 당월 신규', 신규, { highlightSoon: true });

  // ③ 제거·제외
  const s3 = wb.addWorksheet('③ 제거·제외');
  s3.addRow(['구분', 'id', '활동명', '사유/마감일']);
  for (const r of removedRows) s3.addRow(['마감경과 제거', r.id, r.활동명, r.마감일 || '']);
  for (const x of excluded) s3.addRow(['게시 제외', x.id, x.활동명, x.게시상태]);
  styleHeader(s3); autoWidth(s3);

  // ④ 분야·별점 분포 요약
  const s4 = wb.addWorksheet('④ 분포 요약');
  const byField = {};
  const byStar = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const x of published) {
    byField[x.분야 || '(미지정)'] = (byField[x.분야 || '(미지정)'] || 0) + 1;
    const st = Number(x.SDC_적합도);
    if (st >= 1 && st <= 5) byStar[st]++;
  }
  s4.addRow(['분야', '게시 건수']);
  for (const [k, v] of Object.entries(byField)) s4.addRow([k, v]);
  s4.addRow([]);
  s4.addRow(['별점', '건수']);
  for (const st of [5, 4, 3, 2, 1]) s4.addRow(['★'.repeat(st), byStar[st]]);
  s4.addRow([]);
  s4.addRow(['게시 총계', published.length]);
  s4.addRow(['당월 신규', 신규.length]);
  styleHeader(s4); autoWidth(s4);

  // 저장
  ensureDir(P.records);
  const outName = `${m}_ECA_기록.xlsx`;
  const outPath = path.join(P.records, outName);
  return wb.xlsx.writeFile(outPath).then(() => {
    // 아카이브 사본
    const archiveDir = path.join(P.archive, m);
    ensureDir(archiveDir);
    fs.copyFileSync(outPath, path.join(archiveDir, outName));
    log(`엑셀 기록 저장 — ${outName} (게시 ${published.length} / 신규 ${신규.length} / 제외 ${excluded.length} / 마감제거 ${removedRows.length})`);
  });
}

main();
