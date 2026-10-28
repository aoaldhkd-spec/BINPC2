import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
for (const script of ['bootstrap-production.mjs','rotate-exposed-secrets.mjs','restore-login-now.mjs','test-session-toggle.mjs','security-harden.mjs','sim-concurrent-users.mjs','verify-all-features.mjs']) {
  test(`${script}: missing confirmation stops before credentials or network`,()=>{
    const result=spawnSync(process.execPath,[resolve('scripts',script)],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:3000});
    assert.equal(result.status,1);
    assert.match(result.stderr,/requires explicit --target=production/);
    assert.doesNotMatch(result.stderr,/Missing credentials|Set RENDER_API_KEY|fetch failed/);
  });
  test(`${script}: dry-run needs no credentials and performs no operation`,()=>{
    const result=spawnSync(process.execPath,[resolve('scripts',script),'--dry-run'],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:3000});
    assert.equal(result.status,0);
    assert.match(result.stdout,/DRY RUN: no credentials read, files changed, or provider requests sent/);
  });
}
