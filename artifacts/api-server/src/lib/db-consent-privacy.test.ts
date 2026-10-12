import { describe, it, expect } from 'vitest';
import { sanitizeProfile, sanitizeProfileForViewer } from './db-sanitize';
describe('registration consent stays private', () => {
  const row = { id: 'a', nickname: 'synthetic', contact_private: false, registration_consent: { collection: true, sharing: true } };
  it('omits consent evidence from broadcasts and other participant reads', () => {
    expect(sanitizeProfile(row)).not.toHaveProperty('registration_consent');
    expect(sanitizeProfileForViewer(row, 'b')).not.toHaveProperty('registration_consent');
    expect(sanitizeProfileForViewer(row, null)).not.toHaveProperty('registration_consent');
    expect(row).toHaveProperty('registration_consent');
  });
  it('keeps the participant own consent evidence and private contacts rule', () => {
    expect(sanitizeProfileForViewer(row, 'a')).toHaveProperty('registration_consent');
    expect(sanitizeProfileForViewer({ ...row, contact_private: true, phone_number: 'synthetic' }, 'b')).not.toHaveProperty('phone_number');
  });
});
