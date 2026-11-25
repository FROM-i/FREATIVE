// Claude API 공급자 — Anthropic Messages API를 직접 부른다.
// 호출마다 붙는 급(knowledge/orchestration.js)에 따라 모델을 고른다: lead → 주 모델, support → 보조 모델.
//   direct  브라우저에서 내 키로 직접 부른다. 키는 이 브라우저에만 저장된다.
//   proxy   server.js 또는 Vercel 함수(/api/claude)가 서버의 키로 대신 부른다. 회사 키를 직원 PC에 나눠 주지 않는다.
// 호출 형식은 2026-11 문서(platform.claude.com/docs/en/api/messages/create)를 따랐다. 실제 키로는 아직 확인하지 못했다.
import { parseJSON } from '../engine/json.js';

export const ANTHROPIC_DEFAULTS = {
  mode: 'direct',
  baseUrl: 'https://api.anthropic.com/v1',
  proxyUrl: '/api/claude',
  version: '2026-10-21',
  models: { lead: 'claude-opus-5-5', support: 'claude-sonnet-5-5' },
  maxTokens: 8000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readText = (r) => (Array.isArray(r?.content) ? r.content : []).filter((b) => b.type === 'text').map((b) => b.text || '').join('');

export function createAnthropic(config = {}, { getKey = () => '', getCode = () => '', fetchImpl = (...a) => fetch(...a) } = {}) {
  const c = { ...ANTHROPIC_DEFAULTS, ...config, models: { ...ANTHROPIC_DEFAULTS.models, ...(config.models || {}) } };

  async function post(body, signal) {
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      const direct = c.mode === 'direct';
      if (direct && !getKey()) throw new Error('Claude API 키가 없습니다. 설정에서 넣어 주세요.');
      const r = await fetchImpl(direct ? `${c.baseUrl.replace(/\/$/, '')}/messages` : c.proxyUrl, {
        method: 'POST', signal,
        headers: direct
          // 브라우저에서 직접 부를 때는 이 헤더가 있어야 받아 준다. 데이터 보존을 끈(ZDR) 조직은 이 헤더가 있어도 거절된다 — 그때는 proxy로 쓴다.
          ? { 'Content-Type': 'application/json', Authorization: `Bearer ${getKey()}`, 'anthropic-version': c.version, 'anthropic-dangerous-direct-browser-access': 'true' }
          : { 'Content-Type': 'application/json', 'x-brain-code': getCode() },
        body: JSON.stringify(direct ? body : { body }),
      });
      const raw = await r.text();
      if (r.ok) return JSON.parse(raw);
      let msg = raw; try { msg = JSON.parse(raw).error.message || msg; } catch { /* 그대로 */ }
      last = Object.assign(new Error(/CORS requests are not allowed/i.test(msg) ? 'Claude API: 이 조직은 브라우저에서 직접 부를 수 없습니다. 설정에서 "서버 키"로 바꿔 주세요.' : `Claude API ${r.status}: ${msg}`), { status: r.status });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1) ** 2); continue; }
      throw last;
    }
    throw last;
  }

  const modelFor = (tier) => c.models[tier] || c.models.lead;

  return {
    name: 'anthropic',
    label: c.mode === 'proxy' ? 'Claude API (서버 키)' : 'Claude API (내 키)',
    models: c.models,
    modelFor,
    async json({ tier = 'lead', system, user, signal }) {
      const model = modelFor(tier);
      let max = c.maxTokens;
      for (let i = 0; i < 2; i++) {
        const r = await post({ model, max_tokens: max, system, messages: [{ role: 'user', content: user }] }, signal);
        // 답이 길어 잘렸으면 한 번만 늘려서 다시 받는다. 잘린 JSON을 고쳐 쓰지 않는다
        if (r.stop_reason === 'max_tokens' && i === 0) { max *= 2; continue; }
        if (r.stop_reason === 'max_tokens') throw new Error('Claude API: 답이 길어 잘렸습니다. 이슈나 노드 수를 줄여 다시 실행해 주세요.');
        return { json: parseJSON(readText(r)), model, usage: r.usage ? { in: r.usage.input_tokens || 0, out: r.usage.output_tokens || 0 } : null };
      }
      throw new Error('Claude API 요청 실패');
    },
  };
}
