import { describe, expect, it } from 'vitest';
import { DEFAULT_MODULE_FLAGS, parseModuleFlags, serializeModuleFlags } from './module-flags';

describe('module-flags', () => {
  it('keeps all current modules enabled by default', () => {
    expect(parseModuleFlags(undefined)).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('supports safe partial soft-detach', () => {
    expect(parseModuleFlags('{"group_chat":false}')).toEqual({
      ...DEFAULT_MODULE_FLAGS,
      group_chat: false,
    });
  });

  it('canonicalizes malformed/extra input', () => {
    expect(parseModuleFlags('{oops')).toEqual(DEFAULT_MODULE_FLAGS);
    expect(JSON.parse(serializeModuleFlags({ push: false, unknown: false }))).toEqual({
      ...DEFAULT_MODULE_FLAGS,
      push: false,
    });
  });
});
