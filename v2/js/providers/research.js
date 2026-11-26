// 딥리서치 에이전트 — 서버의 /api/research를 거쳐 Claude 콘솔의 에이전트에게 팩트북 조사를 맡긴다.
import { FACT_KINDS, SOURCE_TYPES, parseFactbook, factProblem, nextFactId } from '../../knowledge/facts.js';

export function createResearch({ url = '/api/research', getToken = async () => '', getCode = () => '', fetchImpl = (...a) => fetch(...a) } = {}) {
  const post = async (payload) => {
    const token = await getToken();
    let r; try { r = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-brain-code': getCode() || '', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload) }); }
    catch { throw new Error('조사 서버에 닿지 못했다 — 배포된 주소나 server.js로 연 화면에서만 쓴다'); }
    const raw = await r.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 글로 온 오류 */ }
    if (!r.ok) throw new Error(json?.error?.message || `조사 서버 ${r.status}`);
    return json;
  };
  return { agents: () => post({ action: 'agents' }), start: (agent, prompt, title) => post({ action: 'start', agent, prompt, title }), poll: (session) => post({ action: 'poll', session }), stop: (session) => post({ action: 'stop', session }) };
}

/** 조사 지시문 — 과제의 정의와 배경만 준다. 자료 원문은 주지 않는다. 답은 팩트북 형식으로 받는다 */
export function researchPrompt(project) {
  const b = project.brief || {}; const line = (k, v) => (String(v || '').trim() ? `- ${k}: ${String(v).trim()}` : '');
  const areas = (project.areas || []).filter((a) => String(a.name || '').trim()).map((a) => a.name).join(' · ');
  const have = (project.facts || []).length;
  const ok = SOURCE_TYPES.filter((t) => t.ai);
  return `아래 과제의 방향을 정하는 데 근거로 쓸 사실을 조사한다. 웹에서 원문을 직접 확인한 것만 적는다.

## 과제
- 프로젝트: ${project.title || ''}
${[line('목표', b.what), line('목적', b.purpose), line('성공 기준', b.success), line('핵심 포인트', b.points), line('타겟', b.target), line('제품 · 서비스', b.product), line('채널 · 매체', b.channel), line('업무 영역', areas)].filter(Boolean).join('\n')}
${(project.issues || []).filter((i) => String(i.title || '').trim()).map((i) => `- 이슈: ${i.title}`).join('\n')}

## 조사할 것
과제를 클라이언트의 사업 높이에서 볼 수 있게 하는 사실을 찾는다: 시장과 카테고리의 최근 흐름, 클라이언트와 경쟁사의 발표 · 정책 · 실적, 타겟의 실제 행동과 수치, 지금 벌어진 이슈와 규제.${have ? ` 팩트북에 이미 ${have}건이 있다 — 겹치지 않는 것을 찾는다.` : ''} 20~40건.

## 받는 출처 — 이 네 가지만
${ok.map((t) => `- ${t.name}: ${t.hint}`).join('\n')}
언론 기사 · 블로그 · 커뮤니티 · 출처를 확인하지 못한 자료는 적지 않는다. 원문 주소와 날짜가 없는 것도 적지 않는다. 수치는 원문 그대로 옮긴다. 추정하거나 지어내지 않는다.

## 답의 형식 — 마지막 답은 아래 마크다운만 낸다
종류별 제목은 정확히 이 이름을 쓴다: ${FACT_KINDS.map((k) => `"## ${k.name}"`).join(' · ')}

## ${FACT_KINDS[0].name}

- 사실 한 문장 (수치 · 기한 · 이름 포함)
  - 출처: ${ok[0].name} — 기관 · 문서 이름
  - 날짜: 2026-01-15
  - 주소: https://…
  - 근거 구절: "원문에서 그대로 옮긴 20자 안팎"
  - 확인: AI 조사 · 확인 전`;
}

/** 에이전트의 답에서 팩트를 꺼낸다 — 형식과 출처 조건에 맞는 것만 받는다 */
export function factsFromReport(text, project) {
  const md = String(text || ''); const at = md.search(/^##\s+/m);
  const list = at < 0 ? [] : parseFactbook(md.slice(at));
  const have = new Set((project.facts || []).map((f) => f.text)); const facts = []; const rejected = []; const draft = { facts: [...(project.facts || [])] };
  for (const f of list) {
    f.by = 'ai'; f.checked = false; f.id = '';
    const why = have.has(f.text) ? '이미 있다' : factProblem(f);
    if (why) { rejected.push({ text: f.text, why }); continue; }
    f.id = nextFactId(draft); draft.facts.push(f); facts.push(f); have.add(f.text);
  }
  return { facts, rejected, found: list.length };
}
