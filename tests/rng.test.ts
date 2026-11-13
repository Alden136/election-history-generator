import { describe, expect, it } from 'vitest';
import { createRng } from '../src/engine/rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(1792);
    const b = createRng(1792);
    const drawsA = Array.from({ length: 100 }, () => a.next());
    const drawsB = Array.from({ length: 100 }, () => b.next());
    expect(drawsA).toEqual(drawsB);
  });

  it('gives different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const rng = createRng(42);
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10_000).toBeCloseTo(0.5, 1);
  });

  it('between() covers both ends of the range, inclusive', () => {
    const rng = createRng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) seen.add(rng.between(1, 5));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
