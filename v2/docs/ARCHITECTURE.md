# 설계 — THE FROM BRAIN

구현 기준 문서다. 값이 다르면 코드가 맞다.

## 1. 옵시디언과 다른 점

| 옵시디언 | BRAIN |
|---|---|
| 볼트 = 폴더 | 프로젝트 1개 = JSON 1개 (`내보내기`) |
| 노트 = 마크다운 파일 | 노드 = 기준(`knowledge/nodes.js`) 또는 분석 결과(판단 · 통합 인사이트) |
| `[[위키링크]]` | 이슈 설명에 `[[노드 이름]]`을 쓰면 그 노드를 반드시 분석에 넣는다 |
| 백링크 | 노드 탭 — 낸 판단, 연결된 판단, 쓰인 인사이트 |
| 그래프 뷰 | 뇌 형상의 브레인 맵 |
| 링크에 종류가 없다 | 연결에 종류 · 무게 · 이유가 있다 |
| 사람이 직접 잇는다 | AI가 잇고 사람이 고친다 |

설치 · 플러그인 · 파일 시스템은 쓰지 않는다. 브라우저에서 연다.

## 2. 세팅 (`knowledge/tags.js`, `js/graph/model.js`)

사람마다 노드를 다르게 세팅하지 않도록 칸과 태그를 정해 두었다.

| 항목 | 내용 |
|---|---|
| 분류 6 | 마케팅 · 기획 · 디자인 · 개발 · 통합 · 서비스(자사) |
| 공통 인풋 6칸 | 무엇을 · 목적 · 타겟 · 제품·서비스 · 채널·매체 · 제약·메모 |
| 분류별 인풋 4칸 | 분류마다 4칸, 그중 2칸 필수 (예: 마케팅 = 목표 지표 · 오퍼/메시지) |
| 태그 41개 | 분류별 태그와 키워드. 이슈마다 1개 이상 |
| 이슈 | 제목 · 태그 · (근본 이슈면) 판정 질문 |

- **태그 추천** `recommendTags` — 이슈 글에서 키워드를 찾아 점수순으로 추천한다. 규칙 기반이라 같은 글이면 누가 넣어도 같은 태그가 나온다. 사람이 고르지 않으면 추천 3개를 자동으로 붙이고 "자동"으로 표시한다.
- **분류 추천** `recommendCategory` — 같은 방식으로 분류를 추천한다.
- **세팅 점검** `validateProject` — 빈 필수 칸과 분석에 못 들어가는 이슈를 문장으로 알려 준다. 필수 칸이 비면 분석을 시작하지 않는다.
- **개발 관점 필요 여부** `needsDevelopment` — 분류가 개발이거나 개발 태그가 붙은 이슈가 있으면 필요로 본다. 아니면 AI가 판단하고, 뺄 때는 이유를 쓴다.

## 3. 분석 순서 (`js/engine/think.js`)

| # | 단계 | 하는 일 | 호출 |
|---|---|---|---|
| ⓪ | 기본안 | 기준 노드 없이 브리프만 읽고 안 3개를 받는다. 방법론 프롬프트를 넣지 않는다 | 1 |
| ① | 사조 고르기 | Airplane 사조 16개 중 4개를 고른다. 서로 반대되는 쌍을 1쌍 이상 넣는다 (카탈로그 A-99) | 1 |
| ② | 분석 | 아이덴티티 6 · 터널 4 · 고른 사조 4가 같은 미션과 이슈를 받아 따로 판단을 낸다 | 14 |
| ③ | 연결 | 판단 사이의 원인 · 조건 · 강화 · 충돌을 정한다. 이유가 없는 연결과 같은 노드 안의 연결은 받지 않는다 | 1 |
| ④ | 묶기 | 지지도와 묶음을 계산한다. AI를 부르지 않아서 같은 입력이면 같은 결과가 나온다 | 0 |
| ⑤ | 통합 | 묶음마다 통합 인사이트 1건 | 3 |
| ⑥ | 검증 | 인사이트가 묶음의 모든 노드군을 거쳤는지 ID로 센다. 걸리면 이유를 붙여 1번 다시 쓴다 | 걸린 건당 +1 |
| ⑦ | 통합 디렉션 | 인사이트를 기획 · 디자인 · 개발 · 서비스 관점의 할 일로 정리하고, 인사이트마다 기본안과 같은 해법인지 판정한다 | 1 |

기본값이면 21회다.

### 깊이 — 노드를 훑지 않게 하는 장치

노드 이름과 정의만 읽고 쓴 판단은 결과를 바꾸지 못한다. 그래서 분석 단계에 세 가지를 넣었다.

1. **원문을 읽힌다.** 사조 노드는 카탈로그 카드 전문을, 아이덴티티 · 터널 노드는 CORE의 해당 절을 프롬프트에 그대로 넣는다 (`knowledge/isms.js`, `knowledge/core.js`).
2. **생각한 순서를 쓰게 한다.**

| 칸 | 내용 | 대상 |
|---|---|---|
| `origin` | 이 사조가 무엇에 반대해서 나왔나 | 사조 |
| `parallel` | 그 반대가 이 과제의 무엇과 같은 구조인가 | 사조 |
| `ladder` | 현상 → 왜 → 본질, 3단계 이상 | 전체 |
| `treatment` | 그래서 이 과제에서 무엇을 어떻게 하나 | 사조 |
| `swap` | 다른 사조를 넣었다면 무엇이 달라지나 | 사조 |
| `leave` | 사조에서 가져오지 않을 것 | 사조 |
| `against` | 이 판단에 대한 반론 | 아이덴티티 · 터널 |

3. **얕은 판단은 코드가 뺀다.** `ladder`가 3단계 미만이거나 사조 판단에 `origin` · `parallel` · `swap`이 비어 있으면 제외하고 건수를 기록한다.

### 기본안 대조 — 브레인을 쓴 효과를 실행마다 확인

1. ⓪에서 받은 기본안 3개(B1~B3)를 ⑤ 통합 프롬프트에 넣는다. 인사이트는 가장 가까운 기본안(`without.nearest`)과 차이(`without.difference`)를 써야 한다.
2. ⑦에서 다른 호출이 인사이트마다 `같음` · `일부` · `다름`을 판정한다(`direction.overlap`). 인사이트를 쓴 호출이 스스로 판정하지 않게 나눴다.
3. 화면과 보고서에 건수로 표시한다. `같음`이 있으면 경고를 띄운다.

넣은 이유: 2026-11-25 평가에서 2.0 인사이트 3건 중 1건이 기본안과 같은 해법으로 판정됐다 (`docs/EVALUATION.md`).

## 4. 데이터

```
project { id, title, category, brief{what,purpose,target,product,channel,note}, seed{[분류]:{칸:값}},
          issues[{id,title,detail,test,root,tags[]}],
          settings{ismCount,signalsPerLens,insightCount,concurrency,minFamilies,minLenses,muted[],pinned[]},
          run }

run { at, provider, mode, setup, picks[{id,why}],
      signals[{id,lens,family,issue,ladder[],claim,basis,effect,stance,strength,origin?,parallel?,treatment?,swap?,leave?,against?}],
      edges[{id,from,to,type,weight,why,by}],          // by: 'ai' | 'human'
      baseline{concepts[{id,title,concept,visual}],common},
      energy{signalId: 0~1}, clusters[], insights[], direction, link{}, usage{}, failed[], notes[], calls, tokens, ms }

direction { headline, perspectives{planning,design,development?,service: {direction,actions[],from[],need[]}},
            developmentReason, conflicts[{between[2],what,resolve}], priority[{what,owner,from}], unusedInsights[],
            overlap[{insight,baseline,verdict,why}] }
```

- 판단 ID는 노드 이름으로 만든다 (`JAMAIS-2`, `BRUTAL-1`). 병렬 실행 순서가 달라도 같다.
- `stance`: `keep` 지킬 관성 · `change` 바꿀 해석 · `limit` 넘지 않을 선 · `open` 비어 있는 자리.
- `type`: `cause` 원인(방향 있음) · `condition` 조건(방향 있음) · `reinforce` 강화 · `tension` 충돌.

## 5. 계산 (`js/graph/propagate.js`)

**지지도**

```
e ← (1 − d)·강도 + d·(1 − exp(−지지))        d = 0.5, 24회 반복
지지 = Σ 무게 × 이웃의 지지도 × (다른 노드군 1 · 같은 노드군 0.5)
```

원인 · 조건은 결과 쪽으로 전부, 전제 쪽으로 절반 전달한다. 강화는 양쪽으로 전달한다. 충돌은 전달하지 않는다.

**묶음** — 판단 하나에서 시작해, 지금 묶음과 연결 무게 합이 가장 큰 판단을 1건씩 더한다. 같은 이슈면 1.25배, 합이 0.5 미만이면 멈춤, 최대 7건. 자리가 얼마 안 남았는데 빠진 노드군이 있으면 그 노드군부터 넣는다.

```
점수 = 지지도 합 × 노드군 범위(1군 0.2 · 2군 0.6 · 3군 1) × (1 + 0.2 × 묶음 안 충돌 수)
```

점수순으로 N개를 고르고, 이미 고른 묶음과 절반 이상 겹치면 건너뛴다. 충돌에 가산점을 주는 근거는 CORE §6.1이다.

## 6. 검증

**통합 인사이트 `checkInsight`**

| 걸리는 조건 | 뜻 |
|---|---|
| 거친 판단이 3건 미만 | 요약에 그쳤다 |
| 묶음에 있는 노드군 중 거치지 않은 것이 있다 | 한 단계만 인용했다 (1.x의 문제) |
| 근거 노드가 3개 미만 | 한 노드만 반영했다 |
| 묶음이 2개 노드군 미만이다 | 통합이 아니다 |
| 충돌이 있는데 해결 방법이 없다 | 충돌을 건너뛰었다 |
| 근본 이슈에 대입한 결과가 없다 | 이슈에 답하지 않았다 |
| `without`이 비었다 | 기본안과의 차이를 말하지 못했다 |

묶음에 없는 판단 ID는 빼고 `foreign`에 센다. 검증은 문장을 해석하지 않고 ID와 빈칸만 센다.

**통합 디렉션 `checkDirection`** — 관점마다 방향 · 바로 할 일 · 근거 인사이트 ID가 있어야 한다. 총괄 한 문장과 먼저 할 일 2건 이상이 있어야 한다. 개발 관점을 뺐으면 이유가 있어야 한다. 기본안이 있으면 모든 인사이트에 대조 판정이 있어야 한다. 어느 관점에도 쓰이지 않은 인사이트는 `unusedInsights`로 남긴다.

## 7. 공급자

```js
{ name, label, json({ role: 'director'|'brain'|'sub', system, user, signal, task }) → { json, usage? } }
```

`task`는 목업 전용이다. 새 공급자는 `js/providers/`에 같은 형태로 추가하고 `app.js`의 `getProvider`에 한 줄을 넣는다.

| 역할 | 쓰는 단계 |
|---|---|
| `sub` | ⓪ 기본안 · ② 분석 |
| `brain` | ① 사조 고르기 · ③ 연결 |
| `director` | 이슈 뽑기 · ⑤ 통합 · ⑦ 통합 디렉션 |

## 8. 보안

- 모델이 쓴 문장은 `textContent`로만 화면에 넣는다. `innerHTML`은 쓰지 않는다.
- 내 키 방식: 키를 브라우저 localStorage에 저장한다. 공용 PC에서는 쓰지 않는다.
- 서버 키 방식: `/api/llm`은 `/responses` · `/chat/completions`만 전달한다. 사내 배포에는 `BRAIN_ACCESS_CODE`를 꼭 넣는다. 없으면 주소를 아는 누구나 회사 키를 쓴다.
- `server.js`는 `v2/`와 1.x 글꼴 폴더만 연다.

## 9. 다음 작업

1. 사람 블라인드 평가 — 브리프 3건 이상, 1.x · 2.0 · 브레인 없는 안을 설명 없이 비교한다 (CORE §6.3). 평가 방법은 `docs/EVALUATION.md`.
2. 연결 단계를 둘로 나눈다 — 이슈 안 연결과 이슈 간 연결. 판단이 60건을 넘으면 1회 호출로는 얕아진다.
3. 통합 인사이트를 1.x 후반부(컨셉 키트 · Creative)로 넘기는 연결.
4. 웹 조사 노드 — 시장 판단에 URL 근거를 붙인다.
5. Electron 창에 넣기 — `index.html`을 그대로 띄우고 공급자만 1.x 것으로 바꾼다.
6. 중앙관제 — 프로젝트 JSON을 1.x의 `ProjectStore`에 저장한다.
