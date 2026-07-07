// build.js — 마스터에서 게시 항목만 추려 고정 HTML 틀에 끼워 docs/ 사이트 생성 (설계서 4.7)
// 출력: docs/index.html + docs/data.json + docs/og-image.png(없으면 생성) + docs/archive/YYYY-MM/ 스냅샷
// LLM이 아닌 결정적 스크립트라 매월 동일 품질. 내용과 형식 분리.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { P, readJson, writeJson, ensureDir, month, today, log } = require('./lib');

// 최종 배포 URL (5단계에서 실제 Pages 주소로 채움). 카카오톡 OG 미리보기는 절대 URL 필요.
const SITE_URL = (process.env.SDC_SITE_URL || '').replace(/\/$/, '');

const DISCLAIMER_일반 = '본 정보는 수집 시점 기준이며, 일정·요강은 변경될 수 있습니다. 신청 전 반드시 공식 페이지에서 최종 확인하세요.';
const DISCLAIMER_별점 = '이 별점·관련도는 합격·수상 보장이 아닌 SDC 참고용입니다.';

// 사이트에 내보낼 필드만 추림 (_로 시작하는 내부 필드 제거)
const PUBLIC_FIELDS = ['id', '활동명', '분야', '과목태그', '키워드', '대상_학년', '대상_원문',
  '주최', '마감일', '신청기간_원문', '비용_구분', '핵심내용', '웹사이트', '포스터',
  '미국입시_관련도', 'SDC_적합도'];

function toPublic(item) {
  const o = {};
  for (const f of PUBLIC_FIELDS) if (item[f] !== undefined) o[f] = item[f];
  return o;
}

async function ensureOgImage() {
  const out = path.join(P.docs, 'og-image.png');
  if (fs.existsSync(out)) return;
  // SDC 명의의 자체 제작 배너 1장 (활동 포스터를 대표 이미지로 쓰지 않음)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#f7fff9"/>
    </linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
    <rect x="0" y="0" width="1200" height="12" fill="#3b5ba5"/>
    <text x="80" y="270" font-family="Segoe UI, sans-serif" font-size="76" font-weight="700" fill="#2b3a67">SDC 대외활동 모음</text>
    <text x="80" y="350" font-family="Segoe UI, sans-serif" font-size="40" fill="#5a6b8c">초·중·고 대회·공모전·프로그램</text>
    <text x="80" y="560" font-family="Segoe UI, sans-serif" font-size="26" fill="#8a97b3">매월 업데이트 · 신청 전 공식 페이지 확인</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(out);
  log('OG 배너 생성 — docs/og-image.png');
}

function html(dataJson) {
  const ogImage = SITE_URL ? `${SITE_URL}/og-image.png` : 'og-image.png';
  const ogUrl = SITE_URL || '';
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SDC 대외활동 모음 — 초·중·고 대회·공모전·프로그램</title>
<meta name="description" content="공신력 있는 초·중·고 대상 대회·공모전·프로그램을 매월 모아 보여드립니다. 조건을 걸러 나에게 맞는 활동을 찾아보세요.">
<meta property="og:type" content="website">
<meta property="og:title" content="SDC 대외활동 모음">
<meta property="og:description" content="초·중·고 대회·공모전·프로그램을 매월 업데이트. 신청 전 공식 페이지에서 최종 확인하세요.">
<meta property="og:image" content="${ogImage}">
${ogUrl ? `<meta property="og:url" content="${ogUrl}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<style>
  :root{ --blue:#eaf1ff; --blue-d:#3b5ba5; --mint:#e6fbf1; --peach:#fff0e6; --lav:#f0ebff;
    --ink:#2b3a67; --sub:#5a6b8c; --line:#e7ecf5; --card:#ffffff; --bg:#fbfcff; }
  *{box-sizing:border-box}
  body{margin:0;font-family:"Segoe UI","Malgun Gothic",sans-serif;background:var(--bg);color:var(--ink);line-height:1.5}
  .wrap{max-width:1080px;margin:0 auto;padding:16px}
  header{padding:24px 0 8px}
  h1{font-size:26px;margin:0 0 4px}
  .lead{color:var(--sub);font-size:14px;margin:0}
  .notice{background:var(--blue);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:14px 0;font-size:13px;color:var(--sub)}
  .notice strong{color:var(--ink)}
  .controls{background:var(--bg);padding:10px 0;border-bottom:1px solid var(--line)}
  input[type=search]{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:12px;font-size:15px}
  .filters{margin-top:8px}
  .fgroup{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line)}
  .glabel{flex:0 0 74px;white-space:nowrap;text-align:center;font-size:15px;font-weight:700;color:var(--blue-d);letter-spacing:.02em}
  .chips{display:flex;flex-wrap:wrap;gap:8px;flex:1 1 auto;min-width:0}
  .datein{padding:7px 10px;border:1px solid var(--line);border-radius:8px;font-size:13px;font-family:inherit}
  .chip{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 13px;font-size:13px;cursor:pointer;user-select:none;transition:.12s}
  .chip:hover{border-color:var(--blue-d)}
  .chip.on{background:var(--blue-d);color:#fff;border-color:var(--blue-d);font-weight:600;box-shadow:0 1px 5px rgba(59,91,165,.35)}
  .chip.kw.on{background:#7c5fd3;color:#fff;border-color:#7c5fd3}
  .chip.star.on{background:#e6a532;color:#fff;border-color:#e6a532}
  .toggle{font-size:12px;color:var(--sub);display:flex;align-items:center;gap:6px;cursor:pointer}
  .count{color:var(--sub);font-size:13px;margin:10px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:8px}
  .card h3{margin:0;font-size:17px}
  .meta{font-size:13px;color:var(--sub)}
  .badges{display:flex;flex-wrap:wrap;gap:5px}
  .b{font-size:11px;padding:3px 8px;border-radius:999px;background:var(--mint)}
  .b.field{background:var(--blue)}
  .b.subject{background:var(--peach)}
  .b.kw{background:var(--lav)}
  .b.sangsi{background:#ffe9ec;color:#b0455a}
  .stars{color:#e6a532;font-size:14px}
  .desc{font-size:14px}
  .row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:auto}
  .btn{display:inline-block;background:var(--blue-d);color:#fff;text-decoration:none;padding:8px 14px;border-radius:10px;font-size:13px}
  .thumb{width:100%;max-height:180px;object-fit:cover;border-radius:10px;cursor:zoom-in;border:1px solid var(--line)}
  .deadline{font-weight:600}
  .deadline.soon{color:#c0392b}
  footer{color:var(--sub);font-size:12px;text-align:center;padding:28px 0}
  .lightbox{position:fixed;inset:0;background:rgba(20,26,45,.85);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
  .lightbox.on{display:flex}
  .lightbox img{max-width:100%;max-height:100%;border-radius:12px}
  .empty{padding:40px;text-align:center;color:var(--sub)}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>SDC 대외활동 모음</h1>
    <p class="lead">초·중·고 대회·공모전·프로그램 · 매월 업데이트</p>
  </header>

  <div class="notice"><strong>안내.</strong> ${DISCLAIMER_일반}</div>
  <div class="notice">${DISCLAIMER_별점}</div>

  <div class="controls">
    <input id="q" type="search" placeholder="활동명으로 검색">
    <div class="filters" id="filters"></div>
    <div class="fgroup">
      <span class="glabel">신청가능일</span>
      <div class="chips" style="align-items:center">
        <input type="date" id="dateStart" class="datein" aria-label="시작일">
        <span class="meta">~</span>
        <input type="date" id="dateEnd" class="datein" aria-label="종료일">
        <button id="dateClear" class="chip" type="button">해제</button>
        <span class="meta">설정한 날짜/기간에 아직 신청 가능한(마감 전) 활동만 표시 · 상시모집은 항상 포함</span>
      </div>
    </div>
    <div class="fgroup">
      <span class="glabel">옵션</span>
      <div class="chips">
        <label class="toggle"><input type="checkbox" id="kwAnd"> 키워드 모두 만족(AND)</label>
        <label class="toggle"><input type="checkbox" id="showPast"> 지난 것도 보기</label>
      </div>
    </div>
  </div>

  <div class="count" id="count"></div>
  <div class="grid" id="grid"></div>
  <div class="empty" id="empty" style="display:none">조건에 맞는 활동이 없습니다. 필터를 줄여보세요.</div>
</div>

<div class="lightbox" id="lightbox"><img id="lightboxImg" alt="포스터"></div>

<footer>SDC · 이 페이지의 정보는 참고용이며 신청 전 공식 페이지 확인이 필요합니다.</footer>

<script>
const DATA = ${dataJson};
const TODAY = "${today()}";
const FIELDS = ["과학·공학·수학생명·AI","국제·리더십·사회참여","글쓰기·논문·인문사회","스포츠·문화·봉사","환경·예술·공익"];
const GRADES = ["초","중","고"];
const COSTS = ["무료","소액","유료"];
const STAR_LABELS = {5:"매우 높음",4:"높음",3:"보통",2:"낮음",1:"매우 낮음"};
const state = { q:"", grade:new Set(), field:new Set(), star:new Set(), cost:new Set(), term:new Set(), kw:new Set(), dateStart:"", dateEnd:"", kwAnd:false, showPast:false };

function uniq(arr){ return [...new Set(arr)]; }
// 분야 필터 = 대분류 5개 + 데이터에 등장한 과목태그 (통합)
const allSubjects = uniq(DATA.flatMap(d=>d.과목태그||[])).sort();
const FIELD_OPTIONS = FIELDS.concat(allSubjects.filter(s=>!FIELDS.includes(s)));
const allKeywords = uniq(DATA.flatMap(d=>d.키워드||[])).filter(k=>k!=='상시모집').sort(); // 상시모집은 '신청기한' 그룹으로 이동

function chip(label, on, onClick, cls){
  const el = document.createElement('span');
  el.className = 'chip ' + (cls||'') + (on?' on':'');
  el.textContent = label;
  el.onclick = ()=>{ onClick(); el.classList.toggle('on'); render(); }; // 클릭 시 선택 표시 즉시 토글
  return el;
}
function buildFilters(){
  const f = document.getElementById('filters'); f.innerHTML='';
  const mk = (title, values, set, cls, labelFn)=>{
    const g=document.createElement('div'); g.className='fgroup';
    const l=document.createElement('span'); l.className='glabel'; l.textContent=title; g.appendChild(l);
    const wrap=document.createElement('div'); wrap.className='chips'; // 버튼은 라벨 칸을 침범하지 않는 별도 영역에서만 줄바꿈
    values.forEach(v=> wrap.appendChild(chip(labelFn?labelFn(v):v, set.has(v), ()=> set.has(v)?set.delete(v):set.add(v), cls)) );
    g.appendChild(wrap); f.appendChild(g);
  };
  mk('학년', GRADES, state.grade);
  mk('분야', FIELD_OPTIONS, state.field);
  mk('별점', [5,4,3,2,1], state.star, 'star', v=>'★'+v+' '+STAR_LABELS[v]);
  mk('비용', COSTS, state.cost);
  mk('신청기한', ['상시','임박'], state.term, '', v=> v==='상시'?'상시모집':'마감 임박(2주)');
  if(allKeywords.length) mk('키워드', allKeywords, state.kw, 'kw');
}

function isPast(d){ return d && d < TODAY; }
function matches(d){
  if(state.q && !(d.활동명||'').toLowerCase().includes(state.q.toLowerCase())) return false;
  if(!state.showPast && isPast(d.마감일)) return false;
  if(state.grade.size && !(d.대상_학년||[]).some(g=>state.grade.has(g))) return false;
  if(state.field.size){ // 대분류 또는 과목태그 어느 쪽이든 걸리면 통과
    const inField = state.field.has(d.분야) || (d.과목태그||[]).some(s=>state.field.has(s));
    if(!inField) return false;
  }
  if(state.star.size && !state.star.has(Number(d.SDC_적합도))) return false;
  if(state.cost.size && !state.cost.has(d.비용_구분)) return false;
  if(state.term.size){ // 신청기한: 상시모집(마감일 null) / 마감 임박(2주 이내)
    const isS = !d.마감일;
    const isSoon = d.마감일 && !isPast(d.마감일) && d.마감일 <= addDays(TODAY,14);
    if(!((state.term.has('상시') && isS) || (state.term.has('임박') && isSoon))) return false;
  }
  // 날짜/기간: 설정한 날(또는 기간 시작일)에 아직 신청 가능한(마감 전) 것만. 상시(null)는 항상 통과.
  const ws = state.dateStart || state.dateEnd;
  if(ws && d.마감일 && d.마감일 < ws) return false;
  if(state.kw.size){
    const kws = d.키워드||[];
    if(state.kwAnd){ for(const k of state.kw) if(!kws.includes(k)) return false; }
    else { if(!kws.some(k=>state.kw.has(k))) return false; }
  }
  return true;
}
function sortFn(a,b){
  const da=a.마감일||'9999-99-99', db=b.마감일||'9999-99-99';
  if(da!==db) return da<db?-1:1;
  return (a.활동명||'').localeCompare(b.활동명||'','ko');
}
function stars(n){ n=Number(n)||0; return '★'.repeat(n)+'☆'.repeat(5-n); }

function card(d){
  const el=document.createElement('div'); el.className='card';
  let poster='';
  if(d.포스터){ poster='<img class="thumb" src="'+d.포스터+'" alt="'+(d.활동명||'')+' 포스터" data-full="'+d.포스터+'">'; }
  const dl = d.마감일 ? ('<span class="deadline'+(!isPast(d.마감일)&&d.마감일<=addDays(TODAY,14)?' soon':'')+'">마감 '+d.마감일+'</span>')
                      : '<span class="b sangsi">상시</span>';
  const subj=(d.과목태그||[]).map(s=>'<span class="b subject">'+s+'</span>').join('');
  const kw=(d.키워드||[]).map(s=>'<span class="b kw">'+s+'</span>').join('');
  el.innerHTML =
    poster +
    '<h3>'+(d.활동명||'')+'</h3>'+
    '<div class="badges"><span class="b field">'+(d.분야||'')+'</span>'+subj+'</div>'+
    '<div class="meta">주최 '+(d.주최||'-')+' · 대상 '+(d.대상_원문||'-')+'</div>'+
    '<div class="stars" title="'+${JSON.stringify(DISCLAIMER_별점)}+'">'+stars(d.SDC_적합도)+' <span class="meta">중요도 '+(STAR_LABELS[Number(d.SDC_적합도)]||'-')+' · 미국입시 '+(d.미국입시_관련도||'-')+'</span></div>'+
    '<div class="desc">'+(d.핵심내용||'')+'</div>'+
    '<div class="badges">'+kw+'</div>'+
    '<div class="row">'+dl+(d.웹사이트?'<a class="btn" href="'+d.웹사이트+'" target="_blank" rel="noopener">링크</a>':'')+'</div>';
  const t=el.querySelector('.thumb');
  if(t) t.onclick=()=>openLightbox(t.dataset.full);
  return el;
}
function addDays(ymd,n){ const dt=new Date(ymd+'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate()+n);
  return dt.toISOString().slice(0,10); }

function openLightbox(src){ const lb=document.getElementById('lightbox'); document.getElementById('lightboxImg').src=src; lb.classList.add('on'); }
document.getElementById('lightbox').onclick=function(){ this.classList.remove('on'); };

function render(){
  const grid=document.getElementById('grid'); grid.innerHTML='';
  const list=DATA.filter(matches).sort(sortFn);
  document.getElementById('count').textContent='총 '+list.length+'개 활동';
  document.getElementById('empty').style.display=list.length?'none':'block';
  const frag=document.createDocumentFragment();
  list.forEach(d=>frag.appendChild(card(d)));
  grid.appendChild(frag);
}
document.getElementById('q').addEventListener('input', e=>{ state.q=e.target.value; render(); });
document.getElementById('kwAnd').addEventListener('change', e=>{ state.kwAnd=e.target.checked; render(); });
document.getElementById('showPast').addEventListener('change', e=>{ state.showPast=e.target.checked; render(); });
const dStart=document.getElementById('dateStart'), dEnd=document.getElementById('dateEnd');
dStart.addEventListener('change', e=>{ state.dateStart=e.target.value; render(); });
dEnd.addEventListener('change', e=>{ state.dateEnd=e.target.value; render(); });
document.getElementById('dateClear').onclick=()=>{ dStart.value=''; dEnd.value=''; state.dateStart=''; state.dateEnd=''; render(); };
buildFilters(); render();
</script>
</body>
</html>`;
}

async function main() {
  const m = month();
  const master = readJson(P.master, []);
  const published = master.filter((x) => typeof x.게시상태 === 'string' && x.게시상태.startsWith('게시'));

  ensureDir(P.docs);
  await ensureOgImage();

  const publicData = published.map(toPublic);
  const dataJson = JSON.stringify(publicData);

  writeJson(path.join(P.docs, 'data.json'), publicData);
  fs.writeFileSync(path.join(P.docs, 'index.html'), html(dataJson), 'utf8');

  // 아카이브 스냅샷
  const archiveDir = path.join(P.archive, m);
  ensureDir(archiveDir);
  fs.writeFileSync(path.join(archiveDir, 'index.html'), html(dataJson), 'utf8');
  writeJson(path.join(archiveDir, 'data.json'), publicData);

  if (!SITE_URL) log('참고: SDC_SITE_URL 미설정 → OG:image 는 상대경로. 5단계에서 실제 Pages 주소로 설정하면 카톡 미리보기가 완전해집니다.');
  log(`빌드 완료 — 게시 ${published.length}건 → docs/index.html, docs/data.json (아카이브: ${m})`);
}

main();
