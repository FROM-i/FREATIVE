'use strict';
/**
 * OpenAI 프로바이더 — Chat Completions(JSON 모드) + Images.
 * 다른 모델 공급자를 붙일 때는 같은 메서드(chat, image, listModels, test)를 가진 파일을 providers/에 추가한다.
 */
const settings = require('../settings');

function cfg() {
  const s = settings.get().openai;
  return { ...s, key: settings.getSecret('openaiKey') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(pathname, body, { signal, timeoutSec } = {}) {
  const c = cfg();
  if (!c.key) throw new Error('OpenAI API 키가 없습니다. 설정에서 입력하세요.');
  const url = `${c.baseUrl.replace(/\/$/, '')}${pathname}`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) throw new Error('취소됨'); signal.addEventListener('abort', onAbort, { once: true }); }
    const timer = setTimeout(() => ctrl.abort(), (timeoutSec || c.timeoutSec || 240) * 1000);
    try {
      const r = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await r.text();
      if (r.ok) return JSON.parse(text);
      let msg = text;
      try { msg = JSON.parse(text).error.message; } catch { /* noop */ }
      lastErr = new Error(`OpenAI ${r.status}: ${msg}`);
      lastErr.status = r.status;
      // 지원하지 않는 파라미터는 빼고 다시
      if (r.status === 400 && body && /reasoning_effort|reasoning/i.test(msg) && body.reasoning_effort) { delete body.reasoning_effort; continue; }
      if (r.status === 400 && body && /response_format/i.test(msg) && body.response_format) { delete body.response_format; continue; }
      if (r.status === 429 || r.status >= 500) { await sleep(1500 * (attempt + 1) ** 2); continue; }
      throw lastErr;
    } catch (e) {
      if (signal && signal.aborted) throw new Error('취소됨');
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e.name === 'AbortError' ? new Error('응답 시간 초과') : e;
      await sleep(1200 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr || new Error('OpenAI 요청 실패');
}

/** JSON 문자열을 관대하게 파싱 (코드펜스·앞뒤 설명 제거) */
function parseJSON(text) {
  if (!text) throw new Error('빈 응답');
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* try slice */ }
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error('JSON 파싱 실패');
}

/**
 * @param {object} o
 * @param {'director'|'sub'} o.role
 * @param {string} o.system
 * @param {Array} o.content  — user 메시지 content parts (text / image_url / file)
 */
async function chat({ role = 'director', model: override, effort, system, content, signal }) {
  const c = cfg();
  const model = override || c.models[role] || c.models.director;
  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content },
    ],
    response_format: { type: 'json_object' },
  };
  const eff = effort || c.reasoningEffort;
  if (eff && /^(gpt-5|o\d)/.test(model)) body.reasoning_effort = eff;
  const r = await request('/chat/completions', body, { signal });
  const msg = r.choices && r.choices[0] && r.choices[0].message;
  const json = parseJSON(msg && msg.content);
  return { json, model, usage: r.usage || null };
}

async function image({ prompt, size = '1536x1024', signal }) {
  const c = cfg();
  const q = settings.get().run.imageQuality;
  const body = { model: c.models.image, prompt, size, n: 1 };
  if (/gpt-image/.test(c.models.image) && q) body.quality = q;
  const r = await request('/images/generations', body, { signal, timeoutSec: 300 });
  const d = r.data && r.data[0];
  let buffer = null;
  if (d && d.b64_json) buffer = Buffer.from(d.b64_json, 'base64');
  else if (d && d.url) { const res = await fetch(d.url); buffer = Buffer.from(await res.arrayBuffer()); }
  if (!buffer) throw new Error('이미지 응답이 비었습니다');
  return { buffer, usage: r.usage || null, model: c.models.image, quality: q };
}

async function listModels() {
  const r = await request('/models');
  return (r.data || []).map((m) => m.id).sort();
}

async function test() {
  const ids = await listModels();
  return { ok: true, count: ids.length };
}

module.exports = { chat, image, listModels, test, parseJSON, name: 'openai' };
