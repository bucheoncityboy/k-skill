# 국고채 수익률곡선 모니터

`yield-curve-monitor`는 한국은행 ECOS 일별 시장금리에서 국고채 2·3·5·10·20·30년을 같은 관측일로 정렬하고, 만기별 변화와 커브 움직임을 검증하는 조회·리서치 스킬이다. 범용 ECOS 조회는 `bok-ecos-stats`를 사용한다.

## 범위

- 최신 공통 관측일의 여섯 만기 금리
- 전일·1주·전월말·분기말·연초 대비
- 최근 5·20거래일 고점·저점·순변화·최대 일간 변동
- 5Y-3Y, 10Y-5Y, 10Y-3Y, 30Y-10Y 스프레드
- Bull/Bear 및 steepening/flattening 기계적 분류
- 한국은행 기준금리 대비 국고채 3년물 갭
- 이벤트 전후 최초 공통 관측일 비교
- 선택적 뉴스 evidence와 재현 가능한 HTML·Markdown·CSV 보고서

실시간 호가, 개별 채권 가격평가, 듀레이션·DV01, 금리 전망, 매매 신호는 다루지 않는다.

## 데이터 경로

| 원천 | 통계·항목 | 단위·주기 |
| --- | --- | --- |
| 한국은행 ECOS | `817Y002` / 2Y `010195000` | 연% / D |
| 한국은행 ECOS | `817Y002` / 3Y `010200000` | 연% / D |
| 한국은행 ECOS | `817Y002` / 5Y `010200001` | 연% / D |
| 한국은행 ECOS | `817Y002` / 10Y `010210000` | 연% / D |
| 한국은행 ECOS | `817Y002` / 20Y `010220000` | 연% / D |
| 한국은행 ECOS | `817Y002` / 30Y `010230000` | 연% / D |
| 한국은행 ECOS | `722Y001` / 기준금리 `0101000` | 연% |

공개 demo key `sample`로 가입 없이 동작한다. helper는 조회창을 최대 10일로 분할해 demo key의 호출당 10행 제한을 지킨다. 더 많은 호출 여유가 필요하면 ECOS에서 무료 키를 발급받아 `KSKILL_BOK_ECOS_API_KEY`로 전달할 수 있다. 공개 read-only endpoint이므로 k-skill-proxy를 사용하지 않는다.

## 기본 사용

```bash
# 최신 커브와 전일·1주·전월말 비교
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- --preset dashboard

# 최근 20거래일
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- --lookback-sessions 20

# 월말 대 월말
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- --from-month 2026-07 --to-month 2026-08

# 이벤트 전후
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- --event-date 2026-08-27
```

기본 응답은 대화에 핵심 코멘트, 만기별 금리·변화 표, 직접 출처 링크를 표시한다. 요청일이 휴일이거나 최신 통계가 아직 게시되지 않았으면 7일 이내의 최신 공통 관측일을 사용하고 요청일과 실제 관측일을 함께 밝힌다.

## 영구 보고서

사용자가 HTML·레포트·파일 저장을 요청한 경우에만 정확한 두 날짜와 `--out`을 사용한다.

```bash
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- \
  --base 2026-09-11 --as-of 2026-09-18 --out ./yield-curve-report
```

산출물은 다음 여섯 개다.

| 파일 | 역할 |
| --- | --- |
| `report.html` | 커브 차트와 검증 표 |
| `brief.md` | 텍스트 요약과 출처 |
| `market-table.csv` | 계산 결과 |
| `evidence.json` | 정규화 입력, source receipt, 원문 hash |
| `status.json` | READY/INCOMPLETE/BLOCKED와 뉴스 상태 |
| `manifest.json` | 산출물 SHA-256 |

`evidence.json`을 재생하면 네트워크 없이 동일한 여섯 파일을 생성한다.

```bash
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- \
  --replay ./yield-curve-report/evidence.json --out ./yield-curve-replay
```

## 뉴스 evidence

뉴스 코멘트는 사용자가 원인·배경·헤드라인을 요청한 경우에만 추가한다. helper는 뉴스 사이트를 자동 크롤링하지 않는다. 에이전트가 공개 원문을 확인하고 제목, HTTPS URL, 게시 UTC, 140자 이하 요인 의역, 280자 이하 근거 의역만 JSON으로 전달한다.

```bash
npx -y @nomadamas/k-skill@0 exec yield-curve-monitor scripts/yield_curve_monitor.mjs -- \
  --news-template 2026-09-21 > news-evidence.json
```

- 기사 KST 날짜는 실제 공통 관측일과 같아야 한다.
- 3년·10년 방향과 일치하는 explicit 기사만 원인 코멘트에 채택한다.
- 공식 발표는 `contextual/context`로만 기록한다.
- 방향 불일치 기사는 evidence에는 보존하고 코멘트에서 제외한다.
- 뉴스 실패는 검증된 커브의 `READY`를 변경하지 않는다.
- 기사 본문 전체를 저장하거나 재배포하지 않는다.

## 안정성 계약

- 통계표·통계명·항목 코드·항목명·단위·날짜·응답 건수를 검사한다.
- 일시 오류만 최대 3회 지수 backoff로 재시도한다.
- 캐시는 168시간 이내이며 envelope hash와 원문 hash가 모두 맞을 때만 fallback으로 사용한다.
- 여섯 만기가 같은 관측일에 모이지 않으면 완전한 커브 비교를 차단한다.
- 변화는 `1%p = 100bp`로 계산하고 금리는 연%로 표시한다.
- 파일은 staging 디렉터리에 쓴 뒤 자체 검증을 통과한 경우에만 최종 경로로 원자적 이동한다.
- 기존 출력 경로를 덮어쓰지 않는다.

세부 산술과 상태 판정은 다음 reference에 있다.

```bash
npx -y @nomadamas/k-skill@0 read yield-curve-monitor references/methodology.md
```

## 실패 처리

| 상황 | 결과 |
| --- | --- |
| 여섯 만기 공통 관측일 확보 | `READY` |
| 일부 비교 기준만 확보 | `INCOMPLETE`, 확보된 값만 표시 |
| 공통 관측값 없음 | `BLOCKED`, 추정 금지 |
| 한 구간 네트워크 실패 | 검증된 캐시만 사용, 없으면 해당 구간 실패 |
| 기준금리만 실패 | 커브 유지, 정책금리 갭 제외 |
| 뉴스 날짜·호스트·fingerprint 불일치 | 뉴스 evidence 거부 |
| 뉴스 방향 불일치 | `UNATTRIBUTED` 또는 해당 기사 제외 |

## 검증

```bash
node --test scripts/yield-curve-monitor.test.js
npm run generate:skill-stubs -- --check
npm run sync:cli-skills -- --check
npm run migrate:cli-assets -- --check
```

테스트는 날짜·단위·중복·결측·공통 관측일, bp·스프레드·곡선 분류, 캐시 변조·만료, 뉴스 날짜·호스트·방향·fingerprint, 보고서 manifest와 evidence 재생 동일성을 확인한다.
