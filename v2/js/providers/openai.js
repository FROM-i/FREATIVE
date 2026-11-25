// OpenAI 공급자 — 1.x(src/main/providers/openai.js)와 같은 호출 형식(Responses API · JSON)을 쓴다.
//   direct  브라우저가 키로 직접 부른다 (키는 이 브라우저에만 저장)
//   proxy   server.js 또는 api/llm.js 가 키를 쥐고 대신 부른다 — 키를 직원 PC에 나눠 주지 않아도 된다
import { parseJSON } from '../engine/json.js';

// 기본 모델은 1.x knowledge/models.json 의 추천 구성과 같다. 새 모델이 나오면 설정에서 바꾼다.
export const OPENAI_DEFAULTS = {
  mode: 'direct',
  baseUrl: 'https://api.openai.com/v1',
  proxyUrl: '/api/llm',
  // judge — 고르고 가르고 판정하는 호출(사조 훑기 · 기본안 대조 · 대결 · 같은 해법 묶기 · 공격 · 더프롬 판정). 만드는 호출과 모델을 따로 둘 수 있다.
  models: { director: 'gpt-6-astra', brain: 'gpt-6.1-sol', sub: 'gpt-6.1-sol', judge: 'gpt-6-astra' },
  efforts: { director: 'high', brain: 'high', sub: 'low', judge: 'high' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readResponse(r) {
  let text = '';
  for (const item of r.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) if (c.type === 'output_text') text += c.text || '';
  }
  return text || (typeof r.output_text === 'string' ? r.output_text : '');
}

export function createOpenAI(config = {}, { getKey = () => '', getCode = () => '' } = {}) {
  const c = { ...OPENAI_DEFAULTS, ...config, models: { ...OPENAI_DEFAULTS.models, ...(config.models || {}) }, efforts: { ...OPENAI_DEFAULTS.efforts, ...(config.efforts || {}) } };

  async function post(path, body, signal) {
    let last;
    for (let attempt = 0; attempt < 3; attempt++) {
      const direct = c.mode === 'direct';
      if (direct && !getKey()) throw new Error('OpenAI API 키가 없습니다. 설정에서 넣어 주세요.');
      const r = await fetch(direct ? `${c.baseUrl.replace(/\/$/, '')}${path}` : c.proxyUrl, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', ...(direct ? { Authorization: `Bearer ${getKey()}` } : { 'x-brain-code': getCode() }) },
        body: JSON.stringify(direct ? body : { path, body }),
      });
      const raw = await r.text();
      if (r.ok) return JSON.parse(raw);
      let msg = raw; try { msg = JSON.parse(raw).error.message || msg; } catch { /* 그대로 */ }
      last = Object.assign(new Error(`OpenAI ${r.status}: ${msg}`), { status: r.status });
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1) ** 2); continue; }
      throw last;
    }
    throw last;
  }

  return {
    name: 'openai',
    label: c.mode === 'proxy' ? 'OpenAI (서버 키)' : 'OpenAI (내 키)',
    models: c.models,
    async json({ role = 'director', system, user, signal }) {
      const model = c.models[role] || c.models.director;
      const body = {
        model, instructions: system,
        input: [{ role: 'user', content: [{ type: 'input_text', text: user }] }],
        text: { format: { type: 'json_object' } },
        reasoning: { effort: c.efforts[role] || 'medium' },
      };
      // 모델이 받지 않는 선택 항목은 하나씩 빼고 다시 부른다
      for (let i = 0; i < 4; i++) {
        try {
          const r = await post('/responses', body, signal);
          return { json: parseJSON(readResponse(r)), model, usage: r.usage ? { in: r.usage.input_tokens || 0, out: r.usage.output_tokens || 0 } : null };
        } catch (e) {
          const msg = String(e.message);
          if (e.status === 400 && /reasoning/i.test(msg) && body.reasoning) { delete body.reasoning; continue; }
          if (e.status === 400 && /text\.format|json_object|JSON mode/i.test(msg) && body.text) { delete body.text; continue; }
          if (e.status === 404 || (e.status === 400 && /responses|not supported|unsupported/i.test(msg))) {
            const r = await post('/chat/completions', { model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' } }, signal);
            return { json: parseJSON(r.choices?.[0]?.message?.content), model, usage: r.usage ? { in: r.usage.prompt_tokens || 0, out: r.usage.completion_tokens || 0 } : null };
          }
          throw e;
        }
      }
      throw new Error('OpenAI 요청 실패 — 선택 항목을 빼도 거절됨');
    },
    /**
     * 웹 조사 — Responses API의 웹 검색 도구를 켜고 부른다. 팩트북 조사에만 쓴다.
     * 돌려받은 항목은 엔진이 출처 조건으로 다시 거른다. 실제 키로는 아직 확인하지 못했다.
     */
    async research({ system, user, signal }) {
      const model = c.models.brain || c.models.director;
      const body = { model, instructions: system, input: [{ role: 'user', content: [{ type: 'input_text', text: user }] }], tools: [{ type: 'web_search' }] };
      const r = await post('/responses', body, signal);
      return { json: parseJSON(readResponse(r)), model, usage: r.usage ? { in: r.usage.input_tokens || 0, out: r.usage.output_tokens || 0 } : null };
    },
  };
}
