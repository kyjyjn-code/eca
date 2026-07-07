# SDC ECA 자동 리서치·게시 시스템

초·중·고 대상 대회·공모전·프로그램(ECA)을 매월 자동 수집·정리·게시하는 시스템입니다.
설계 기준: `SDC_ECA_시스템_설계서_v3.md` / 공통 규칙: `CLAUDE.md`

## 구조
- `data/` — `sources.json`(소스 씨앗), `keywords.json`(키워드 사전), `master.json`(동적 마스터, 사이트의 원천), `raw/`·`curated/`(월별 수집·정리 기록)
- `scripts/` — 결정적 스크립트 5종 (merge / check-links / fetch-posters / export-excel / build)
- `.claude/agents/` — 에이전트 3종 (researcher / curator / publisher), `.claude/commands/monthly-eca.md` — 실행 명령
- `docs/` — GitHub Pages 공개 사이트 (학생이 보는 곳)
- `records/` — 월별 엑셀 기록 (내부용)
- `.github/workflows/monthly.yml` — 매월 1일 자동 실행 + 수동 실행 버튼

## 로컬 실행 순서
```
node scripts/merge.js         # curated → master 병합
node scripts/check-links.js   # 링크 생존 확인 → 게시상태 갱신
node scripts/fetch-posters.js # 포스터 다운로드·압축
node scripts/export-excel.js  # 월별 엑셀 기록
node scripts/build.js         # docs/ 사이트 생성
```
