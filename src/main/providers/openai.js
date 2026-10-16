'use strict';
/**
 * OpenAI 프로바이더 — Chat Completions(JSON 모드) + Responses(웹 탐색) + Images.
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

/** Responses API 출력에서 본문 · 인용 URL · 검색 횟수를 모은다 */
function readResponse(r) {
  let text = '';
  const citations = [];
  let searches = 0;
  for (const item of r.output || []) {
    if (item.type === 'web_search_call') {
      searches++;
      const srcs = (item.action && item.action.sources) || [];
      for (const s of srcs) if (s && s.url) citations.push({ url: s.url, title: s.title || '', consulted: true });
    }
    if (item.type === 'message') {
      for (const c of item.content || []) {
        if (c.type !== 'output_text') continue;
        text += c.text || '';
        for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url) citations.push({ url: a.url, title: a.title || '' });
      }
    }
  }
  if (!text && typeof r.output_text === 'string') text = r.output_text;
  // 같은 URL은 하나로 — 본문 인용을 우선
  const seen = new Map();
  for (const c of citations) { const k = c.url.replace(/[#?].*$/, ''); if (!seen.has(k) || (seen.get(k).consulted && !c.consulted)) seen.set(k, c); }
  return { text, citations: [...seen.values()], searches };
}

/**
 * 웹 탐색 — Responses API + web_search 도구. 조수가 웹을 직접 확인하고 JSON으로 정리한다.
 * 반환: { json, model, usage, citations:[{url,title}], searches }
 */
async function search({ role = 'sub', model: override, effort, system, content, signal }) {
  const c = cfg();
  const model = override || c.models[role] || c.models.sub || c.models.director;
  const text = (Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }]).filter((x) => x.type === 'text').map((x) => x.text).join('\n');
  const tool = { type: 'web_search', search_context_size: 'medium', user_location: { type: 'approximate', country: 'KR' } };
  const body = {
    model,
    instructions: system,
    input: [{ role: 'user', content: [{ type: 'input_text', text }] }],
    tools: [tool],
    tool_choice: 'auto',
    include: ['web_search_call.action.sources'],
    text: { format: { type: 'json_object' } },
  };
  let eff = effort || c.reasoningEffort;
  if (eff === 'minimal') eff = 'low'; // web_search는 minimal 추론을 지원하지 않는다
  if (eff && /^(gpt-5|o\d)/.test(model)) body.reasoning = { effort: eff };
  let r;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { r = await request('/responses', body, { signal, timeoutSec: Math.max(300, c.timeoutSec || 0) }); break; } catch (e) {
      const msg = String(e.message || '');
      if (e.status !== 400) throw e;
      if (/web_search/.test(msg) && tool.type === 'web_search') { tool.type = 'web_search_preview'; delete tool.search_context_size; continue; }
      if (/include/.test(msg) && body.include) { delete body.include; continue; }
      if (/text\.format|json_object|response_format/.test(msg) && body.text) { delete body.text; continue; }
      if (/reasoning/.test(msg) && body.reasoning) { delete body.reasoning; continue; }
      if (/user_location/.test(msg) && tool.user_location) { delete tool.user_location; continue; }
      throw e;
    }
  }
  if (!r) throw new Error('웹 탐색 요청 실패');
  const out = readResponse(r);
  const json = parseJSON(out.text);
  return { json, model, usage: r.usage || null, citations: out.citations, searches: out.searches };
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

module.exports = { chat, search, image, listModels, test, parseJSON, name: 'openai' };
