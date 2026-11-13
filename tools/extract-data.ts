/**
 * Pulls every hand-typed input out of the frozen sheet snapshot and writes it
 * to data/*.json. The engine reads only these files, never the sheet.
 *
 * Run: node tools/extract-data.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { colIndex, colName, loadSheet, type CellValue } from './sheet.ts';

const sheet = loadSheet();

// ---------------------------------------------------------------- helpers

function fail(message: string): never {
  throw new Error(`extract-data: ${message}`);
}

function str(addr: string): string {
  const v = sheet.value(addr);
  if (typeof v !== 'string') fail(`${addr} should be text, got ${JSON.stringify(v)}`);
  return v.trim();
}

function num(addr: string): number {
  const v = sheet.value(addr);
  if (typeof v !== 'number') fail(`${addr} should be a number, got ${JSON.stringify(v)}`);
  return v;
}

function optStr(addr: string): string | null {
  const v = sheet.value(addr);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function isConstant(addr: string): boolean {
  const v = sheet.value(addr);
  return v !== null && v !== '' && sheet.formula(addr) === null;
}

function cols(from: string, to: string): string[] {
  const out: string[] = [];
  for (let c = colIndex(from); c <= colIndex(to); c++) out.push(colName(c));
  return out;
}

function writeJson(name: string, data: unknown): void {
  writeFileSync(`data/${name}`, `${JSON.stringify(data, null, 2)}\n`);
}

/** The sheet's own state codes differ from postal codes in three places. */
const CODE_FIXES: Record<string, string> = { WS: 'WI', HW: 'HI', KT: 'KY' };
const fixCode = (code: string): string => CODE_FIXES[code] ?? code;

// ------------------------------------------------------------ year layout

const FIRST_ELECTION = 1792;
const LAST_ELECTION = 2064;
const elections: number[] = [];
for (let y = FIRST_ELECTION; y <= LAST_ELECTION; y += 4) elections.push(y);

/** Term rows: row 4 is the 1792 election (term began 1789), one row per term. */
const termRow = (election: number): number => 4 + (election - FIRST_ELECTION) / 4;
if (num(`AO${termRow(1792)}`) !== 1792) fail('term rows do not start at 1792');
if (num(`T${termRow(2064)}`) !== 2064) fail('term rows do not end at 2064');

/** State-grid rows: row 89 is the 1792 election. */
const gridRow = (election: number): number => 89 + (election - FIRST_ELECTION) / 4;
if (num(`AG${gridRow(1792)}`) !== 1792) fail('state grid does not start at 1792');
if (num('CX90') !== 1796 || num('FO91') !== 1796 || num('IK90') !== 1796 || num('LI90') !== 1796) {
  fail('state sub-tables are not aligned on 1796');
}

// ---------------------------------------------------------------- parties

const partyNames = cols('AU', 'BI').map((c) => str(`${c}3`));
if (partyNames.length !== 15 || partyNames[14] !== 'Third Party') fail('unexpected party list');

/** Each party's ideology block starts at the column whose row 1 holds its name. */
const ideologyColumn = new Map<string, string>();
for (const c of cols('HY', 'SD')) {
  const name = optStr(`${c}1`);
  if (name && partyNames.includes(name)) ideologyColumn.set(name, c);
}

const parties = partyNames.map((name, index) => {
  const col = ideologyColumn.get(name) ?? null;
  const tagline = col ? optStr(`${colName(colIndex(col) + 2)}1`) : null;
  return {
    id: name
      .toLowerCase()
      .replace(/[^a-z]+/g, '-')
      .replace(/^-|-$/g, ''),
    name,
    /** Position in the sheet's party lists; several formulas depend on it. */
    order: index,
    /** Starting ideology score, -10 (left) to 10 (right). Null for Third Party. */
    startIdeology: col ? num(`${col}5`) : null,
    /** True when the party already exists in 1792. */
    existsAtStart: col ? isConstant(`${col}4`) : false,
    tagline,
    sheetIdeologyColumn: col,
  };
});
if (parties.filter((p) => p.startIdeology !== null).length !== 14) fail('expected 14 party ideologies');

// ------------------------------------------------------------- candidates

const bandCols = cols('DN', 'DW');
const bands = bandCols.map((c) => {
  const m = /^(-?\d+) to (-?\d+)$/.exec(str(`${c}3`));
  if (!m) fail(`bad ideology band header at ${c}3`);
  return { min: Number(m[1]), max: Number(m[2]) };
});

const candidatesByElection: Record<string, string[]> = {};
for (const election of elections) {
  const row = termRow(election);
  if (num(`DM${row}`) !== election) fail(`candidate row ${row} is not ${election}`);
  if (election === 1792) continue; // Washington is fixed; the sheet has no row for 1792.
  candidatesByElection[election] = bandCols.map((c) => str(`${c}${row}`));
}

// ----------------------------------------------------------------- states

const winnerCols = cols('AI', 'CT');
const leanCols = cols('DC', 'FN');
const urbanCols = cols('FS', 'ID');
const voteCols = cols('IN', 'KY');
const realVoteCols = cols('LL', 'NW');
for (const group of [leanCols, urbanCols, voteCols, realVoteCols]) {
  if (group.length !== winnerCols.length) fail('state sub-tables have different widths');
}

/** Map tiles: the sheet draws the country on an 11-by-9 grid at B88:L96. */
const tile = new Map<string, { col: number; row: number }>();
sheet.range('B88:L96').forEach((line, row) =>
  line.forEach((cell, col) => {
    if (typeof cell !== 'string') return;
    const code = cell.trim();
    if (code === '' || code.toUpperCase() === 'X') return;
    tile.set(fixCode(code), { col, row });
  }),
);

const censusElections = elections.filter(
  (e) => e >= 1796 && optStr(`II${gridRow(e)}`)?.toLowerCase() === 'yes',
);

const states = winnerCols.map((wc, i) => {
  const lc = leanCols[i]!, uc = urbanCols[i]!, vc = voteCols[i]!, rc = realVoteCols[i]!;
  const sheetCode = str(`${wc}88`);
  const code = fixCode(sheetCode);
  for (const [addr, label] of [
    [`${lc}88`, 'lean'],
    [`${uc}89`, 'urbanisation'],
    [`${vc}88`, 'electoral votes'],
    [`${rc}88`, 'real electoral votes'],
  ] as const) {
    if (fixCode(str(addr)) !== code) fail(`${label} column ${addr} is ${str(addr)}, expected ${code}`);
  }

  const realVotes: Record<string, number> = {};
  for (const election of elections) {
    if (election === 1792) continue;
    const v = sheet.value(`${rc}${gridRow(election)}`);
    if (typeof v === 'number') realVotes[election] = v;
    else if (v !== null && v !== '') fail(`real votes ${rc} ${election}: ${JSON.stringify(v)}`);
  }

  const position = tile.get(code);
  if (!position) fail(`no map tile for ${code}`);

  return {
    code,
    sheetCode,
    name: str(`${wc}86`),
    /** Cultural region used for the North/South drift. Null for neither. */
    region: (optStr(`${wc}87`) as 'NORTH' | 'SOUTH' | null) ?? null,
    /** Party that carried the state in 1792, for the 16 original states. */
    winner1792: optStr(`${wc}${gridRow(1792)}`),
    /** Starting lean in 1796, -8 (left) to 8 (right). Null when the sheet leaves it blank. */
    lean1796: isConstant(`${lc}90`) ? Math.round(num(`${lc}90`) * 1e9) / 1e9 : null,
    /** Starting urbanisation share in 1796. Null when the sheet computes it. */
    urbanisation1796: isConstant(`${uc}91`) ? num(`${uc}91`) : null,
    /** The sheet's "GEO?" flag on the urbanisation table. */
    geoFlag: optStr(`${uc}88`)?.toUpperCase() === 'YES',
    /** Starting electoral votes in 1796. Null when not yet a state. */
    electoralVotes1796: isConstant(`${vc}90`) ? num(`${vc}90`) : null,
    /** The sheet's "Special" flag: electoral votes follow a custom formula. */
    specialVotes: optStr(`${vc}87`) === 'Special',
    /** Real-life electoral votes by election year (estimated for non-states). */
    realElectoralVotes: realVotes,
    tile: position,
  };
});
if (states.length !== 64) fail(`expected 64 states, found ${states.length}`);
if (tile.size !== 64) fail(`expected 64 map tiles, found ${tile.size}`);

/** Whether urbanisation pulls states left or right, by election year. */
const urbanDirection: Record<string, 'LEFT' | 'RIGHT'> = {};
for (const election of elections) {
  if (election < 1800) continue;
  // The urbanisation table sits one row lower than the other state tables.
  const v = str(`FP${gridRow(election) + 1}`);
  if (v !== 'LEFT' && v !== 'RIGHT') fail(`bad urban direction for ${election}: ${v}`);
  urbanDirection[election] = v;
}

// ------------------------------------------------------------------ dials

const dials = {
  /** Chance a state repeats its last vote (sheet AD86). */
  partyLoyalty: num('AD86'),
  /** Lean distance from the president that makes a state secede in a civil war (AE86). */
  secessionThreshold: num('AE86'),
  /** Weight of party strength against ideological fit when a state votes (AF86). */
  partyVictoryBoost: num('AF86'),
  /** Extra noise on party ideology after a failed presidency (HW9). */
  crisisBacklash: num('HW9'),
  /** Pull of parties away from an unpopular president's ideology (HW13). */
  potusBacklash: num('HW13'),
  /** How fast ideology bloc sizes move (SO3). */
  blocSizeMultiplier: num('SO3'),
};

// ---------------------------------------------------------- initial state

const blocCols = cols('SS', 'SY');
const blocs = blocCols.map((c, i) => ({
  name: str(`${c}3`),
  /** Fixed position on the ideology axis. */
  position: [-9, -6.5, -3.5, 0, 3.5, 6.5, 9][i]!,
  startSize: num(`${c}4`),
}));

const court = cols('TX', 'UL').map((c) => {
  const v = sheet.value(`${c}4`);
  return typeof v === 'number' ? v : null; // "Empty" seats become null
});

/**
 * Every other hand-typed value in the 1792 row (row 4) and, where the sheet
 * seeds two rows, the 1796 row (row 5). Keyed by column so the engine port can
 * look each one up next to its formula in reference/formulas.md.
 */
const seedCells: Record<string, { label: string; row4?: CellValue; row5?: CellValue }> = {};
// Columns A to S are the display panel, DM is a year column.
const skip = new Set([...cols('A', 'S'), ...bandCols, ...blocCols, ...cols('TX', 'UL'), 'DM']);
for (let c = 0; c < sheet.cols; c++) {
  const name = colName(c);
  if (skip.has(name)) continue;
  const label = optStr(`${name}3`) ?? '';
  if (label === 'Election' || label === 'ELECTION' || label === 'TERM') continue;
  const entry: { label: string; row4?: CellValue; row5?: CellValue } = { label };
  if (isConstant(`${name}4`)) entry.row4 = sheet.value(`${name}4`);
  if (isConstant(`${name}5`)) entry.row5 = sheet.value(`${name}5`);
  if (entry.row4 !== undefined || entry.row5 !== undefined) seedCells[name] = entry;
}

// ------------------------------------------------------------------ write

mkdirSync('data', { recursive: true });
writeJson('parties.json', parties);
writeJson('candidates.json', { bands, byElection: candidatesByElection });
writeJson('states.json', states);
writeJson('elections.json', { elections, censusElections, urbanDirection });
writeJson('dials.json', dials);
writeJson('initial-state.json', { blocs, court, seedCells });

console.log(
  [
    `${parties.length} parties`,
    `${Object.keys(candidatesByElection).length} candidate rows x ${bands.length} bands`,
    `${states.length} states`,
    `${censusElections.length} census elections`,
    `${Object.keys(seedCells).length} seed cells`,
  ].join('; '),
);
