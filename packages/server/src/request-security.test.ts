import { describe, expect, it } from 'vitest';
import { applicationOrigin, assertSameOrigin, safeReturnPath } from './request-security';

describe('cookie request origin', () => {
  it('requires an explicit secure public origin, permits loopback development', () => {
    expect(applicationOrigin('http://127.0.0.1:3100/x', '')).toBe('http://127.0.0.1:3100');
    expect(applicationOrigin('http://internal/x', 'https://hire.example')).toBe(
      'https://hire.example',
    );
    expect(() => applicationOrigin('https://untrusted.example', '')).toThrow();
    expect(() => applicationOrigin('http://internal', 'http://hire.example')).toThrow();
    expect(() => applicationOrigin('http://internal', 'https://user:pass@hire.example')).toThrow();
  });
  it('rejects absent, null, cross-origin and cross-site mutation origins', () => {
    for (const origin of [undefined, 'null', 'https://evil.example']) {
      const request = new Request('https://hire.example/api', {
        method: 'POST',
        headers: origin ? { origin } : {},
      });
      expect(() => assertSameOrigin(request, 'https://hire.example')).toThrow();
    }
    expect(() =>
      assertSameOrigin(
        new Request('https://hire.example/api', {
          headers: { origin: 'https://hire.example', 'sec-fetch-site': 'cross-site' },
        }),
        'https://hire.example',
      ),
    ).toThrow();
    expect(() =>
      assertSameOrigin(
        new Request('https://hire.example/api', { headers: { origin: 'https://hire.example' } }),
        'https://hire.example',
      ),
    ).not.toThrow();
  });
  it('never uses arbitrary auth return URLs', () => {
    expect(safeReturnPath('//evil.example')).toBe('/workspace');
    expect(safeReturnPath('/account')).toBe('/account');
  });
});
