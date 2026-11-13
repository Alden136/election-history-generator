import { describe, expect, it } from 'vitest';
import partyData from '../data/parties.json';
import { congressFromRaw, electCongress, electPresident } from '../src/engine/congress';
import { courtAverage } from '../src/engine/court';
import { DEFAULT_DIALS, P, PARTIES, partyIndex } from '../src/engine/data';
import { blocShares, electorateCenter, nationalSupport, partyVotes, updateBlocSizes } from '../src/engine/electorate';
import { dayOneApproval, electionDayApproval, presidentIdeology, stability } from '../src/engine/president';
import { internals } from '../src/engine/simulate';
import { averageUrban, electoralShares, electoralTotals, leanAverage, NO_EXPANSIONS, nextWinners, updateExpansions, VIRGINIA } from '../src/engine/states';
import { summarise } from '../src/engine/summary';
import { NO_VOTE, SECEDED, type Context, type Expansions, type StateGrid } from '../src/engine/types';
import { loadSheet, colIndex, colName } from '../tools/sheet';

const sheet = loadSheet();
const ctx: Context = {
  dials: DEFAULT_DIALS,
  rng: {
    next: (): never => { throw new Error('Unexpected random draw in fixed-input check'); },
    between: (): never => { throw new Error('Unexpected integer draw in fixed-input check'); },
  },
};

function number(address: string, blankIsZero = false): number {
  const value = sheet.value(address);
  if (blankIsZero && (value === null || value === '')) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${address} should contain a number, got ${JSON.stringify(value)}`);
  }
  return value;
}

function label(address: string): string {
  const value = sheet.value(address);
  if (typeof value !== 'string' || value.startsWith('#ERR:')) {
    throw new Error(`${address} should contain text, got ${JSON.stringify(value)}`);
  }
  return value;
}

function party(address: string): number {
  const name = label(address);
  const index = partyIndex(name);
  if (index < 0) throw new Error(`Unrecognised party ${name} at ${address}`);
  return index;
}

function addresses(start: string, end: string, row: number): string[] {
  const first = colIndex(start);
  return Array.from({ length: colIndex(end) - first + 1 }, (_, i) => colName(first + i) + row);
}

function numbers(start: string, end: string, row: number, blankIsZero = false): number[] {
  return addresses(start, end, row).map((address) => number(address, blankIsZero));
}

function check(actual: number, address: string, blankIsZero = false): void {
  const expected = number(address, blankIsZero);
  // The export rounds cached intermediates to roughly ten significant digits.
  expect(Math.abs(actual - expected), address).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(expected)));
}

function checkRow(actual: readonly number[], expected: string[]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((address, i) => check(actual[i]!, address));
}

const partyIdeologyColumns = partyData.flatMap((p) => p.sheetIdeologyColumn ? [p.sheetIdeologyColumn] : []);
const termRows = Array.from({ length: 69 }, (_, i) => i + 4);

function summaryTerm(row: number) {
  return {
    termBegan: number(`AC${row}`),
    president: label(`AD${row}`),
    potusParty: party(`AE${row}`),
    potusIdeology: number(`AG${row}`),
    descriptor: label(`AL${row}`),
    performance: number(`AK${row}`, row === 4),
    winnerName: label(`AR${row}`),
    winnerParty: party(`AS${row}`),
  };
}

function readExpansions(row: number): Expansions {
  const columns = ['P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W'];
  return Object.fromEntries(Object.keys(NO_EXPANSIONS).map((key, i) => [
    key, sheet.value(`${columns[i]}${row}`) === 'Yes',
  ])) as unknown as Expansions;
}

function stateGrid(row: number): StateGrid {
  const winners = addresses('AI', 'CT', row).map((address) => {
    const value = sheet.value(address);
    if (value === null || value === '') return NO_VOTE;
    return value === 'Seceded' ? SECEDED : party(address);
  });
  return {
    winners,
    expansions: readExpansions(row),
    expanded: sheet.value(`X${row}`) === true,
    lean: numbers('DC', 'FN', row, true),
    urban: row === 89 ? [] : numbers('FS', 'ID', row + 1, true),
    avgUrban: row === 89 ? 0 : number(`IE${row + 1}`),
    votes: numbers('IN', 'KY', row, true),
    totalVotes: number(`IL${row}`, row === 89),
    secededVotes: number(`Y${row}`),
    votingStates: number(`Z${row}`),
  };
}

describe('frozen workbook parity', () => {
  it('starts from the workbook’s fixed 1792 values', () => {
    const first = internals.firstTerm({ ...ctx, rng: { ...ctx.rng, next: () => 0.5 } });
    checkRow(first.blocSizes, addresses('SS', 'SY', 4));
    checkRow(first.support, addresses('BM', 'CA', 4));
    checkRow(first.congress, addresses('CG', 'CU', 4));
    check(first.congressIdeology, 'CE4');
    check(first.courtAverage, 'UM4');
    expect(first.grid.winners).toEqual(stateGrid(89).winners);
    check(first.grid.votingStates, 'Z89');
  });

  it('replays approval, stability, ideology, and electorate formulas from prior sheet rows', () => {
    const terms = termRows.map((row) => ({
      ...summaryTerm(row),
      support: numbers('BM', 'CA', row),
      congress: numbers('CG', 'CU', row),
      stability: number(`AM${row}`),
      center: number(`SM${row}`),
      ideology: partyIdeologyColumns.map((col) => number(`${col}${row}`, row === 4)),
      blocSizes: numbers('SS', 'SY', row),
      leanShift: number(`SQ${row}`, row === 4 || row === 72),
    }));
    for (const [i, row] of termRows.entries()) {
      const term = terms[i]!;
      const shares = blocShares(term.blocSizes);
      checkRow(shares, addresses('SF', 'SL', row));
      check(electorateCenter(shares), `SM${row}`);
      if (i === 0) continue;
      const prev = terms[i - 1]!;
      const dayOne = dayOneApproval(prev, terms[i - 2]);
      check(dayOne, `AJ${row}`);
      check(presidentIdeology(term.potusParty, prev), `AG${row}`);
      check(stability(term.performance, term.potusIdeology, sheet.value(`X${row + 85}`) === true, terms.slice(0, i)), `AM${row}`);
      checkRow(updateBlocSizes(prev, term.potusIdeology, number(`AJ${row}`), number(`AN${row}`), ctx), addresses('SS', 'SY', row));
    }
  });

  it('replays all 14 parties’ votes by bloc, their totals, and nonvoters', () => {
    for (const row of termRows.slice(1)) {
      const strength = numbers('GC', 'GP', row);
      const ideology = partyIdeologyColumns.map((col) => number(`${col}${row}`));
      const { votes, totals, nonvoters } = partyVotes(strength, ideology, numbers('SF', 'SL', row));
      partyIdeologyColumns.forEach((col, i) => {
        const start = colIndex(col) + 2;
        checkRow(votes[i]!, addresses(colName(start), colName(start + 6), row));
        check(totals[i]!, colName(start + 7) + row);
      });
      checkRow(nonvoters, addresses('GV', 'HB', row));
    }
  });

  it('checks national support and election-day approval against the possible RAND outputs', () => {
    const low = { ...ctx, rng: { ...ctx.rng, next: () => 0 } };
    const high = { ...ctx, rng: { ...ctx.rng, next: () => 1 - Number.EPSILON } };
    for (const row of termRows.slice(1)) {
      const strength = numbers('GC', 'GP', row);
      const strengthThird = number(`GQ${row}`);
      const ideology = partyIdeologyColumns.map((col) => number(`${col}${row}`));
      const totals = partyIdeologyColumns.map((col) => number(colName(colIndex(col) + 9) + row));
      const election = number(`AO${row}`);
      const minThird = nationalSupport(election, strength, strengthThird, totals, ideology, low);
      const maxThird = nationalSupport(election, strength, strengthThird, totals, ideology, high);
      numbers('BM', 'CA', row).forEach((value, i) => {
        const address = colName(colIndex('BM') + i) + row;
        expect(value, address).toBeGreaterThanOrEqual(Math.min(minThird.support[i]!, maxThird.support[i]!) - 1e-9);
        expect(value, address).toBeLessThanOrEqual(Math.max(minThird.support[i]!, maxThird.support[i]!) + 1e-9);
        if (i < P.THIRD) check(value > 0 ? ideology[i]! : 0, colName(colIndex('ER') + i) + row);
      });
      const term = summaryTerm(row);
      const result = label(`AQ${row - 1}`);
      if (result !== 'WIN' && result !== 'LOSS') throw new Error(`Unexpected result: ${result}`);
      const approve = (pinned: Context) => electionDayApproval(
        number(`AJ${row}`), term.performance, term.descriptor, term.potusIdeology, number(`CD${row}`),
        term.potusParty, { result, congressLeader: party(`CF${row - 1}`) }, pinned,
      );
      const expected = number(`AN${row}`);
      expect(expected, `AN${row}`).toBeGreaterThanOrEqual(approve(low) - 1e-9);
      expect(expected, `AN${row}`).toBeLessThanOrEqual(approve(high) + 1e-9);
    }
  });

  it('checks territory decisions against both possible random branches', () => {
    for (let row = 5; row <= 73; row++) {
      const gridRow = row + 85;
      const prev = readExpansions(gridRow - 1);
      const expected = readExpansions(gridRow);
      const input = {
        termBegan: number(`AC${row}`),
        potusIdeology: number(`AG${row}`),
        prevTermBegan: number(`AC${row - 1}`),
        prevPotusIdeology: number(`AG${row - 1}`),
        prev,
        prev2: row === 5 ? NO_EXPANSIONS : readExpansions(gridRow - 2),
        virginiaSeceded: stateGrid(gridRow - 1).winners[VIRGINIA] === SECEDED,
      };
      // West, Mexico, and Quebec can take independent draws in one term.
      const possible = Array.from({ length: 8 }, (_, mask) => {
        const tape = [0, 1, 2].map((bit) => (mask & (1 << bit)) === 0 ? 0 : 0.99);
        return updateExpansions(input, { ...ctx, rng: { ...ctx.rng, next: () => tape.shift()! } });
      });
      expect(possible, `P${gridRow}:W${gridRow}`).toContainEqual(expected);
      const expanded = Object.keys(prev).some((key) => prev[key as keyof Expansions] !== expected[key as keyof Expansions]);
      expect(expanded, `X${gridRow}`).toBe(sheet.value(`X${gridRow}`));
    }
  });

  it('recounts state totals, checks eligible state winners, and checks Electoral College shares', () => {
    let prev = stateGrid(89);
    for (const row of termRows.slice(1)) {
      const gridRow = row + 85;
      const grid = stateGrid(gridRow);
      const totals = electoralTotals(grid);
      check(totals.total, `IL${gridRow}`);
      check(totals.seceded, `Y${gridRow}`);
      check(totals.votingStates, `Z${gridRow}`);
      check(leanAverage(grid), `CY${gridRow}`);
      check(averageUrban(grid.urban), `IE${gridRow + 1}`);
      const input = {
        performance: number(`AK${row}`),
        descriptor: label(`AL${row}`),
        potusIdeology: number(`AG${row}`),
        support: numbers('BM', 'CA', row),
        shownIdeology: numbers('ER', 'FF', row),
      };
      const noLoyalty = { ...ctx, rng: { ...ctx.rng, next: () => 0.99 } };
      const withLoyalty = { ...ctx, rng: { ...ctx.rng, next: () => 0 } };
      const candidates = [noLoyalty, withLoyalty].map((pinned) =>
        nextWinners(prev, grid.lean, grid.votes, input, pinned),
      );
      grid.winners.forEach((winner, i) => {
        expect(candidates.map((option) => option[i]), colName(colIndex('AI') + i) + gridRow).toContain(winner);
      });
      const expected = numbers('AU', 'BI', row);
      const undiminished = electoralShares(grid, { ...ctx, rng: { ...ctx.rng, next: () => 0.8 } });
      const tape: number[] = [];
      undiminished.slice(0, P.THIRD).forEach((base, i) => {
        const actual = expected[i]!;
        expect(actual, `EC row ${row}, ${PARTIES[i]!.name}`).toBeGreaterThanOrEqual(0.95 * base - 1e-9);
        expect(actual, `EC row ${row}, ${PARTIES[i]!.name}`).toBeLessThanOrEqual(base + 1e-9);
        if (actual < base - 1e-9) tape.push(0.9, (1 - actual / base) / 0.05);
        else tape.push(0.8);
      });
      checkRow(electoralShares(grid, { ...ctx, rng: { ...ctx.rng, next: () => tape.shift()! } }), addresses('AU', 'BI', row));
      expect(tape).toHaveLength(0);
      prev = grid;
    }
  });

  it('replays both congressional tie-breaks and checks Congress and court outputs', () => {
    const branches = new Set<string>();
    for (const row of termRows.slice(1)) {
      const prev = {
        congress: numbers('CG', 'CU', row - 1),
        shownIdeology: numbers('ER', 'FF', row - 1),
        closeness: numbers('CX', 'DL', row - 1),
      };
      const electoral = numbers('AU', 'BI', row);
      branches.add(Math.max(...electoral) > 0.5 ? 'majority' :
        Math.max(...prev.congress) > 0.45 ? 'congress share' : 'congress ideology');
      expect(electPresident(electoral, prev), `AS${row}`).toBe(party(`AS${row}`));
      const congressRaw = numbers('DZ', 'EN', row);
      const shownIdeology = numbers('ER', 'FF', row);
      const support = numbers('BM', 'CA', row);
      const outgoing = { ...prev, congressRaw: numbers('DZ', 'EN', row - 1) };
      const grid = stateGrid(row + 85);
      const event = label(`AL${row}`);
      const noNoise = electCongress(outgoing, event, support, shownIdeology, grid, {
        ...ctx, rng: { ...ctx.rng, next: () => 0 },
      }).raw;
      congressRaw.slice(0, P.THIRD).forEach((raw, i) => {
        const address = colName(colIndex('DZ') + i) + row;
        expect(raw, address).toBeGreaterThanOrEqual(Math.max(0, noNoise[i]! - 0.05) - 1e-9);
        expect(raw, address).toBeLessThanOrEqual(noNoise[i]! + 1e-9);
      });
      check(noNoise[P.THIRD]!, `EN${row}`);
      const result = congressFromRaw(congressRaw, prev, shownIdeology);
      checkRow(result.shares, addresses('CG', 'CU', row));
      checkRow(result.closeness.slice(0, P.THIRD), addresses('CX', 'DK', row));
      if (number(`EN${row}`) === 0 && result.shares[P.THIRD]! < 1e-9) {
        // The XLSX rounds sub-ulp remainders in CU to zero, but the original
        // Sheets calculation sometimes used them when evaluating DL.
        const distanceScore = 100 - Math.abs(number(`FF${row}`) - number(`CE${row}`));
        for (const score of [result.closeness[P.THIRD]!, number(`DL${row}`)]) {
          if (score !== 0) expect(score, `DL${row}`).toBeCloseTo(distanceScore, 7);
        }
      } else {
        check(result.closeness[P.THIRD]!, `DL${row}`);
      }
      check(result.ideology, `CE${row}`);
      expect(result.leader, `CF${row}`).toBe(party(`CF${row}`));
      const winner = party(`AS${row}`);
      check(electoral[winner]!, `X${row}`);
      check((electoral[winner]! + 2 * support[winner]!) / 3, `W${row}`);
      const seats = addresses('TX', 'UL', row).map((a) => sheet.value(a) === 'Empty' ? null : number(a));
      check(courtAverage(seats), `UM${row}`);
    }
    expect(branches).toEqual(new Set(['majority', 'congress share', 'congress ideology']));
  });

  it('replays the entire summary panel, including the 2065 term where the sheet counts it', () => {
    const summary = summarise(termRows.map(summaryTerm), {
      name: label('AD73'),
      party: party('AE73'),
      ideology: number('AG73'),
      termBegan: number('AC73'),
      descriptor: label('AL73'),
    }, readExpansions(158));
    check(summary.weirdness, 'D6');
    expect(summary.weirdnessLabel).toBe(label('E6'));
    [summary.dictatorships, summary.civilWars, summary.expansions, summary.governingParties]
      .forEach((value, i) => check(value, `H${i + 7}`));
    [summary.current, summary.best, summary.worst, summary.radical, summary.longest].forEach((value, i) => {
      const row = i + 6;
      expect(value.name, `N${row}`).toBe(label(`N${row}`));
      expect(value.party, `O${row}`).toBe(party(`O${row}`));
      check(value.termStart, `P${row}`);
      expect(value.termEnd, `Q${row}`).toBe(number(`Q${row}`));
      expect(value.info, `R${row}`).toBe(label(`R${row}`).trim());
    });
  });
});
