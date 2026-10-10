/**
 * Divergence for many indicator v3
 *
 * Looks for regular (or hidden) divergences between the price and up to 11 indicators: RSI, MACD, MACD histogram,
 * Momentum, CCI, OBV, Stochastic, DI oscillator, volume weighted MACD, Chaikin Money Flow and Money Flow Index.
 * When the high of a bar is the highest of the last `Left Bars` bars and is above (below for hidden divergences) the
 * high at the last confirmed pivot high, with no close above the straight line between the two, each indicator
 * that is lower (higher) than it was there, without cutting through its own line, counts as one negative
 * divergence. The same is done with the lows and the last pivot low for positive divergences. A line joins the two
 * price points and a label gives the number of divergences (and the indicator names). Until the next pivot the line
 * and the label of a side are replaced by those of the next signal.
 *
 * Reference: "Divergence for many indicator v3" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, LineDrawingData, LabelData } from '../types';

export interface DivergenceForManyIndicatorV3Inputs {
  lb: number;
  rb: number;
  showHidden: boolean;
  /** Check Cut-Through in indicators */
  checkCut: boolean;
  showNumber: boolean;
  showNames: boolean;
  showPivot: boolean;
  /** Change Width by Number of Divergence */
  changeWidth: boolean;
  /** Minimum Number of Divergence */
  showLimit: number;
  calcMacd: boolean;
  calcMacdHist: boolean;
  calcRsi: boolean;
  calcStoch: boolean;
  calcCci: boolean;
  calcMom: boolean;
  calcObv: boolean;
  calcDiosc: boolean;
  calcVwmacd: boolean;
  calcCmf: boolean;
  calcMfi: boolean;
}

export const defaultInputs: DivergenceForManyIndicatorV3Inputs = {
  lb: 5,
  rb: 5,
  showHidden: false,
  checkCut: true,
  showNumber: true,
  showNames: false,
  showPivot: false,
  changeWidth: true,
  showLimit: 1,
  calcMacd: true,
  calcMacdHist: true,
  calcRsi: true,
  calcStoch: true,
  calcCci: true,
  calcMom: true,
  calcObv: true,
  calcDiosc: true,
  calcVwmacd: true,
  calcCmf: true,
  calcMfi: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lb', type: 'int', title: 'Left Bars', defval: 5, min: 1 },
  { id: 'rb', type: 'int', title: 'Right Bars', defval: 5, min: 1 },
  { id: 'showHidden', type: 'bool', title: 'Show Hidden Divergences', defval: false },
  { id: 'checkCut', type: 'bool', title: 'Check Cut-Through in indicators !', defval: true },
  { id: 'showNumber', type: 'bool', title: 'Show Divergence Number', defval: true },
  { id: 'showNames', type: 'bool', title: 'Show Indicator Names', defval: false },
  { id: 'showPivot', type: 'bool', title: 'Show Pivot Points', defval: false },
  { id: 'changeWidth', type: 'bool', title: 'Change Width by Number of Divergence', defval: true },
  { id: 'showLimit', type: 'int', title: 'Minimum Number of Divergence', defval: 1, min: 1, max: 11 },
  { id: 'calcMacd', type: 'bool', title: 'MACD', defval: true },
  { id: 'calcMacdHist', type: 'bool', title: 'MACD Histogram', defval: true },
  { id: 'calcRsi', type: 'bool', title: 'RSI', defval: true },
  { id: 'calcStoch', type: 'bool', title: 'Stochastic', defval: true },
  { id: 'calcCci', type: 'bool', title: 'CCI', defval: true },
  { id: 'calcMom', type: 'bool', title: 'Momentum', defval: true },
  { id: 'calcObv', type: 'bool', title: 'OBV', defval: true },
  { id: 'calcDiosc', type: 'bool', title: 'Diosc', defval: true },
  { id: 'calcVwmacd', type: 'bool', title: 'VWmacd', defval: true },
  { id: 'calcCmf', type: 'bool', title: 'Chaikin Money Flow', defval: true },
  { id: 'calcMfi', type: 'bool', title: 'Money Flow Index', defval: true },
];

// No plot(): the outputs are two plotshape series, lines and labels
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Divergence for many indicator v3',
  shortTitle: 'Divergence for many indicator v3',
  overlay: true,
};

/** study() default: max_lines_count = 50, max_labels_count = 50 */
const MAX_LINES = 50;
const MAX_LABELS = 50;

// Colours of the Pine version of the original (v4)
const RED = '#FF5252';
const LIME = '#00E676';
const WHITE = '#FFFFFF';
const BLACK = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** Pine nz() */
const nz = (x: number) => (Number.isFinite(x) ? x : 0);
/** A float used as a condition: na and 0 are false */
const truthy = (x: number) => !Number.isNaN(x) && x !== 0;

/** `for x = from to to`: counts down when `to` is below `from` */
function range(from: number, to: number): number[] {
  const out: number[] = [];
  if (to >= from) for (let x = from; x <= to; x++) out.push(x);
  else for (let x = from; x >= to; x--) out.push(x);
  return out;
}

interface Drawn<T> {
  data: T;
  deleted: boolean;
}

/**
 * Live drawings in creation order. A creation that brings the count above max + 5 deletes the oldest objects until
 * max remain; the object that a `var` variable of the script still refers to is not deleted (it still counts).
 */
class Registry<T> {
  live: Array<Drawn<T>> = [];

  constructor(private max: number, private held: (obj: Drawn<T>) => boolean) {}

  create(data: T): Drawn<T> {
    const obj = { data, deleted: false };
    this.live.push(obj);
    if (this.live.length > this.max + 5) {
      let excess = this.live.length - this.max;
      this.live = this.live.filter((o) => {
        if (excess <= 0 || o === obj || this.held(o)) return true;
        excess--;
        o.deleted = true;
        return false;
      });
    }
    return obj;
  }

  delete(obj: Drawn<T> | null): void {
    if (!obj || obj.deleted) return;
    obj.deleted = true;
    this.live.splice(this.live.indexOf(obj), 1);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DivergenceForManyIndicatorV3Inputs> = {},
): Omit<IndicatorResult, 'markers' | 'lines' | 'labels'> & { markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { lb, rb, showHidden, checkCut } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const closeSeries = new Series(bars, (b) => b.close);
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const volumeSeries = new Series(bars, (b) => b.volume ?? NaN);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);

  // Indicators
  const rsi = A(ta.rsi(closeSeries, 14));
  const [macdS, , histS] = ta.macd(closeSeries, 12, 26, 9);
  const macd = A(macdS);
  const deltamacd = A(histS);
  const moment = A(ta.mom(closeSeries, 10));
  const cci = A(ta.cci(closeSeries, 10));
  const obv = A(ta.obv(bars));
  const stk = A(ta.sma(ta.stoch(closeSeries, highSeries, lowSeries, 14), 3));
  // DI oscillator: DI = change(high) - (-change(low)); diosc = fixnan(100 * rma(DI, 14) / rma(tr, 14))
  const di = bars.map((_b, i) => (i > 0 ? high[i] - high[i - 1] - -(low[i] - low[i - 1]) : NaN));
  const trur = A(ta.rma(ta.tr(bars, false), 14));
  const diRma = A(ta.rma(S(di), 14));
  const diosc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = (100 * diRma[i]) / trur[i];
    diosc[i] = !Number.isNaN(v) ? v : i > 0 ? diosc[i - 1] : NaN;
  }
  // Volume weighted MACD
  const maFast = A(ta.vwma(closeSeries, 12, volumeSeries));
  const maSlow = A(ta.vwma(closeSeries, 26, volumeSeries));
  const vwmacd = maFast.map((v, i) => v - maSlow[i]);
  // Chaikin money flow
  const cmfv = bars.map((_b, i) => ((close[i] - low[i] - (high[i] - close[i])) / (high[i] - low[i])) * volume[i]);
  const cmfNum = A(ta.sma(S(cmfv), 21));
  const cmfDen = A(ta.sma(volumeSeries, 21));
  const cmf = cmfNum.map((v, i) => v / cmfDen[i]);
  const mfi = A(ta.mfi(closeSeries, 14, volumeSeries));

  // Order of the checks in the original, with the label names
  const indicators: Array<{ on: boolean; values: number[]; name: string }> = [
    { on: cfg.calcRsi, values: rsi, name: 'RSI' },
    { on: cfg.calcMacd, values: macd, name: 'MACD' },
    { on: cfg.calcMacdHist, values: deltamacd, name: 'MACD Hist' },
    { on: cfg.calcMom, values: moment, name: 'Momentum' },
    { on: cfg.calcCci, values: cci, name: 'CCI' },
    { on: cfg.calcObv, values: obv, name: 'OBV' },
    { on: cfg.calcStoch, values: stk, name: 'Stoch' },
    { on: cfg.calcDiosc, values: diosc, name: 'Diosc' },
    { on: cfg.calcVwmacd, values: vwmacd, name: 'VWMacd' },
    { on: cfg.calcCmf, values: cmf, name: 'CMF' },
    { on: cfg.calcMfi, values: mfi, name: 'MFI' },
  ];

  const top = A(ta.pivothigh(highSeries, lb, rb));
  const bot = A(ta.pivotlow(lowSeries, lb, rb));
  const newTop = A(ta.pivothigh(highSeries, lb, 0)); // left side only
  const newBot = A(ta.pivotlow(lowSeries, lb, 0));

  /** x[k] on bar i */
  const at = (a: number[], i: number, k: number) => (i - k >= 0 && k >= 0 ? a[i - k] : NaN);

  /** The indicator has no value beyond (above: side 1, below: side -1) the line from `len` bars back to the bar */
  const noCut = (indi: number[], i: number, len: number, side: 1 | -1): boolean => {
    const diff = (indi[i] - nz(at(indi, i, len))) / len;
    let ln = indi[i] - diff;
    for (const x of range(1, len - 1)) {
      const v = nz(at(indi, i, x));
      if (side === 1 ? gt(v, ln) : lt(v, ln)) return false;
      ln -= diff;
    }
    return true;
  };

  /**
   * Names of the indicators that diverge on bar i against the bar `count` bars back, in the order of the checks.
   * side 1: tops (negative divergences), side -1: bottoms (positive divergences).
   */
  const divergences = (i: number, count: number, side: 1 | -1): string[] => {
    const names: string[] = [];
    for (const { on, values, name } of indicators) {
      if (!on) continue;
      const then = at(values, i, count);
      const now = values[i];
      // regular: the indicator was higher at the top (lower at the bottom); hidden: the reverse
      const regular = side === 1 ? gt(then, now) : lt(then, now);
      const hidden = side === 1 ? lt(then, now) : gt(then, now);
      if (!(showHidden ? hidden : regular)) continue;
      if (checkCut && !noCut(values, i, count, side)) continue;
      names.push(name);
    }
    return names;
  };
  const textOf = (names: string[]) => names.map((name) => name + '\n').join('');
  /** The searched kind reaches the minimum number; the count of the other kind is 0 */
  const shown = (count: number) => count >= cfg.showLimit || 0 >= cfg.showLimit;

  // Drawings
  type LineObj = Drawn<LineDrawingData>;
  type LabelObj = Drawn<LabelData>;
  let divLineHigh: LineObj | null = null;
  let divLabelHigh: LabelObj | null = null;
  let divLineLow: LineObj | null = null;
  let divLabelLow: LabelObj | null = null;
  const lineRegistry = new Registry<LineDrawingData>(MAX_LINES, (o) => o === divLineHigh || o === divLineLow);
  const labelRegistry = new Registry<LabelData>(MAX_LABELS, (o) => o === divLabelHigh || o === divLabelLow);
  const widthOf = (count: number) => (!cfg.changeWidth ? 2 : count <= 2 ? 2 : count <= 5 ? 3 : count <= 8 ? 4 : 5);

  const markers: MarkerData[] = [];
  let topc = 0;
  let botc = 0;
  let newAreaHigh = false;
  let newAreaLow = false;

  for (let i = 0; i < n; i++) {
    const isTop = truthy(top[i]);
    const isBot = truthy(bot[i]);
    // plotshape(top and showpivot, text = "[PH]", style = shape.labeldown, location = location.abovebar, offset = -rb)
    if (cfg.showPivot && i - rb >= 0) {
      if (isTop) {
        markers.push({ time: bars[i - rb].time, position: 'aboveBar', shape: 'labelDown', color: WHITE, text: '[PH]', textColor: BLACK });
      }
      if (isBot) {
        markers.push({ time: bars[i - rb].time, position: 'belowBar', shape: 'labelDown', color: WHITE, text: '[PL]', textColor: BLACK });
      }
    }
    topc = isTop ? lb : topc + 1;
    botc = isBot ? lb : botc + 1;

    // ---- Tops: regular negative / hidden divergences
    const nt = newTop[i];
    const highThen = at(high, i, topc);
    let emptyHigh = true;
    if (!Number.isNaN(nt) && ((gt(nt, highThen) && !showHidden) || (lt(nt, highThen) && showHidden))) {
      // no close may be higher than the line between the last pivot high and the current high
      const diff = (nt - highThen) / topc;
      let hline = nt - diff;
      for (const x of range(1, topc - 1)) {
        if (gt(at(close, i, x), hline)) {
          emptyHigh = false;
          break;
        }
        hline -= diff;
      }
    } else {
      emptyHigh = false;
    }
    const negNames = emptyHigh && !Number.isNaN(nt) ? divergences(i, topc, 1) : [];
    const negText = textOf(negNames);

    if (isTop) newAreaHigh = false;
    if (shown(negNames.length)) {
      if (newAreaHigh) {
        // the old line is removed until a new pivot point is reached
        lineRegistry.delete(divLineHigh);
        labelRegistry.delete(divLabelHigh);
      }
      const count = negNames.length;
      divLineHigh = lineRegistry.create({
        time1: bars[i - topc]?.time ?? NaN, price1: highThen, time2: bars[i].time, price2: high[i], color: RED, width: widthOf(count),
      });
      if (cfg.showNumber || cfg.showNames) {
        const text = (cfg.showNames ? negText : '') + (cfg.showNumber ? String(count) : '');
        // label.new(bar_index, na, ..., yloc = yloc.abovebar): the price is not used
        divLabelHigh = labelRegistry.create({
          time: bars[i].time, price: high[i], text, color: RED, textColor: WHITE, style: 'label_down', yloc: 'abovebar',
        });
      }
      newAreaHigh = true;
    }

    // ---- Bottoms: regular positive / hidden divergences
    const nb = newBot[i];
    const lowThen = at(low, i, botc);
    let emptyLow = true;
    if (!Number.isNaN(nb) && ((lt(nb, lowThen) && !showHidden) || (gt(nb, lowThen) && showHidden))) {
      // no close may be lower than the line between the last pivot low and the current low
      const diff = (nb - lowThen) / botc;
      let lline = nb - diff;
      for (const x of range(1, botc - 1)) {
        if (lt(at(close, i, x), lline)) {
          emptyLow = false;
          break;
        }
        lline -= diff;
      }
    } else {
      emptyLow = false;
    }
    const posNames = emptyLow && !Number.isNaN(nb) ? divergences(i, botc, -1) : [];
    let posText = '';
    for (const name of posNames) {
      // hidden search: the CMF line of the original starts again from the text of the negative side
      // (hposdivtxt := hnegdivtxt + "CMF\n")
      posText = (showHidden && name === 'CMF' ? negText : posText) + name + '\n';
    }

    if (isBot) newAreaLow = false;
    if (shown(posNames.length)) {
      if (newAreaLow) {
        lineRegistry.delete(divLineLow);
        labelRegistry.delete(divLabelLow);
      }
      const count = posNames.length;
      divLineLow = lineRegistry.create({
        time1: bars[i - botc]?.time ?? NaN, price1: lowThen, time2: bars[i].time, price2: low[i], color: LIME, width: widthOf(count),
      });
      if (cfg.showNumber || cfg.showNames) {
        const text = (cfg.showNames ? posText : '') + (cfg.showNumber ? String(count) : '');
        divLabelLow = labelRegistry.create({
          time: bars[i].time, price: low[i], text, color: LIME, textColor: BLACK, style: 'label_up', yloc: 'belowbar',
        });
      }
      newAreaLow = true;
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines: lineRegistry.live.map((l) => l.data),
    labels: labelRegistry.live.map((l) => l.data),
  };
}

export const DivergenceForManyIndicatorV3 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
