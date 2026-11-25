/** JSON 문자열을 관대하게 읽는다 (코드펜스 · 앞뒤 설명 제거) */
export function parseJSON(text) {
  if (text && typeof text === 'object') return text;
  if (!text) throw new Error('빈 응답');
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try { return JSON.parse(t); } catch { /* 본문에서 객체만 꺼낸다 */ }
  const s = t.indexOf('{'); const e = t.lastIndexOf('}');
  if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error('JSON으로 읽을 수 없는 응답');
}
