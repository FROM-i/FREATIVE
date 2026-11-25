// 수파베이스 연결 값 — 브라우저에 내려가도 되는 공개 값이다(프로젝트 주소와 공개 키). 비밀 키는 여기에 적지 않는다.
// 둘 다 비어 있으면 로그인 없이 돌아가고, 프로젝트는 이 브라우저에만 저장한다.
export const CLOUD = {
  url: 'https://qifxzkzpixdmyajhbdsx.supabase.co',
  key: 'sb_publishable_Q5wpArZixknAlzjhXVoXXg_MAdJPEPk',
  domain: 'from.co.kr',   // 가입할 수 있는 메일 주소
  hosts: ['thefrombrain.vercel.app'],   // 로그인을 켜는 주소. 도메인을 붙이면 여기에 더한다(Vercel 미리보기 주소 *.vercel.app 은 자동)
};
// 로그인은 배포된 주소에서만 켠다. 내 컴퓨터(localhost · 파일), 단일 파일, 아티팩트에서는 로그인 없이 이 브라우저에만 저장한다.
//   내 컴퓨터에서 로그인까지 시험하려면 주소 뒤에 ?cloud=1 을 붙인다.
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export const cloudOn = (loc = globalThis.location) => {
  if (!CLOUD.url || !CLOUD.key || !loc) return false;
  const host = loc.hostname || '';
  return CLOUD.hosts.includes(host) || host.endsWith('.vercel.app') || (LOCAL.test(host) && /[?&]cloud=1\b/.test(loc.search || ''));
};
