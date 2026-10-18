'use strict';
/**
 * API 비용 — 호출마다 usage로 계산하고 userData/usage.jsonl 장부에 남긴다.
 * 단가는 설정(pricing)에서 고칠 수 있다. 실제 청구액은 OpenAI 대시보드가 기준이며 여기 값은 추정치다.
 */
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const settings = require('./settings');

function pricingFor(model) {
  const p = require('./models').pricing();
  const m = String(model || '').replace(/^mock:/, '');
  if (p[m]) return p[m];
  const key = Object.keys(p).filter((k) => k !== 'image' && m.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? p[key] : null;
}

function chatCost(model, usage) {
  if (!usage) return { usd: 0, input: 0, cached: 0, output: 0 };
  const input = usage.prompt_tokens || usage.input_tokens || 0;
  const cached = (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || (usage.input_tokens_details && usage.input_tokens_details.cached_tokens) || 0;
  const output = usage.completion_tokens || usage.output_tokens || 0;
  const p = pricingFor(model);
  const usd = p ? ((input - cached) * p.in + cached * (p.cached ?? p.in) + output * p.out) / 1e6 : 0;
  return { usd, input, cached, output, priced: !!p };
}

/** 웹 검색 도구 호출 비용 — 1회 단가(설정 pricing.webSearch) × 횟수 */
function searchCost(n) {
  const per = require('./models').pricing().webSearch ?? 0.01;
  return { usd: (n || 0) * per, searches: n || 0 };
}

function imageCost(model, usage, size, quality) {
  const p = pricingFor(model);
  if (usage && (usage.input_tokens || usage.output_tokens) && p) {
    const d = usage.input_tokens_details || {};
    const text = d.text_tokens ?? usage.input_tokens ?? 0;
    const img = d.image_tokens || 0;
    const usd = (text * p.in + img * (p.imageIn || p.in) + (usage.output_tokens || 0) * p.out) / 1e6;
    return { usd, input: usage.input_tokens || 0, output: usage.output_tokens || 0, priced: true };
  }
  const t = require('./models').pricing().image || {};
  const base = t[quality] ?? t.medium ?? 0.06;
  const sq = size === '1024x1024' ? 0.67 : 1;
  return { usd: base * sq, input: 0, output: 0, priced: false, estimate: true };
}

function ledgerFile() { return path.join(app.getPath('userData'), 'usage.jsonl'); }

function record(entry) {
  try { fs.appendFileSync(ledgerFile(), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); } catch { /* noop */ }
}

/** 장부 집계 — 월·모델별에 더해 프로젝트별 · 일별(최근 60일). 목업 호출은 빼고 센다 (includeMock은 테스트용) */
function summary({ includeMock = false } = {}) {
  const out = { month: 0, total: 0, calls: 0, byModel: {}, byMonth: {}, byProject: [], byDay: [] };
  let lines = [];
  try { lines = fs.readFileSync(ledgerFile(), 'utf8').split('\n').filter(Boolean); } catch { return out; }
  const ym = new Date().toISOString().slice(0, 7);
  const localDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('sv-SE'); };
  const since = localDay(new Date(Date.now() - 59 * 864e5).toISOString());
  const proj = {}, day = {};
  const add = (m, k, e) => { const x = m[k] = m[k] || { calls: 0, input: 0, output: 0, usd: 0, first: e.at, last: e.at }; x.calls++; x.input += e.input || 0; x.output += e.output || 0; x.usd += e.usd || 0; if (e.at < x.first) x.first = e.at; if (e.at > x.last) x.last = e.at; };
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      if (e.mock && !includeMock) continue;
      out.total += e.usd || 0; out.calls++;
      if ((e.at || '').startsWith(ym)) out.month += e.usd || 0;
      const k = (e.at || '').slice(0, 7);
      out.byMonth[k] = (out.byMonth[k] || 0) + (e.usd || 0);
      out.byModel[e.model] = (out.byModel[e.model] || 0) + (e.usd || 0);
      add(proj, e.projectId || '(프로젝트 없음)', e);
      const d = localDay(e.at); if (d && d >= since) add(day, d, e);
    } catch { /* skip */ }
  }
  let nameOf = () => null;
  try { const store = require('./services/storage'); const list = store.list(); const by = Object.fromEntries(list.map((p) => [p.id, p.name])); nameOf = (id) => by[id] || null; } catch { /* 저장소 없이 */ }
  out.byProject = Object.entries(proj).map(([id, v]) => ({ id, name: nameOf(id) || (id === '(프로젝트 없음)' ? '프로젝트 밖 호출' : '삭제된 프로젝트'), deleted: !nameOf(id) && id !== '(프로젝트 없음)', ...v })).sort((a, b) => b.last.localeCompare(a.last));
  out.byDay = Object.entries(day).map(([d, v]) => ({ day: d, ...v })).sort((a, b) => b.day.localeCompare(a.day));
  return out;
}

module.exports = { chatCost, imageCost, searchCost, record, summary, pricingFor };
