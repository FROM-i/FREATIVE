#!/usr/bin/env node
// 스킬 폴더를 Claude에 올리는 ZIP으로 묶는다 — skill/thefrom-brain-project.zip
//   ZIP 안의 맨 위는 스킬 폴더여야 한다(thefrom-brain-project/SKILL.md).
//   압축하지 않고(저장 방식) 날짜를 고정해, 같은 내용이면 항상 같은 파일이 나온다. 테스트가 이것으로 ZIP이 최신인지 본다.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SKILL = 'thefrom-brain-project';
const TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** files: [{ name, data: Buffer }] → ZIP Buffer */
export function zip(files) {
  const DATE = 0x5b21; const TIME = 0; const locals = []; const central = []; let offset = 0;   // 2025-09-01 00:00
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8'); const crc = crc32(f.data);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(0, 8); head.writeUInt16LE(TIME, 10); head.writeUInt16LE(DATE, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(f.data.length, 18); head.writeUInt32LE(f.data.length, 22); head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, name, f.data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(TIME, 12); c.writeUInt16LE(DATE, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(f.data.length, 20); c.writeUInt32LE(f.data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name); offset += 30 + name.length + f.data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
export const packSkill = () => zip([{ name: `${SKILL}/SKILL.md`, data: fs.readFileSync(path.join(root, 'skill', SKILL, 'SKILL.md')) }]);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(root, 'skill', `${SKILL}.zip`); fs.writeFileSync(out, packSkill()); console.log(`${path.relative(root, out)}  ${fs.statSync(out).size} bytes`);
}
