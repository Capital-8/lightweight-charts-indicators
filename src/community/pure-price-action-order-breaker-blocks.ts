/**
 * Pure Price Action Order & Breaker Blocks [LuxAlgo]
 *
 * Swings from price action only: a high (low) is a level-1 swing high (low) when it is above (below) the high
 * (low) of the bar before and the bar after it; a level-2 swing is a level-1 swing that is above (below) the
 * level-1 swings on each side, and so on up to the "Detection" depth (Short Term 1, Intermediate Term 2, Long Term 3).
 * When the close crosses the latest swing high, the bullish order block is the bar with the lowest body bottom (low
 * without "Use Candle Body") between the swing and the crossing bar, from its body bottom to its body top. A close
 * of the body below the block turns it into a breaker block; a close above a breaker block removes it. Bearish
 * order blocks are the mirror image. A label marks the swing when a swing level lies inside one of the last breaker
 * blocks ("Show Historical Polarity Changes").
 *
 * On the last bar the last `Show Last Bullish OB` / `Show Last Bearish OB` blocks are drawn: an order block as a box
 * extended to the right with its top, bottom and dotted middle lines; a breaker block as a box up to its break bar,
 * with lines in the break colour from the break bar, extended to the right. At most 500 labels are kept.
 *
 * Reference: "Pure Price Action Order & Breaker Blocks [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  color, box, line, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';

export interface PurePriceActionOrderBreakerBlocksInputs {
  /** Swing depth */
  term: 'Short Term' | 'Intermediate Term' | 'Long Term';
  /** Number of bullish blocks drawn */
  showBull: number;
  /** Number of bearish blocks drawn */
  showBear: number;
  /** Candle body (else high / low) for the block extremes */
  useBody: boolean;
  bullCss: string;
  bullBreakCss: string;
  bearCss: string;
  bearBreakCss: string;
  /** Labels on the swings that confirm a polarity change */
  showLabels: boolean;
}

export const defaultInputs: PurePriceActionOrderBreakerBlocksInputs = {
  term: 'Intermediate Term',
  showBull: 3,
  showBear: 3,
  useBody: true,
  bullCss: 'rgba(33, 87, 243, 0.2)',
  bullBreakCss: 'rgba(255, 17, 0, 0.6)',
  bearCss: 'rgba(255, 93, 0, 0.2)',
  bearBreakCss: 'rgba(12, 181, 26, 0.6)',
  showLabels: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'term', type: 'string', title: 'Detection', defval: 'Intermediate Term', options: ['Short Term', 'Intermediate Term', 'Long Term'] },
  { id: 'showBull', type: 'int', title: 'Show Last Bullish OB', defval: 3, min: 0 },
  { id: 'showBear', type: 'int', title: 'Show Last Bearish OB', defval: 3, min: 0 },
  { id: 'useBody', type: 'bool', title: 'Use Candle Body', defval: true },
  { id: 'bullCss', type: 'color', title: 'Bullish OB', defval: 'rgba(33, 87, 243, 0.2)', inline: 'bullcss', group: 'Style' },
  { id: 'bullBreakCss', type: 'color', title: 'Bullish Break', defval: 'rgba(255, 17, 0, 0.6)', inline: 'bullcss', group: 'Style' },
  { id: 'bearCss', type: 'color', title: 'Bearish OB', defval: 'rgba(255, 93, 0, 0.2)', inline: 'bearcss', group: 'Style' },
  { id: 'bearBreakCss', type: 'color', title: 'Bearish Break', defval: 'rgba(12, 181, 26, 0.6)', inline: 'bearcss', group: 'Style' },
  { id: 'showLabels', type: 'bool', title: 'Show Historical Polarity Changes', defval: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Pure Price Action Order & Breaker Blocks [LuxAlgo]',
  shortTitle: 'LuxAlgo - Pure Price Action OB/BB',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;
/** Default box text colour of a version 5 script (no text is drawn) */
const BOX_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(Math.abs(a - b) > EPS);

interface Swing { y: number; x: number; crossed: boolean }
interface OrderBlock { top: number; btm: number; loc: number; breaker: boolean; breakLoc: number }

/** method notransp(color css) => color.rgb(color.r(css), color.g(css), color.b(css)) */
const notransp = (css: string) => color.rgb(color.r(css), color.g(css), color.b(css));

/** `for i = from to to`: counts down when to < from */
function pineRange(from: number, to: number): number[] {
  const out: number[] = [];
  if (to >= from) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out;
}

/**
 * method detect(array<vector> id, mode, depth): moves the middle swing of a level up to the next level when it is the
 * extreme of the three, and gives the latest swing of the last level (`var swingLevel`, one per call site).
 */
function detector(levels: Swing[][], bull: boolean, depth: number): () => Swing {
  let swingLevel: Swing = { y: NaN, x: NaN, crossed: false };
  return () => {
    for (let i = 0; i < depth; i++) {
      const v = levels[i];
      if (v.length !== 3) continue;
      const pivot = bull ? Math.max(v[0].y, v[1].y, v[2].y) : Math.min(v[0].y, v[1].y, v[2].y);
      if (eq(pivot, v[1].y)) {
        if (i < depth - 1) {
          levels[i + 1].unshift(v[1]);
          if (levels[i + 1].length > 3) levels[i + 1].pop();
        } else {
          swingLevel = { y: v[1].y, x: v[1].x, crossed: false };
        }
        v.pop();
        v.pop();
      }
    }
    return swingLevel;
  };
}

export function calculate(bars: Bar[], inputs: Partial<PurePriceActionOrderBreakerBlocksInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const depth = cfg.term === 'Short Term' ? 1 : cfg.term === 'Long Term' ? 3 : 2;
  const ms = n > 0 && bars[0].time >= 1e12;
  const toMs = (t: number) => (ms ? t : t * 1000);
  const time = bars.map((b) => toMs(b.time));
  const max = bars.map((b) => (cfg.useBody ? Math.max(b.close, b.open) : b.high));
  const min = bars.map((b) => (cfg.useBody ? Math.min(b.close, b.open) : b.low));

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS });

  const fh: Swing[][] = Array.from({ length: depth }, () => []);
  const fl: Swing[][] = Array.from({ length: depth }, () => []);
  const detectTop = detector(fh, true, depth);
  const detectBtm = detector(fl, false, depth);
  const bullishOb: OrderBlock[] = [];
  const bearishOb: OrderBlock[] = [];
  let prevBullConf = NaN;
  let prevBearConf = NaN;
  const bullLabelText = notransp(cfg.bearCss);
  const bearLabelText = notransp(cfg.bullCss);

  for (let b = 0; b < n; b++) {
    setDrawingBar(b, b === n - 1);
    const bar = bars[b];
    fh[0].unshift({ y: bar.high, x: b, crossed: false });
    fl[0].unshift({ y: bar.low, x: b, crossed: false });
    if (fh[0].length > 3) fh[0].pop();
    if (fl[0].length > 3) fl[0].pop();
    const top = detectTop();
    const btm = detectBtm();

    // Bullish OB
    let bullBreakConf = 0;
    if (gt(bar.close, top.y) && !top.crossed) {
      top.crossed = true;
      let minima = max[b - 1];
      let maxima = min[b - 1];
      let loc = time[b - 1];
      for (const i of pineRange(1, b - top.x - 1)) {
        minima = Math.min(min[b - i], minima);
        maxima = eq(minima, min[b - i]) ? max[b - i] : maxima;
        loc = eq(minima, min[b - i]) ? time[b - i] : loc;
      }
      bullishOb.unshift({ top: maxima, btm: minima, loc, breaker: false, breakLoc: NaN });
    }
    for (let i = bullishOb.length - 1; i >= 0; i--) {
      const element = bullishOb[i];
      if (!element.breaker) {
        if (lt(Math.min(bar.close, bar.open), element.btm)) {
          element.breaker = true;
          element.breakLoc = time[b];
        }
      } else if (gt(bar.close, element.top)) {
        bullishOb.splice(i, 1);
      } else if (i < cfg.showBull && lt(top.y, element.top) && gt(top.y, element.btm)) {
        bullBreakConf = 1;
      }
    }
    if (gt(bullBreakConf, prevBullConf) && cfg.showLabels) {
      label.new(top.x, top.y, '▼', 'bar_index', 'price', 'transparent', 'label_down', bullLabelText, 'tiny');
    }
    prevBullConf = bullBreakConf;

    // Bearish OB
    let bearBreakConf = 0;
    if (lt(bar.close, btm.y) && !btm.crossed) {
      btm.crossed = true;
      let minima = min[b - 1];
      let maxima = max[b - 1];
      let loc = time[b - 1];
      for (const i of pineRange(1, b - btm.x - 1)) {
        maxima = Math.max(max[b - i], maxima);
        minima = eq(maxima, max[b - i]) ? min[b - i] : minima;
        loc = eq(maxima, max[b - i]) ? time[b - i] : loc;
      }
      bearishOb.unshift({ top: maxima, btm: minima, loc, breaker: false, breakLoc: NaN });
    }
    for (let i = bearishOb.length - 1; i >= 0; i--) {
      const element = bearishOb[i];
      if (!element.breaker) {
        if (gt(Math.max(bar.close, bar.open), element.top)) {
          element.breaker = true;
          element.breakLoc = time[b];
        }
      } else if (lt(bar.close, element.btm)) {
        bearishOb.splice(i, 1);
      } else if (i < cfg.showBear && gt(btm.y, element.btm) && lt(btm.y, element.top)) {
        bearBreakConf = 1;
      }
    }
    if (gt(bearBreakConf, prevBearConf) && cfg.showLabels) {
      label.new(btm.x, btm.y, '▲', 'bar_index', 'price', 'transparent', 'label_up', bearLabelText, 'tiny');
    }
    prevBearConf = bearBreakConf;

    // Set order blocks: every box and line is deleted on each bar, the blocks are drawn on the last bar
    for (const bx of box.all()) box.delete(bx);
    for (const l of line.all()) line.delete(l);
    if (b === n - 1) {
      const show = (obs: OrderBlock[], count: number, css: string, breakCss: string) => {
        if (count <= 0) return;
        for (const i of pineRange(0, Math.min(count - 1, obs.length - 1))) {
          if (i >= obs.length) throw new Error(`Index ${i} is out of bounds, array size is ${obs.length}`);
          display(obs[i], css, breakCss, time[b]);
        }
      };
      show(bullishOb, cfg.showBull, cfg.bullCss, cfg.bullBreakCss);
      show(bearishOb, cfg.showBear, cfg.bearCss, cfg.bearBreakCss);
    }
  }
  setDrawingBar(null);

  const drawings = drawingOutputs(bars, ms ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: drawings.boxes ?? [],
    lines: drawings.lines ?? [],
    labels: drawings.labels ?? [],
  };
}

/** method display(ob id, css, break_css), xloc.bar_time; `now` is the time of the last bar (ms) */
function display(ob: OrderBlock, css: string, breakCss: string, now: number): void {
  const avg = (ob.top + ob.btm) / 2;
  if (ob.breaker) {
    box.new(ob.loc, ob.top, ob.breakLoc, ob.btm, css, undefined, undefined, undefined, 'bar_time', css,
      undefined, undefined, BOX_TEXT);
    line.new(ob.breakLoc, ob.top, now + 1, ob.top, 'bar_time', 'right', breakCss);
    line.new(ob.breakLoc, ob.btm, now + 1, ob.btm, 'bar_time', 'right', breakCss);
    line.new(ob.loc, avg, now + 1, avg, 'bar_time', 'right', notransp(breakCss), 'dotted');
  } else {
    box.new(ob.loc, ob.top, now, ob.btm, 'transparent', undefined, undefined, 'right', 'bar_time', css,
      undefined, undefined, BOX_TEXT);
    line.new(ob.loc, ob.top, now + 1, ob.top, 'bar_time', 'right', css);
    line.new(ob.loc, ob.btm, now + 1, ob.btm, 'bar_time', 'right', css);
    line.new(ob.loc, avg, now + 1, avg, 'bar_time', 'right', notransp(css), 'dotted');
  }
}

export const PurePriceActionOrderBreakerBlocks = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
