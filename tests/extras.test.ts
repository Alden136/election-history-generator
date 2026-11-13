import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx';
import { timelineCsv } from '../src/app/export';
import { parseDials } from '../src/app/dials';
import { ideologyChartBounds, partyResults, readLocation, timelineUrl } from '../src/app/presentation';
import { DEFAULT_DIALS, PARTIES, STATES } from '../src/engine/data';
import { CORRECTED_SETTINGS, simulate } from '../src/engine/simulate';
import { collectStatistics, measureTimeline, TIMELINE_METRICS } from '../src/engine/statistics';

describe('timeline extras', () => {
  it('keeps the founding winner share and leaves other 1792 popular votes unrecorded', () => {
    const results = partyResults(simulate(42).terms[0]!);
    expect(results.map(({ name, popular }) => [name, popular])).toEqual([
      ['Federalist', 1],
      ['J. Republican', null],
    ]);
  });

  it('includes the full range of shown party ideology in the chart', () => {
    const values = simulate(2, CORRECTED_SETTINGS).terms.flatMap((term) => term.shownIdeology);
    expect(Math.min(...values)).toBeLessThan(-10);
    expect(ideologyChartBounds(values).min).toBeLessThanOrEqual(Math.min(...values));
    expect(ideologyChartBounds([10.4]).max).toBe(15);
    expect(ideologyChartBounds([])).toEqual({ min: -10, max: 10 });
  });

  it('round-trips adjusted dials and preserves legacy default links', () => {
    const initial = readLocation('?seed=7&year=2024&rules=whig-loyalty');
    const dials = { ...DEFAULT_DIALS, partyLoyalty: 0.83, secessionThreshold: 5.7, potusBacklash: 0 };
    const url = timelineUrl('https://example.test/election/', { ...initial, dials });
    const replay = readLocation(url.search);
    expect(replay).toEqual({ ...initial, dials });
    expect(simulate(replay.seed, replay)).toEqual(simulate(initial.seed, { ...initial, dials }));
    expect(timelineUrl(url.href, initial).searchParams.has('dials')).toBe(false);
    expect(parseDials('partyLoyalty=100,secessionThreshold=Infinity,crisisBacklash=no,partyVictoryBoost=9.7'))
      .toEqual({ ...DEFAULT_DIALS, partyVictoryBoost: 9.5 });
  });

  it('uses the same metrics as the CLI and excludes the fixed election from rates', () => {
    const samples = [simulate(42), simulate(43)];
    const aggregate = collectStatistics();
    for (const timeline of samples) aggregate.add(timeline);
    const result = aggregate.result();
    const measurements = samples.map(measureTimeline);
    expect(result.means).toEqual(TIMELINE_METRICS.map((_, i) => (measurements[0]![i]! + measurements[1]![i]!) / 2));
    expect(result.outcomes.reduce((total, outcome) => total + outcome.count, 0)).toBe(2);
    expect(result.withCivilWar).toBe(samples.filter((t) => t.summary.civilWars > 0).length / samples.length);
    const elected = samples.flatMap((t) => t.terms.slice(1));
    for (const [i, party] of PARTIES.entries()) {
      expect(result.means[TIMELINE_METRICS.indexOf(party.name)])
        .toBeCloseTo(elected.filter((t) => t.winnerParty === i).length / elected.length);
    }
  });

  it('exports all 69 elections and the settings and state results for each row', () => {
    const dials = { ...DEFAULT_DIALS, partyLoyalty: 0.7 };
    const corrections = ['canada-annexation', 'whig-loyalty'] as const;
    const timeline = simulate(42, { dials, corrections });
    const workbook = XLSX.read(timelineCsv(timeline, dials), { type: 'string', raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
    expect(rows).toHaveLength(69);
    expect(rows[0]).toMatchObject({ Seed: '42', Preset: 'custom', Election: '1792',
      'Party loyalty': '0.7', Corrections: 'whig-loyalty, canada-annexation', 'President elected': 'George Washington' });
    expect(rows.at(-1)).toMatchObject({ Election: '2064', 'President elected': timeline.terms.at(-1)!.winnerName });
    const state = STATES[0]!;
    expect(rows[0]![`${state.code} (${state.name})`]).toBe(state.winner1792);
  });
});
