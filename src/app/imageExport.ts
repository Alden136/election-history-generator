/**
 * Saves the map or a seating chart as a PNG. Everything is drawn straight
 * onto a canvas from the same shapes, colors and seat layouts the page uses,
 * so the picture matches the screen without copying the page itself. The
 * picture carries the year, the winner and the seed so it makes sense when
 * shared on its own.
 */
import { partyName, STATES } from '../engine/data';
import { NO_VOTE, SECEDED, type Term } from '../engine/types';
import { inkOn, NO_VOTE_COLOR, PARTY_COLORS, SECEDED_COLOR } from './presentation';

export interface Caption {
  seed: number;
  /** "Corrected rules" or "Custom rules · 2 dials adjusted". */
  rules: string;
  /** The share link for this timeline and year. */
  url: string;
}

export interface MapShape {
  d: string;
  label?: [number, number];
  labelOutside?: boolean;
  callout?: { box: [number, number, number, number]; line: [number, number, number, number] };
}
export interface MapShapes {
  width: number;
  height: number;
  background: string;
  insets: [number, number, number, number][];
  states: Record<string, MapShape>;
  wholeVirginia: MapShape;
}

export interface LegendItem { color: string; label: string; kind: 'party' | 'absent' | 'seceded' }

/** Something drawn in the middle of the picture, at its own size in picture pixels. */
interface Body { width: number; height: number; draw: (ctx: CanvasRenderingContext2D) => void }

const WIDTH = 1200;
const PAD = 28;
const INK = '#141414';
const PAPER = '#f4f2ee';
const ABSENT_FILL = '#d2cec7';
const ABSENT_LINE = '#5d5a54';
const ABSENT_INK = '#4a4741';
const STRIPE_DARK = '#2b2a27';

const SANS = "'Archivo Variable', 'Arial Narrow', Arial, sans-serif";
const MONO = "'IBM Plex Mono', Consolas, monospace";
const theme = () => {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return { bg: read('--bg', '#b4b0a8'), panel: read('--panel', '#cbc7bf'), muted: read('--muted', '#45423d'), accent: read('--accent', '#ff4f12'), hair: read('--hair', '#8c8880') };
};

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, css: string, { stretch = 'normal' as CanvasFontStretch, spacing = '0px' } = {}) {
  ctx.font = css;
  if ('fontStretch' in ctx) ctx.fontStretch = stretch;
  if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
}

/** Cuts text to fit a width, ending with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/**
 * The seceded hatching: dark stripes at 45 degrees, `unit` apart and `dark` wide,
 * matching the page's SVG pattern (6 and 2.5) and tile gradient (7 and 3).
 */
function hatch(ctx: CanvasRenderingContext2D, unit = 6, dark = 2.5): CanvasPattern | string {
  // Drawn four times larger and scaled down, so the stripe edges stay smooth.
  const tile = document.createElement('canvas');
  tile.width = unit * 4;
  tile.height = unit * 4;
  const t = tile.getContext('2d');
  if (!t) return SECEDED_COLOR;
  t.fillStyle = SECEDED_COLOR;
  t.fillRect(0, 0, tile.width, tile.height);
  t.fillStyle = STRIPE_DARK;
  t.fillRect(0, 0, dark * 4, tile.height);
  // The pattern copies the tile as it is now, so it is made after the stripes are drawn.
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return SECEDED_COLOR;
  pattern.setTransform(new DOMMatrix().rotateSelf(45).scaleSelf(0.25));
  return pattern;
}

function winnerColor(winner: number): string {
  return PARTY_COLORS[winner] ?? (winner === SECEDED ? SECEDED_COLOR : NO_VOTE_COLOR);
}
const kindOf = (winner: number): LegendItem['kind'] => winner === SECEDED ? 'seceded' : winner === NO_VOTE ? 'absent' : 'party';

/* ------------------------------------------------------------------ bodies */

/** The geographic map, as GeoMap draws it, without the hover outline. */
export function geoBody(term: Term, shapes: MapShapes): Body {
  const { muted } = theme();
  const width = WIDTH - 2 * PAD - 40;
  const scale = width / shapes.width;
  const undivided = !term.grid.expansions.westVirginia;
  const shapeOf = (code: string) => undivided && code === 'VA' ? shapes.wholeVirginia : shapes.states[code]!;
  const drawn = (code: string) => !(undivided && code === 'WV');
  const winner = (i: number) => term.grid.winners[i] ?? NO_VOTE;
  const ink = (i: number) => kindOf(winner(i)) === 'absent' ? ABSENT_INK : kindOf(winner(i)) === 'seceded' ? PAPER : inkOn(winnerColor(winner(i)));

  return {
    width, height: shapes.height * scale,
    draw(ctx) {
      ctx.scale(scale, scale);
      const stripes = hatch(ctx);
      const background = new Path2D(shapes.background);
      ctx.fillStyle = '#9f9b93';
      ctx.fill(background);
      ctx.strokeStyle = '#6f6b64';
      ctx.lineWidth = 0.6;
      ctx.stroke(background);
      for (const [x, y, w, h] of shapes.insets) {
        ctx.fillStyle = '#c5c1b9';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, h);
      }
      ctx.lineJoin = 'miter';
      STATES.forEach((state, i) => {
        if (!drawn(state.code)) return;
        const path = new Path2D(shapeOf(state.code).d);
        const kind = kindOf(winner(i));
        ctx.fillStyle = kind === 'seceded' ? stripes : kind === 'absent' ? ABSENT_FILL : winnerColor(winner(i));
        ctx.fill(path);
        ctx.strokeStyle = kind === 'absent' ? ABSENT_LINE : INK;
        ctx.lineWidth = kind === 'absent' ? 0.8 : 1.1;
        ctx.stroke(path);
      });
      ctx.textAlign = 'center';
      STATES.forEach((state, i) => {
        const callout = shapeOf(state.code).callout;
        if (!callout) return;
        const [x1, y1, x2, y2] = callout.line;
        const [bx, by, bw, bh] = callout.box;
        const kind = kindOf(winner(i));
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillStyle = kind === 'seceded' ? stripes : kind === 'absent' ? ABSENT_FILL : winnerColor(winner(i));
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = kind === 'absent' ? ABSENT_LINE : INK;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx, by, bw, bh);
        font(ctx, `700 12.5px ${MONO}`);
        ctx.fillStyle = ink(i);
        ctx.fillText(state.code, bx + bw / 2, by + bh / 2 + 4.5);
      });
      font(ctx, `700 14px ${MONO}`);
      STATES.forEach((state, i) => {
        if (!drawn(state.code)) return;
        const { label, labelOutside } = shapeOf(state.code);
        if (!label) return;
        ctx.fillStyle = labelOutside ? muted : ink(i);
        ctx.fillText(state.code, label[0], label[1] + 5);
      });
    },
  };
}

/** The tile map: one square per possible state on an 11 by 9 grid, as the Tiles view shows it. */
export function tileBody(term: Term): Body {
  const columns = 11;
  const rows = 9;
  const gap = 6;
  const width = 760;
  const cell = (width - gap * (columns - 1)) / columns;
  // The page's grid is 11 wide by 8.05 tall, so its cells are a little wider than tall.
  const cellHeight = (width * 8.05 / 11 - gap * (rows - 1)) / rows;
  const height = cellHeight * rows + gap * (rows - 1);
  return {
    width, height,
    draw(ctx) {
      // Tiles here are about 1.6 times their on-screen size, so the stripes scale with them.
      const stripes = hatch(ctx, 11, 4.8);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      font(ctx, `700 17px ${MONO}`);
      STATES.forEach((state, i) => {
        const winner = term.grid.winners[i] ?? NO_VOTE;
        const kind = kindOf(winner);
        const x = state.tile.col * (cell + gap);
        const y = state.tile.row * (cellHeight + gap);
        ctx.fillStyle = kind === 'seceded' ? stripes : kind === 'absent' ? ABSENT_FILL : winnerColor(winner);
        ctx.fillRect(x, y, cell, cellHeight);
        const border = kind === 'absent' ? 1.5 : 3;
        ctx.strokeStyle = kind === 'absent' ? ABSENT_LINE : INK;
        ctx.lineWidth = border;
        ctx.strokeRect(x + border / 2, y + border / 2, cell - border, cellHeight - border);
        ctx.fillStyle = kind === 'absent' ? ABSENT_INK : kind === 'seceded' ? PAPER : inkOn(winnerColor(winner));
        ctx.fillText(state.code, x + cell / 2, y + cellHeight / 2 + 1);
      });
      ctx.textBaseline = 'alphabetic';
    },
  };
}

export interface ChamberPicture {
  seats: { x: number; y: number; party: number }[];
  /** Seat size on the chart's 100-unit radius scale. */
  size: number;
  total: number;
  needed: number;
  majority: number | null;
  parties: { party: number; seats: number }[];
}

/** A House or Senate seating chart with its party list, as the Congress panel shows it. */
export function chamberBody(chamber: ChamberPicture): Body {
  const { muted, hair } = theme();
  const width = WIDTH - 2 * PAD - 40;
  const listWidth = 330;
  const chartWidth = width - listWidth - 40;
  const unit = 100;
  const half = chamber.size * unit / 2;
  const span = 2 * unit + 2 * half;
  const scale = chartWidth / span;
  const chartHeight = (unit + 2 * half) * scale;
  const rowHeight = 36;
  const listHeight = 54 + chamber.parties.length * rowHeight;
  return {
    width, height: Math.max(chartHeight, listHeight),
    draw(ctx) {
      ctx.save();
      ctx.translate(0, (Math.max(chartHeight, listHeight) - chartHeight) / 2);
      ctx.scale(scale, scale);
      ctx.translate(unit + half, unit + half);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 0.6;
      for (const seat of chamber.seats) {
        ctx.fillStyle = PARTY_COLORS[seat.party]!;
        ctx.fillRect(seat.x * unit - half, seat.y * unit - half, half * 2, half * 2);
        ctx.strokeRect(seat.x * unit - half, seat.y * unit - half, half * 2, half * 2);
      }
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -unit - half);
      ctx.lineTo(0, half);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Party list on the right.
      const x0 = chartWidth + 40;
      const control = chamber.majority === null ? 'No majority' : `${partyName(chamber.majority)} majority`;
      ctx.fillStyle = chamber.majority === null ? '#d9d5ce' : PARTY_COLORS[chamber.majority]!;
      ctx.fillRect(x0, 0, listWidth, 40);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 + 1.5, 1.5, listWidth - 3, 37);
      font(ctx, `900 17px ${SANS}`, { stretch: 'semi-expanded', spacing: '0.5px' });
      ctx.fillStyle = '#111111';
      ctx.textAlign = 'left';
      ctx.fillText(fit(ctx, control.toUpperCase(), listWidth - 24), x0 + 12, 27);
      chamber.parties.forEach(({ party, seats }, n) => {
        const y = 54 + n * rowHeight;
        ctx.fillStyle = PARTY_COLORS[party]!;
        ctx.fillRect(x0, y + 11, 13, 13);
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1;
        ctx.strokeRect(x0 + 0.5, y + 11.5, 12, 12);
        font(ctx, `700 17px ${SANS}`);
        ctx.fillStyle = INK;
        ctx.textAlign = 'left';
        ctx.fillText(fit(ctx, partyName(party), listWidth - 150), x0 + 24, y + 23);
        font(ctx, `600 18px ${MONO}`);
        ctx.textAlign = 'right';
        ctx.fillText(String(seats), x0 + listWidth - 70, y + 23);
        font(ctx, `500 14px ${MONO}`);
        ctx.fillStyle = muted;
        ctx.fillText(`${(seats / chamber.total * 100).toFixed(1)}%`, x0 + listWidth, y + 23);
        if (n < chamber.parties.length - 1) {
          ctx.fillStyle = hair;
          ctx.fillRect(x0, y + rowHeight - 1, listWidth, 1);
        }
      });
      ctx.textAlign = 'left';
    },
  };
}

/* ------------------------------------------------------------------ the picture */

export interface Picture {
  /** Small line above the title, e.g. "Electoral map" or "Senate · sits 1861–1865". */
  kicker: string;
  year: number;
  /** "The 1860 election" splits around the year, which is drawn in the accent color. */
  titleBefore: string;
  titleAfter: string;
  /** "Winner" on a map, "President elected" on a chamber. */
  winnerLabel: string;
  winner: { name: string; party: number; detail: string };
  body: Body;
  legend: LegendItem[];
  caption: Caption;
}

const FONTS = [`900 40px ${SANS}`, `700 16px ${SANS}`, `600 14px ${MONO}`, `700 14px ${MONO}`, `500 14px ${MONO}`];

export async function renderPicture(picture: Picture): Promise<HTMLCanvasElement> {
  // Canvas text only uses web fonts once they have loaded.
  await Promise.all(FONTS.map((f) => document.fonts?.load(f).catch(() => [])));
  const colors = theme();
  const scaleFactor = 2;
  const { body } = picture;

  // Measure the legend's lines before sizing the canvas.
  const measure = document.createElement('canvas').getContext('2d') as Ctx;
  font(measure, `600 14px ${MONO}`, { spacing: '1px' });
  const legendLines: LegendItem[][] = [[]];
  let lineWidth = 0;
  const itemWidth = (item: LegendItem) => 26 + measure.measureText(item.label.toUpperCase()).width + 26;
  for (const item of picture.legend) {
    const w = itemWidth(item);
    if (lineWidth + w > WIDTH - 2 * PAD - 40 && legendLines.at(-1)!.length) { legendLines.push([]); lineWidth = 0; }
    legendLines.at(-1)!.push(item);
    lineWidth += w;
  }

  const headerH = 112;
  const winnerH = 96;
  const bodyPad = 20;
  const legendH = picture.legend.length ? 20 + legendLines.length * 26 : 0;
  const footerH = 46;
  const cardH = headerH + winnerH + body.height + 2 * bodyPad + legendH + footerH;
  const height = cardH + 2 * PAD;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH * scaleFactor;
  canvas.height = Math.ceil(height * scaleFactor);
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('This browser cannot draw images.');
  ctx.scale(scaleFactor, scaleFactor);

  // Page and card.
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, WIDTH, height);
  const cardX = PAD;
  const cardW = WIDTH - 2 * PAD;
  ctx.fillStyle = INK;
  ctx.fillRect(cardX + 8, PAD + 8, cardW, cardH);
  ctx.fillStyle = colors.panel;
  ctx.fillRect(cardX, PAD, cardW, cardH);

  // Header: kicker, then "The 1860 election" with the year in the accent color.
  let y = PAD;
  ctx.fillStyle = INK;
  ctx.fillRect(cardX, y, cardW, headerH);
  font(ctx, `600 13px ${MONO}`, { spacing: '1.5px' });
  ctx.fillStyle = '#a9a59d';
  ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, `ELECTION HISTORY GENERATOR · ${picture.kicker.toUpperCase()}`, cardW - 48), cardX + 24, y + 32);
  font(ctx, `900 50px ${SANS}`, { stretch: 'expanded', spacing: '-1px' });
  let x = cardX + 24;
  const titleY = y + 88;
  for (const [text, color] of [[picture.titleBefore, PAPER], [String(picture.year), colors.accent], [picture.titleAfter, PAPER]] as const) {
    ctx.fillStyle = color;
    ctx.fillText(text.toUpperCase(), x, titleY);
    x += ctx.measureText(text.toUpperCase()).width;
  }
  y += headerH;

  // Winner strip with the party color down the left edge.
  ctx.fillStyle = INK;
  ctx.fillRect(cardX, y, cardW, 3);
  ctx.fillStyle = PARTY_COLORS[picture.winner.party] ?? NO_VOTE_COLOR;
  ctx.fillRect(cardX, y + 3, 14, winnerH - 6);
  font(ctx, `600 12px ${MONO}`, { spacing: '1.5px' });
  ctx.fillStyle = colors.muted;
  ctx.fillText(`${picture.winnerLabel.toUpperCase()} · ${partyName(picture.winner.party).toUpperCase()}`, cardX + 34, y + 30);
  font(ctx, `900 30px ${SANS}`, { stretch: 'semi-expanded' });
  ctx.fillStyle = INK;
  const name = fit(ctx, picture.winner.name.toUpperCase(), cardW - 70);
  ctx.fillText(name, cardX + 34, y + 64);
  font(ctx, `600 16px ${SANS}`);
  ctx.fillStyle = colors.muted;
  ctx.fillText(fit(ctx, picture.winner.detail, cardW - 70), cardX + 34, y + 86);
  y += winnerH;
  ctx.fillStyle = INK;
  ctx.fillRect(cardX, y - 3, cardW, 3);

  // Body, centred.
  ctx.save();
  ctx.translate(cardX + (cardW - body.width) / 2, y + bodyPad);
  body.draw(ctx);
  ctx.restore();
  y += body.height + 2 * bodyPad;

  // Legend bar.
  if (legendH) {
    ctx.fillStyle = INK;
    ctx.fillRect(cardX, y, cardW, legendH);
    font(ctx, `600 14px ${MONO}`, { spacing: '1px' });
    legendLines.forEach((line, n) => {
      const total = line.reduce((t, item) => t + itemWidth(item), 0) - 26;
      let lx = cardX + (cardW - total) / 2;
      const ly = y + 10 + n * 26;
      for (const item of line) {
        ctx.fillStyle = item.kind === 'seceded' ? hatch(ctx, 7, 3) : item.kind === 'absent' ? ABSENT_FILL : item.color;
        ctx.fillRect(lx, ly + 3, 14, 14);
        ctx.strokeStyle = item.kind === 'absent' ? ABSENT_LINE : PAPER;
        ctx.lineWidth = item.kind === 'absent' ? 1 : 2;
        ctx.strokeRect(lx + 1, ly + 4, 12, 12);
        ctx.fillStyle = PAPER;
        ctx.textAlign = 'left';
        ctx.fillText(item.label.toUpperCase(), lx + 22, ly + 15);
        lx += itemWidth(item);
      }
    });
    y += legendH;
  }

  // Footer: seed and rules on the left, the link on the right.
  ctx.fillStyle = INK;
  ctx.fillRect(cardX, y, cardW, 3);
  font(ctx, `600 13px ${MONO}`, { spacing: '0.5px' });
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  const left = `SEED ${picture.caption.seed} · ${picture.caption.rules.toUpperCase()}`;
  ctx.fillText(left, cardX + 24, y + 29);
  const leftWidth = ctx.measureText(left).width;
  font(ctx, `500 12px ${MONO}`);
  ctx.fillStyle = colors.muted;
  ctx.textAlign = 'right';
  ctx.fillText(fit(ctx, picture.caption.url, cardW - 48 - leftWidth - 24), cardX + cardW - 24, y + 29);
  ctx.textAlign = 'left';

  // Card border, last so it sits over every edge.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(cardX + 1.5, PAD + 1.5, cardW - 3, cardH - 3);
  return canvas;
}

export async function savePicture(picture: Picture, filename: string): Promise<void> {
  const canvas = await renderPicture(picture);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('The image could not be created.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

