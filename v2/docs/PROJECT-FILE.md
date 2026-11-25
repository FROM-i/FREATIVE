# 프로젝트 파일 규격 — RFP와 자료를 브레인의 새 프로젝트로 옮기는 법

> 어느 LLM에서든 RFP · 팩트 자료를 읽고 이 규격의 JSON을 만들면, 브레인 화면의 "프로젝트 가져오기"나 `scripts/run-brain.mjs`가 그대로 받는다.
> 스킬이나 MCP로 연결할 때 LLM에게 주는 지시문도 이 문서다.

## 1. 만드는 순서

1. RFP에서 **적힌 것만** 옮긴다. 적히지 않은 칸은 비워 둔다. 지어내지 않는다.
2. 분류를 고른다. 걸치면 여러 개 고른다(예: 마케팅 + 운영).
3. 고른 분류마다 특화 인풋을 채운다.
4. 팩트는 출처가 있는 것만 넣는다. 출처 주소와 날짜가 없으면 넣지 않는다.
5. 이슈는 비워 둔다. 근본 이슈는 브레인이 후보를 내고 사람이 고른다. RFP가 문제를 분명히 적었으면 그 문장을 후보로 넣어도 된다.
6. `node scripts/run-brain.mjs 파일.json --check` 로 빠진 칸을 확인한다.

## 2. 형식

```json
{
  "title": "프로젝트 이름",
  "categories": ["marketing", "ops"],
  "brief": {
    "what": "만들거나 풀 것 한 문장",
    "purpose": "끝나면 무엇이 되어야 하나",
    "success": "무엇이 얼마나 달라지면 성공인가",
    "target": "누가, 어떤 순간에",
    "product": "대상이 되는 제품 · 서비스",
    "channel": "어디서 만나나",
    "note": "반드시 지킬 것, 쓰면 안 되는 것, 비교 대상"
  },
  "seed": {
    "marketing": { "kpi": "", "offer": "", "media": "", "rival": "" },
    "ops": { "cycle": "", "standard": "", "team": "", "review": "" }
  },
  "facts": [
    { "id": "F1", "kind": "stat", "text": "사실 한 문장", "sourceType": "stat", "source": "기관 · 자료 이름", "date": "2026-10", "url": "https://…", "by": "ai", "checked": false }
  ],
  "issues": [],
  "settings": { "look": { "kind": "brain" } }
}
```

## 3. 칸의 뜻

| 칸 | 값 |
|---|---|
| `categories` | `marketing` 마케팅 · `planning` 기획 · `design` 디자인 · `dev` 개발 · `integrated` 통합 · `service` 서비스(자사) · `ops` 운영. 여러 개 가능 |
| `brief` | `what` · `purpose` · `target`은 필수. `success`가 없으면 판정에서 성공 기준을 "확인 필요"로 둔다 |
| `seed.<분류>` | 분류마다 4칸. 칸 이름은 `knowledge/tags.js`의 `SEED_INPUT`. 필수 칸이 비면 검사에서 알려 준다 |
| `facts[].kind` | `trend` 트렌드 · `habit` 타겟 습성 · `stat` 통계 · `disclosure` 공시 · `notice` 브랜드 공지 · `issue` 실제 이슈 |
| `facts[].sourceType` | `stat` 공식 통계 · `disclosure` 공시 · `official` 브랜드 공식 자료 · `press` 보도자료 원문. 클라이언트가 준 내부 자료는 `internal`(사람이 넣은 것만) |
| `facts[].by` · `checked` | LLM이 넣었으면 `"ai"` · `false`. 사람이 원문을 확인하면 화면에서 확인 표시를 한다 |
| `issues` | 비워 두거나 `{ "id": "I1", "root": true, "title": "누구의 무엇이 바뀌는가", "detail": "", "test": "판정 질문", "tags": [] }` |
| `settings.look` | 브레인 맵 모양. `{ "kind": "brain" }` 기본 · `{ "kind": "burger" }` 층 쌓기 예시 · `{ "kind": "stack", "layers": [...] }` 직접 정한 층 |

## 4. 하지 않는 것

- RFP에 없는 수치 · 사례 · 타겟 묘사를 채우지 않는다.
- 블로그, 커뮤니티, 출처 없는 기사, LLM의 기억에서 나온 수치는 팩트로 넣지 않는다.
- 해법을 이슈 문장에 넣지 않는다. 이슈는 "누구의 무엇이 바뀌는가"다.
