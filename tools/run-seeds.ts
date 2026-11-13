/**
 * Run seeded timelines, assert invariants for each, and optionally compare
 * timeline-level metrics with independently recalculated Google Sheets runs.
 *
 * npm run seeds -- [count] [firstSeed] [refreshes.csv]
 */
import { readFileSync } from 'node:fs';
import { simulate } from '../src/engine/simulate.ts';
import { TIMELINE_METRICS as metrics, measureTimeline } from '../src/engine/statistics.ts';
import { assertTimeline } from './timeline-invariants.ts';

const count = Number(process.argv[2] ?? 1000);
const first = Number(process.argv[3] ?? 1);
const sheetPath = process.argv[4];
if (!Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(first) || first < 0 ||
    first + count - 1 > 0xffffffff) {
  throw new Error('Use a positive count and a seed range within 0 to 4294967295.');
}

function readRefreshes(path: string): number[][] {
  const [header, ...rows] = readFileSync(path, 'utf8').trim().split(/\r?\n/);
  if (header !== ['refresh', 'performance1796', ...metrics].join(',') || rows.length < 2) {
    throw new Error('Expected the refresh CSV header and at least two sheet timelines.');
  }
  const seen = new Set<number>();
  return rows.map((row, i) => {
    const cells = row.split(',');
    const values = cells.map(Number);
    if (values.length !== metrics.length + 2 || values[0] !== i ||
        cells.some((cell) => cell.trim() === '') || !values.every(Number.isFinite) || seen.has(values[1]!)) {
      throw new Error(`Invalid or duplicated sheet refresh on CSV line ${i + 2}`);
    }
    seen.add(values[1]!);
    return values.slice(2);
  });
}

function describeSample(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return {
    mean,
    standardError: Math.sqrt(variance / values.length),
    p10: sorted[Math.floor((sorted.length - 1) * 0.1)]!,
    p90: sorted[Math.ceil((sorted.length - 1) * 0.9)]!,
  };
}

const refreshes = sheetPath ? readRefreshes(sheetPath) : undefined;
const started = Date.now();
const results: number[][] = [];
const labels = new Map<string, number>();
let noEligibleElectors = 0;
for (let seed = first; seed < first + count; seed++) {
  const timeline = simulate(seed);
  assertTimeline(timeline);
  const label = timeline.summary.weirdnessLabel;
  labels.set(label, (labels.get(label) ?? 0) + 1);
  noEligibleElectors += timeline.terms.slice(1).filter((term) => term.grid.totalVotes === term.grid.secededVotes).length;
  results.push(measureTimeline(timeline));
}

console.log(`${count} timelines passed invariants in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
console.log(`No eligible electors in ${noEligibleElectors} simulated elections.`);
console.log('Weirdness labels', Object.fromEntries(labels));
if (refreshes) {
  console.log(`Compared with ${refreshes.length} sheet refreshes. Rates use 1796–2064 and the timeline is the unit of sampling.`);
  console.log('Difference bands are approximate 95% intervals for engine mean minus sheet mean.');
  console.log('A dash marks zero observed variation in one of the samples.');
}

console.table(Object.fromEntries(metrics.map((name, i) => {
  const engine = describeSample(results.map((row) => row[i]!));
  const interval = (low: number, high: number) => `[${low.toFixed(4)}, ${high.toFixed(4)}]`;
  const engineStats = { engine: engine.mean.toFixed(4), 'engine p10–p90': interval(engine.p10, engine.p90) };
  if (!refreshes) return [name, engineStats];
  const sheet = describeSample(refreshes.map((row) => row[i]!));
  const delta = engine.mean - sheet.mean;
  const margin = 1.96 * Math.hypot(engine.standardError, sheet.standardError);
  return [name, { ...engineStats, sheet: sheet.mean.toFixed(4), 'sheet p10–p90': interval(sheet.p10, sheet.p90),
    difference: delta.toFixed(4), '95% difference band':
      engine.standardError === 0 || sheet.standardError === 0 ? '—' : interval(delta - margin, delta + margin) }];
})));
