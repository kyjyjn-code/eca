---
description: 이번 달 ECA 파이프라인 전체를 순서대로 실행한다 (대상 열거 → 리서치 → 기록 검증 → 큐레이션 → 병합 → 링크검증 → 포스터 → 엑셀 → 빌드 → 계측 → 게시 PR → 회고).
---

이번 달 SDC ECA 파이프라인을 아래 순서대로 실행하세요. 각 단계는 파일(JSON)로 다음 단계에 연결되며, 한 단계가 실패하면 그 지점부터 다시 돌릴 수 있습니다. 대상 월은 인자로 지정할 수 있고, 없으면 이번 달(YYYY-MM)입니다: $ARGUMENTS

## 최우선 원칙 (모든 단계 공통)
- 결과 보장 표현 금지 · 사실 검증 · **HSS/Holyseas School 언급 절대 금지** · 한국 학생 지원 자격 확인.

## 실행 순서

0.5. **대상 열거** — `node scripts/make-targets.js` : 이번 회차에 처리할 대상을 전부 열거해 `data/raw/YYYY-MM.targets.json`을 만든다. **리서치보다 먼저 돌아야 한다.**
1. **리서치** — `researcher` 서브에이전트를 실행한다. targets 의 전 항목을 처리하고 `data/raw/YYYY-MM.json` 과 `YYYY-MM.coverage.json` 둘을 만든다. **신규 발굴은 매월 무조건 수행한다.**
1.5. **기록 검증** — `node scripts/check-coverage.js` : targets 전 항목의 처리 결과·확인수준 표기·소스 관찰 기록을 확인한다. **실패하면 exit 1 로 멈춘다.** 통과하면 사람이 읽는 `coverage.md`를 렌더한다.
1.6. **검토 큐 갱신** — `node scripts/update-review-queue.js` : 학교 단위 접수 대회를 `data/review/기관접수검토.md`에 누적한다.
2. **큐레이션** — `curator` 서브에이전트를 실행해 판정·가공 칸을 채우고 `data/curated/YYYY-MM.json`을 만든다.
3. **병합** — `node scripts/merge.js` : curated 를 `data/master.json`에 병합, 마감 경과 제거, 병합 리포트 생성.
4. **링크 검증** — `node scripts/check-links.js` : 마스터 전체 링크 생존 확인, 이상 항목 게시 제외, 리포트 생성.
5. **포스터** — `node scripts/fetch-posters.js` : 신규 포스터 다운로드·800px webp 압축.
6. **엑셀 기록** — `node scripts/export-excel.js` : `records/`에 월별 xlsx + 아카이브 사본.
7. **빌드** — `node scripts/build.js` : `docs/index.html` + `docs/data.json` + `docs/upcoming.json` + 아카이브 스냅샷 생성.
7.5. **계측** — `node scripts/compute-kpi.js` : 당월 지표를 재서 `data/retro/kpi.json`에 upsert 한다. 숫자는 스크립트가 재고 회고는 해석만 한다.
8. **변경 요약** — `node scripts/pr-summary.js > pr-body.md` : 병합·링크 리포트 기반 PR 본문 생성.
9. **가드레일 검사** — `node scripts/check-guardrails.js` : 금칙 명칭·보장 표현·제외 항목 누출·참고용 고지를 확인한다. **실패하면 게시하지 않고 중단한다.**
10. **게시** — 가드레일 통과 시 `eca/update-YYYY-MM` 브랜치로 게시용 PR 을 만든다(본문은 `pr-body.md`). 자동 실행에서는 GitHub Actions가 이 단계를 대신한다.
11. **회고** — `retro` 서브에이전트를 실행해 `data/retro/YYYY-MM.md`를 만든다. **이 단계는 CI 에 없다 — 월간 세션에서만 돈다.** 회고는 제안만 하고 반영은 사람이 한다(최대 3건).

## 안전장치
- 리서치 결과가 비었거나, 병합 후 **게시 항목이 기준 건수(초기 10건) 미만**이면 게시(10단계)를 중단하고 사유를 알린다. 기존 사이트를 빈약한 페이지로 덮어쓰지 않는다.
- **가드레일 검사(9단계)가 실패하면 어떤 경우에도 게시하지 않는다.** 검사기를 통과시키려고 규칙을 완화하지 않는다.
- 실패 시 어느 단계에서 멈췄는지 명확히 보고한다. 월별 아카이브는 항상 보존한다.

## 마친 뒤 보고
- 신규 발굴 / 갱신 / 마감제거 / 링크제외 건수, 게시 총계, 별점 분포, 씨앗 커버리지를 요약한다.
- **신규 발굴이 0건이면 그 자체를 이상 신호로 보고한다** — `coverage.json` 의 `신규0건_사유`를 함께 인용한다.
- 회고가 낸 제안(최대 3건)을 그대로 옮겨 담당자가 채택을 결정하게 한다.
- 채택한 제안을 반영했다면 `data/retro/changelog.md`에 한 줄 적었는지 확인한다.
- 담당자가 확인할 것: PR 변경 요약 + 미리보기(docs) + 별점 타당성 + 회고 제안.
