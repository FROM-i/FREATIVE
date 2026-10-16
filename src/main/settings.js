'use strict';
/** 설정 — userData/settings.json. 비밀값(API 키·토큰)은 OS 키체인 기반 safeStorage로 암호화한다. */
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    // 역할별 기본 모델 — 화가(메인·오케스트레이터) / 조수(서브) / 판단 브레인 / 이미지
    // 추천 구성 따르기 — knowledge/models.json(저장소 동기화)이 역할·풀·단가를 정한다. 끄면 아래 값을 직접 쓴다.
    followRecommended: true,
    models: { director: 'gpt-6-astra', sub: 'gpt-6.1-sol', brain: 'gpt-6.1-sol', image: 'gpt-image-2.5-sunburst' },
    roleEfforts: { director: 'high', brain: 'high', sub: 'low' },
    imagePool: [],
    // 화가가 단계별로 고를 수 있는 모델 풀 — autoModel이 켜져 있으면 화가가 판단해 바꾼다
    autoModel: true,
    pool: [
      { id: 'gpt-6-astra', effort: 'high', tier: 'frontier', note: '컨셉·최종 판단' },
      { id: 'gpt-6.1-sol', effort: 'medium', tier: 'strong', note: '분석·종합' },
      { id: 'gpt-6-luna', effort: 'low', tier: 'fast', note: '정리·요약' },
    ],
    reasoningEffort: 'medium', // gpt-5·o 계열에만 전달. '' 이면 보내지 않음
    timeoutSec: 240, // 목록 조회 등 짧은 요청
    idleSec: 180,    // 모델 호출 — 이 시간 동안 아무 데이터도 오지 않을 때만 끊고 다시 요청한다(총 시간 제한 없음)
  },
  // 지식 동기화 — 앱 저장소(프롬프트·브레인·유형·팀 라이브러리) + 스킬 저장소(방법론 원본, 읽기 전용)
  knowledge: {
    repo: 'FROM-i/FREATIVE',
    branch: 'main',
    manifestPath: 'knowledge/manifest.json',
    skillRepo: 'FROM-i/thefrom_design_Skill',
    skillBranch: 'main',
    autoSync: true,
  },
  // 단가 (USD / 1M tokens) — OpenAI 가격이 바뀌면 설정에서 고친다. 이미지 per-image는 usage가 없을 때의 추정치
  pricing: {
    'gpt-5': { in: 1.25, cached: 0.125, out: 10 },
    'gpt-5-mini': { in: 0.25, cached: 0.025, out: 2 },
    'gpt-5-nano': { in: 0.05, cached: 0.005, out: 0.4 },
    'gpt-4.1': { in: 2, cached: 0.5, out: 8 },
    'gpt-4.1-mini': { in: 0.4, cached: 0.1, out: 1.6 },
    'gpt-4o': { in: 2.5, cached: 1.25, out: 10 },
    'gpt-image-1': { in: 5, cached: 1.25, out: 40, imageIn: 10 },
    image: { low: 0.016, medium: 0.063, high: 0.25 },
    webSearch: 0.01, // 웹 검색 1회 (USD) — 검색 결과 토큰은 모델 단가로 따로 계산된다
  },
  krwPerUsd: 1400,
  lastWorker: '',
  library: { disabled: [] },
  run: {
    maxParallel: 4,
    brain: 'standard', // standard: 모든 단계 · core: 컨셉·FoR/PoP/PoD·Creative 중심 · off
    brainRetry: 1,     // 브레인이 '재작업' 판정 시 다시 그리는 횟수
    budgetUsd: 10,     // 미션당 예산 — 넘으면 경고
    webSearch: true,   // FoR·PoP·PoD 차별성 검토에서 조수가 웹을 직접 탐색
    generateImages: true,
    imageQuality: 'medium',
  },
  ui: { followCamera: true },
  // 중앙관제 전환 시 사용 — 지금은 비워 둔다 (docs/ARCHITECTURE.md)
  central: { enabled: false, endpoint: '', orgId: '', teamId: '' },
};

const SECRET_KEYS = ['openaiKey', 'githubToken'];
let file = null;
let data = null;

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch === undefined ? base : patch;
  const out = { ...(base || {}) };
  for (const k of Object.keys(patch)) {
    out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k])) ? deepMerge(base[k], patch[k]) : patch[k];
  }
  return out;
}

function init() {
  file = path.join(app.getPath('userData'), 'settings.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
  data = deepMerge(DEFAULTS, saved);
  data.secrets = data.secrets || {};
  // 환경 변수로도 키를 넣을 수 있다 (CI·테스트)
  if (process.env.OPENAI_API_KEY && !data.secrets.openaiKey) setSecret('openaiKey', process.env.OPENAI_API_KEY);
  save();
}

function save() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

/** 렌더러로 보내는 공개 설정 — 비밀값은 존재 여부만 */
function get() {
  const { secrets, ...pub } = data;
  pub.has = Object.fromEntries(SECRET_KEYS.map((k) => [k, !!(secrets && secrets[k])]));
  return JSON.parse(JSON.stringify(pub));
}

function set(patch) {
  if (patch && patch.secrets) delete patch.secrets;
  data = deepMerge(data, patch || {});
  // 단계 지정은 통째로 바꾼다 (지운 항목이 병합으로 남지 않게)
  if (patch && patch.openai && patch.openai.stages) data.openai.stages = patch.openai.stages;
  save();
  return get();
}

function setSecret(key, value) {
  if (!SECRET_KEYS.includes(key)) throw new Error('unknown secret ' + key);
  if (!value) { delete data.secrets[key]; save(); return get(); }
  let enc;
  if (safeStorage.isEncryptionAvailable()) enc = { e: 1, v: safeStorage.encryptString(value).toString('base64') };
  else enc = { e: 0, v: Buffer.from(value, 'utf8').toString('base64') };
  data.secrets[key] = enc;
  save();
  return get();
}

function getSecret(key) {
  const s = data.secrets && data.secrets[key];
  if (!s) return '';
  try {
    const buf = Buffer.from(s.v, 'base64');
    return s.e ? safeStorage.decryptString(buf) : buf.toString('utf8');
  } catch { return ''; }
}

function raw() { return data; }

module.exports = { init, get, set, setSecret, getSecret, raw, DEFAULTS };
