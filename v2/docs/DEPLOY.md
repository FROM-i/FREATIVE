# 배포 · 로그인 · 권한

THE FROM BRAIN(2.0)은 `v2/`만 웹에 올린다. FREATIVE 1.x는 저장소 루트에 그대로 두고 설치형 실행 파일로 쓴다. 두 쪽은 파일을 공유하지 않는다.

## 구성

| 무엇 | 어디 | 값 |
| --- | --- | --- |
| 코드 | GitHub `FROM-i/FREATIVE` | 2.0은 `v2/`, 1.x는 루트 |
| 배포 | Vercel `from-is-projects/thefrom_brain` | Root Directory `v2`, 배포 브랜치 `main`, 주소 `thefrombrain.vercel.app` |
| 로그인 · 저장 | Supabase `qifxzkzpixdmyajhbdsx` (서울) | 스키마 `supabase/migrations/` (0001, 0002 적용) |
| 모델 키 | Vercel 환경 변수 `ANTHROPIC_API_KEY` | 서버에만 둔다. 브라우저로 내려가지 않는다 |

`main`에 푸시하면 사이트가 다시 배포된다. Vercel은 `v2/`만 보므로 1.x(`src/` · `knowledge/`)를 고쳐도 사이트 내용은 바뀌지 않는다. 1.x 설치 파일은 `electron-builder.yml`이 `src/` · `knowledge/`만 담아서 `v2/`가 들어가지 않는다.

## 로그인과 역할

- 가입은 회사 메일(@from.co.kr)만 된다. 다른 주소는 DB가 막는다.
- 가입 → 로그인 → **승인 대기** → 관리자가 승인하면 쓴다. 확인 메일은 보내지 않는다(Confirm email 꺼짐).
- 메일 확인이 없으므로 주소의 주인인지는 시스템이 모른다. **승인할 때 본인이 신청한 것인지 직접 확인한다.**
- 역할 4가지

| 역할 | 할 수 있는 일 |
| --- | --- |
| 승인 대기 `pending` | 없음 |
| 사용자 `member` | 분석 실행, 프로젝트 만들기, 전체 프로젝트 열람 |
| 관리자 `admin` | 사용자 승인 · 사용 중지, 모든 프로젝트 수정 · 삭제 |
| 수퍼관리자 `super_admin` | 관리자 지정까지 |

- 처음 수퍼관리자는 가입한 뒤 SQL Editor에서 한 번 올린다(`supabase/migrations/0002_no_mail_confirm.sql`의 주석). 메일 주소만으로 자동 지정하지 않는다.
- 승인과 역할 변경은 미션 탭의 **계정 → 사용자 관리**에서 한다.

## 프로젝트

- 승인된 사용자는 모든 프로젝트를 본다. 고치고 지우는 것은 만든 사람과 관리자만 한다.
- 남의 프로젝트는 읽기 전용이다. **내 프로젝트로 복사**하면 고칠 수 있다.
- 규칙은 DB(RLS)가 지킨다. 화면에서 버튼을 숨기는 것은 편의다.
- 프로젝트는 분석 결과까지 한 행(`projects.data`)에 통째로 넣는다.

## 모델 호출

- 배포된 사이트에서는 `/api/claude`가 서버의 키로 Claude API를 부른다.
- 이 주소는 로그인 토큰을 받아 수파베이스에 확인하고, 역할이 사용자 이상일 때만 통과시킨다(`api/_guard.js`).
- 쓸 수 있는 모델은 `BRAIN_CLAUDE_MODELS`로 묶을 수 있다.

## 내 컴퓨터에서

- `node server.js` → `http://localhost:4173`. 로그인 없이 돌고, 프로젝트는 이 브라우저에만 저장한다.
- 로그인까지 시험하려면 주소 뒤에 `?cloud=1`을 붙인다.
- 단일 파일(`npm run build` → `standalone/the-from-brain.html`)도 로그인 없이 돈다.
- 로그인은 `js/cloud/config.js`의 `hosts`에 적은 주소와 `*.vercel.app`에서만 켜진다. 회사 도메인을 붙이면 `hosts`에 더하고, 수파베이스의 Site URL도 같이 바꾼다.

## 알아 둘 것

- 메일을 보내지 않으므로 비밀번호 찾기가 없다. 비밀번호를 잊으면 수파베이스 대시보드(Authentication → Users)에서 관리자가 다시 정해 준다.
- 메일 확인을 다시 켜려면 메일 발송(SMTP)을 먼저 연결한다. 수파베이스 기본 발송은 조직 멤버 주소로만, 시간당 2통까지 보낸다.
- 수파베이스 주소와 공개 키(`js/cloud/config.js`)는 브라우저에 내려가도 되는 값이다. 비밀 키(`sb_secret_…`)는 어디에도 적지 않는다.
- 스키마를 바꾸면 `supabase/migrations/`에 파일을 더하고 SQL Editor에서 실행한다.
