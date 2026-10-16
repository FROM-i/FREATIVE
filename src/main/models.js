'use strict';
/**
 * 실제로 쓰는 모델 구성 = 추천 구성(knowledge/models.json, 저장소에서 동기화) 또는 사용자가 직접 지정한 설정.
 *  - settings.openai.followRecommended (기본 true) 이면 추천 구성을 따른다 → OpenAI가 새 모델을 내면
 *    models.json만 고쳐 manifest version을 올리면 설치된 앱이 재설치 없이 따라간다.
 *  - 단가는 언제나 추천 단가 위에 사용자 단가를 덮어 쓴다(사용자가 고친 값이 이긴다).
 */
const settings = require('./settings');

function recommended() {
  try { return require('./knowledge').load().models || null; } catch { return null; }
}

function following() {
  const o = settings.get().openai || {};
  return o.followRecommended !== false && !!recommended();
}

/** { models:{director,brain,sub,image}, efforts:{role:effort}, pool:[{id,effort,tier,note}], imagePool, stages, source } */
function effective() {
  const o = settings.get().openai || {};
  const r = recommended();
  if (following()) {
    const roles = r.roles || {};
    return {
      models: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, v.model])),
      efforts: Object.fromEntries(Object.entries(roles).filter(([, v]) => v.effort).map(([k, v]) => [k, v.effort])),
      pool: r.pool || [],
      imagePool: r.imagePool || [],
      stages: r.stages || {},
      effortsList: r.efforts,
      catalog: r.catalog || [], uses: r.uses || {}, effortGuide: r.effortGuide || {},
      source: 'recommended',
      updated: r.updated,
    };
  }
  return {
    models: { ...(o.models || {}) },
    efforts: { ...(o.roleEfforts || {}) },
    pool: o.pool || [],
    imagePool: o.imagePool && o.imagePool.length ? o.imagePool : (r && r.imagePool) || [],
    stages: o.stages || {},
    catalog: (r && r.catalog) || [], uses: (r && r.uses) || {}, effortGuide: (r && r.effortGuide) || {},
    source: 'custom',
    updated: r && r.updated,
  };
}

function pricing() {
  const r = recommended();
  const base = (r && r.pricing) || {};
  const user = settings.get().pricing || {};
  const out = { ...base };
  for (const [k, v] of Object.entries(user)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = { ...(base[k] || {}), ...v };
    else if (v != null) out[k] = v;
  }
  return out;
}

/** 추천 구성을 사용자 설정으로 복사 — '직접 지정'으로 바꿀 때 지금 값에서 출발하도록 */
function snapshotToCustom() {
  const e = effective();
  return { models: e.models, roleEfforts: e.efforts, pool: e.pool, imagePool: e.imagePool, stages: e.stages };
}

/** 계정에서 쓸 수 있는 모델 목록에서 새 모델을 찾아 등급을 추정한다 */
function classify(ids) {
  const e = effective();
  const known = new Set([...e.pool.map((p) => p.id), ...e.imagePool.map((p) => p.id), ...Object.values(e.models)]);
  const text = [], image = [];
  for (const id of ids) {
    if (known.has(id)) continue;
    if (/(realtime|audio|tts|transcribe|whisper|embedding|moderation|search-api|cyber|rosalind|codex|live|translate|babbage|davinci|instruct)/.test(id)) continue;
    if (/^(gpt-image|dall-e)/.test(id)) { image.push({ id, tier: /mini|flare|fast/.test(id) ? 'fast' : 'quality' }); continue; }
    if (!/^(gpt-\d|o\d)/.test(id)) continue;
    if (/\d{4}-\d{2}-\d{2}$/.test(id)) continue; // 날짜 고정 스냅샷은 건너뛴다
    const tier = /(astra|pro|max|ultra)/.test(id) ? 'frontier' : /(luna|nano|mini|lite)/.test(id) ? 'fast' : 'strong';
    text.push({ id, tier });
  }
  const ver = (id) => parseFloat((id.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]);
  text.sort((a, b) => ver(b.id) - ver(a.id));
  return { text, image };
}

module.exports = { recommended, following, effective, pricing, snapshotToCustom, classify };
