# 설계 — THE FROM BRAIN

README가 "무엇을 · 왜"라면 이 문서는 "정확히 어떻게"다. 값은 코드가 원본이다.

## 1. 옵시디언에서 가져온 것과 버린 것

| 옵시디언 | BRAIN |
|---|---|
| 볼트 = 폴더 | 프로젝트 하나 = JSON 하나 (`내보내기`) |
| 노트 = 마크다운 파일 | 노드 = 기준(`knowledge/nodes.js`) 또는 사고의 산출(신호 · 인사이트) |
| `[[위키링크]]` | 이슈 설명의 `[[노드 이름]]` → 사람의 지목(`hint`) |
| 백링크 | 노드 탭 — 낸 신호 · 대입된 신호 · 쓰인 인사이트 |
| 그래프 뷰 | 뇌 형상의 유니버스 |
| 링크에 종류가 없다 | **엣지에 종류 · 무게 · 이유가 있다** |
| 사람이 손으로 잇는다 | AI가 잇고 사람이 고친다 |

버린 것: 설치 · 플러그인 · 파일 시스템. 브라우저에서 열린다.

## 2. 데이터

```
project { id, title, brief{what,purpose,target,product,channel,note},
          issues[{id,title,detail,test,root}],
          settings{ismCount,signalsPerLens,insightCount,concurrency,minFamilies,minLenses,muted[],pinned[]},
          run }

run { at, provider, mode, picks[{id,why}],
      signals[{id,lens,family,issue,claim,basis,effect,stance,strength,source,leave?,hinted?,muted?}],
      edges[{id,from,to,type,weight,why,by}],          // by: 'ai' | 'human'
      energy{signalId: 0~1}, clusters[], insights[], link{}, usage{}, failed[], notes[], calls, tokens, ms }
```

- 신호 ID는 노드 이름에서 만든다(`JAMAIS-2` · `BRUTAL-1`). 병렬 실행 순서와 무관하게 같다.
- `stance`: `keep` 지킬 관성 · `change` 바꿀 해석 · `limit` 넘지 않을 경계 · `open` 비어 있는 자리.
- `type`: `cause` 원인(방향) · `condition` 조건(방향) · `reinforce` 강화 · `tension` 긴장.

## 3. 계산 (`js/graph/propagate.js`)

**에너지**

```
e ← (1 − d)·강도 + d·(1 − exp(−지지))        d = 0.5, 24회 반복
지지 = Σ 무게 × 이웃의 에너지 × (다른 노드군 1 · 같은 노드군 0.5)
```

원인 · 조건은 결과 쪽으로 온전히, 전제 쪽으로 절반이 흐른다. 강화는 양쪽. 긴장은 에너지를 주지 않는다.

**묶음** — 신호마다 씨앗으로 삼아, 지금 묶음과 이어진 엣지 무게의 합이 가장 큰 신호를 하나씩 더한다(같은 이슈면 1.25배, 합이 0.5 미만이면 멈춤, 최대 7건). 자리가 얼마 남지 않았는데 빠진 노드군이 있으면 그 노드군을 먼저 데려온다.

```
점수 = 에너지 합 × 노드군 범위(1군 0.2 · 2군 0.6 · 3군 1) × (1 + 0.2 × 묶음 안의 긴장 수)
```

점수 순으로 N개를 고르되, 이미 고른 묶음과 절반 이상 겹치면 건너뛴다. 긴장에 가산점을 주는 이유: 좋은 안은 긴장을 푸는 자리에서 나온다(CORE §6.1).

## 4. 가드 (`checkInsight`)

| 걸리는 조건 | 뜻 |
|---|---|
| 사슬이 지난 신호가 3건 미만 | 요약이지 통합이 아니다 |
| 묶음에 있는 노드군 중 사슬이 지나지 않은 것이 있다 | 한 단계만 인용했다 — 1.x의 그 문제 |
| 근거 노드가 `minLenses`(3)개 미만 | 한 노드의 말만 들었다 |
| 묶음이 `minFamilies`(2)군 미만에 걸쳐 있다 | 수렴이 아니다 |
| 묶음에 긴장이 있는데 푸는 법이 없다 | 긴장을 피했다 |
| 근본 이슈에 넣은 결과가 없다 | 대입하지 않았다 |

묶음에 없는 신호 ID는 사슬에서 빼고 `foreign`에 센다. 가드는 문장을 읽지 않는다. ID만 센다 — 그래서 속지 않는다.

## 5. 공급자

```js
{ name, label, json({ role: 'director'|'brain'|'sub', system, user, signal, task }) → { json, usage? } }
```

`task`는 목업 전용이다(어떤 작업인지와 재료). 새 공급자는 `js/providers/`에 같은 모양으로 더하고 `app.js`의 `getProvider`에 한 줄을 넣는다.

| 역할 | 쓰는 단계 |
|---|---|
| `sub` 조수 | ② 발화 |
| `brain` 브레인 | ① 여행지 · ③ 연결 |
| `director` 화가 | 이슈 뽑기 · ⑤ 통합 |

## 6. 보안

- 모델이 쓴 문장은 `textContent`로만 화면에 넣는다. `innerHTML`을 쓰지 않는다.
- 내 키 방식: 키는 이 브라우저의 localStorage에 있다. 공용 PC에서는 쓰지 않는다.
- 서버 키 방식: `/api/llm`은 `/responses` · `/chat/completions` 두 경로만 넘긴다. 사내 배포에서는 `BRAIN_ACCESS_CODE`를 반드시 넣는다 — 없으면 주소를 아는 누구나 회사 키를 쓴다.
- `server.js`는 `v2/`와 1.x 글꼴 폴더만 연다.

## 7. 다음

1. **실제 모델 검증** — 같은 브리프 3건을 1.x와 2.0에 넣고, 결과를 비참여자에게 설명 없이 보여 준다(CORE §6.3).
2. 연결 판단을 둘로 나눈다 — 이슈 안의 연결 / 이슈를 건너는 연결. 신호가 60건을 넘으면 호출 1회로는 얕아진다.
3. 통합 인사이트 → 1.x 후반부(컨셉 키트 · Creative)로 넘기는 이음새.
4. 웹 정찰 노드 — 시장 신호에 URL 근거를 붙인다.
5. Electron 창에 싣기 — `index.html`을 그대로 띄우면 된다. 공급자만 1.x 것(`safeStorage` 키)으로 바꾼다.
6. 중앙관제 — 프로젝트 JSON을 1.x가 깔아 둔 `ProjectStore` 이음새에 싣는다.
