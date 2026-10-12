/**
 * Future Trend Channel [ChartPrime]
 *
 * The trend turns up when the close crosses over the `Trend Length` SMA of the close plus a volatility (the highest
 * ATR(200) of the last 100 bars), and down when it crosses under the SMA minus that volatility.
 *
 * Each trend change starts a channel of three lines at the bar of the change: a middle line at hl2 and two edges at
 * hl2 +- volatility * `Channel Width`, with a diamond label at the lower edge (up trend) or the upper edge (down
 * trend). While the trend lasts, the lines of the current channel end on the current bar at the 20-call SMA of their
 * price (the SMA runs only on the bars of that trend side) and extend to the right; a label shows the price of the
 * middle line `Index of future price` bars ahead. At the next change the channel ends on the bar of the change at the
 * prices of that bar. A channel that goes the way of its trend is drawn in the trend colour (solid), else in the chart
 * foreground colour (dashed, its diamond hidden); the two edges are filled with that colour at 90 % transparency.
 *
 * `chart.fg_color` comes from the chart context (foregroundColorOf; a dark theme value without it).
 *
 * Reference: "Future Trend Channel [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  ta, str, color, callsite, Series, line, label, linefill, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label,
} from 'oakscriptjs';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface FutureTrendChannelInputs {
  /** Trend Length */
  length: number;
  /** Channel Width */
  multi: number;
  /** Index of future price */
  extend: number;
  colorUp: string;
  colorDn: string;
}

export const defaultInputs: FutureTrendChannelInputs = {
  length: 100,
  multi: 3,
  extend: 50,
  colorUp: '#16d897',
  colorDn: '#da853f',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Trend Length', defval: 100 },
  { id: 'multi', type: 'float', title: 'Channel Width', defval: 3, step: 0.1 },
  { id: 'extend', type: 'int', title: 'Index of future price', defval: 50 },
  { id: 'colorUp', type: 'color', title: 'Up', defval: '#16d897', inline: 'Colors' },
  { id: 'colorDn', type: 'color', title: 'Dn', defval: '#da853f', inline: 'Colors' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Future Trend Channel [ChartPrime]',
  shortTitle: 'Future Trend Channel [ChartPrime]',
  overlay: true,
};

/** indicator(max_lines_count = 500); labels keep the default 50 */
const MAX_LINES = 500;
const MAX_LABELS = 50;
/** Default text colour of a label in Pine version 5 */
const LABEL_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** Colour value of a colour string (for `color == color_up`) */
const colorKey = (c: string) => String(color.new(c, 0));

/** The three lines of one channel (fields of the user type `channel`: not held like `var` variables) */
interface ChannelLines {
  mid?: Line;
  top?: Line;
  low?: Line;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FutureTrendChannelInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fg = foregroundColorOf(chart);
  const close = new Series(bars, (b) => b.close);

  // atr = ta.highest(ta.atr(200), 100)
  const atr = ta.highest(ta.atr(bars, 200), 100).toArray().map((v) => v ?? NaN);

  // trend(length): crossover(close, sma + atr) -> true, crossunder(close, sma - atr) -> false (var bool = na)
  const sma = ta.sma(close, cfg.length);
  const upper = sma.add(Series.fromArray(bars, atr));
  const lower = sma.sub(Series.fromArray(bars, atr));
  const signalUp = ta.crossover(close, upper).toArray();
  const signalDn = ta.crossunder(close, lower).toArray();

  resetDrawings({ line: MAX_LINES, label: MAX_LABELS });
  // `var label_up`, `var label_dn`, `var label_m` of draw_channel() hold their labels
  const labelUp = varDrawing<Label>();
  const labelDn = varDrawing<Label>();
  const labelM = varDrawing<Label>();
  const c1: ChannelLines = {};
  const c2: ChannelLines = {};
  // ta.sma(..., 20) in the `if trend` block (3 call sites) and in the `if not trend` block (3 call sites)
  const smaUp = [callsite.sma(), callsite.sma(), callsite.sma()];
  const smaDn = [callsite.sma(), callsite.sma(), callsite.sma()];
  // `var color_lines` of the two color_lines() calls
  const lineColor = [cfg.colorUp, cfg.colorDn];
  const upKey = colorKey(cfg.colorUp);

  const yOf = (l: Line | undefined, end: 1 | 2) => (l ? (end === 1 ? line.get_y1(l) : line.get_y2(l)) : NaN);

  // future_price(x1, x2, y1, y2, index)
  const futurePrice = (ch: ChannelLines, index: number): Label => {
    const m = ch.mid;
    const x1 = m ? line.get_x1(m) : NaN;
    const x2 = m ? line.get_x2(m) : NaN;
    const y1 = yOf(m, 1);
    const y2 = yOf(m, 2);
    const slope = (y2 - y1) / (x2 - x1);
    const price = y1 + slope * (index - x1);
    const style = gt(y1, y2) ? 'label_lower_left' : 'label_upper_left';
    return label.new(index, price, str.tostring(price, 'Future Price: \n #.#'), 'bar_index', 'price',
      String(color.new(fg, 80)), style, fg);
  };

  // color_lines(line_m, line_t, line_l, color, label)
  const colorLines = (ch: ChannelLines, col: string, lab: Label | undefined, k: number) => {
    const y1 = yOf(ch.mid, 1);
    const y2 = yOf(ch.mid, 2);
    const isUp = colorKey(col) === upKey;
    const set = (c: string, style: 'solid' | 'dashed') => {
      for (const l of [ch.mid, ch.low, ch.top]) {
        if (!l) continue;
        line.set_color(l, c);
        line.set_style(l, style);
      }
    };
    if (isUp ? le(y1, y2) : ge(y1, y2)) {
      lineColor[k] = col;
      set(col, 'solid');
      if (lab) label.set_color(lab, col);
    }
    if (isUp ? ge(y1, y2) : le(y1, y2)) {
      lineColor[k] = fg;
      set(fg, 'dashed');
      if (lab) label.set_color(lab, String(color.new(fg, 100)));
    }
    if (lab) label.set_size(lab, 'tiny');
    // one linefill per pair: a second call on the pair changes its colour
    if (ch.low && ch.top) linefill.new(ch.low, ch.top, String(color.new(lineColor[k], 90)));
  };

  // trend: var bool = na; na is false in every condition of the script (`not na` is true)
  let trend = false;
  let prevTrend = false;
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    prevTrend = trend;
    if (signalUp[i]) trend = true;
    if (signalDn[i]) trend = false;

    const b = bars[i];
    const src = (b.high + b.low) / 2;
    const lowSrc = src - atr[i] * cfg.multi;
    const highSrc = src + atr[i] * cfg.multi;
    const turnUp = trend && !prevTrend;
    const turnDn = !trend && prevTrend;

    if (turnUp) {
      labelUp.value = label.new(i, lowSrc, '', 'bar_index', 'price', undefined, 'diamond', LABEL_TEXT);
      c1.mid = line.new(i, src, i, src);
      c1.top = line.new(i, highSrc, i, highSrc);
      c1.low = line.new(i, lowSrc, i, lowSrc);
      if (c2.mid) line.set_xy2(c2.mid, i, src);
      if (c2.top) line.set_xy2(c2.top, i, highSrc);
      if (c2.low) line.set_xy2(c2.low, i, lowSrc);
    }
    if (turnDn) {
      labelDn.value = label.new(i, highSrc, '', 'bar_index', 'price', undefined, 'diamond', LABEL_TEXT);
      c2.mid = line.new(i, src, i + 2, src);
      c2.top = line.new(i, highSrc, i, highSrc);
      c2.low = line.new(i, lowSrc, i, lowSrc);
      if (c1.mid) line.set_xy2(c1.mid, i, src);
      if (c1.top) line.set_xy2(c1.top, i, highSrc);
      if (c1.low) line.set_xy2(c1.low, i, lowSrc);
    }

    // Extend: the current channel runs to the right, the other one stops
    const [cur, other, sites] = trend ? [c1, c2, smaUp] : [c2, c1, smaDn];
    if (labelM.value) label.delete(labelM.value);
    for (const l of [other.mid, other.top, other.low]) if (l) line.set_extend(l, 'none');
    for (const l of [cur.mid, cur.top, cur.low]) if (l) line.set_extend(l, 'right');
    const mid = sites[0](i, src, 20);
    const top = sites[1](i, highSrc, 20);
    const low = sites[2](i, lowSrc, 20);
    if (cur.mid) line.set_xy2(cur.mid, i, mid);
    if (cur.top) line.set_xy2(cur.top, i, top);
    if (cur.low) line.set_xy2(cur.low, i, low);
    labelM.value = futurePrice(cur, i + cfg.extend);

    colorLines(c1, cfg.colorUp, labelUp.value, 0);
    colorLines(c2, cfg.colorDn, labelDn.value, 1);

    // remove_lines(trend)
    if (turnUp) {
      c2.mid = undefined;
      c2.top = undefined;
      c2.low = undefined;
    }
    if (turnDn) {
      c1.mid = undefined;
      c1.top = undefined;
      c1.low = undefined;
    }
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: out.lines ?? [],
    labels: out.labels ?? [],
    linefills: out.linefills ?? [],
  };
}

export const FutureTrendChannel = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
