import { expect, it } from 'vitest';
import { createSessionBoundary } from './session-boundary';
it('invalidates old work when the same account signs out and back in', () => {
  const boundary = createSessionBoundary();
  boundary.observe('SIGNED_IN', 'candidate-a');
  const version = boundary.version;
  const key = boundary.key();
  boundary.observe('SIGNED_OUT', null);
  boundary.observe('SIGNED_IN', 'candidate-a');
  expect(boundary.key()).not.toBe(key);
  expect(() => boundary.assert(version)).toThrow('session changed');
});
it('keeps a request valid across ordinary token refresh', () => {
  const boundary = createSessionBoundary();
  boundary.observe('INITIAL_SESSION', 'candidate-a');
  const version = boundary.version;
  boundary.observe('TOKEN_REFRESHED', 'candidate-a');
  expect(() => boundary.assert(version)).not.toThrow();
});
it('invalidates a request on account switch even without a sign-out event', () => {
  const boundary = createSessionBoundary();
  boundary.observe('SIGNED_IN', 'candidate-a');
  const version = boundary.version;
  boundary.observe('INITIAL_SESSION', 'candidate-b');
  expect(() => boundary.assert(version)).toThrow('session changed');
});
