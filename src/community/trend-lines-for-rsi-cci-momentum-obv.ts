/**
 * Trend Lines for RSI, CCI, Momentum, OBV
 *
 * Draws trend lines on an oscillator: RSI, CCI, "Momentum" (the original computes it as a CCI of the momentum
 * length) or OBV. Pivot highs and pivot lows of the oscillator ("Pivot Point Period" bars on each side) are found;
 * the latest 2 or 3 of each side are kept with the bar where they were confirmed. For each of the newer pivots, the
 * script tries the older pivots, oldest first: two rising pivot lows give a support line, two falling pivot highs a
 * resistance line, when no oscillator value from the bar after the older pivot to the current bar is on the wrong
 * side of the line. The first valid pair of each newer pivot is drawn, from the older pivot to the current bar (its
 * end value is the line value one bar after the current bar, as in the original). The lines of the bar before are
 * deleted on every bar, so the lines of the last bar are the ones left. Levels at 70 / 30 (RSI) or 100 / -100 (CCI)
 * with a fill between them; none for OBV and Momentum.
 *
 * Reference: "Trend Lines for RSI, CCI, Momentum, OBV" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  ta, color, line, Series, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { LineDrawingData } from '../types';

export interface TrendLinesForRsiCciMomentumObvInputs {
  indi: 'RSI' | 'CCI' | 'OBV' | 'Momentum';
  src: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';
  rsiLen: number;
  cciLen: number;
  momLen: number;
  /** Pivot Point Period */
  prd: number;
  /** Number of Pivot Point to check */
  ppNum: number;
}

export const defaultInputs: TrendLinesForRsiCciMomentumObvInputs = {
  indi: 'RSI',
  src: 'close',
  rsiLen: 14,
  cciLen: 20,
  momLen: 10,
  prd: 10,
  ppNum: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'indi', type: 'string', title: 'Indicator', defval: 'RSI', options: ['RSI', 'CCI', 'OBV', 'Momentum'] },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'cciLen', type: 'int', title: 'CCI Length', defval: 20, min: 1 },
  { id: 'momLen', type: 'int', title: 'Momentum Length', defval: 10, min: 1 },
  { id: 'prd', type: 'int', title: 'Pivot Point Period', defval: 10, min: 5, max: 50 },
  { id: 'ppNum', type: 'int', title: 'Number of Pivot Point to check', defval: 3, min: 2, max: 3 },
];

/** color.blue of Pine v4 (plot and line default colour) */
const BLUE = '#2196F3';
/** Default hline colour */
const GRAY = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Indicator', color: BLUE, lineWidth: 2 },
];

/** hline(hline1) / hline(hline2): 70 / 30 for RSI (100 / -100 for CCI, none for OBV and Momentum) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 70, title: 'Upper Level', color: GRAY, linestyle: 'dashed' },
  { id: 'hline_lower', price: 30, title: 'Lower Level', color: GRAY, linestyle: 'dashed' },
];

/** fill(h1, h2, color = #9915ff): default transparency 90 */
export const fillConfig: FillConfig[] = [
  { id: 'fill_levels', plot1: 'hline_upper', plot2: 'hline_lower', color: String(color.new('#9915ff', 90)) },
];

export const metadata = {
  title: 'Trend Lines for RSI, CCI, Momentum, OBV',
  shortTitle: 'Trend Lines for RSI, CCI, Momentum, OBV',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

function sourceOf(b: Bar, src: TrendLinesForRsiCciMomentumObvInputs['src']): number {
  switch (src) {
    case 'open': return b.open;
    case 'high': return b.high;
    case 'low': return b.low;
    case 'hl2': return (b.high + b.low) / 2;
    case 'hlc3': return (b.high + b.low + b.close) / 3;
    case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
    case 'hlcc4': return (b.high + b.low + b.close + b.close) / 4;
    default: return b.close;
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendLinesForRsiCciMomentumObvInputs> = {},
): Omit<IndicatorResult, 'lines'> & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = Math.trunc(cfg.prd);
  const ppNum = Math.trunc(cfg.ppNum);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const srcSeries = new Series(bars, (b) => sourceOf(b, cfg.src));

  // src = RSI / CCI / "Momentum" (cci(Src, momlen) in the original) / OBV (of the close)
  const osc = cfg.indi === 'RSI' ? A(ta.rsi(srcSeries, cfg.rsiLen))
    : cfg.indi === 'CCI' ? A(ta.cci(srcSeries, cfg.cciLen))
      : cfg.indi === 'Momentum' ? A(ta.cci(srcSeries, cfg.momLen))
        : A(ta.obv(bars));
  const oscSeries = Series.fromArray(bars, osc);
  const ph = A(ta.pivothigh(oscSeries, prd, prd));
  const pl = A(ta.pivotlow(oscSeries, prd, prd));
  /** nz(src[k]) */
  const srcAt = (i: number) => (i >= 0 && i < n && !Number.isNaN(osc[i]) ? osc[i] : 0);

  // Lines: `var line` variables deleted and created again on every bar, so only the lines of the last bar are
  // left at the end: the port runs the line part on the last bar only.
  resetDrawings({ line: 50 });
  if (n > 0) {
    const last = n - 1;
    setDrawingBar(last, true);
    // valuewhen(ph, bar_index, k): bar of the k-th latest confirmation (a float condition: na and 0 are false)
    const latest = (p: number[]) => {
      const pos: number[] = [];
      for (let i = last; i >= 0 && pos.length < 3; i--) if (!Number.isNaN(p[i]) && p[i] !== 0) pos.push(i);
      while (pos.length < 3) pos.push(NaN);
      return pos;
    };
    // t1val = nz(src[getloc(t1pos)]), getloc(bar) = bar_index + prd - bar: the pivot value; an na position is an
    // na history offset, which reads the current bar
    const valueOf = (pos: number) => (Number.isNaN(pos) ? srcAt(last) : srcAt(pos - prd));
    const lowPos = latest(pl);
    const highPos = latest(ph);
    const lowVal = lowPos.map(valueOf);
    const highVal = highPos.map(valueOf);

    let countLo = 0;
    let countHi = 0;
    for (let p1 = 1; p1 <= ppNum - 1; p1++) {
      // support: rising pivot lows, no value below the line
      let uv1 = 0;
      let uv2 = 0;
      let up1 = 0;
      let up2 = 0;
      for (let p2 = ppNum; p2 >= p1 + 1; p2--) {
        const val1 = lowVal[p1 - 1];
        const val2 = lowVal[p2 - 1];
        const pos1 = lowPos[p1 - 1];
        const pos2 = lowPos[p2 - 1];
        if (gt(val1, val2)) {
          const diff = (val1 - val2) / (pos1 - pos2);
          let hline = val2 + diff;
          let lloc = last;
          let valid = true;
          for (let x = pos2 + 1 - prd; x <= last; x++) {
            if (lt(srcAt(x), hline)) valid = false;
            lloc = x;
            hline += diff;
          }
          if (valid) {
            uv1 = hline;
            uv2 = val2;
            up1 = lloc;
            up2 = pos2;
            break;
          }
        }
      }
      // resistance: falling pivot highs, no value above the line
      let dv1 = 0;
      let dv2 = 0;
      let dp1 = 0;
      let dp2 = 0;
      for (let p2 = ppNum; p2 >= p1 + 1; p2--) {
        const val1 = highVal[p1 - 1];
        const val2 = highVal[p2 - 1];
        const pos1 = highPos[p1 - 1];
        const pos2 = highPos[p2 - 1];
        if (lt(val1, val2)) {
          const diff = (val2 - val1) / (pos1 - pos2);
          let hline = val2 - diff;
          let lloc = last;
          let valid = true;
          for (let x = pos2 + 1 - prd; x <= last; x++) {
            if (gt(srcAt(x), hline)) {
              valid = false;
              break;
            }
            lloc = x;
            hline -= diff;
          }
          if (valid) {
            dv1 = hline;
            dv2 = val2;
            dp1 = lloc;
            dp2 = pos2;
            break;
          }
        }
      }
      // `up2 != 0`: false when na
      if (up1 !== 0 && up2 !== 0 && !Number.isNaN(up2)) {
        countLo++;
        if (countLo <= 3) line.new(up2 - prd, uv2, up1, uv1, 'bar_index', 'none', BLUE);
      }
      if (dp1 !== 0 && dp2 !== 0 && !Number.isNaN(dp2)) {
        countHi++;
        if (countHi <= 3) line.new(dp2 - prd, dv2, dp1, dv1, 'bar_index', 'none', BLUE);
      }
    }
    setDrawingBar(null);
  }
  const drawn = drawingOutputs(bars);
  resetDrawings();

  const plot0 = bars.map((b, i) => ({ time: b.time, value: osc[i] }));
  // hline1 / hline2: na (no line, no fill) for OBV and Momentum
  const levels = cfg.indi === 'RSI' ? [70, 30] : cfg.indi === 'CCI' ? [100, -100] : null;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines: levels
      ? [
        { value: levels[0], options: { title: 'Upper Level', color: GRAY, linestyle: 'dashed' } },
        { value: levels[1], options: { title: 'Lower Level', color: GRAY, linestyle: 'dashed' } },
      ]
      : [],
    fills: levels
      ? [{ plot1: 'hline_upper', plot2: 'hline_lower', options: { color: String(color.new('#9915ff', 90)) } }]
      : [],
    lines: drawn.lines ?? [],
  };
}

export const TrendLinesForRsiCciMomentumObv = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
