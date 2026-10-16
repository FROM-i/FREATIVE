'use strict';
/**
 * 라이브러리 — 사조·노하우 추가
 *  1) 디자이너가 자료(.md·pdf·pptx·docx·이미지)를 올린다
 *  2) 모델이 카탈로그 형식으로 추출한다 (사조 카드 / 노하우 항목)
 *  3) 미리 보고 저장하면 userData/library/<kind>/ 에 .md로 남고, 다음 실행부터 여행 후보·브레인 노하우로 쓰인다
 *  4) '팀 공유'는 같은 .md를 저장소 knowledge/custom/<kind>/ 에 커밋하면 모든 직원에게 동기화된다
 */
const fs = require('fs');
const path = require('path');
const knowledge = require('./knowledge');
const settings = require('./settings');
const attachments = require('./attachments');
const providers = require('./providers');
const cost = require('./cost');
const { render } = require('./orchestrator/prompts');

const KIND_DIR = { ism: 'isms', knowhow: 'knowhow' };
const slug = (s) => String(s || 'item').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'item';
const bl = (arr) => (arr || []).map((x) => `- ${x}`).join('\n');

function ismToMd(it) {
  return `## \`${it.id}\` · ${it.name}${it.original ? ` (${it.original})` : ''}

**${it.era || '시기 미상'}**

${(it.people || []).length ? `**인물**: ${it.people.join(' · ')}\n\n` : ''}**원리**
${bl(it.principles)}

**시각** (참고용) ${(it.visual || []).join(' / ')}

**대표작** ${(it.works || []).join(' · ') || '—'}

**가져올 것**
${bl(it.take)}

**두고 올 것**${it.inferred ? ' _(원리에서 추론 — 확인 필요)_' : ''}
${bl(it.leave)}

**요약** ${it.summary || ''}
`;
}

function knowhowToMd(items, title) {
  const rows = items.map((it) => `| \`${it.id}\` | ${it.name} | ${String(it.desc || '').replace(/\|/g, '/')} | ${String(it.effect || '').replace(/\|/g, '/')} | ${(it.stages || []).join('·')} | ${String(it.how || '').replace(/\|/g, '/')} |`).join('\n');
  return `# 더프롬 노하우 — ${title}\n\n| ID | 이름 | 정의(원문) | 효과 | 쓰이는 단계 | 쓰는 법 |\n|---|---|---|---|---|---|\n${rows}\n`;
}

async function extract(kind, files) {
  if (!KIND_DIR[kind]) throw new Error('kind?');
  const m = await attachments.prepare(files);
  const k = knowledge.load();
  const sample = kind === 'ism'
    ? (k.isms.find((i) => i.id === 'ISM-BAUHAUS') || k.isms[0] || { body: '' }).body.slice(0, 2500)
    : k.knowhow.slice(0, 6).map((r) => `| \`${r.id}\` | ${r.name} | ${r.desc} |`).join('\n');
  const existing = (kind === 'ism' ? k.isms : k.knowhow).map((x) => x.id).join(', ');
  const { system, user } = render(kind === 'ism' ? 'lib_ism' : 'lib_knowhow', { sample, existing, material: '(아래 첨부)' });
  const content = [{ type: 'text', text: user }];
  for (const t of m.texts) content.push({ type: 'text', text: `\n---\n[자료: ${t.name}]\n${t.text}` });
  for (const im of m.images) { content.push({ type: 'text', text: `[자료 이미지: ${im.name}]` }); content.push({ type: 'image_url', image_url: { url: im.dataUrl } }); }
  for (const p of m.pdfs) content.push({ type: 'file', file: { filename: p.name, file_data: p.dataUrl } });
  const model = settings.get().openai.models.director;
  const r = await providers.get().chat({ role: 'director', model, system, content, meta: { prompt: kind === 'ism' ? 'lib_ism' : 'lib_knowhow', ctx: { files: files.map((f) => path.basename(f)) } } });
  const c = cost.chatCost(model, r.usage);
  cost.record({ projectId: null, stage: 'library', usd: c.usd, model, role: 'library', mock: providers.isMock() });
  const items = (r.json.items || []).filter((it) => it && it.id && it.name);
  const prefix = kind === 'ism' ? 'ISM-' : 'KH-';
  for (const it of items) { it.id = String(it.id).toUpperCase().replace(/[^A-Z0-9-]/g, ''); if (!it.id.startsWith(prefix)) it.id = prefix + it.id.replace(/^[A-Z]+-/, ''); }
  return { kind, items, note: r.json.note || '', skipped: m.skipped, usd: c.usd };
}

function save(kind, items, title) {
  const dir = knowledge.libraryDir(KIND_DIR[kind]);
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  if (kind === 'ism') {
    for (const it of items) {
      const f = path.join(dir, `${slug(it.id)}.md`);
      fs.writeFileSync(f, `# 사조 카드 — 라이브러리 추가\n\n${ismToMd(it)}`, 'utf8');
      written.push(f);
    }
  } else {
    const f = path.join(dir, `${slug(title || items[0].id)}-${Date.now().toString(36)}.md`);
    fs.writeFileSync(f, knowhowToMd(items, title || '추가 노하우'), 'utf8');
    written.push(f);
  }
  knowledge.invalidate();
  return { written, dir };
}

function list() {
  const k = knowledge.load();
  return { items: k.library, disabled: k.disabled, base: { isms: k.isms.filter((i) => !i.custom).length, knowhow: k.knowhow.filter((r) => !r.custom).length } };
}

function toggle(id, enabled) {
  const cur = new Set(((settings.get().library || {}).disabled) || []);
  if (enabled) cur.delete(id); else cur.add(id);
  settings.set({ library: { disabled: [...cur] } });
  knowledge.invalidate();
  return list();
}

/** 이 PC 라이브러리에서 지운다 — 팀 공유본은 저장소에서 지워야 한다 */
function remove(id) {
  for (const kind of Object.values(KIND_DIR)) {
    const dir = knowledge.libraryDir(kind);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const text = fs.readFileSync(p, 'utf8');
      if (!text.includes(`\`${id}\``)) continue;
      if (kind === 'isms') fs.unlinkSync(p);
      else {
        const kept = text.split('\n').filter((l) => !l.startsWith(`| \`${id}\``));
        if (kept.filter((l) => /^\| `KH-/.test(l)).length) fs.writeFileSync(p, kept.join('\n'), 'utf8'); else fs.unlinkSync(p);
      }
    }
  }
  knowledge.invalidate();
  return list();
}

function dir() { return path.dirname(knowledge.libraryDir('isms')); }

module.exports = { extract, save, list, toggle, remove, dir, ismToMd, knowhowToMd };
