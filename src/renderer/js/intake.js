// 미션 접수 폼 — 디자이너가 핵심만 적는다. 나머지는 화가가 첨부에서 도출하거나 묻는다.
import { esc, $, $$, fmtSize, toast } from './util.js';
import { typeIcon } from './art.js';

const DRAFT_KEY = 'ct.intake.draft';
const empty = () => ({
  projectName: '', worker: '', deliverables: [], deliverableNote: '', purposes: [], purposeNote: '',
  target: '', product: '', channel: '', devices: [], keyMoment: '',
  brand: '', constraints: '', references: '', depth: 'gate', images: true, memo: '',
});

function loadDraft() { try { return { ...empty(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }; } catch { return empty(); } }
function saveDraft(s) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(s)); } catch { /* noop */ } }
export function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } }

function gate(s, files) {
  const hasFiles = files.length > 0;
  const c = {
    s1: s.deliverables.length > 0 && !!s.product.trim(),
    s2: !!s.target.trim() && !!s.channel && s.devices.length > 0,
    s3: !!s.keyMoment.trim(),
    s4: !!s.brand.trim(),
    s5: !!s.constraints.trim(),
    s6: s.purposes.length > 0 || !!s.purposeNote.trim(),
  };
  const need = !s.projectName.trim() || !s.worker.trim() || !c.s1 || !c.s2 || !c.s6;
  let state = '통과 예상', note = '화가가 바로 여행을 떠납니다.';
  if (need) { state = '입력 필요'; note = '필수 항목을 채우면 시작할 수 있어요.'; }
  else if (!c.s3) { state = hasFiles ? '도출 시도' : '질문 가능'; note = hasFiles ? '★3 핵심 순간은 첨부·목적에서 도출을 시도하고, 모호하면 최대 3개만 묻습니다.' : '★3 핵심 순간이 비어 있어요. 화가가 도출하거나 최대 3개만 묻습니다.'; }
  return { c, state, ok: !need, note };
}

export function renderIntake(root, { types, onStart, worker = '' }) {
  const s = loadDraft();
  if (!s.worker) s.worker = worker;
  let files = [];
  const T = types.types;

  root.innerHTML = `
  <div class="intake">
    <div class="intake-head">
      <div><span class="kicker">NEW MISSION · 미션 접수</span><h1 class="h1" style="margin-top:8px">화가에게 미션을 주세요.</h1>
        <p class="lead">핵심만 적어 주세요. 나머지는 화가와 조수들이 첨부에서 읽고 추론합니다. 첨부는 <b>.md 브리프와 이미지</b>를 권장합니다.</p></div>
      <div class="row"><button class="btn sm ghost" data-act="reset">새로 쓰기</button></div>
    </div>
    <div class="intake-grid">
      <form class="form" id="intakeForm" autocomplete="off">
        <div class="q"><div class="q-no">00</div><div class="q-body">
          <div class="grid" style="grid-template-columns:2fr 1fr;gap:24px">
            <div class="field"><div class="q-title">프로젝트명 <span class="star">필수</span></div>
              <input class="input" name="projectName" placeholder="예) 겨울 원두 팝업 — 성수" value="${esc(s.projectName)}"/></div>
            <div class="field"><div class="q-title">작업자 <span class="star">필수</span></div>
              <input class="input" name="worker" placeholder="이름" value="${esc(s.worker)}"/></div>
          </div></div></div>

        <div class="q"><div class="q-no">01</div><div class="q-body">
          <div class="q-title">무엇을 만드나요 <span class="star">★1 필수</span><span class="hint">여러 개 고르면 첫 번째가 주 결과물</span></div>
          <div class="types">${T.map((t) => `<button type="button" class="type" data-type="${t.id}">${typeIcon(t.id)}<b>${esc(t.label)}</b><small>${esc(t.desc)}</small></button>`).join('')}</div>
          <input class="input" name="deliverableNote" placeholder="범위 한 줄 (선택) — 예) 외벽 사인 1 + 대기열 패널 2 + 컵 슬리브" value="${esc(s.deliverableNote)}"/></div></div>

        <div class="q"><div class="q-no">02</div><div class="q-body">
          <div class="q-title">목적은 무엇인가요 <span class="star">★6 필수</span></div>
          <div class="chips" data-multi="purposes">${types.purposes.map((p) => `<button type="button" class="chip" data-val="${esc(p)}">${esc(p)}</button>`).join('')}</div>
          <input class="input" name="purposeNote" placeholder="한 줄로 — 무엇이 되면 성공인가요? 예) 팝업 앞에서 멈춰 시음까지" value="${esc(s.purposeNote)}"/></div></div>

        <div class="q"><div class="q-no">03</div><div class="q-body">
          <div class="q-title">타겟은 누구인가요 <span class="star">★2 필수</span><span class="hint">연령보다 상황 — 언제, 어떤 순간에 만나는가</span></div>
          <textarea class="textarea" name="target" rows="2" placeholder="예) 주말 오후 성수동을 걷는 20~30대. 목적지 없이 구경하며 지나간다">${esc(s.target)}</textarea></div></div>

        <div class="q"><div class="q-no">04</div><div class="q-body">
          <div class="q-title">어떤 제품·서비스인가요 <span class="star">★1 필수</span></div>
          <input class="input" name="product" placeholder="예) 제주 로컬 로스터리의 겨울 시즌 블렌드 원두" value="${esc(s.product)}"/></div></div>

        <div class="q"><div class="q-no">05</div><div class="q-body">
          <div class="q-title">어디서 만나나요 <span class="star">★2 필수</span></div>
          <div class="row"><div class="seg" data-single="channel">${types.channels.map((c) => `<button type="button" data-val="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>
          <div class="q-title" style="font-size:14px;margin-top:6px">주 노출 디바이스 <span class="hint">여러 개 가능</span></div>
          <div class="chips" data-multi="devices">${types.devices.map((d) => `<button type="button" class="chip" data-val="${esc(d)}">${esc(d)}</button>`).join('')}</div></div></div>

        <div class="q"><div class="q-no">06</div><div class="q-body">
          <div class="q-title">핵심 순간 <span class="star opt">★3 권장</span><span class="hint">비우면 화가가 도출하거나 최대 3개만 묻습니다</span></div>
          <input class="input" name="keyMoment" placeholder="이걸 만난 사람이 가장 얻고 싶은 것 — 예) 지나가다 멈춰 한 모금 맛볼 이유" value="${esc(s.keyMoment)}"/></div></div>

        <details class="more" ${s.brand || s.constraints || s.references || s.memo ? 'open' : ''}>
          <summary>더 알려주기 <span class="muted" style="font-weight:400;font-size:13px">브랜드 · 제약 · 레퍼런스 · 깊이 — 비워도 됩니다</span></summary>
          <div class="more-grid">
            <div class="field"><span class="label">★4 브랜드 <span class="hint">클라이언트 브랜드 · 톤 · 컬러. 없으면 '없음'</span></span><input class="input" name="brand" placeholder="예) 로고 원본만, 컬러 가이드 없음" value="${esc(s.brand)}"/></div>
            <div class="field"><span class="label">★5 제약 · 금지 · 재료</span><input class="input" name="constraints" placeholder="예) 설치 높이 3m 이하, 할인 문구 금지" value="${esc(s.constraints)}"/></div>
            <div class="field"><span class="label">비교 · 레퍼런스 <span class="hint">경쟁·통상적 해석의 실례 (출처와 함께)</span></span><input class="input" name="references" placeholder="예) 인근 팝업 A·B 외벽 사진 첨부" value="${esc(s.references)}"/></div>
            <div class="field"><span class="label">★6 깊이</span><div class="seg" data-single="depth"><button type="button" data-val="gate">C 게이트에서 판정</button><button type="button" data-val="full">끝까지 (예비 통과)</button></div></div>
            <div class="field full"><span class="label">메모</span><textarea class="textarea" name="memo" rows="2" placeholder="화가에게 더 하고 싶은 말">${esc(s.memo)}</textarea></div>
            <label class="toggle"><input type="checkbox" name="images" ${s.images ? 'checked' : ''}/> Creative 예시에 콘셉트 비주얼 이미지 생성</label>
          </div>
        </details>
      </form>

      <aside class="side">
        <div class="drop" id="drop" tabindex="0" role="button" aria-label="파일 첨부">
          <svg viewBox="0 0 40 40"><path d="M12 4 H26 L33 11 V36 H12 Z"/><path d="M26 4 V11 H33"/><path d="M22.5 17 V29 M17.5 22 L22.5 17 L27.5 22"/></svg>
          <b>파일을 끌어다 놓거나 클릭</b>
          <span class="rec">권장 <b>.md 브리프</b> · <b>이미지</b> — 그 외 PDF · PPTX · DOCX · TXT</span>
        </div>
        <div class="files" id="files"></div>
        <div class="gatebox" id="gatebox"></div>
        <div class="start-row"><button class="btn primary" id="startBtn" disabled>Creative Travel 시작 <span class="arrow">→</span></button></div>
        <div class="gate-note">화가(메인 모델)가 미션을 정리하고 조수(서브 모델)들을 사조 여행과 터널 레이어에 보냅니다. 더프롬 판단 브레인이 단계마다 방향을 제시하고 검증합니다. ★1·★2·★3은 가정으로 채우지 않습니다 — 더프롬 스킬의 원칙입니다.</div>
      </aside>
    </div>
  </div>`;

  const form = $('#intakeForm', root);
  const sync = () => {
    for (const el of $$('input[name], textarea[name]', form)) {
      if (el.type === 'checkbox') s[el.name] = el.checked; else s[el.name] = el.value;
    }
    $$('.type', form).forEach((b) => {
      const i = s.deliverables.indexOf(b.dataset.type);
      b.classList.toggle('on', i >= 0);
      let o = b.querySelector('.ord');
      if (i >= 0 && s.deliverables.length > 1) { if (!o) { o = document.createElement('span'); o.className = 'ord'; b.appendChild(o); } o.textContent = i === 0 ? '주' : String(i + 1); }
      else if (o) o.remove();
    });
    $$('[data-multi]', form).forEach((g) => $$('.chip', g).forEach((c) => c.classList.toggle('on', s[g.dataset.multi].includes(c.dataset.val))));
    $$('[data-single]', form).forEach((g) => $$('button', g).forEach((c) => c.classList.toggle('on', s[g.dataset.single] === c.dataset.val)));
    saveDraft(s);
    const g = gate(s, files);
    const stars = [
      ['★1', '무엇을', g.c.s1, true], ['★2', '누구에게', g.c.s2, true], ['★3', '핵심 순간', g.c.s3, false],
      ['★4', '브랜드', g.c.s4, false], ['★5', '제약·재료', g.c.s5, false], ['★6', '목적·깊이', g.c.s6, true],
    ];
    $('#gatebox', root).innerHTML = `
      <div class="state"><span class="kicker">브리프 게이트 미리보기</span><span class="badge ${g.ok ? 'y' : 'ghost'}">${esc(g.state)}</span></div>
      <ul class="checks">${stars.map(([k, l, ok, req]) => `<li><span class="mk ${ok ? 'ok' : req ? '' : 'auto'}"></span><span class="st">${k}</span><span>${l} <span class="muted">${ok ? '' : req ? '— 필요' : k === '★3' ? '— 도출/질문' : k === '★4' ? "— '없음'으로 가정" : '— 없음으로 진행'}</span></span></li>`).join('')}</ul>
      <div class="gate-note">${esc(g.note)}</div>`;
    $('#startBtn', root).disabled = !g.ok;
  };

  form.addEventListener('input', sync);
  form.addEventListener('click', (e) => {
    const t = e.target.closest('.type');
    if (t) { const id = t.dataset.type; const i = s.deliverables.indexOf(id); if (i >= 0) s.deliverables.splice(i, 1); else s.deliverables.push(id); sync(); return; }
    const c = e.target.closest('[data-multi] .chip');
    if (c) { const k = c.closest('[data-multi]').dataset.multi; const i = s[k].indexOf(c.dataset.val); if (i >= 0) s[k].splice(i, 1); else s[k].push(c.dataset.val); sync(); return; }
    const sg = e.target.closest('[data-single] button');
    if (sg) { const k = sg.closest('[data-single]').dataset.single; s[k] = sg.dataset.val; sync(); }
  });
  root.querySelector('[data-act="reset"]').addEventListener('click', () => { clearDraft(); renderIntake(root, { types, onStart, worker }); });

  // 첨부
  const drop = $('#drop', root);
  const renderFiles = () => {
    $('#files', root).innerHTML = files.map((f, i) => `
      <div class="file ${/\.(md|markdown)$/i.test(f.name) || f.kind === 'image' ? 'rec' : ''}">
        <div class="thumb">${f.preview ? `<img src="${f.preview}" alt=""/>` : esc((f.name.split('.').pop() || '').toUpperCase())}</div>
        <div style="min-width:0"><div class="nm">${esc(f.name)}</div><div class="sz">${fmtSize(f.size)} · ${f.kind === 'unsupported' ? '지원하지 않음' : esc(f.kind)}</div></div>
        <button class="x" data-rm="${i}" aria-label="삭제">×</button></div>`).join('');
    sync();
  };
  const add = (list) => {
    for (const f of list) if (!files.find((x) => x.path === f.path) && f.kind !== 'unsupported') files.push(f);
    const bad = list.filter((f) => f.kind === 'unsupported');
    if (bad.length) toast(`지원하지 않는 형식: ${bad.map((b) => b.name).join(', ')}`);
    renderFiles();
  };
  drop.addEventListener('click', async () => add(await window.api.files.pick()));
  drop.addEventListener('keydown', async (e) => { if (e.key === 'Enter' || e.key === ' ') add(await window.api.files.pick()); });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault(); drop.classList.remove('over');
    const paths = [...e.dataTransfer.files].map((f) => window.api.files.pathFor(f)).filter(Boolean);
    add(await window.api.files.inspect(paths));
  });
  $('#files', root).addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(+b.dataset.rm, 1); renderFiles(); } });

  $('#startBtn', root).addEventListener('click', async (e) => {
    e.preventDefault();
    sync();
    const btn = e.currentTarget; btn.disabled = true;
    try { await onStart({ ...s, images: !!s.images }, files.map((f) => f.path)); clearDraft(); }
    catch (err) { toast(err.message); btn.disabled = false; }
  });

  sync();
}
