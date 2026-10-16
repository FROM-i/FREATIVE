// 라이브러리 — 사조 추가 · 더프롬 노하우 추가 · 판단 브레인 렌즈 보기
import { esc, $, $$, arr } from './util.js';
import { ismIcon } from './art.js';

let tab = 'ism';
let pending = null; // { kind, items, note }

const SRC = { 스킬: '', 노하우북: '', '스킬 패턴': '', 팀: 'team', '내 PC': 'local' };
const STAGE_KO = { canvas: '캔버스', airplane: 'Airplane', tunnel: 'Tunnel', positioning: 'Positioning', forpop: 'FoR·PoP·PoD', concept: 'Concept', creative: 'Creative' };

export async function renderLibrary(root, { api, toast, onChange }) {
  const [cat, lib] = await Promise.all([api.library.catalog(), api.library.list()]);
  const disabled = new Set(lib.disabled || []);
  const customIds = new Set(arr(lib.items).map((x) => x.id));
  const local = new Set(arr(lib.items).filter((x) => x.source === '내 PC').map((x) => x.id));

  const uploader = (kind) => `
    <div class="stack" style="gap:12px">
      <div class="drop" id="libDrop" tabindex="0" role="button">
        <svg viewBox="0 0 40 40"><path d="M12 4 H26 L33 11 V36 H12 Z"/><path d="M26 4 V11 H33"/><path d="M22.5 17 V29 M17.5 22 L22.5 17 L27.5 22"/></svg>
        <b>${kind === 'ism' ? '사조를 정리한 자료' : '노하우를 정리한 자료'}를 끌어다 놓거나 클릭</b>
        <span class="rec">.md 권장 · PDF · PPTX · DOCX · 이미지 — 화가가 ${kind === 'ism' ? '카탈로그 카드(원리 · 가져올 것 · 두고 올 것)' : '노하우북 항목(원문 정의 · 쓰이는 단계)'}로 추출합니다</span>
      </div>
      ${pending && pending.kind === kind ? preview(pending) : ''}
      <div class="card soft" style="font-size:13px"><span class="kicker">팀과 공유하려면</span>
        저장한 항목은 이 PC에서 바로 쓰입니다. 팀 전체에 배포하려면 라이브러리 폴더의 .md를 저장소 <span class="mono">knowledge/custom/${kind === 'ism' ? 'isms' : 'knowhow'}/</span>에 커밋하고 manifest version을 올리세요.
        <div><button class="btn xs" data-l="open">라이브러리 폴더 열기</button></div></div>
    </div>`;

  const ismList = () => `<div class="lib-list">${cat.isms.map((i) => {
    const c = customIds.has(i.id);
    return `<div class="lib-item ${c && disabled.has(i.id) ? 'off' : ''}">${ismIcon(i.id, 40)}
      <div><b>${esc(i.name)}</b> <span class="id">${esc(i.id)} · ${esc(i.era || '')}</span>${i.source && i.source !== '스킬' ? ` <span class="src-b ${SRC[i.source] || ''}">${esc(i.source)}</span>` : ''}<br/><span class="muted">${esc(i.summary || '')}</span></div>
      <div class="row">${c ? `<label class="toggle"><input type="checkbox" data-l="toggle" data-id="${esc(i.id)}" ${disabled.has(i.id) ? '' : 'checked'}/></label>` : ''}${local.has(i.id) ? `<button class="btn xs ghost" data-l="del" data-id="${esc(i.id)}">삭제</button>` : ''}</div></div>`;
  }).join('')}${arr(lib.items).filter((x) => x.kind === 'ism' && disabled.has(x.id)).map((x) => `<div class="lib-item off"><span></span><div><b>${esc(x.name)}</b> <span class="id">${esc(x.id)}</span> <span class="src-b ${SRC[x.source] || ''}">${esc(x.source)}</span> <span class="muted">· 꺼짐</span></div><div class="row"><label class="toggle"><input type="checkbox" data-l="toggle" data-id="${esc(x.id)}"/></label>${local.has(x.id) ? `<button class="btn xs ghost" data-l="del" data-id="${esc(x.id)}">삭제</button>` : ''}</div></div>`).join('')}</div>`;

  const groups = cat.brain.knowhowGroups || {};
  const knowhowList = () => {
    const custom = arr(lib.items).filter((x) => x.kind === 'knowhow');
    const byPrefix = {};
    for (const r of cat.knowhow) (byPrefix[r.prefix] = byPrefix[r.prefix] || []).push(r);
    return `<div class="stack" style="gap:16px">
      ${custom.length ? `<div><span class="kicker">더프롬 추가 노하우</span><div class="lib-list" style="margin-top:6px">${custom.map((x) => `<div class="lib-item ${disabled.has(x.id) ? 'off' : ''}"><span class="lens-chip">${esc(x.id.replace(/^KH-/, ''))}</span><div><b>${esc(x.name)}</b> <span class="id">${esc(x.id)}</span> <span class="src-b ${SRC[x.source] || ''}">${esc(x.source)}</span><br/><span class="muted">${esc(x.desc || '')}</span></div><div class="row"><label class="toggle"><input type="checkbox" data-l="toggle" data-id="${esc(x.id)}" ${disabled.has(x.id) ? '' : 'checked'}/></label>${local.has(x.id) ? `<button class="btn xs ghost" data-l="del" data-id="${esc(x.id)}">삭제</button>` : ''}</div></div>`).join('')}</div></div>` : ''}
      ${Object.entries(groups).filter(([g]) => g !== 'custom').map(([g, def]) => `<details ${g === 'structure' ? 'open' : ''}><summary class="kicker" style="cursor:pointer">${esc(def.label)} · ${def.prefixes.map((p) => (byPrefix[p] || []).length).reduce((a, b) => a + b, 0)}개</summary>
        <div class="lib-list" style="margin-top:6px">${def.prefixes.flatMap((p) => byPrefix[p] || []).map((r) => `<div class="lib-item"><span class="lens-chip">${esc(r.prefix)}</span><div><b>${esc(r.name)}</b> <span class="id">${esc(r.id)}</span><br/><span class="muted">${esc(r.desc)}</span></div><span></span></div>`).join('')}</div></details>`).join('')}
    </div>`;
  };

  const brainView = () => {
    const b = cat.brain;
    return `<div class="stack">
      <p class="lead">더프롬 철학을 <b>판단 렌즈</b>로 바꾼 엔진입니다. 단계마다 <b>방향을 제시</b>하고(무엇을 지키고, 무엇을 피하고, 어떤 노하우를 쓸지), 결과를 <b>검증</b>합니다(렌즈별 0~5점 · 통과/보완/재작업). FoR·PoP·PoD의 발상의 전환과 컨셉 3→1 자체 검증은 브레인이 직접 추론합니다. 렌즈와 개입 단계는 저장소의 <span class="mono">knowledge/brain.json</span>에서 고칩니다.</p>
      <table class="tbl lens-table"><thead><tr><th>렌즈</th><th>질문</th><th>출처</th></tr></thead><tbody>
      ${arr(b.lenses).map((l) => `<tr><td><span class="lens-chip">${esc(l.id)}</span> <b>${esc(l.name)}</b></td><td>${esc(l.question)}</td><td class="mono muted">${esc(l.source)}</td></tr>`).join('')}</tbody></table>
      <span class="kicker">단계별 개입</span>
      <table class="tbl"><thead><tr><th>단계</th><th>강도</th><th>렌즈</th><th>노하우 범위</th><th>방향 제시의 초점</th></tr></thead><tbody>
      ${Object.entries(b.stages || {}).map(([k, v]) => `<tr><td><b>${esc(STAGE_KO[k] || k)}</b></td><td class="mono">${esc(arr(v.intensity).join('/'))}</td><td>${arr(v.lenses).map((l) => `<span class="lens-chip">${esc(l)}</span>`).join(' ')}</td><td>${arr(v.knowhow).map((g) => esc((groups[g] || {}).label || g)).join(' · ') || '—'}</td><td style="font-size:12px">${esc(v.direct)}</td></tr>`).join('')}</tbody></table>
    </div>`;
  };

  root.innerHTML = `<div class="lib">
    <div class="intake-head"><div><span class="kicker">LIBRARY</span><h1 class="h1" style="margin-top:8px">라이브러리</h1>
      <p class="lead">사조와 더프롬 노하우를 더하면 다음 미션부터 화가의 여행 후보와 판단 브레인의 노하우가 됩니다. 기본 사조 ${lib.base.isms} · 노하우 ${lib.base.knowhow}, 추가 ${arr(lib.items).length}.</p></div></div>
    <nav class="lib-tabs">${[['ism', '사조'], ['knowhow', '더프롬 노하우'], ['brain', '판단 브레인']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
    ${tab === 'brain' ? brainView() : `<div class="lib-grid"><div>${uploader(tab)}</div><div>${tab === 'ism' ? ismList() : knowhowList()}</div></div>`}
  </div>`;

  const rerender = () => renderLibrary(root, { api, toast, onChange });
  $$('[data-tab]', root).forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; rerender(); }));
  const drop = $('#libDrop', root);
  const run = async (paths) => {
    if (!paths.length) return;
    drop.innerHTML = '<b>화가가 자료를 읽고 카탈로그 형식으로 추출하는 중…</b><span class="rec">자료 분량에 따라 1~2분</span>';
    try { pending = await api.library.extract(tab, paths); if (!pending.items.length) toast('추출된 항목이 없습니다'); }
    catch (e) { toast(e.message, 6000); pending = null; }
    rerender();
  };
  if (drop) {
    drop.addEventListener('click', async () => run((await api.files.pick()).map((f) => f.path)));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); run([...e.dataTransfer.files].map((f) => api.files.pathFor(f)).filter(Boolean)); });
  }
  root.onclick = async (e) => {
    const b = e.target.closest('[data-l]'); if (!b || b.type === 'checkbox') return;
    if (b.dataset.l === 'open') api.library.open();
    if (b.dataset.l === 'del') { await api.library.remove(b.dataset.id); await onChange(); toast('삭제했습니다'); rerender(); }
    if (b.dataset.l === 'cancel') { pending = null; rerender(); }
    if (b.dataset.l === 'save') {
      const keep = $$('[data-pick-item]', root).filter((c) => c.checked).map((c) => +c.dataset.pickItem);
      const items = pending.items.filter((_, i) => keep.includes(i));
      if (!items.length) { toast('저장할 항목을 고르세요'); return; }
      const title = ($('#libTitle', root) || {}).value || '';
      await api.library.save(pending.kind, items, title);
      pending = null; await onChange(); toast(`${items.length}개를 라이브러리에 저장했습니다 — 다음 미션부터 적용`); rerender();
    }
  };
  root.onchange = async (e) => {
    const c = e.target.closest('[data-l="toggle"]'); if (!c) return;
    await api.library.toggle(c.dataset.id, c.checked); await onChange(); rerender();
  };
}

function preview(p) {
  const body = p.kind === 'ism'
    ? p.items.map((it, i) => `<div class="card"><label class="toggle"><input type="checkbox" data-pick-item="${i}" checked/> <b>${esc(it.name)}</b> <span class="mono muted">${esc(it.id)} · ${esc(it.era || '')}</span></label>
        <div class="grid g2" style="font-size:13px"><div><span class="kicker">가져올 것 — 원리</span><ul class="ul plus">${arr(it.take).map((x) => `<li><span>${esc(x)}</span></li>`).join('')}</ul></div>
        <div><span class="kicker">두고 올 것${it.inferred ? ' · 추론' : ''}</span><ul class="ul minus">${arr(it.leave).map((x) => `<li><span>${esc(x)}</span></li>`).join('')}</ul></div></div>
        <div class="muted" style="font-size:12px">원리 — ${esc(arr(it.principles).join(' / '))}</div><div style="font-size:13px"><b>요약</b> ${esc(it.summary)}</div></div>`).join('')
    : `<input class="input box" id="libTitle" placeholder="이 노하우 묶음의 이름 (예: 2026 키비주얼 촬영 노하우)"/>` + p.items.map((it, i) => `<div class="card"><label class="toggle"><input type="checkbox" data-pick-item="${i}" checked/> <b>${esc(it.name)}</b> <span class="mono muted">${esc(it.id)} · ${esc(it.category)}</span></label>
        <div style="font-size:13px">${esc(it.desc)}</div><div class="muted" style="font-size:12px">효과 — ${esc(it.effect || '')} · 쓰는 법 — ${esc(it.how || '')}</div>
        <div class="row">${arr(it.stages).map((s) => `<span class="lens-chip">${esc(s)}</span>`).join('')}</div></div>`).join('');
  return `<div class="preview"><div class="row"><span class="kicker">추출 결과 — 확인 후 저장</span><span class="muted" style="font-size:12px">${esc(p.note || '')}</span></div>
    ${body}${arr(p.skipped).length ? `<div class="muted" style="font-size:12px">읽지 못한 파일 — ${p.skipped.map((s) => esc(s.name)).join(', ')}</div>` : ''}
    <div class="row"><button class="btn primary sm" data-l="save">라이브러리에 저장</button><button class="btn ghost sm" data-l="cancel">취소</button></div></div>`;
}
