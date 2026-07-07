// fetch-posters.js — 공식 포스터 이미지 다운로드·압축 (설계서 4.5)
// - 마스터에서 포스터_url 이 있고 게시상태가 "게시"인 항목만 대상
// - 이미지 파일을 내려받아 최대 변 800px 리사이즈 + webp 압축 → docs/posters/<id>.webp
// - 스키마의 포스터 칸(로컬 경로)을 채움
// - 이미 내려받은 포스터(동일 id)는 건너뜀
// - 포스터가 없거나 접근·다운로드가 막히면 건너뛰고 포스터를 빈칸으로 (기본 카드로 표시)
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { P, readJson, writeJson, ensureDir, month, log } = require('./lib');

const MAX_PX = 800;
const TIMEOUT_MS = 20000;

async function download(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SDC-ECA-poster/1.0)' },
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') || '';
    if (!/image\//i.test(ct)) return { ok: false, reason: `이미지 아님(${ct || '타입불명'})` };
    const buf = Buffer.from(await res.arrayBuffer());
    return { ok: true, buf };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, reason: e.name === 'AbortError' ? '타임아웃' : (e.message || '다운로드 실패') };
  }
}

async function main() {
  const m = month();
  const master = readJson(P.master, []);
  ensureDir(P.posters);

  let 신규 = 0, 건너뜀 = 0, 실패 = 0;

  for (const item of master) {
    const published = typeof item.게시상태 === 'string' && item.게시상태.startsWith('게시');
    if (!item.포스터_url || !published) continue;

    const outRel = path.posix.join('posters', `${item.id}.webp`);
    const outAbs = path.join(P.posters, `${item.id}.webp`);

    if (fs.existsSync(outAbs)) { // 이미 있음 → 경로만 보장
      item.포스터 = outRel;
      건너뜀++;
      continue;
    }

    const dl = await download(item.포스터_url);
    if (!dl.ok) {
      item.포스터 = '';
      item._포스터오류 = dl.reason;
      실패++;
      log(`포스터 실패 [${item.id}] ${dl.reason}`);
      continue;
    }
    try {
      await sharp(dl.buf)
        .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(outAbs);
      item.포스터 = outRel;
      delete item._포스터오류;
      신규++;
    } catch (e) {
      item.포스터 = '';
      item._포스터오류 = '이미지 변환 실패: ' + (e.message || '');
      실패++;
      log(`포스터 변환 실패 [${item.id}] ${e.message}`);
    }
  }

  writeJson(P.master, master);
  log(`포스터 처리 완료 — 신규 ${신규} / 기존건너뜀 ${건너뜀} / 실패 ${실패}`);
}

main();
