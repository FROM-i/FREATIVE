# FREATIVE
THE FROM + CREATIVE = FREATIVE

모든 Creative는 나로부터(THE FROM) 시작된다.

> 화가가 미션을 받고, 캔버스를 펼치고, 타임머신 비행기로 사조를 여행하고, 차를 타고 터널에서 인사이트를 겹치고, 새 캔버스에 컨셉을 그린다.

더프롬 UX 스킬([`FROM-i/thefrom_design_Skill`](https://github.com/FROM-i/thefrom_design_Skill))의 철학·방법론·노하우를 **그대로 담아**, UI/UX에서 **범용 크리에이티브**(제안 컨셉 · 광고 소재 · 영상 · UI/UX · 피처 이미지/KV · 페이지 · 오프라인 사이니지 · 프로모션)로 넓힌 Windows·macOS 설치형 데스크톱 툴입니다. GPT API를 씁니다.

```
미션 접수 ─ 캔버스 ─ ✈ Airplane ─ ◐ Tunnel ─ Positioning Map ─ FoR·PoP·PoD ─ Concept·Theme ─ Creative
 (브리프 게이트)  (S0)   사조 여행      레이어링     5→4→3→1      PoD 5→3→1      C 게이트(사람)    A/B 예시
```

## 두 저장소의 관계

| 저장소 | 담는 것 | 이 앱과의 관계 |
|---|---|---|
| **`FROM-i/thefrom_design_Skill`** | 더프롬 방법론 원본(`method/`)과 스킬 `thefrom-ux` | 앱이 **읽기만** 한다. 방법론의 단일 원본 — 앱 저장소에 복사본을 커밋하지 않는다 |
| **`FROM-i/FREATIVE`** (이 저장소) | 앱 코드 · 프롬프트 · 판단 브레인(`brain.json`) · 결과물 유형 · 팀 라이브러리 · 설치 파일 릴리스 | 앱 본체와 앱 전용 지식 |

`knowledge/manifest.json`이 두 저장소를 잇습니다. `@skill/`로 시작하는 경로는 스킬 저장소에서, 나머지는 이 저장소에서 가져옵니다. 그래서 **방법론을 고치면 스킬 저장소만, 앱의 사고 흐름을 고치면 이 저장소만** 고치면 됩니다.

## 무엇이 스킬과 같고, 무엇이 더해졌나

| | 스킬(thefrom-ux) | FREATIVE |
|---|---|---|
| 원칙 | 관성은 구조에서, 새로움은 해석에서 · 판단은 사람, 연산은 AI · 증거는 지어내지 않는다 · N7 | **동일** — 스킬 원문을 프롬프트에 그대로 인용 |
| 브리프 | ★1~6, ★1·2·3 비면 멈춤 | 디자이너용 **간략 폼** + 첨부(.md·이미지 권장). ★3은 도출 시도 후 모호하면 최대 3개 질문 |
| Airplane | 사조 3~5 · 가져올 것/두고 올 것 · A3 | 사조마다 **조수(서브 모델) 1명이 병렬로 여행** — 결과물 매체의 언어로 원리 재작성 |
| Tunnel | 타겟 · 브랜드 · UX | **시장 · 브랜드 · 타겟 · 사용 습관** 4레이어 병렬 → 화가가 겹쳐 출구 |
| 컨셉 도출 | 메타포 → C 게이트 | **신설** Creative Positioning Map(5→4→3→1) · FoR/PoP/PoD(PoD 5→3→1) → Concept/Theme → **C 게이트** |
| 결과물 | 375px HTML 프로토타입 | 유형별 Creative 예시 A(시스템 주도)/B(경험 주도) + 명분·효익 표 + 콘셉트 비주얼 이미지 + 예비 판정 |
| 시각화 | — | 횡스크롤 라인 드로잉 여정 · 플랫 구조 도식 |

## 더프롬 판단 브레인 (v0.2)

더프롬 철학을 **판단 렌즈 10개**(나로부터 · 자메뷰 · 관성은 구조/새로움은 해석 · 1U 하나에서 파생 · 노랑 전 세대 · 근본 있는 하이브리드 · 터널의 빛 · 사람이 얻는 것 · N7 · 조형 완성도)로 바꾼 엔진입니다. 단계마다

- **방향 제시** — 시작 전에 이 미션에 맞춘 방향·반드시·피할 것·쓸 노하우(노하우북 ID)·발상의 전환 힌트를 화가와 조수에게 준다
- **검증** — 끝나면 렌즈별 0~5점과 통과/보완/재작업. 재작업이면 그 단계를 다시 그리고(설정에서 횟수), 보완은 다음 단계로 넘긴다
- **공동 추론** — FoR·PoP·PoD의 발상의 전환 2회(5→3→1), Concept 3→1 자체 검증은 브레인이 직접 한다

렌즈·개입 단계·노하우 범위는 `knowledge/brain.json` 하나로 관리합니다(저장소 동기화).

노하우북(175항목)은 이미지뿐 아니라 **구조화**(대비·강조·균형·비율로 축과 좁히기를 설계)에도 쓰입니다 — 브레인이 단계마다 고르고, 고른 항목의 원문이 그 단계 프롬프트에 들어갑니다.

## 쓰는 법 (디자이너)

1. **새 미션** — 필수 6칸(무엇을 · 목적 · 타겟 · 제품/서비스 · 채널 · 디바이스)만 채우고, 브리프 .md나 이미지를 끌어다 놓습니다.
2. **Creative Travel 시작** — 위쪽 여정에서 화가와 조수들이 움직입니다. 아래 패널에 단계별 결과가 쌓입니다.
3. 화가가 질문하면(브리프 게이트) 선택지로 답합니다.
4. **C 게이트** — 5안 → 1차 3안 → 브레인 검증 → 1안으로 좁혀진 컨셉·테마를 보고 `GO` / `수정 요청`(의견 필수) / `중단`. GO면 Creative 가이드 3~5종과 이미지를 만듭니다.
5. **영감** — 어느 단계든 리포트 아래 `영감`에 떠오른 것을 적으면 그 단계부터 다시 그립니다(이전 결과는 버전으로 남음).
6. **PPT 리포트** — 전체 흐름의 코어만 추출해 Pretendard 16:9 PPT로 저장. `.md` 보고서와 스킬 양식 호환 `브리프_*.md`도 있습니다.
7. **라이브러리** — 사조·노하우 자료를 올리면 카탈로그 형식으로 추출해 추가합니다. 팀 공유는 `knowledge/custom/`에 커밋.

비용은 실행 화면 상단에 실시간(USD·원)으로, 누적은 설정 › API 비용에 표시됩니다(단가는 설정에서 수정 — 실제 청구는 OpenAI 대시보드 기준).

깊이를 `끝까지`로 두면 C 게이트를 **예비 통과**로 기록하고 예시까지 갑니다(사람이 나중에 확정).

## 설치

- **Windows**: `THEFROM-FREATIVE-Setup-<버전>.exe` 실행. 서명 전이라 SmartScreen이 뜨면 *추가 정보 → 실행*.
- **macOS**: `.dmg` 열어 Applications로. 서명 전이면 첫 실행은 *우클릭 → 열기*.
- 처음 열면 **설정 → OpenAI API 키**를 넣습니다(이 PC 키체인으로 암호화 저장).

## 업데이트 — 두 갈래

| 무엇이 바뀌나 | 어떻게 반영되나 | 해야 할 일 |
|---|---|---|
| 방법론·스킬 — **스킬 저장소** `method/` → `plugins/thefrom-ux/…` | 앱을 열 때 **자동 동기화** (재설치 불필요) | 스킬 저장소에서 고치고 push → **이 저장소** `knowledge/manifest.json`의 `version`을 올리고 push |
| 프롬프트 · 판단 브레인 · 결과물 유형 · 팀 라이브러리 — **이 저장소** `knowledge/` | 앱을 열 때 **자동 동기화** | 고치고 → `knowledge/manifest.json`의 `version`을 올리고 → push |
| 앱 코드(화면·오케스트레이터) | **GitHub Releases 자동 업데이트** | `package.json` version 올리고 → 태그 `v<버전>` push → Actions가 설치 파일 빌드 |

자세한 절차는 [`docs/RELEASE.md`](docs/RELEASE.md).

## 개발

```bash
git clone https://github.com/FROM-i/FREATIVE
git clone https://github.com/FROM-i/thefrom_design_Skill   # 옆 폴더에 두면 빌드가 스킬 원본을 여기서 읽는다 (없으면 GitHub에서 내려받음)
cd FREATIVE
npm install
npm run mock      # API 키 없이 목업으로 화면·흐름 확인
npm start         # 실제 GPT로 실행 (스킬 원본을 knowledge/skill로 가져온 뒤 실행)
npm test          # 헤드리스 점검: 프롬프트 참조 해석 + 전체 흐름(목업)  ※ Linux는 xvfb-run 필요
npm run dist:win  # Windows 설치 파일 → dist/
npm run dist:mac  # macOS 설치 파일 (macOS에서)
```

## 구조

```
FREATIVE/
  .github/workflows/release.yml  태그 v* → Windows·macOS 설치 파일 빌드·릴리스
  src/main/                 메인 프로세스
    main.js                 창 · ct:// 프로토콜 · 부팅
    ipc.js                  렌더러 요청 → 권한 확인(auth.can) → 처리
    settings.js             설정 · API 키 암호화
    knowledge.js            방법론·프롬프트 GitHub 동기화 · 사조 카드 파싱 · 절 추출
    attachments.js          md·이미지·pdf·pptx·docx → 모델 입력
    orchestrator/           화가(메인 모델)·조수(서브 모델) 오케스트레이션 · 게이트
    providers/              openai.js(GPT) · mock.js(목업) — 공급자 추가 지점
    services/auth.js        사용자·조직·팀·역할 (지금 로컬 → 이후 중앙 로그인)
    services/storage.js     프로젝트 저장 (지금 로컬 → 이후 중앙 저장소)
    report.js · updater.js
  src/renderer/             화면 (빌드 단계 없는 ES 모듈)
    js/journey.js           횡스크롤 라인 드로잉 여정
    js/art.js               화가·조수·비행기·차·사조 아이콘 (선 그림)
    js/panels.js            단계별 패널 · 포지셔닝 맵 · FoR/PoP/PoD 도식
    js/intake.js            접수 폼
  knowledge/                지식 (manifest가 원본 경로를 적는다 — 저장소에서 동기화)
    prompts/                단계별 프롬프트 (<<<SYSTEM>>>/<<<USER>>>, {{include:파일#절}})
    types.json              결과물 유형 8종 정의
    brain.json              더프롬 판단 브레인 — 렌즈·개입 단계·노하우 범위
    custom/                 팀 공유 사조·노하우 (라이브러리)
    skill/                  빌드 때 스킬 저장소에서 가져옴 (git에 올리지 않음)
  docs/ARCHITECTURE.md      설계 · 중앙관제 확장
  supabase/schema.sql       중앙관제 스키마 초안
```
