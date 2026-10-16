'use strict';
/**
 * 프롬프트 템플릿 렌더러.
 * 템플릿은 knowledge/prompts/*.md 이고 GitHub에서 동기화된다 — 코드 수정 없이 프롬프트를 고칠 수 있다.
 *
 *   <<<SYSTEM>>> ... <<<USER>>> ...     시스템/사용자 메시지 구분
 *   {{name}}                            문자열 값
 *   {{json:name}}                       값을 JSON으로
 *   {{include:path}}                    지식 파일 전체
 *   {{include:path#제목}}               지식 파일의 해당 절(제목으로 시작하는 헤딩부터 같은 깊이의 다음 헤딩 전까지)
 */
const knowledge = require('../knowledge');

function get(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function renderString(tpl, ctx, depth = 0) {
  return tpl.replace(/\{\{\s*([a-z]+:)?([^}]+?)\s*\}\}/gi, (_m, prefix, key) => {
    const p = (prefix || '').replace(':', '');
    if (p === 'include') {
      const [file, heading] = key.split('#');
      const text = knowledge.doc(file.trim());
      const part = heading ? knowledge.section(text, heading.trim()) : text;
      if (!part) return `(참조 없음: ${key})`;
      return depth < 2 ? renderString(part, ctx, depth + 1) : part;
    }
    const v = get(ctx, key.trim());
    if (p === 'json') return v === undefined ? 'null' : JSON.stringify(v, null, 1);
    if (v === undefined || v === null) return '';
    return typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  });
}

function render(name, ctx) {
  const tpl = knowledge.doc(`prompts/${name}.md`);
  if (!tpl) throw new Error(`프롬프트 없음: ${name}`);
  const [, sys = '', user = ''] = tpl.match(/<<<SYSTEM>>>([\s\S]*?)<<<USER>>>([\s\S]*)$/) || [null, tpl, ''];
  return { system: renderString(sys.trim(), ctx), user: renderString(user.trim(), ctx) };
}

module.exports = { render, renderString };
