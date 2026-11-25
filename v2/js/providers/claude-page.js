// Claude 공급자 — 이 페이지가 claude.ai 아티팩트로 열렸을 때만 쓸 수 있다.
// 보는 사람의 Claude에게 묻는다. 키가 필요 없고, 첫 호출에서 동의를 묻는다.
import { parseJSON } from '../engine/json.js';

const TIER = { director: 'complex', brain: 'complex', sub: 'default' };

/** 쓸 수 없으면 null */
export async function createClaudePage() {
  const use = globalThis.claude?.use;
  if (typeof use !== 'function') return null;
  let sample = null;
  try { sample = await use.call(globalThis.claude, 'sample'); } catch { return null; }
  if (!sample) return null;
  return {
    name: 'claude',
    label: 'Claude (이 페이지)',
    async json({ role = 'director', system, user, signal }) {
      const input = `${system}\n\n---\n\n${user}`;
      try {
        return { json: parseJSON(await sample.json(input, { signal, modelTier: TIER[role] || 'default' })), usage: null };
      } catch (e) {
        if (e?.code === 'not_granted') throw new Error('Claude 사용에 동의하지 않아 실행하지 못했습니다.');
        if (e?.code === 'rate_limited') throw new Error('Claude 사용 한도에 닿았습니다. 잠시 뒤 다시 실행해 주세요.');
        if (signal?.aborted) throw new Error('취소됨');
        // JSON이 깨진 경우 글로 받아 한 번 더 읽는다
        const r = await sample(input, { signal, modelTier: TIER[role] || 'default' });
        return { json: parseJSON(r.text), usage: null };
      }
    },
  };
}
