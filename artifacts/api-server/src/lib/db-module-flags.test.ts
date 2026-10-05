import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODULE_FLAGS,
  moduleEnabled,
  moduleWriteGate,
  parseModuleFlags,
  serializeModuleFlags,
} from './db-module-flags.js';

describe('db-module-flags', () => {
  it('defaults every detachable module on for non-regression', () => {
    expect(parseModuleFlags(null)).toEqual(DEFAULT_MODULE_FLAGS);
    expect(parseModuleFlags('not-json')).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('parses partial flags without disabling unspecified modules', () => {
    expect(parseModuleFlags('{"hearts":false,"push":0}')).toEqual({
      ...DEFAULT_MODULE_FLAGS,
      hearts: false,
      push: false,
    });
    expect(moduleEnabled({ group_chat: false }, 'group_chat')).toBe(false);
  });

  it('serializes canonical keys only', () => {
    expect(JSON.parse(serializeModuleFlags({ hearts: false, extra: false }))).toEqual({
      ...DEFAULT_MODULE_FLAGS,
      hearts: false,
    });
  });

  it('blocks only writes owned by a disabled module', () => {
    expect(moduleWriteGate('likes', { hearts: false })).toMatchObject({
      allowed: false,
      module: 'hearts',
      code: 'MODULE_DISABLED',
    });
    expect(moduleWriteGate('messages', { direct_chat: false }).allowed).toBe(false);
    expect(moduleWriteGate('group_messages', { group_chat: false }).allowed).toBe(false);
    expect(moduleWriteGate('profiles', { hearts: false }).allowed).toBe(true);
  });
});
