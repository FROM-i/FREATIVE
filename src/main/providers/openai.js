'use strict';
/**
 * OpenAI 프로바이더 — Responses(스트리밍 · JSON · 웹 탐색) + Chat Completions(대체) + Images.
 * 스트리밍으로 실제 진행(추론 · 검색 · 작성)을 받아 화면에 보이고, '총 시간'이 아니라 '무응답 시간'으로만 끊는다.
 * 다른 모델 공급자를 붙일 때는 같은 메서드(chat, image, listModels, test)를 가진 파일을 providers/에 추가한다.
 */
const settings = require('../settings');

function cfg() {
  const s = settings.get().openai;
  const e = require('../models').effective();
  return { ...s, models: { ...s.models, ...e.models }, roleEfforts: e.efforts || {}, key: settings.getSecret('openaiKey') };
}

/** 추론 강도를 모델이 받는 값으로 맞춘다 — gpt-5 이후·o 계열만. GPT-6 계열은 minimal 대신 low */
const REASONING = /^(gpt-([5-9]|\d{2})|o\d)/;
function effortFor(model, eff) {
  if (!eff || !REASONING.test(model)) return '';
  if (/^gpt-([6-9]|\d{2})/.test(model) && eff === 'minimal') return 'low';
  if (/^gpt-5(?!\.\d)/.test(model) && (eff === 'max' || eff === 'none')) return eff === 'max' ? 'high' : 'minimal';
  return eff;
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
      if (r.status === 400 && body && /quality/i.test(msg) && body.quality) { delete body.quality; continue; }
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

/**
 * 스트리밍 요청 (Responses API · SSE). 데이터가 들어오는 동안은 끊지 않고, idleSec 동안 아무것도 오지 않을 때만 끊는다.
 * onEvent(evt) 로 실제 진행(추론 요약 · 검색 · 작성 글자 수)을 알린다. 반환: 완료된 response 객체
 */
async function stream(pathname, body, { signal, idleSec = 180, onEvent } = {}) {
  const c = cfg();
  if (!c.key) throw new Error('OpenAI API 키가 없습니다. 설정에서 입력하세요.');
  const url = `${c.baseUrl.replace(/\/$/, '')}${pathname}`;
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) throw new Error('취소됨'); signal.addEventListener('abort', onAbort, { once: true }); }
    let idle = false;
    let timer = null;
    const beat = () => { clearTimeout(timer); timer = setTimeout(() => { idle = true; ctrl.abort(); }, idleSec * 1000); };
    beat();
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.key}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ ...body, stream: true }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        const text = await r.text();
        let msg = text; try { msg = JSON.parse(text).error.message; } catch { /* noop */ }
        const e = new Error(`OpenAI ${r.status}: ${msg}`); e.status = r.status;
        if (r.status === 429 || r.status >= 500) { lastErr = e; await sleep(1500 * (attempt + 1) ** 2); continue; }
        throw e;
      }
      onEvent && onEvent({ type: 'connected' });
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      let done = null;
      for (;;) {
        const { value, done: end } = await reader.read();
        if (end) break;
        beat();
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, k); buf = buf.slice(k + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
          if (!data || data === '[DONE]') continue;
          let ev; try { ev = JSON.parse(data); } catch { continue; }
          if (ev.type === 'response.completed') done = ev.response;
          else if (ev.type === 'response.failed' || ev.type === 'response.incomplete') { const e = new Error(`OpenAI 응답 실패: ${(ev.response && ev.response.error && ev.response.error.message) || (ev.response && ev.response.incomplete_details && ev.response.incomplete_details.reason) || ev.type}`); e.status = 502; throw e; }
          else if (ev.type === 'error') { const e = new Error(`OpenAI 오류: ${ev.message || (ev.error && ev.error.message) || ''}`); e.status = 502; throw e; }
          if (onEvent) onEvent(ev);
        }
      }
      if (!done) { const e = new Error('스트림이 완료 없이 끝났습니다'); e.status = 502; throw e; }
      return done;
    } catch (e) {
      if (signal && signal.aborted) throw new Error('취소됨');
      if (idle) { lastErr = new Error(`응답 없음 — ${idleSec}초 동안 아무 데이터도 오지 않아 다시 요청합니다`); lastErr.idle = true; onEvent && onEvent({ type: 'retry', reason: 'idle' }); continue; }
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e; onEvent && onEvent({ type: 'retry', reason: e.message });
      await sleep(1200 * (attempt + 1));
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }
  throw lastErr || new Error('OpenAI 요청 실패');
}

/** SSE 이벤트 → 사람이 읽는 진행 상태 */
function progressTracker(onProgress) {
  if (!onProgress) return null;
  const st = { phase: 'connecting', chars: 0, reasoningChars: 0, searches: 0, summary: '' };
  let last = 0;
  const push = (force) => { const t = Date.now(); if (force || t - last > 700) { last = t; onProgress({ ...st }); } };
  return (ev) => {
    switch (ev.type) {
      case 'connected': st.phase = 'queued'; push(true); break;
      case 'response.created': case 'response.in_progress': st.phase = 'queued'; push(); break;
      case 'response.output_item.added':
        if (ev.item && ev.item.type === 'reasoning') st.phase = 'reasoning';
        if (ev.item && ev.item.type === 'web_search_call') { st.phase = 'searching'; st.searches++; }
        if (ev.item && ev.item.type === 'message') st.phase = 'writing';
        push(true); break;
      case 'response.reasoning_summary_text.delta': st.phase = 'reasoning'; st.reasoningChars += (ev.delta || '').length; st.summary = (st.summary + (ev.delta || '')).slice(-160); push(); break;
      case 'response.reasoning_summary_part.added': st.phase = 'reasoning'; st.summary = ''; push(); break;
      case 'response.web_search_call.searching': case 'response.web_search_call.in_progress': st.phase = 'searching'; push(); break;
      case 'response.output_text.delta': st.phase = 'writing'; st.chars += (ev.delta || '').length; push(); break;
      case 'retry': st.phase = 'retry'; st.note = ev.reason; push(true); break;
      default: push();
    }
  };
}

/** Chat 형식 content parts → Responses input parts */
function toInput(content) {
  return (Array.isArray(content) ? content : [{ type: 'text', text: String(content || '') }]).map((c) => {
    if (c.type === 'text') return { type: 'input_text', text: c.text };
    if (c.type === 'image_url') return { type: 'input_image', image_url: c.image_url.url };
    if (c.type === 'file') return { type: 'input_file', filename: c.file.filename, file_data: c.file.file_data };
    return null;
  }).filter(Boolean);
}

/**
 * 스트리밍 → 안 되면 비스트리밍으로. 조직 미인증 등으로 스트리밍이 막히면 기다림만 알린다(경과 시간은 화면이 센다).
 * 지원하지 않는 선택 항목(추론 요약 · JSON 형식 · include 등)은 하나씩 빼고 다시.
 */
async function respond(body, { signal, onProgress }) {
  const track = progressTracker(onProgress);
  for (let i = 0; i < 6; i++) {
    try {
      if (body.__nostream) {
        onProgress && onProgress({ phase: 'waiting', chars: 0, searches: 0, note: '스트리밍 불가 — 응답 전체를 기다리는 중' });
        const b = { ...body }; delete b.__nostream;
        return await request('/responses', b, { signal, timeoutSec: 900 });
      }
      const b = { ...body }; delete b.__nostream;
      return await stream('/responses', b, { signal, onEvent: track, idleSec: settings.get().openai.idleSec || 180 });
    } catch (e) {
      const msg = String(e.message || '');
      if (e.status !== 400 && e.status !== 403) throw e;
      if (/summary/i.test(msg) && body.reasoning && body.reasoning.summary) { delete body.reasoning.summary; continue; }
      if (/stream|verif/i.test(msg) && !body.__nostream) { body.__nostream = true; continue; }
      if (/include/.test(msg) && body.include) { delete body.include; continue; }
      if (/text\.format|json_object|response_format|JSON mode/i.test(msg) && body.text) { delete body.text; continue; }
      if (/max_tool_calls/.test(msg) && body.max_tool_calls) { delete body.max_tool_calls; continue; }
      if (/reasoning/.test(msg) && body.reasoning) { delete body.reasoning; continue; }
      if (body.tools) {
        const tool = body.tools[0];
        if (/web_search/.test(msg) && tool.type === 'web_search') { tool.type = 'web_search_preview'; delete tool.search_context_size; continue; }
        if (/user_location/.test(msg) && tool.user_location) { delete tool.user_location; continue; }
      }
      throw e;
    }
  }
  throw new Error('OpenAI 요청 실패 — 옵션 조정 후에도 거절됨');
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
async function chat({ role = 'director', model: override, effort, system, content, signal, onProgress }) {
  const c = cfg();
  const model = override || c.models[role] || c.models.director;
  const eff = effortFor(model, effort || c.roleEfforts[role] || c.reasoningEffort);
  const body = {
    model,
    instructions: system,
    input: [{ role: 'user', content: toInput(content) }],
    text: { format: { type: 'json_object' } },
  };
  if (eff) body.reasoning = { effort: eff, summary: 'auto' };
  let r;
  try {
    r = await respond(body, { signal, onProgress });
  } catch (e) {
    // Responses를 못 쓰는 모델·게이트웨이 → Chat Completions (진행은 경과 시간만)
    if (!(e.status === 404 || (e.status === 400 && /responses|not supported|unsupported/i.test(e.message)))) throw e;
    onProgress && onProgress({ phase: 'waiting', chars: 0, searches: 0, note: '응답 전체를 기다리는 중' });
    const cb = { model, messages: [{ role: 'system', content: system }, { role: 'user', content }], response_format: { type: 'json_object' } };
    if (eff) cb.reasoning_effort = eff;
    const cr = await request('/chat/completions', cb, { signal, timeoutSec: 900 });
    const msg = cr.choices && cr.choices[0] && cr.choices[0].message;
    return { json: parseJSON(msg && msg.content), model, usage: cr.usage || null };
  }
  const out = readResponse(r);
  return { json: parseJSON(out.text), model, usage: r.usage || null };
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
async function search({ role = 'sub', model: override, effort, system, content, signal, onProgress }) {
  const c = cfg();
  const model = override || c.models[role] || c.models.sub || c.models.director;
  let eff = effortFor(model, effort || c.roleEfforts[role] || c.reasoningEffort);
  if (eff === 'minimal' || eff === 'none') eff = 'low'; // web_search는 minimal·none 추론을 지원하지 않는다
  const so = (settings.get().run && settings.get().run.search) || {};
  const body = {
    model,
    instructions: system,
    input: [{ role: 'user', content: toInput(content).filter((x) => x.type === 'input_text') }],
    // 검색 도구는 JSON 모드와 같이 쓸 수 없다(OpenAI 400: Web Search cannot be used with JSON mode) — 형식은 지시문으로 받고 본문에서 JSON을 꺼낸다
    tools: [{ type: 'web_search', search_context_size: so.context || 'low', user_location: { type: 'approximate', country: 'KR' } }],
    tool_choice: 'auto',
    include: ['web_search_call.action.sources'],
    max_tool_calls: so.maxCalls || 4,
  };
  if (eff) body.reasoning = { effort: eff, summary: 'auto' };
  const r = await respond(body, { signal, onProgress });
  const out = readResponse(r);
  let json;
  try { json = parseJSON(out.text); } catch (e) { throw new Error(`검색 결과를 JSON으로 읽지 못함 — ${e.message}`); }
  return { json, model, usage: r.usage || null, citations: out.citations, searches: out.searches };
}

async function image({ prompt, size = '1536x1024', model: override, signal }) {
  const c = cfg();
  const q = settings.get().run.imageQuality;
  const model = override || c.models.image;
  const body = { model, prompt, size, n: 1 };
  if (/gpt-image/.test(model) && q) body.quality = q;
  const r = await request('/images/generations', body, { signal, timeoutSec: 300 });
  const d = r.data && r.data[0];
  let buffer = null;
  if (d && d.b64_json) buffer = Buffer.from(d.b64_json, 'base64');
  else if (d && d.url) { const res = await fetch(d.url); buffer = Buffer.from(await res.arrayBuffer()); }
  if (!buffer) throw new Error('이미지 응답이 비었습니다');
  return { buffer, usage: r.usage || null, model, quality: q };
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
