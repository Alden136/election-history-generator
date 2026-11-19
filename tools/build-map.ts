/**
 * Builds src/app/map-shapes.json: SVG paths for all 64 possible states,
 * projected once at build time so the app needs no map library.
 *
 * Sources
 * - US states, Canadian provinces, Cuba, Puerto Rico and the background:
 *   sane-topojson north-america_50m (MIT), derived from Natural Earth.
 * - Sonora and Chihuahua: reference/map-sources/mexico-sonora-chihuahua.geojson,
 *   extracted from Natural Earth ne_10m_admin_1_states_provinces (public domain).
 *
 * The game's "Columbia" (CL) is British Columbia and "Jefferson" (JF) is
 * Alberta, matching their places on the sheet's tile grid.
 *
 * Run: npm run build-map
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { geoConicEqualArea, geoPath, type GeoProjection } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import { presimplify, simplify } from 'topojson-simplify';
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import statesJson from '../data/states.json' with { type: 'json' };

const WIDTH = 960;
const PAD = 12;

type Shape = Feature<Polygon | MultiPolygon>;

// ------------------------------------------------------------------ sources

const rawTopo = JSON.parse(
  readFileSync('node_modules/sane-topojson/dist/north-america_50m.json', 'utf8'),
) as Topology<{ subunits: GeometryCollection; countries: GeometryCollection; land: GeometryCollection }>;
// Simplify shared borders together so neighbouring states still meet exactly.
// The threshold (in steradians) removes detail far below one pixel at this scale.
const SIMPLIFY = 2e-7;
const topo = simplify(presimplify(rawTopo), SIMPLIFY) as typeof rawTopo;

const subunits = (feature(topo, topo.objects.subunits) as FeatureCollection).features as Shape[];
const countries = (feature(topo, topo.objects.countries) as FeatureCollection).features as Shape[];
const mexico = (JSON.parse(readFileSync('reference/map-sources/mexico-sonora-chihuahua.geojson', 'utf8')) as FeatureCollection)
  .features as Shape[];

/** Game code -> where its outline comes from. */
const SOURCE_ID: Record<string, string> = { CL: 'BC', JF: 'AB' };

function shapeFor(code: string): Shape {
  if (code === 'SN' || code === 'CH') {
    const found = mexico.find((f) => f.properties?.code === code);
    if (!found) throw new Error(`Missing Mexican state ${code}`);
    return found;
  }
  if (code === 'CU' || code === 'PR') {
    const found = countries.find((f) => f.id === (code === 'CU' ? 'CUB' : 'PRI'));
    if (!found) throw new Error(`Missing country for ${code}`);
    return found;
  }
  const id = SOURCE_ID[code] ?? code;
  const found = subunits.find((f) => f.id === id);
  if (!found) throw new Error(`Missing subunit ${id} for ${code}`);
  return found;
}

const states = statesJson.map((s) => ({ code: s.code, name: s.name, shape: shapeFor(s.code) }));
const INSET = new Set(['AK', 'HI']);

// -------------------------------------------------------------- projections

const collection = (features: readonly Feature<Geometry>[]): FeatureCollection => ({ type: 'FeatureCollection', features: [...features] });

/**
 * The frame: every playable state from west to east, from Puerto Rico in the
 * south up to 56°N. Canada's provinces reach much further north, but that is
 * empty land that would halve the size of the United States on screen, so the
 * frame crops them.
 */
const NORTH_EDGE = 56;
const main = geoConicEqualArea().parallels([29.5, 50]).rotate([96, 0]);
const framePoints: Feature<Geometry> = {
  type: 'Feature', properties: {},
  geometry: { type: 'MultiPoint', coordinates: [[-127, NORTH_EDGE], [-96, NORTH_EDGE], [-60, NORTH_EDGE]] },
};
const frameFeatures = collection([
  ...states.filter((s) => !INSET.has(s.code) && !['CL', 'JF', 'SK', 'MB', 'ON', 'QC', 'NL'].includes(s.code)).map((s) => s.shape),
  framePoints,
]);
main.fitWidth(WIDTH - 2 * PAD, frameFeatures);
const mainBounds = geoPath(main).bounds(frameFeatures);
// Shift so the frame starts at the padding.
main.translate([main.translate()[0] + PAD - mainBounds[0][0], main.translate()[1] + PAD - mainBounds[0][1]]);
const HEIGHT = Math.ceil(mainBounds[1][1] - mainBounds[0][1] + 2 * PAD);
// Anything outside the frame (Greenland, northern Canada, Central America) is cut off.
main.clipExtent([[0, 0], [WIDTH, HEIGHT]]);

/** Alaska at 35% of the main scale and Hawaii at full scale, bottom left. */
const alaska = geoConicEqualArea().parallels([55, 65]).rotate([154, 0]).center([0, 58.5]).scale(main.scale() * 0.35);
const hawaii = geoConicEqualArea().parallels([8, 18]).rotate([157, 0]).center([0, 20.3]).scale(main.scale());

function placeInset(projection: GeoProjection, shape: Shape, x: number, bottom: number) {
  projection.translate([0, 0]);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(shape);
  projection.translate([x - x0, bottom - y1]);
  return { x, y: bottom - (y1 - y0), w: x1 - x0, h: y1 - y0 };
}

const akShape = states.find((s) => s.code === 'AK')!.shape;
const hiShape = states.find((s) => s.code === 'HI')!.shape;
const akBox = placeInset(alaska, akShape, PAD + 4, HEIGHT - PAD - 4);
const hiBox = placeInset(hawaii, hiShape, akBox.x + akBox.w + 16, HEIGHT - PAD - 4);

const projectionFor = (code: string): GeoProjection => (code === 'AK' ? alaska : code === 'HI' ? hawaii : main);

// ------------------------------------------------------------------ helpers

/**
 * geoPath output with numbers rounded to one decimal place. Points that land
 * within 0.4 px of the previous one are dropped: they cannot be seen.
 */
function pathString(projection: GeoProjection, geometry: Feature<Geometry> | FeatureCollection): string {
  const d = geoPath(projection)(geometry) ?? '';
  const rounded = d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n) * 10) / 10));
  return rounded.split('Z').map((ring) => {
    const points = ring.split(/(?=[ML])/).filter(Boolean);
    let last: [number, number] | null = null;
    const kept: string[] = [];
    points.forEach((p, i) => {
      const [x, y] = p.slice(1).split(',').map(Number) as [number, number];
      const isEnd = i === 0 || i === points.length - 1;
      if (last && !isEnd && Math.hypot(x - last[0], y - last[1]) < 0.4) return;
      kept.push(p);
      last = [x, y];
    });
    // A ring that collapsed below a few points is invisible.
    return kept.length >= 3 ? kept.join('') : '';
  }).filter(Boolean).join('Z') + (rounded.endsWith('Z') ? 'Z' : '');
}

/** Largest polygon of a shape, by projected area. */
function largestPolygon(projection: GeoProjection, shape: Shape): Feature<Polygon> {
  const polygons: Position[][][] = shape.geometry.type === 'Polygon' ? [shape.geometry.coordinates] : shape.geometry.coordinates;
  let best: Feature<Polygon> | null = null;
  let bestArea = -1;
  for (const coordinates of polygons) {
    const candidate: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates } };
    const area = geoPath(projection).area(candidate);
    if (area > bestArea) { bestArea = area; best = candidate; }
  }
  return best!;
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Hand nudges (in pixels) where the centroid sits awkwardly. */
const LABEL_NUDGE: Record<string, [number, number]> = {
  FL: [9, 6], MI: [6, 10], LA: [-6, -2], ID: [0, 12], KY: [4, 1], NY: [6, 4], CA: [-6, 0],
  TN: [2, 0], ON: [0, 22], QC: [0, 30], NL: [10, 26], NS: [-4, 2], OK: [8, 0], TX: [4, 0],
  VA: [6, 2], NC: [6, 0], WV: [-1, 2], MN: [-2, 6], CL: [4, 6], ME: [-2, 4], SN: [-4, 0],
  // Cuba is thin and curved; this is the widest part of the island.
  CU: [-38.7, -10.7],
};

/** States too small to label or hover easily get a box in the Atlantic. */
const CALLOUTS = ['VT', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC'];
/** Small islands get a label beside the shape instead of on it (offset in pixels). */
const FORCED_LABEL: Record<string, [number, number]> = { PR: [0, -16], HI: [-26, -18] };
const MIN_LABEL_WIDTH = 40;
const MIN_LABEL_HEIGHT = 24;

// ----------------------------------------------------------------- shapes

interface StateShape {
  d: string;
  label?: [number, number];
  /** The label sits beside the shape, on the map background. */
  labelOutside?: boolean;
  callout?: { box: [number, number, number, number]; line: [number, number, number, number] };
}

const shapes: Record<string, StateShape> = {};
const anchors: Record<string, [number, number]> = {};

for (const { code, shape } of states) {
  const projection = projectionFor(code);
  const d = pathString(projection, shape);
  const core = largestPolygon(projection, shape);
  const [cx, cy] = geoPath(projection).centroid(core);
  const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(core);
  const nudge = LABEL_NUDGE[code] ?? [0, 0];
  anchors[code] = [cx, cy];
  shapes[code] = { d };
  const forced = FORCED_LABEL[code];
  if (forced) {
    shapes[code].label = [round(cx + forced[0]), round(cy + forced[1])];
    shapes[code].labelOutside = true;
  } else if (!CALLOUTS.includes(code) && x1 - x0 >= MIN_LABEL_WIDTH && y1 - y0 >= MIN_LABEL_HEIGHT) {
    shapes[code].label = [round(cx + nudge[0]), round(cy + nudge[1])];
  }
}

// Callout boxes: one column in the Atlantic, east of the New Jersey coast.
// Boxes are ordered by the angle from the column's middle to each state, so
// the leader lines fan out without crossing.
const BOX_W = 38, BOX_H = 21, BOX_GAP = 4;
const coastX = Math.max(...['MA', 'RI', 'NJ', 'DE'].map((c) => anchors[c]![0])) + 46;
const byLatitude = [...CALLOUTS].sort((a, b) => anchors[a]![1] - anchors[b]![1]);
const firstY = anchors[byLatitude[0]!]![1] - 4;
const slotY = (i: number) => firstY + i * (BOX_H + BOX_GAP) + BOX_H / 2;

/** Whether segment p1-p2 crosses segment p3-p4. */
function crosses(p1: readonly number[], p2: readonly number[], p3: readonly number[], p4: readonly number[]): boolean {
  const turn = (a: readonly number[], b: readonly number[], c: readonly number[]) => Math.sign((b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!));
  return turn(p1, p2, p3) !== turn(p1, p2, p4) && turn(p3, p4, p1) !== turn(p3, p4, p2);
}

/** Every order of the boxes; nine boxes is 362,880 orders, quick to check. */
function* permutations(items: string[]): Generator<string[]> {
  if (items.length <= 1) { yield items; return; }
  for (let i = 0; i < items.length; i++) {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) yield [items[i]!, ...rest];
  }
}

// Pick the order with the fewest crossing leader lines, then the shortest total length.
let ordered = byLatitude;
let bestScore = Infinity;
for (const order of permutations(byLatitude)) {
  const lines = order.map((code, i) => [anchors[code]!, [coastX, slotY(i)]] as const);
  let crossings = 0;
  for (let a = 0; a < lines.length; a++) {
    for (let b = a + 1; b < lines.length; b++) if (crosses(lines[a]![0], lines[a]![1], lines[b]![0], lines[b]![1])) crossings++;
  }
  const length = lines.reduce((sum, [p, q]) => sum + Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!), 0);
  const score = crossings * 1e6 + length;
  if (score < bestScore) { bestScore = score; ordered = order; }
}
if (bestScore >= 1e6) console.warn('Some callout lines still cross');
ordered.forEach((code, i) => {
  const [ax, ay] = anchors[code]!;
  const bx = round(coastX);
  const by = round(firstY + i * (BOX_H + BOX_GAP));
  shapes[code]!.callout = { box: [bx, by, BOX_W, BOX_H], line: [round(ax), round(ay), bx, round(by + BOX_H / 2)] };
});

// ------------------------------------------------------------- background

const gameIds = new Set(states.filter((s) => !['CU', 'PR', 'SN', 'CH'].includes(s.code)).map((s) => SOURCE_ID[s.code] ?? s.code));
const background = collection([
  // Countries with no game states in them, plus Mexico as a base layer. Canada is left out: its
  // outline runs through the middle of the Great Lakes, and its provinces and territories cover it
  // anyway, so leaving it out keeps the lakes water on both sides of the border.
  ...countries.filter((c) => !['USA', 'CAN', 'CUB', 'PRI'].includes(String(c.id))),
  // Canadian territories and Prince Edward Island are drawn but not playable.
  ...subunits.filter((s) => !gameIds.has(String(s.id))),
]);

// ------------------------------------------------------- undivided Virginia

/**
 * West Virginia only exists in the game once Virginia secedes. Until then the
 * app draws Virginia whole: one outline merged from both states' shared
 * topology, so no border shows between them.
 */
const wholeVirginiaShape: Feature<MultiPolygon> = {
  type: 'Feature', properties: {},
  geometry: merge(topo, topo.objects.subunits.geometries.filter((g) => g.id === 'VA' || g.id === 'WV') as never),
};
const wholeVirginiaCore = largestPolygon(main, wholeVirginiaShape);
const [wvx, wvy] = geoPath(main).centroid(wholeVirginiaCore);
const wholeVirginia = { d: pathString(main, wholeVirginiaShape), label: [round(wvx + 2), round(wvy + 2)] as [number, number] };

const output = {
  source: 'Natural Earth (public domain) via sane-topojson 50m; Sonora and Chihuahua from Natural Earth 10m admin-1',
  width: WIDTH,
  height: HEIGHT,
  background: pathString(main, background),
  insets: [akBox, hiBox].map((b) => [round(b.x - 6), round(b.y - 6), round(b.w + 12), round(b.h + 12)]),
  states: shapes,
  /** Virginia and West Virginia as one state, used before West Virginia splits off. */
  wholeVirginia,
};

writeFileSync('src/app/map-shapes.json', `${JSON.stringify(output)}\n`);
console.log(`map ${WIDTH}x${HEIGHT}, ${Object.keys(shapes).length} states, ${(JSON.stringify(output).length / 1024).toFixed(0)} KB`);
console.log('labelled:', Object.entries(shapes).filter(([, s]) => s.label).length, 'callouts:', CALLOUTS.length);
console.log('unlabelled:', Object.entries(shapes).filter(([, s]) => !s.label && !s.callout).map(([c]) => c).join(' '));
