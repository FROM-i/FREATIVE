# 설계 — THE FROM FREATIVE

## 1. 오케스트레이션 — 화가와 조수

메인 모델(**화가**, 설정의 `director`)이 판단의 축을 잡고, 서브 모델(**조수**, `sub`)이 병렬로 재료를 모은다. 이미지 모델(`image`)은 마지막 갤러리에서만 쓴다.

| 단계 | 장면 | 주체 | 호출 수 | 프롬프트 | 게이트 |
|---|---|---|---|---|---|
| brief | 미션 편지 | 화가 | 1 (+답변마다 1) | `01_brief` | **브리프 게이트** — ★1·★2 비거나 모호하면 질문(최대 3). 질문이 남으면 멈춤 |
| canvas | 캔버스 | 화가 | 1 | `02_canvas` | — |
| airplane | 타임머신 비행기 | 조수 ×(사조 3~5) → 화가 | N+1 | `03_ism` → `04_airplane_synth` | A3(원리/코스튬) 기록 |
| tunnel | 차 · 터널 | 조수 ×(레이어 3~4) → 화가 | M+1 | `05_layer` → `06_tunnel_synth` | 레이어 3개 이상 겹치지 않으면 실패 |
| positioning | 언덕 위 지도 | 화가 | 1 | `07_positioning` | 최종 영역은 예비 |
| forpop | 틀 | 화가 | 1 | `08_forpop` | — |
| concept | 새 캔버스 | 화가 | 1 (+수정마다 1) | `09_concept` | **C 게이트 — 사람** (go / 수정 / 중단). 깊이 `끝까지`면 예비 통과 |
| creative | 갤러리 | 화가 + 이미지 조수 | 1 + 예시 수 | `10_creative` | 예비 판정(G1·G4·G7) |

- 병렬 조수 수는 `설정 → 동시 조수 수`(기본 4).
- 화가는 첫 호출(`01_brief`)에서 **어떤 사조로 여행할지, 어떤 레이어를 겹칠지, 예시를 몇 개 만들지**를 정한다(`plan`). 오케스트레이터가 카탈로그에 없는 사조 ID를 걸러내고 최소 3개를 보장한다.
- 첨부(텍스트·이미지·PDF)는 브리프 단계에만 원본으로 넣고, 이후 단계는 화가가 정리한 `attachment_insights`로 전달한다 — 비용과 일관성 때문.
- 모든 결과는 `project.json`의 `run`에 단계별로 저장된다. 앱이 꺼져도 끊긴 단계부터 **이어서 진행**할 수 있다.

## 2. 스킬을 "온전히" 담는 방식

- 프롬프트는 스킬 원문을 **요약하지 않고 인용**한다: `{{include:skill/references/core.md#4.2 "근본 있는"이 제약이다}}`처럼 절 단위로 끌어온다. 원문이 바뀌면 다음 동기화부터 프롬프트도 바뀐다.
- 사조 카드는 `catalog-ism.md`를 `## \`ISM-…\`` 단위로 잘라, 여행하는 조수에게 **그 사조의 카드 원문 전체**를 준다.
- 스킬의 불변 원칙(`prompts/_common.md`): 관성은 구조·새로움은 해석 / 판단은 사람 / 증거 생성 금지(출처 표기 `브리프·첨부·일반 관찰·추론`, 없으면 `확인 필요`) / 원리 층위 / 반대 대상은 관찰 / N7 / 효익 없는 결정은 개살구 / 메타포는 톤, 형식은 과업.
- 범용화는 `types.json`이 맡는다. 결과물 유형마다 단위(화면·씬·위치·섹션·참여 단계…), 판단 초점, 점검 항목, 이미지 크기를 정의하고 모든 단계 프롬프트에 주입한다. 유형 추가는 이 파일만 고치면 된다.

## 3. 업데이트 구조

```
GitHub: FROM-i/thefrom_design_Skill (main)        ← 방법론 원본 · 앱은 읽기만
 └─ method/ → scripts/build_references.py → plugins/thefrom-ux/skills/thefrom-ux/

GitHub: FROM-i/FREATIVE (main)        ← 이 저장소
 ├─ knowledge/manifest.json   ← version · '@skill/…' 경로는 위 저장소에서 가져온다
 ├─ knowledge/prompts/ brain.json types.json custom/
 └─ Releases (v0.x.y)  ← 설치 파일 + latest.yml / latest-mac.yml

설치된 앱
 ├─ 시작 시 manifest.json version 비교 → 바뀌었으면 files 목록을 내려받아 userData/knowledge/current 로 교체
 │   (실패하거나 오프라인이면 설치본 내장 knowledge/ 로 동작)
 └─ electron-updater 가 Releases 확인 → 내려받고 종료 시 설치
```

- 지식 버전이 앱보다 오래되면(앱이 더 최신 지식을 내장한 채로 업데이트된 경우) 내장본을 쓴다.
- 저장소를 비공개로 바꾸면(둘 중 어느 쪽이든): 지식 동기화는 `설정 → GitHub 토큰`(read 권한), 앱 업데이트는 electron-updater의 private repo 설정(`GH_TOKEN` 배포) 또는 공개 릴리스 전용 저장소 분리가 필요하다.

## 4. 중앙관제 확장 — 지금 만들지 않고 자리만 둔다

목표: ① 권한 체크와 조직·팀 단위 로그인/회원 관리 ② 작업물·결과물의 조직·팀 단위 통합 관리.

### 이미 깔아 둔 이음새

| 이음새 | 지금 | 중앙관제에서 |
|---|---|---|
| `services/auth.js` `AuthProvider` | `LocalAuthProvider` — PC 사용자 1명, org `thefrom`, role `owner` | `CentralAuthProvider` — Supabase Auth(이메일·SSO) 로그인, `memberships`에서 org·team·role |
| `auth.can(user, action, resource)` | 모든 IPC가 호출(항상 통과) | 역할×가시성 판정 그대로 사용 — `ROLES` 표가 이미 owner·admin·lead·designer·viewer를 정의 |
| `services/storage.js` `ProjectStore` | `LocalProjectStore` — userData/workspace | `CentralProjectStore` — `projects`·`artifacts` 테이블 + Storage 버킷. 같은 메서드 시그니처 |
| 프로젝트 메타 | `ownerId · orgId · teamId · visibility` 기록 중 | 그대로 컬럼이 됨 → 로컬 기록 일괄 업로드(마이그레이션) 가능 |
| 게이트 기록 | `run.gates.C.history` (시각·결정·의견) | `gate_decisions` — 누가 판정했는지 `decided_by` 추가 |
| 설정 | `central: { enabled, endpoint, orgId, teamId }` 자리 | 켜면 provider 교체 |
| 스키마 | `supabase/schema.sql` 초안 (RLS 포함) | 검토 후 적용 |

### 전환 순서 (안)

1. Supabase 프로젝트에 `schema.sql` 적용, 조직·팀·멤버 초기 데이터.
2. `CentralAuthProvider` 구현 — 앱에 로그인 화면 추가, 토큰은 `settings.setSecret`으로 보관.
3. `CentralProjectStore` 구현 — 쓰기는 로컬 우선 저장 후 동기화(오프라인 대비), 이미지·첨부는 Storage.
4. 프로젝트 목록에 `내 것 / 팀 / 조직` 필터, 프로젝트별 공유 범위(`visibility`) 변경 UI.
5. 관리자 웹(조직·팀·권한·사용량)은 기존 GitHub → Vercel → Supabase 스택으로 별도 구축.
6. API 키를 개인 키에서 조직 키로: 중앙 프록시(Edge Function)가 키를 보관하고 사용량을 팀별로 집계 — `openai.baseUrl`만 바꾸면 앱은 그대로.

## 5. 보안 메모

- 렌더러는 `contextIsolation` + preload 브리지만 쓴다. Node 접근 없음.
- API 키·토큰은 OS 키체인 기반 `safeStorage`로 암호화. 렌더러에는 존재 여부만 전달.
- 생성 이미지는 `ct://project/<id>/…` 전용 스킴으로만 노출하고 프로젝트 폴더 밖 경로는 거부한다.
