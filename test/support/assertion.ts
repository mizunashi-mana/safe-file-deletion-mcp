import { expect } from 'vitest';

export function assertNonNullish<T>(value: T | undefined | null): asserts value is T {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
}
