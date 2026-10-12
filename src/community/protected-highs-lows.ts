/**
 * Protected Highs & Lows [TFO]
 *
 * Market structure from pivots of "Pivot Strength" bars on each side. The script keeps the latest swing high and
 * swing low to break. A close above the swing high is a bullish break (BOS when the trend was already bullish, MSS
 * when it changes), a close below the swing low a bearish break. On a break the lowest pivot low since the last
 * bearish break (the protected low) becomes the low to break, and the other way round. With the pullback criteria on,
 * a pivot only counts as protected after price closed beyond the candle that made the opposite swing.
 *
 * Outputs: the trail of the protected level (a line in the colour of the protected high or low), trend bar colours,
 * a dashed line from the broken swing to the break bar, a "BOS" / "MSS" label on it and a triangle label on the
 * protected level. Their colours are set on the bar after the break, as in the original. "Show Retracements" draws a
 * box over the previous leg with lines at 30, 50 and 70 %, extended bar after bar. At most 500 lines, labels and
 * boxes are kept. The trail width is an input of the original; the plot width here is its default, 2.
 *
 * Reference: "Protected Highs & Lows [TFO]" by tradeforopp
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © tradeforopp
 */

import {
  ta, Series, color, line, box, label, resetDrawings, setDrawingBar,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, BoxData, LabelData, LineDrawingData } from '../types';

export interface ProtectedHighsLowsInputs {
  /** Pivot Strength: bars on each side of a pivot */
  ps: number;
  /** Trend Candles */
  colorTrend: boolean;
  /** Show Structure Labels */
  showLabels: boolean;
  labelType: 'MSS' | 'BOS' | 'All';
  /** Show Protected Highs & Lows */
  showPhl: boolean;
  /** Show Protected Trail */
  trailPhl: boolean;
  trailWidth: number;
  /** Use Valid Pullback Criteria */
  useValidPbs: boolean;
  /** Specific Pullback Candle Criteria */
  extraValidPbs: boolean;
  phColor: string;
  plColor: string;
  bullColor: string;
  bearColor: string;
  /** Show Retracements */
  showRets: boolean;
  boxTransp: number;
  lineW: number;
  lineS: 'Solid' | 'Dashed' | 'Dotted';
}

export const defaultInputs: ProtectedHighsLowsInputs = {
  ps: 1,
  colorTrend: true,
  showLabels: true,
  labelType: 'MSS',
  showPhl: true,
  trailPhl: true,
  trailWidth: 2,
  useValidPbs: true,
  extraValidPbs: false,
  phColor: '#f23645',
  plColor: '#2962ff',
  bullColor: '#00897B',
  bearColor: '#f23645',
  showRets: false,
  boxTransp: 85,
  lineW: 1,
  lineS: 'Dotted',
};

const G_STR = 'Structure';
const G_PHL = 'Protected Highs & Lows';
const G_PB = 'Pullbacks';
const G_RET = 'Retracements';

export const inputConfig: InputConfig[] = [
  { id: 'ps', type: 'int', title: 'Pivot Strength', defval: 1, group: G_STR },
  { id: 'colorTrend', type: 'bool', title: 'Trend Candles', defval: true, inline: 'TREND', group: G_STR },
  { id: 'showLabels', type: 'bool', title: 'Show Structure Labels', defval: true, inline: 'MSS', group: G_STR },
  { id: 'labelType', type: 'string', title: '', defval: 'MSS', options: ['MSS', 'BOS', 'All'], inline: 'MSS', group: G_STR },
  { id: 'showPhl', type: 'bool', title: 'Show Protected Highs & Lows', defval: true, inline: 'PHL', group: G_PHL },
  { id: 'trailPhl', type: 'bool', title: 'Show Protected Trail', defval: true, inline: 'TRAIL', group: G_PHL },
  { id: 'trailWidth', type: 'int', title: '', defval: 2, inline: 'TRAIL', group: G_PHL },
  {
    id: 'useValidPbs', type: 'bool', title: 'Use Valid Pullback Criteria', defval: true, group: G_PB,
    tooltip: 'When looking at the swing high that price must close above for a BOS/MSS, in order to form a valid protected low, price must first close below the low of the candle that made the swing high (and vice versa for protected highs)',
  },
  {
    id: 'extraValidPbs', type: 'bool', title: 'Specific Pullback Candle Criteria', defval: false, group: G_PB,
    tooltip: "When 'Use Valid Pullback Criteria' is enabled, if a given swing high is formed with a down close candle, the script will look backward to find the most recent up-close candle. Using this candle, price must close below its low to validate a pullback from a swing high (and vice versa)",
  },
  { id: 'phColor', type: 'color', title: '', defval: '#f23645', inline: 'PHL', group: G_PHL },
  { id: 'plColor', type: 'color', title: '', defval: '#2962ff', inline: 'PHL', group: G_PHL },
  { id: 'bullColor', type: 'color', title: '', defval: '#00897B', inline: 'TREND', group: G_STR },
  { id: 'bearColor', type: 'color', title: '', defval: '#f23645', inline: 'TREND', group: G_STR },
  {
    id: 'showRets', type: 'bool', title: 'Show Retracements', defval: false, group: G_RET,
    tooltip: 'Show retracements of the previous zone with 30, 50, and 70% retracement levels',
  },
  {
    id: 'boxTransp', type: 'int', title: 'Box Transparency', defval: 85, min: 0, max: 100, group: G_RET,
    tooltip: 'Larger values will make the retracement box more transparent',
  },
  { id: 'lineW', type: 'int', title: 'Line Width', defval: 1, min: 0, max: 10, group: G_RET },
  { id: 'lineS', type: 'string', title: 'Line Style', defval: 'Dotted', options: ['Solid', 'Dashed', 'Dotted'], group: G_RET },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: '#2962ff', lineWidth: 2 },
];

export const metadata = {
  title: 'Protected Highs & Lows [TFO]',
  shortTitle: 'Protected Highs & Lows [TFO]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Pullback {
  price: number;
  idx: number;
  valid: boolean;
  bull: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ProtectedHighsLowsInputs> = {},
): IndicatorResult & { barColors: BarColorData[]; lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const ps = Math.trunc(cfg.ps);
  const style = cfg.lineS === 'Solid' ? 'solid' : cfg.lineS === 'Dashed' ? 'dashed' : 'dotted';
  // Pine times are in ms; the bars may be in seconds
  const ms = n > 0 && bars[0].time >= 1e12;
  const timeMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);

  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), ps, ps).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), ps, ps).toArray();
  const isPivot = (v: number | null | undefined) => v !== null && v !== undefined && !Number.isNaN(v);

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });

  // var bool bull = na: an na bool reads as false in every place the script uses it
  let bull = false;
  let trailPrice = NaN;
  let trailColor: string | null = null;
  const ph: number[] = [];
  const pl: number[] = [];
  const pht: number[] = [];
  const plt: number[] = [];
  let lastHigh = NaN;
  let lastLow = NaN;
  let lastHighIdx = NaN;
  let lastLowIdx = NaN;
  let trackHigh = NaN;
  let trackLow = NaN;
  let trackHighIdx = NaN;
  let trackLowIdx = NaN;
  const pbFromHigh: Pullback = { price: NaN, idx: NaN, valid: false, bull: true };
  const pbFromLow: Pullback = { price: NaN, idx: NaN, valid: false, bull: false };
  // dwg: label[] _label, label[] _phl, line[] _line, bool[] _bull (newest first)
  const dLabel: Array<Label | undefined> = [];
  const dPhl: Array<Label | undefined> = [];
  const dLine: Line[] = [];
  const dBull: boolean[] = [];
  // snd: the retracement box and its three lines (fields of a var object: not protected from the count)
  const snd: { box?: Box; l30?: Line; l50?: Line; l70?: Line } = {};
  let prevChange = false;
  let prevBear = false;
  let prevBullBreak = false;

  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  const barColors: BarColorData[] = [];

  const pbSet = (p: Pullback, price: number, idx: number) => {
    p.price = price;
    p.idx = idx;
    p.valid = false;
  };
  const clearAll = () => {
    pl.length = 0;
    plt.length = 0;
    ph.length = 0;
    pht.length = 0;
  };
  const sndAdd = (high: number, low: number, t: number) => {
    const r30 = (high - low) * 0.3 + low;
    const r50 = (high - low) * 0.5 + low;
    const r70 = (high - low) * 0.7 + low;
    snd.box = box.new(t, high, t, low, 'transparent', undefined, undefined, undefined, 'bar_time', 'transparent');
    snd.l30 = line.new(t, r30, t, r30, 'bar_time', undefined, 'transparent', style, cfg.lineW);
    snd.l50 = line.new(t, r50, t, r50, 'bar_time', undefined, 'transparent', style, cfg.lineW);
    snd.l70 = line.new(t, r70, t, r70, 'bar_time', undefined, 'transparent', style, cfg.lineW);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = timeMs(i);
    const back = (k: number) => (i - k >= 0 ? bars[i - k] : undefined);
    const pivLow = plArr[i];
    const pivHigh = phArr[i];

    // if ta.pivotlow(low, ps, ps) and pl.size() == 0 (a float condition: na and 0 are false)
    if (isPivot(pivLow) && pivLow !== 0 && pl.length === 0) {
      const pb = back(ps)!;
      pl.unshift(pb.low);
      plt.unshift(timeMs(i - ps));
      if (cfg.extraValidPbs) {
        for (let k = 0; k <= 3; k++) {
          const c = back(ps + k);
          if (c && lt(c.close, c.open)) {
            pbSet(pbFromLow, c.high, i);
            break;
          }
        }
      } else {
        pbSet(pbFromLow, pb.high, i);
      }
      if (Number.isNaN(lastLow)) {
        lastLow = pb.low;
        lastLowIdx = i - ps;
      } else if (lt(pb.low, lastLow)) {
        lastLow = pb.low;
        lastLowIdx = i - ps;
      }
    }
    if (isPivot(pivHigh) && pivHigh !== 0 && ph.length === 0) {
      const pb = back(ps)!;
      ph.unshift(pb.high);
      pht.unshift(timeMs(i - ps));
      if (cfg.extraValidPbs) {
        for (let k = 0; k <= 3; k++) {
          const c = back(ps + k);
          if (c && gt(c.close, c.open)) {
            pbSet(pbFromHigh, c.low, i);
            break;
          }
        }
      } else {
        pbSet(pbFromHigh, pb.low, i);
      }
      if (Number.isNaN(lastHigh)) {
        lastHigh = pb.high;
        lastHighIdx = i - ps;
      } else if (gt(pb.high, lastHigh)) {
        lastHigh = pb.high;
        lastHighIdx = i - ps;
      }
    }

    // check_pb()
    for (const p of [pbFromHigh, pbFromLow]) {
      if (p.bull) {
        if (lt(b.close, p.price) && !p.valid) p.valid = true;
      } else if (gt(b.close, p.price) && !p.valid) {
        p.valid = true;
      }
    }

    const backPs = back(ps);
    const hPs = backPs ? backPs.high : NaN;
    const lPs = backPs ? backPs.low : NaN;
    if ((gt(hPs, trackHigh) || Number.isNaN(trackHigh) || lastLowIdx >= trackHighIdx) && isPivot(pivHigh)
      && (cfg.useValidPbs ? pbFromLow.valid : true)) {
      trackHigh = hPs;
      trackHighIdx = i - ps;
    }
    if ((lt(lPs, trackLow) || Number.isNaN(trackLow) || lastHighIdx >= trackLowIdx) && isPivot(pivLow)
      && (cfg.useValidPbs ? pbFromHigh.valid : true)) {
      trackLow = lPs;
      trackLowIdx = i - ps;
    }

    let bosBear = false;
    let bosBull = false;
    let mssBear = false;
    let mssBull = false;
    let change = false;

    // maintain(snd)
    if (snd.box) {
      box.set_right(snd.box, t);
      line.set_x2(snd.l30!, t);
      line.set_x2(snd.l50!, t);
      line.set_x2(snd.l70!, t);
    }

    if (ph.length > 0 && gt(b.close, ph[0])) {
      let lb: Label | undefined;
      let phl: Label | undefined;
      if (cfg.showLabels) {
        const save = (cfg.labelType === 'MSS' && !bull) || (cfg.labelType === 'BOS' && bull) || cfg.labelType === 'All';
        if (save) {
          lb = label.new(Math.floor((t + pht[0]) / 2), ph[0], bull ? 'BOS' : 'MSS', 'bar_time', undefined, '#ffffff00',
            'label_down', 'transparent');
        }
      }
      if (bull) bosBull = true;
      else mssBull = true;
      if (cfg.showRets && (cfg.useValidPbs ? pbFromHigh.valid : true)) sndAdd(ph[0], trackLow, t);
      const ln = line.new(pht[0], ph[0], t, ph[0], 'bar_time', undefined, 'transparent', 'dashed');
      bull = true;
      change = true;
      clearAll();
      if (!Number.isNaN(trackLow)) {
        if (cfg.showPhl) {
          phl = label.new(timeMs(trackLowIdx), trackLow, '▲', 'bar_time', undefined, '#ffffff00', 'label_up', 'transparent');
        }
        pl.unshift(trackLow);
        plt.unshift(timeMs(trackLowIdx));
        lastHigh = NaN;
      }
      dLabel.unshift(lb);
      dPhl.unshift(phl);
      dLine.unshift(ln);
      dBull.unshift(bull);
    }

    if (pl.length > 0 && lt(b.close, pl[0])) {
      let lb: Label | undefined;
      let phl: Label | undefined;
      if (cfg.showLabels) {
        const save = (cfg.labelType === 'MSS' && bull) || (cfg.labelType === 'BOS' && !bull) || cfg.labelType === 'All';
        if (save) {
          lb = label.new(Math.floor((t + plt[0]) / 2), pl[0], !bull ? 'BOS' : 'MSS', 'bar_time', undefined, '#ffffff00',
            'label_up', 'transparent');
        }
      }
      if (!bull) bosBear = true;
      else mssBear = true;
      if (cfg.showRets && (cfg.useValidPbs ? pbFromLow.valid : true)) sndAdd(pl[0], trackHigh, t);
      const ln = line.new(plt[0], pl[0], t, pl[0], 'bar_time', undefined, 'transparent', 'dashed');
      bull = false;
      change = true;
      clearAll();
      if (!Number.isNaN(trackHigh)) {
        if (cfg.showPhl) {
          phl = label.new(timeMs(trackHighIdx), trackHigh, '▼', 'bar_time', undefined, '#ffffff00', 'label_down', 'transparent');
        }
        ph.unshift(trackHigh);
        pht.unshift(timeMs(trackHighIdx));
        lastLow = NaN;
      }
      dLabel.unshift(lb);
      dPhl.unshift(phl);
      dLine.unshift(ln);
      dBull.unshift(bull);
    }

    if (prevChange) {
      if (prevBear) {
        trailPrice = trackHigh;
        trailColor = cfg.phColor;
      } else if (prevBullBreak) {
        trailPrice = trackLow;
        trailColor = cfg.plColor;
      }
      const lastBull = dBull[0];
      const c = lastBull ? cfg.bullColor : cfg.bearColor;
      if (dLabel[0]) label.set_textcolor(dLabel[0], c);
      if (dPhl[0]) label.set_textcolor(dPhl[0], lastBull ? cfg.plColor : cfg.phColor);
      line.set_color(dLine[0], c);
      if (snd.box) {
        box.set_bgcolor(snd.box, String(color.new(bull ? cfg.bullColor : cfg.bearColor, cfg.boxTransp)));
        line.set_color(snd.l30!, c);
        line.set_color(snd.l50!, c);
        line.set_color(snd.l70!, c);
      }
    }
    prevChange = change;
    prevBear = bosBear || mssBear;
    prevBullBreak = bosBull || mssBull;

    if (cfg.colorTrend) barColors.push({ time: b.time, color: bull ? cfg.bullColor : cfg.bearColor });
    const value = cfg.trailPhl ? trailPrice : NaN;
    plot0.push(trailColor === null ? { time: b.time, value } : { time: b.time, value, color: trailColor });
  }
  setDrawingBar(null);

  // xloc.bar_time objects: a time between two bars is drawn on the next bar
  const times = bars.map((_, i) => timeMs(i));
  const T = (x: number) => {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return bars[lo].time;
  };
  const C = (c: unknown) => (c === null || c === undefined ? 'transparent' : String(c));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    barColors,
    // an object with an na price is not drawn
    lines: line.all().filter((l) => !Number.isNaN(l.y1) && !Number.isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: C(l.color),
      ...(l.width !== undefined && l.width !== 1 ? { width: l.width } : {}),
      ...(l.style && l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: C(l.color), textColor: C(l.textcolor),
      style: l.style as 'label_down' | 'label_up',
    })),
    boxes: box.all().filter((bx) => !Number.isNaN(bx.top) && !Number.isNaN(bx.bottom)).map((bx) => ({
      time1: T(bx.left), price1: bx.top, time2: T(bx.right), price2: bx.bottom,
      bgColor: C(bx.bgcolor), borderColor: C(bx.border_color),
    })),
  };
}

export const ProtectedHighsLows = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
