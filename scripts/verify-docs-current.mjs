import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const master = read('docs/MASTER_CONTEXT.md');
const status = read('docs/CURRENT_STATUS.md');
const arch = read('ARCHITECTURE.md');

const failures = [];
const requireText = (name, text, needle) => {
  if (!text.includes(needle)) failures.push(`${name}: missing "${needle}"`);
};
const forbidText = (name, text, needle) => {
  if (text.includes(needle)) failures.push(`${name}: stale text "${needle}"`);
};

for (const [name, text] of [['MASTER_CONTEXT', master], ['CURRENT_STATUS', status]]) {
  requireText(name, text, '23:00');
  requireText(name, text, '24:00');
  requireText(name, text, '01:00');
  requireText(name, text, '17:00');
  requireText(name, text, '하트 + 1:1 채팅');
  forbidText(name, text, '23:30 → 친구');
  forbidText(name, text, '24:30 → 무지개');
  forbidText(name, text, '시간은 어드민에서 분 단위로 변경 가능');
}
forbidText('ARCHITECTURE', arch, 'HeartOpsCard.tsx');
requireText('ARCHITECTURE', arch, 'db-daily-cycle.ts');
requireText('ARCHITECTURE', arch, 'PWA Web Push');

if (failures.length) {
  console.error('BINPC2 docs freshness check failed:');
  failures.forEach((f) => console.error(' -', f));
  process.exit(1);
}
console.log('BINPC2 docs freshness check passed.');
