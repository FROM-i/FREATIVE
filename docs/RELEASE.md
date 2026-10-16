# 배포·업데이트 절차 — 관리자용

## A. 방법론·프롬프트만 바꿀 때 (대부분)

재설치 없이 모든 직원 앱에 반영된다.

1. 고친다
   - 방법론: **스킬 저장소** `FROM-i/thefrom_design_Skill`의 `method/` → `python3 scripts/build_references.py` → push (스킬 README의 절차 그대로)
   - 프롬프트: 이 저장소 `knowledge/prompts/*.md`
   - 판단 브레인 렌즈·개입 단계: `knowledge/brain.json`
   - 결과물 유형: `knowledge/types.json`
   - 팀 공유 사조·노하우: `knowledge/custom/isms/`, `knowledge/custom/knowhow/`
   - 새 파일을 추가했다면 `manifest.json`의 `files`에 등록 — 이 저장소 파일은 `"앱 안 경로": "knowledge/…"`, 스킬 저장소 파일은 `"@skill/plugins/…"`
2. 이 저장소 `knowledge/manifest.json`의 **`version`을 올린다** (예: `1.2.0` → `1.2.1`). 스킬만 고쳤어도 올려야 반영된다.
3. main에 push.
4. 직원 앱은 다음 실행 때 자동 동기화(또는 `설정 → 지금 동기화`). 상단 배지에 `지식 v1.0.1`.

프롬프트 템플릿 문법: `<<<SYSTEM>>>` / `<<<USER>>>` 구분, `{{변수}}`, `{{json:변수}}`, `{{include:파일}}`, `{{include:파일#제목}}`(그 제목의 절만). 고친 뒤 `npm test`로 모든 include가 실제 절로 풀리는지 확인한다.

## B. 앱 코드를 바꿀 때

1. `package.json`의 `version`을 올린다 (예: `0.2.1` → `0.3.0`).
2. 커밋·push 후 태그: `git tag v0.2.0 && git push origin v0.2.0`
3. GitHub Actions(`.github/workflows/release.yml`)가 스킬 저장소를 함께 체크아웃해 Windows·macOS 설치 파일을 빌드하고 이 저장소 Release에 올린다.
   - 워크플로 파일은 workflow 권한이 있는 계정으로 push해야 한다.
4. 설치된 앱이 실행 중 새 버전을 내려받고, `설정 → 설치 후 재시작` 또는 종료 시 설치한다.

### 로컬에서 직접 빌드

```bash
cd FREATIVE && npm ci   # 옆 폴더에 thefrom_design_Skill 클론이 있으면 거기서 스킬을 읽는다
npm run dist:win     # Windows (Windows 또는 wine이 있는 Linux)
npm run dist:mac     # macOS (macOS에서만)
```

## C. 서명

| | 없을 때 | 있을 때 |
|---|---|---|
| Windows 코드 서명 | 설치 시 SmartScreen 경고, 자동 업데이트는 동작 | 경고 없음 — `CSC_LINK`·`CSC_KEY_PASSWORD`(pfx) |
| macOS Developer ID + 공증 | 첫 실행 우클릭 → 열기, **자동 업데이트 안 됨**(수동 재설치) | 자동 업데이트 동작 — 워크플로의 `MAC_CSC_LINK`, `APPLE_ID` 등 시크릿 |

## D. 저장소 공개 범위

- 지금(공개): 추가 설정 없음.
- 비공개로 바꾸면: 직원 앱 `설정 → GitHub 토큰`(Contents read 권한 fine-grained 토큰)이 있어야 지식 동기화가 된다. 앱 자동 업데이트는 이 저장소를 공개로 두거나, 릴리스 전용 공개 저장소를 따로 두고 `electron-builder.yml`의 `publish.repo`를 바꾸는 방식을 권장. 스킬 저장소가 비공개가 되면 빌드에 `GITHUB_TOKEN`(읽기)이 필요하다.
