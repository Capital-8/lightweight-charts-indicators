/**
 * True Breakout Pattern Breakout Signal Indicator (TFlab)
 *
 * Major swing highs and lows are pivots with "Swing Period" bars on each side. A swing high is watched until it is
 * used: a bar whose high goes above it but closes below it, before any close above it, removes it; after the first
 * close above it (the breakout bar), a bar within "Back to Break-Even Period" bars that closes back below it (the
 * close before was above it, the close is below the open of the bar before and the low below the low before) is a
 * failed breakout on the high side ("FBO" above the bar). The low side is the mirror. "Max Swing Back Method" =
 * Custom only checks the newest "Max Swing Back" swings, and only once there are more of them.
 *
 * On a high-side signal: a dashed line from the swing to the signal bar, an "FBO" label and a cross above the bar,
 * and Fibonacci levels (1, 0.786, 0.618, 0.5, 0.382, 0.236, 0) from the highest high of the last 5 bars down to the
 * low of the signal bar, drawn to 4 bars after it. For "Valid After Trigger Bars" bars after it, while the high stays
 * below the top, a lower low moves the levels, and a high between the 0.618 level and the top adds a triangle (once).
 * The low side is the mirror, with levels drawn to 3 bars after the signal bar. At most 500 lines and 500 labels.
 *
 * Inputs without effect, as in the original: "Show All / High / Low TBO" (passed to the detector but not used) and the
 * Alert group (the alerts of the AlertSenderLibrary_TradingFinder library have no output).
 *
 * Reference: "True Breakout Pattern [TradingFinder] Breakout Signal Indicator" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import {
  ta, Series, line, label, resetDrawings, setDrawingBar, drawingOutputs, varDrawing,
  type Line, type Label, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';

export interface TrueBreakoutPatternBreakoutSignalInputs {
  swingPeriod: number;
  validAfterTriggerBars: number;
  maxSwingBackMethod: 'All' | 'Custom';
  maxSwingBack: number;
  backToBreakPeriod: number;
  /** Show All TBO (no effect, as in the original) */
  aShow: boolean;
  /** Show High TBO (no effect, as in the original) */
  hShow: boolean;
  /** Show Low TBO (no effect, as in the original) */
  lShow: boolean;
  hnColor: string;
  lnColor: string;
  hlColor: string;
  llColor: string;
  /** Alert (no output in the port) */
  alert: 'On' | 'Off';
  /** Alert Name (no output in the port) */
  alertName: string;
  /** Message Frequency (no output in the port) */
  frequency: 'All' | 'Once Per Bar' | 'Per Bar Close';
  /** Show Alert time by Time Zone (no output in the port) */
  alertTimezone: string;
  /** Long Position Message (no output in the port) */
  messageBull: string;
  /** Short Position Message (no output in the port) */
  messageBear: string;
}

export const defaultInputs: TrueBreakoutPatternBreakoutSignalInputs = {
  swingPeriod: 50,
  validAfterTriggerBars: 5,
  maxSwingBackMethod: 'All',
  maxSwingBack: 100,
  backToBreakPeriod: 4,
  aShow: true,
  hShow: true,
  lShow: true,
  hnColor: '#870505',
  lnColor: '#014f07',
  hlColor: 'rgba(185, 0, 0, 0.72)',
  llColor: 'rgba(6, 146, 6, 0.65)',
  alert: 'On',
  alertName: 'TBO [TradingFinder]',
  frequency: 'Once Per Bar',
  alertTimezone: 'UTC',
  messageBull: 'Long Signal Position Based on TBO',
  messageBear: 'Short Signal Position Based on TBO',
};

const ALERT_TIP = 'If you turn on the Alert, you can receive alerts and notifications after setting the "Alert".';
const FREQ_TIP = 'The triggering frequency. Possible values are: All (all function calls trigger the alert), Once Per Bar '
  + '(the first function call during the bar triggers the alert),  Per Bar Close (the function call triggers the alert '
  + 'only when it occurs during the last script iteration of the real-time bar, when it closes). The default is '
  + 'alert.freq_once_per_bar.)';

export const inputConfig: InputConfig[] = [
  { id: 'swingPeriod', type: 'int', title: 'Swing Period', defval: 50, min: 1, group: 'Logical Setting' },
  { id: 'validAfterTriggerBars', type: 'int', title: 'Valid After Trigger Bars', defval: 5, min: 1, max: 10, group: 'Logical Setting' },
  { id: 'maxSwingBackMethod', type: 'string', title: 'Max Swing Back Method', defval: 'All', options: ['All', 'Custom'],
    group: 'Logical Setting' },
  { id: 'maxSwingBack', type: 'int', title: 'Max Swing Back', defval: 100, min: 1, group: 'Logical Setting' },
  { id: 'backToBreakPeriod', type: 'int', title: 'Back to Break-Even Period', defval: 4, min: 1, max: 5, group: 'Logical Setting' },
  { id: 'aShow', type: 'bool', title: 'Show All TBO', defval: true, group: 'Display Setting' },
  { id: 'hShow', type: 'bool', title: 'Show High TBO', defval: true, group: 'Display Setting', inline: 'H' },
  { id: 'lShow', type: 'bool', title: 'Show Low TBO', defval: true, group: 'Display Setting', inline: 'L' },
  { id: 'hnColor', type: 'color', title: 'Name', defval: '#870505', group: 'Display Setting', inline: 'H' },
  { id: 'lnColor', type: 'color', title: 'Name', defval: '#014f07', group: 'Display Setting', inline: 'L' },
  { id: 'hlColor', type: 'color', title: 'Line', defval: 'rgba(185, 0, 0, 0.72)', group: 'Display Setting', inline: 'H' },
  { id: 'llColor', type: 'color', title: 'Line', defval: 'rgba(6, 146, 6, 0.65)', group: 'Display Setting', inline: 'L' },
  { id: 'alert', type: 'string', title: 'Alert', defval: 'On', options: ['On', 'Off'], tooltip: ALERT_TIP, group: 'Alert' },
  { id: 'alertName', type: 'string', title: 'Alert Name', defval: 'TBO [TradingFinder]', group: 'Alert' },
  { id: 'frequency', type: 'string', title: 'Message Frequency', defval: 'Once Per Bar',
    options: ['All', 'Once Per Bar', 'Per Bar Close'], tooltip: FREQ_TIP, group: 'Alert' },
  { id: 'alertTimezone', type: 'string', title: 'Show Alert time by Time Zone', defval: 'UTC', group: 'Alert' },
  { id: 'messageBull', type: 'string', title: 'Long Position Message', defval: 'Long Signal Position Based on TBO', group: 'Alert' },
  { id: 'messageBear', type: 'string', title: 'Short Position Message', defval: 'Short Signal Position Based on TBO', group: 'Alert' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'True Breakout Pattern [TradingFinder] Breakout Signal Indicator',
  shortTitle: 'TBO TFlab',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** const int Z = 100000000000000000: no breakout bar yet */
const Z = 100000000000000000;
/** Pine v5 color.black */
const BLACK = '#363A45';  // also the default label text colour of Pine v5
const CLEAR = '#ffffff00';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const LEVELS = [0.236, 0.382, 0.5, 0.618, 0.786];
/** Fibo(X0, X1): the 0.236 ... 0.786 levels from X0 to X1 */
const fibo = (x0: number, x1: number) => LEVELS.map((r) => x0 + ((x1 - x0) * r));

/** The swings of one side (SF_Detector) */
interface Swings {
  price: number[];
  time: number[];
  permit: boolean[];
  /** Bar of the first close beyond the swing (Z: none yet) */
  aoi: number[];
}

/** The Fibonacci drawings of one side: 7 lines and 7 labels (top level, 0.236 ... 0.786 levels, bottom level) */
interface FiboDrawings {
  lines: ReturnType<typeof varDrawing<Line>>[];
  labels: ReturnType<typeof varDrawing<Label>>[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrueBreakoutPatternBreakoutSignalInputs> = {},
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const sp = Math.trunc(cfg.swingPeriod);
  const valid = Math.trunc(cfg.validAfterTriggerBars);
  const custom = cfg.maxSwingBackMethod === 'Custom';
  const maxSwingBack = Math.trunc(cfg.maxSwingBack);
  const backToBreak = Math.trunc(cfg.backToBreakPeriod);

  const ms = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  /** Pine `time` (ms) of bar i */
  const T = (i: number) => (i >= 0 ? bars[i].time * ms : NaN);
  const msh = ta.pivothigh(new Series(bars, (b) => b.high), sp, sp).toArray();
  const msl = ta.pivotlow(new Series(bars, (b) => b.low), sp, sp).toArray();
  const atr = ta.atr(bars, 200).toArray();

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const high: Swings = { price: [], time: [], permit: [], aoi: [] };
  const low: Swings = { price: [], time: [], permit: [], aoi: [] };
  let hIndex = 0;
  let hPrice = 0;
  let lIndex = 0;
  let lPrice = 0;

  /**
   * One side of SF_Detector on bar i: true for a failed breakout. `isHigh`: a close above a swing high, then back
   * below it; else the mirror for swing lows.
   */
  const detect = (sw: Swings, isHigh: boolean, i: number): boolean => {
    const b = bars[i];
    const size = sw.price.length;
    const swingBack = custom ? maxSwingBack : size;
    let alert = false;
    if (!(size > (custom ? swingBack : 1)) || i === 0) return false;
    const p = bars[i - 1];
    for (let k = 1; k <= swingBack; k++) {
      const j = size - k;
      if (!sw.permit[j]) continue;
      const level = sw.price[j];
      if (i <= sw.aoi[j] + backToBreak) {
        const wick = isHigh ? lt(level, b.high) && gt(level, b.close) : gt(level, b.low) && lt(level, b.close);
        if (wick && sw.aoi[j] === Z) {
          sw.permit[j] = false;
        } else if (isHigh
          ? gt(level, b.close) && lt(level, p.close) && lt(b.close, p.open) && lt(b.low, p.low)
          : lt(level, b.close) && gt(level, p.close) && gt(b.close, p.open) && gt(b.high, p.high)) {
          sw.permit[j] = false;
          if (isHigh) {
            hIndex = sw.time[j];
            hPrice = level;
          } else {
            lIndex = sw.time[j];
            lPrice = level;
          }
          alert = true;
        }
      }
      if ((isHigh ? lt(level, b.close) : gt(level, b.close)) && sw.aoi[j] === Z) sw.aoi[j] = i;
    }
    return alert;
  };

  // Drawing(): `var` drawing variables
  const newFibo = (): FiboDrawings => ({
    lines: Array.from({ length: 7 }, () => varDrawing<Line>()),
    labels: Array.from({ length: 7 }, () => varDrawing<Label>()),
  });
  const be = newFibo();
  const bu = newFibo();
  const mshLine = varDrawing<Line>();
  const mshLabel = varDrawing<Label>();
  const mshShape = varDrawing<Label>();
  const mslLine = varDrawing<Line>();
  const mslLabel = varDrawing<Label>();
  const mslShape = varDrawing<Label>();
  const bullLabel = varDrawing<Label>();
  const bearLabel = varDrawing<Label>();
  let bullHigh = 0;
  let bullLow = 0;
  let bearHigh = 0;
  let bearLow = 0;
  let bullBar = 0;
  let bearBar = 0;
  let hPermit = true;
  let lPermit = true;
  let corHPermit = true;
  let corLPermit = true;

  /** Moves the 7 lines and labels of one side to the levels */
  const setLevels = (d: FiboDrawings, levels: number[]) => {
    levels.forEach((y, k) => {
      const l = d.lines[k].value;
      if (l) {
        line.set_y2(l, y);
        line.set_y1(l, y);
      }
      const lb = d.labels[k].value;
      if (lb) label.set_y(lb, y);
    });
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const time = T(i);
    const dt = time - T(i - 1);

    // SF_Detector
    if (!Number.isNaN(msh[i]) && msh[i] !== 0) {
      high.price.push(bars[i - sp].high);
      high.time.push(T(i - sp));
      high.permit.push(true);
      high.aoi.push(Z);
    }
    if (!Number.isNaN(msl[i]) && msl[i] !== 0) {
      low.price.push(bars[i - sp].low);
      low.time.push(T(i - sp));
      low.permit.push(true);
      low.aoi.push(Z);
    }
    const hAlert = detect(high, true, i);
    const lAlert = detect(low, false, i);

    // Drawing()
    const ATR = atr[i] ?? NaN;
    const back = (k: number, f: (x: Bar) => number) => (i >= k ? f(bars[i - k]) : NaN);
    const prevBearBar = bearBar;
    const prevBullBar = bullBar;

    if (hAlert && hPermit) {
      hPermit = false;
      bearHigh = Math.max(b.high, back(1, (x) => x.high), back(2, (x) => x.high), back(3, (x) => x.high), back(4, (x) => x.high));
      bearLow = b.low;
      bearBar = time;
      if (gt(b.high, bearHigh)) bearHigh = b.high;
      if (!lt(b.high, bearHigh)) bearBar = time;
      const levels = [bearHigh, ...fibo(bearLow, bearHigh), bearLow];
      const x2 = time + 4 * dt;
      const texts = ['1', '0.236', '0.382', '0.5', '0.618', '0.786', '0'];
      levels.forEach((y, k) => {
        be.lines[k].value = line.new(bearBar, y, x2, y, 'bar_time', 'none', BLACK, 'dashed');
      });
      levels.forEach((y, k) => {
        be.labels[k].value = label.new(x2, y, texts[k], 'bar_time', 'price', CLEAR, 'label_left', BLACK);
      });
      mshLine.value = line.new(hIndex, hPrice, time, hPrice, 'bar_time', 'none', cfg.hlColor, 'dashed');
      mshLabel.value = label.new(i, b.high + 1.15 * ATR, 'FBO', 'bar_index', 'price', CLEAR, 'label_down', cfg.hnColor, 'small');
      mshShape.value = label.new(i, b.high + 1.05 * ATR, '', 'bar_index', 'price', cfg.hnColor, 'xcross', CLEAR, 'tiny');
    }

    if (gt(bearBar + valid * dt, time) && lt(b.high, bearHigh) && corHPermit) {
      if (lt(b.low, bearLow)) bearLow = b.low;
      const f = fibo(bearLow, bearHigh);
      setLevels(be, [bearHigh, ...f, bearLow]);
      if (gt(b.high, f[3]) && lt(b.high, bearHigh)) {
        corHPermit = false;
        bearLabel.value = label.new(i, b.high + 1.05 * ATR, '', 'bar_index', 'price', cfg.hnColor, 'triangledown', CLEAR, 'tiny');
      }
    } else {
      corHPermit = false;
    }
    if (i > 0 && prevBearBar !== bearBar) corHPermit = true;
    if (!hAlert) hPermit = true;

    if (lAlert && lPermit) {
      lPermit = false;
      bullHigh = b.high;
      bullLow = Math.min(b.low, back(1, (x) => x.low), back(2, (x) => x.low), back(3, (x) => x.low), back(4, (x) => x.low));
      bullBar = time;
      if (gt(b.high, bullHigh)) bullHigh = b.high;
      if (lt(b.low, bullLow)) bullLow = b.low;
      if (!gt(b.low, bullLow)) bullBar = time;
      const levels = [bullHigh, ...fibo(bullHigh, bullLow), bullLow];
      const x2 = time + 3 * dt;
      const texts = ['0', '0.236', '0.382', '0.5', '0.618', '0.786', '1'];
      levels.forEach((y, k) => {
        bu.lines[k].value = line.new(bullBar, y, x2, y, 'bar_time', 'none', BLACK, 'dashed');
      });
      levels.forEach((y, k) => {
        bu.labels[k].value = label.new(x2, y, texts[k], 'bar_time', 'price', CLEAR, 'label_left', BLACK);
      });
      mslLine.value = line.new(lIndex, lPrice, time, lPrice, 'bar_time', 'none', cfg.llColor, 'dashed');
      mslLabel.value = label.new(i, b.low - 1.15 * ATR, 'FBO', 'bar_index', 'price', CLEAR, 'label_up', cfg.lnColor, 'small');
      mslShape.value = label.new(i, b.low - 1.05 * ATR, '', 'bar_index', 'price', cfg.lnColor, 'xcross', CLEAR, 'tiny');
    }

    if (gt(bullBar + valid * dt, time) && gt(b.low, bullLow) && corLPermit) {
      if (gt(b.high, bullHigh)) bullHigh = b.high;
      const f = fibo(bullHigh, bullLow);
      setLevels(bu, [bullHigh, ...f, bullLow]);
      if (lt(b.low, f[3]) && gt(b.low, bullLow)) {
        corLPermit = false;
        bullLabel.value = label.new(i, b.low - 1.05 * ATR, '', 'bar_index', 'price', cfg.lnColor, 'triangleup', CLEAR, 'tiny');
      }
    } else {
      corLPermit = false;
    }
    if (i > 0 && prevBullBar !== bullBar) corLPermit = true;
    if (!lAlert) lPermit = true;
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const TrueBreakoutPatternBreakoutSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
