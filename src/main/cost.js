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
  const p = settings.get().pricing || {};
  const m = String(model || '').replace(/^mock:/, '');
  if (p[m]) return p[m];
  const key = Object.keys(p).filter((k) => k !== 'image' && m.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  return key ? p[key] : null;
}

function chatCost(model, usage) {
  if (!usage) return { usd: 0, input: 0, cached: 0, output: 0 };
  const input = usage.prompt_tokens || usage.input_tokens || 0;
  const cached = (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0;
  const output = usage.completion_tokens || usage.output_tokens || 0;
  const p = pricingFor(model);
  const usd = p ? ((input - cached) * p.in + cached * (p.cached ?? p.in) + output * p.out) / 1e6 : 0;
  return { usd, input, cached, output, priced: !!p };
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
  const t = (settings.get().pricing || {}).image || {};
  const base = t[quality] ?? t.medium ?? 0.06;
  const sq = size === '1024x1024' ? 0.67 : 1;
  return { usd: base * sq, input: 0, output: 0, priced: false, estimate: true };
}

function ledgerFile() { return path.join(app.getPath('userData'), 'usage.jsonl'); }

function record(entry) {
  try { fs.appendFileSync(ledgerFile(), JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); } catch { /* noop */ }
}

function summary() {
  const out = { month: 0, total: 0, calls: 0, byModel: {}, byMonth: {} };
  let lines = [];
  try { lines = fs.readFileSync(ledgerFile(), 'utf8').split('\n').filter(Boolean); } catch { return out; }
  const ym = new Date().toISOString().slice(0, 7);
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      if (e.mock) continue;
      out.total += e.usd || 0; out.calls++;
      if ((e.at || '').startsWith(ym)) out.month += e.usd || 0;
      const k = (e.at || '').slice(0, 7);
      out.byMonth[k] = (out.byMonth[k] || 0) + (e.usd || 0);
      out.byModel[e.model] = (out.byModel[e.model] || 0) + (e.usd || 0);
    } catch { /* skip */ }
  }
  return out;
}

module.exports = { chatCost, imageCost, record, summary, pricingFor };
