// 자료 읽기 — 어떤 자료든 올리면 전부 읽고(전수), 과제의 배경 · 영역 · 이슈 · 팩트로 정리한다(노드 구성).
// 목표 · 목적 · 성공 기준 · 핵심 포인트는 사람이 쓴다. 자료에서 읽은 것은 초안으로만 보여 주고 채우지 않는다.
//   ① 파일을 글이나 블록으로 바꾼다 (브라우저 안에서. 서버에 원본을 저장하지 않는다)
//   ② 파일마다, 길면 나눠서, 항목을 빠짐없이 뽑는다 (보조 모델)
//   ③ 뽑은 항목 전부를 놓고 과제 구조로 정리한다 (주 모델)
import { CATEGORIES } from '../../knowledge/tags.js';
import { FACT_KINDS, nextFactId } from '../../knowledge/facts.js';

export const INTAKE = { chunk: 90000, maxItems: 80, maxFiles: 20, areas: 5, issues: 8, facts: 60 };
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|xml|ya?ml|rtf|log)$/i;
const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const arr = (v) => (Array.isArray(v) ? v : []);
const cap = (v, n) => { const s = text(v); return s.length > n ? `${s.slice(0, n)}…` : s; };
const ext = (name) => (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

/** ZIP을 푼다 — docx · pptx · xlsx · hwpx가 모두 ZIP이다. 라이브러리 없이 중앙 목록을 읽고 항목을 푼다 */
export async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf); const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('ZIP 형식이 아니다');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const out = new Map(); const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= u8.length; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true); const csize = dv.getUint32(p + 20, true); const nlen = dv.getUint16(p + 28, true); const elen = dv.getUint16(p + 30, true); const clen = dv.getUint16(p + 32, true); const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true); const data = u8.subarray(start, start + csize);
    out.set(name, { method, data });
  }
  return {
    names: [...out.keys()],
    async read(name) { const e = out.get(name); if (!e) return ''; if (e.method === 0) return dec.decode(e.data); if (e.method !== 8) return '';
      const stream = new Blob([e.data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return dec.decode(await new Response(stream).arrayBuffer()); },
  };
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const plain = (xml) => String(xml).replace(/<[^>]+>/g, '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, c) => (c[0] === '#' ? String.fromCodePoint(c[1] === 'x' || c[1] === 'X' ? parseInt(c.slice(2), 16) : +c.slice(1)) : ENT[c] ?? m));
const byNum = (a, b) => (+(a.match(/(\d+)\.xml$/)?.[1] || 0)) - (+(b.match(/(\d+)\.xml$/)?.[1] || 0));
const tidy = (s) => s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** 오피스 문서에서 글을 꺼낸다 */
export async function officeText(buf, kind) {
  const z = await unzip(buf);
  if (kind === 'docx') return tidy(plain((await z.read('word/document.xml')).replace(/<w:tab\/>/g, '\t').replace(/<\/w:tc>/g, ' | ').replace(/<\/w:p>|<w:br\/>/g, '\n')));
  if (kind === 'pptx') { const out = []; for (const n of z.names.filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x)).sort(byNum)) out.push(`## 슬라이드 ${n.match(/(\d+)\.xml$/)[1]}\n${plain((await z.read(n)).replace(/<\/a:p>/g, '\n'))}`); return tidy(out.join('\n\n')); }
  if (kind === 'xlsx') {
    const shared = [...(await z.read('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => plain(m[1]));
    const out = [];
    for (const n of z.names.filter((x) => /^xl\/worksheets\/sheet\d+\.xml$/.test(x)).sort(byNum)) {
      const rows = [...(await z.read(n)).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 3000).map((r) => [...r[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)].map((c) => { const v = c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1]; const t = c[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]; return /t="s"/.test(c[1]) ? shared[+v] ?? '' : plain(t ?? v ?? ''); }).join(' | ')).filter((r) => r.replace(/[| ]/g, ''));
      if (rows.length) out.push(`## 시트 ${n.match(/(\d+)\.xml$/)[1]}\n${rows.join('\n')}`);
    }
    return tidy(out.join('\n\n'));
  }
  if (kind === 'hwpx') { const out = []; for (const n of z.names.filter((x) => /^Contents\/section\d+\.xml$/.test(x)).sort(byNum)) out.push(plain((await z.read(n)).replace(/<\/hp:p>/g, '\n'))); return tidy(out.join('\n\n')); }
  return '';
}

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };

/** 파일 하나를 읽는다 — 글로 읽히면 글로, PDF와 이미지는 그대로 보낼 블록으로. limit: 블록으로 보낼 수 있는 크기(바이트) */
export async function readFile(file, { limit = 3_000_000 } = {}) {
  const name = file.name || '자료'; const e = ext(name); const base = { name, size: file.size || 0 };
  try {
    if (['docx', 'pptx', 'xlsx', 'hwpx'].includes(e)) { const t = await officeText(await file.arrayBuffer(), e); return t ? { ...base, kind: 'text', text: t } : { ...base, kind: 'skip', note: '글을 찾지 못했다 — 그림으로만 된 문서일 수 있다. PDF로 바꿔 올린다' }; }
    if (e === 'pdf' || IMG[e]) {
      if (file.size > limit) return { ...base, kind: 'skip', note: `${(limit / 1e6).toFixed(0)}MB를 넘는다 — 서버 한도 때문에 못 보낸다. 나눠 올리거나 글로 바꿔 올린다` };
      const data = b64(new Uint8Array(await file.arrayBuffer()));
      return { ...base, kind: e === 'pdf' ? 'pdf' : 'image', block: e === 'pdf' ? { type: 'document', title: name, source: { type: 'base64', media_type: 'application/pdf', data } } : { type: 'image', source: { type: 'base64', media_type: IMG[e], data } } };
    }
    if (TEXT_EXT.test(name) || /^text\//.test(file.type || '')) { const t = tidy(await file.text()); return t ? { ...base, kind: 'text', text: t } : { ...base, kind: 'skip', note: '빈 파일이다' }; }
    return { ...base, kind: 'skip', note: e === 'hwp' ? 'HWP는 읽지 못한다 — HWPX나 PDF로 저장해 올린다' : e === 'ppt' || e === 'doc' || e === 'xls' ? `옛 형식(.${e})은 읽지 못한다 — ${e}x나 PDF로 저장해 올린다` : '읽을 수 없는 형식이다' };
  } catch (err) { return { ...base, kind: 'skip', note: `읽지 못했다 — ${err.message}` }; }
}
/** 긴 글은 나눈다 — 줄 경계에서. 나눈 조각을 모두 읽는다 */
export function chunks(t, size = INTAKE.chunk) {
  const out = []; let rest = String(t || '');
  while (rest.length > size) { let cut = rest.lastIndexOf('\n', size); if (cut < size * 0.6) cut = size; out.push(rest.slice(0, cut)); rest = rest.slice(cut); }
  if (rest.trim()) out.push(rest);
  return out;
}

const WORDING = '기획 문서와 회의에서 쓰는 말로 쓴다. 꾸밈말을 쓰지 않는다. 자료에 없는 것을 지어내지 않는다 — 없으면 비운다.';
export function readPrompt(file, part, total) {
  return {
    system: `너는 디자인 에이전시 THE FROM(더프롬)의 자료 분석 담당이다. 프로젝트 자료 하나를 읽고 항목을 **빠짐없이** 뽑는다. 요약하지 않는다 — 과업, 범위, 요구, 평가 기준, 일정, 예산, 제약, 현황, 수치, 이해관계자, 배경을 하나도 빠뜨리지 않는다.
- 항목 하나는 한 가지 내용만, 한 문장으로. 수치 · 기한 · 이름은 원문 그대로 옮긴다.
- \`quote\`: 그 항목의 근거가 되는 원문 구절(40자 이내, 원문 그대로). \`where\`: 쪽 · 절 · 슬라이드 · 시트.
- \`type\`: 과업 | 범위 | 요구 | 평가 | 일정 | 예산 | 제약 | 현황 | 수치 | 이해관계자 | 배경
- 최대 ${INTAKE.maxItems}개. 넘으면 중요한 것부터.
- ${WORDING}

## 출력 (JSON만)
{"summary":"이 자료가 무엇인지 한두 문장","doc":"자료의 종류(RFP · 과업지시서 · 회의록 · 조사 보고서 · 기존 산출물 등)","items":[{"type":"요구","text":"","quote":"","where":""}]}`,
    user: `자료: ${file.name}${total > 1 ? ` (${part}/${total} 부분)` : ''}\n\n${file.kind === 'text' ? `--- 원문 ---\n${file.chunk}\n--- 끝 ---` : '첨부한 자료를 처음부터 끝까지 읽는다.'}\n\n항목을 JSON으로 낸다.`,
  };
}
export function structurePrompt(project, reads) {
  const b = project.brief || {};
  const human = [['목표', b.what], ['목적', b.purpose], ['성공 기준', b.success], ['핵심 포인트', b.points], ['제약', b.note]].filter(([, v]) => text(v)).map(([k, v]) => `- ${k}: ${text(v)}`).join('\n');
  return {
    system: `너는 디자인 에이전시 THE FROM(더프롬)의 수석 기획자다. 프로젝트 자료에서 뽑은 항목 전부를 놓고, 분석에 들어갈 과제 구조를 정리한다.

## 정리할 것
- \`background\`: 타겟(누가, 어떤 순간에) · 제품/서비스 · 채널/매체 · 제약(반드시 지킬 것, 하면 안 되는 것). 자료에 있는 것만.
- \`draft\`: 목표 · 목적 · 성공 기준의 **초안**. 사람이 확인하고 고쳐 쓸 것이다. 자료의 문장을 근거로 쓴다.
- \`categories\`: 이 과제에 필요한 파트. ${CATEGORIES.map((c) => `${c.id}(${c.name})`).join(' · ')} 중에서.
- \`areas\`: 과제가 맡는 **업무 영역** 1~${INTAKE.areas}개. 직무나 시기로 나누지 않는다. 결과물이 하나인 과제는 하나. \`objects\`는 그 영역에서만 다루는 대상 키워드 2~5개.
- \`issues\`: 과제 안의 문제 3~${INTAKE.issues}개. 제목은 "누구의 무엇이 바뀌는가"로 쓴다(산출물 이름이 들어가면 과업이지 이슈가 아니다). 그중 하나만 \`root: true\`(근본 이슈)이고 \`test\`에 판정 질문 — 어떤 안이든 넣어 볼 질문 — 을 쓴다.
- \`facts\`: 분석의 근거로 쓸 사실. 자료의 수치 · 현황 · 요구 · 평가 기준 · 일정에서 최대 ${INTAKE.facts}개. \`kind\`는 ${FACT_KINDS.map((k) => `${k.id}(${k.name})`).join(' · ')} 중 하나. \`from\`에 근거 항목의 id.
- \`gaps\`: 분석에 필요한데 자료에 없어 확인이 필요한 것.
- ${WORDING}

## 출력 (JSON만)
{"background":{"target":"","product":"","channel":"","note":""},"draft":{"what":"","purpose":"","success":""},"categories":["planning"],"areas":[{"name":"","note":"","objects":[""]}],"issues":[{"title":"","detail":"","root":false,"test":"","from":["M1-1"]}],"facts":[{"kind":"notice","text":"","from":"M1-1"}],"gaps":[""]}`,
    user: `프로젝트: ${project.title || ''}
${human ? `\n## 사람이 쓴 과제 정의 — 그대로 둔다. 여기에 맞춰 정리한다\n${human}\n` : ''}
${reads.map((r) => `## ${r.id} ${r.name} — ${r.doc || ''} · ${r.summary || ''}\n${r.items.map((x) => `[${x.id}] (${x.type}${x.where ? ` · ${x.where}` : ''}) ${x.text}`).join('\n')}`).join('\n\n')}

과제 구조를 JSON으로 낸다.`,
  };
}

const TYPES = ['과업', '범위', '요구', '평가', '일정', '예산', '제약', '현황', '수치', '이해관계자', '배경'];
export function shapeRead(raw, id, seen = new Set()) {
  const items = [];
  for (const x of arr(raw?.items)) { const t = cap(x?.text, 240); if (!t || seen.has(t)) continue; seen.add(t); items.push({ id: `${id}-${seen.size}`, type: TYPES.includes(text(x.type)) ? text(x.type) : '배경', text: t, quote: cap(x.quote, 80), where: cap(x.where, 40) }); if (items.length >= INTAKE.maxItems) break; }
  return { summary: cap(raw?.summary, 200), doc: cap(raw?.doc, 30), items };
}
export function shapeStructure(raw, reads) {
  const items = new Map(reads.flatMap((r) => r.items.map((x) => [x.id, { ...x, file: r.name }])));
  const cats = new Set(CATEGORIES.map((c) => c.id)); const kinds = new Set(FACT_KINDS.map((k) => k.id));
  const one = (v) => text(v).replace(/^\[|\]$/g, '');
  const issues = arr(raw?.issues).map((i) => ({ title: cap(i?.title, 120), detail: cap(i?.detail, 600), root: !!i?.root, test: cap(i?.test, 160), from: arr(i?.from).map(one).filter((id) => items.has(id)) })).filter((i) => i.title).slice(0, INTAKE.issues);
  const root = issues.findIndex((i) => i.root && i.test); issues.forEach((i, n) => { i.root = n === (root < 0 ? 0 : root); if (!i.root) i.test = ''; });
  const seen = new Set();
  const facts = arr(raw?.facts).map((f) => { const src = items.get(one(f?.from)); const t = cap(f?.text, 300); if (!t || !src || seen.has(t)) return null; seen.add(t);
    return { kind: kinds.has(text(f.kind)) ? text(f.kind) : 'notice', text: t, sourceType: 'internal', source: `${src.file}${src.where ? ` · ${src.where}` : ''}`, date: '', url: '', quote: src.quote, by: 'doc', checked: false }; }).filter(Boolean).slice(0, INTAKE.facts);
  const bg = raw?.background || {}; const d = raw?.draft || {};
  return {
    background: { target: cap(bg.target, 300), product: cap(bg.product, 300), channel: cap(bg.channel, 300), note: cap(bg.note, 600) },
    draft: { what: cap(d.what, 200), purpose: cap(d.purpose, 300), success: cap(d.success, 300) },
    categories: [...new Set(arr(raw?.categories).map(text).filter((c) => cats.has(c)))],
    areas: arr(raw?.areas).map((a) => ({ name: cap(a?.name, 24), note: cap(a?.note, 80), objects: arr(a?.objects).map((w) => cap(w, 12)).filter(Boolean).slice(0, 6), auto: true })).filter((a) => a.name).slice(0, INTAKE.areas),
    issues, facts, gaps: arr(raw?.gaps).map((g) => cap(g, 160)).filter(Boolean).slice(0, 10),
  };
}

/** 자료를 분석한다. files: readFile()의 결과. 결과를 프로젝트에 넣지는 않는다 — applyIntake가 넣는다 */
export async function analyzeMaterials(project, files, provider, { onEvent = () => {}, signal } = {}) {
  const ok = files.filter((f) => f.kind !== 'skip').slice(0, INTAKE.maxFiles);
  if (!ok.length) throw new Error('읽을 수 있는 자료가 없다');
  if (ok.some((f) => f.block) && !provider.files) throw new Error('PDF와 이미지는 Claude API 공급자에서만 읽는다. 설정에서 모델을 바꾸거나 글 문서로 올린다');
  const reads = [];
  for (let n = 0; n < ok.length; n++) {
    const f = ok[n]; const id = `M${n + 1}`; const parts = f.kind === 'text' ? chunks(f.text) : [null]; const seen = new Set(); const got = { id, name: f.name, summary: '', doc: '', items: [], parts: parts.length };
    for (let k = 0; k < parts.length; k++) {
      if (signal?.aborted) throw new Error('취소됨');
      onEvent({ type: 'read', file: f.name, part: k + 1, parts: parts.length, done: n, total: ok.length });
      const { system, user } = readPrompt({ ...f, chunk: parts[k] }, k + 1, parts.length);
      const r = await provider.json({ tier: 'support', system, user, blocks: f.block ? [f.block] : undefined, signal, task: { kind: 'intakeRead', file: f.name, part: k + 1, sample: (parts[k] || '').slice(0, 2000) } });
      const shaped = shapeRead(r.json, id, seen);
      got.items.push(...shaped.items); if (!got.summary) { got.summary = shaped.summary; got.doc = shaped.doc; }
    }
    reads.push(got);
  }
  if (!reads.some((r) => r.items.length)) throw new Error('자료에서 항목을 뽑지 못했다');
  onEvent({ type: 'structure', items: reads.reduce((s, r) => s + r.items.length, 0) });
  const r = await provider.json({ tier: 'lead', ...structurePrompt(project, reads), signal, task: { kind: 'intake', project, reads } });
  return { ...shapeStructure(r.json, reads), reads: reads.map((x) => ({ id: x.id, name: x.name, doc: x.doc, summary: x.summary, items: x.items.length, parts: x.parts })), skipped: files.filter((f) => f.kind === 'skip').map((f) => ({ name: f.name, note: f.note })) };
}

/** 분석 결과를 프로젝트에 넣는다. 사람이 쓴 것은 덮어쓰지 않는다 — 빈 칸만 채우고, 이슈와 팩트는 더한다 */
export function applyIntake(project, got) {
  const b = project.brief; const added = { background: 0, areas: 0, issues: 0, facts: 0, categories: 0 };
  for (const k of ['target', 'product', 'channel']) if (!text(b[k]) && got.background[k]) { b[k] = got.background[k]; added.background++; }
  if (!text(b.note) && got.background.note) { b.note = got.background.note; added.background++; }
  if (!(project.categories || []).length && got.categories.length) { project.categories = got.categories; project.category = got.categories[0]; added.categories = got.categories.length; }
  if (!(project.areas || []).some((a) => text(a.name)) && got.areas.length) { project.areas = got.areas; added.areas = got.areas.length; }
  const blank = !(project.issues || []).some((i) => text(i.title));
  if (blank) project.issues = [];
  const have = new Set(project.issues.map((i) => text(i.title)));
  for (const i of got.issues) { if (have.has(i.title)) continue; const n = project.issues.length; const id = `I${Math.max(0, ...project.issues.map((x) => +String(x.id).slice(1) || 0)) + 1}`;
    project.issues.push({ id, title: i.title, detail: i.detail, test: i.test, root: blank ? i.root : false, tags: [], auto: true }); added.issues++; if (n > 20) break; }
  project.facts = project.facts || []; const texts = new Set(project.facts.map((f) => f.text));
  for (const f of got.facts) { if (texts.has(f.text)) continue; project.facts.push({ id: nextFactId(project), ...f }); texts.add(f.text); added.facts++; }
  project.materials = [...(project.materials || []).filter((m) => !got.reads.some((r) => r.name === m.name)), ...got.reads.map((r) => ({ name: r.name, doc: r.doc, summary: r.summary, items: r.items, at: new Date().toISOString() }))];
  project.intake = { at: new Date().toISOString(), draft: got.draft, gaps: got.gaps };
  return added;
}
