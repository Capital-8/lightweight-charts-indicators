/**
 * Setup 9.1 (Larry Williams) + EMA 50
 *
 * Larry Williams' 9.1 setup on a 9-bar EMA (or SMA): the MA is green while rising, red while falling, yellow
 * otherwise. A buy signal is the first bar of a rise: its high is the entry level and its low the stop, kept while
 * the MA rises. A sell signal is the first bar of a fall: its low is the entry level and its high the stop, kept
 * while the MA falls. Signal bars closing in the signal direction are coloured; arrows with text mark the signals.
 * A second MA (50-bar EMA by default) is drawn as a filter.
 * Alerts (alertcondition, `alerts` of the result): '9.1 Buy Alert' / '9.1 Sell Alert', true on the signal bars.
 *
 * Reference: "Setup 9.1 (Larry Williams) + EMA 50" by oDouglasAlex
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type Setup91Ema50MaType = 'EMA' | 'SMA';

export interface Setup91Ema50Inputs {
  /** MA 1 type (9.1 signal) */
  typeMa1: Setup91Ema50MaType;
  /** MA 1 length */
  len: number;
  /** Show MA 2 */
  showMa2: boolean;
  /** MA 2 type (filter) */
  typeMa2: Setup91Ema50MaType;
  /** MA 2 length */
  len2: number;
}

export const defaultInputs: Setup91Ema50Inputs = {
  typeMa1: 'EMA',
  len: 9,
  showMa2: true,
  typeMa2: 'EMA',
  len2: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'typeMa1', type: 'string', title: 'MA 1 Type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'len', type: 'int', title: 'MA 1 Length', defval: 9, min: 1 },
  { id: 'showMa2', type: 'bool', title: 'Show MA 2', defval: true },
  { id: 'typeMa2', type: 'string', title: 'MA 2 Type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'len2', type: 'int', title: 'MA 2 Length', defval: 50, min: 1 },
];

const GREEN = String(color.new('#1cff78', 0));
const GREEN_60 = String(color.new('#1cff78', 60));
const RED = String(color.new('#FF0000', 0));
const RED_60 = String(color.new('#FF0000', 60));
const YELLOW = String(color.new('#ffeb3b', 0));
const PURPLE = String(color.new('#9C27B0', 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Moving Average 1 (9.1)', color: GREEN, lineWidth: 2 },
  { id: 'plot1', title: 'Moving Average 2', color: PURPLE, lineWidth: 2 },
  { id: 'plot2', title: 'Buy Entry Level', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Buy Stop Level', color: GREEN_60, lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Sell Entry Level', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'plot5', title: 'Sell Stop Level', color: RED_60, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Setup 9.1 (Larry Williams) + EMA 50',
  shortTitle: 'Setup 9.1 (Larry Williams) + EMA 50',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<Setup91Ema50Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = Series.fromArray(bars, bars.map((b) => b.close));
  // get_ma(type, src, length) = type == "EMA" ? ta.ema(src, length) : ta.sma(src, length)
  const getMa = (type: Setup91Ema50MaType, length: number) => A(type === 'EMA' ? ta.ema(closeS, length) : ta.sma(closeS, length));
  const ma1 = getMa(cfg.typeMa1, cfg.len);
  const ma2 = getMa(cfg.typeMa2, cfg.len2);

  const maColor: string[] = new Array(n);
  const buyTrig: number[] = new Array(n);
  const buyStp: number[] = new Array(n);
  const sellTrig: number[] = new Array(n);
  const sellStp: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  let buyTrigger = NaN; // var float buyTrigger = na
  let buyStop = NaN;
  let sellTrigger = NaN;
  let sellStop = NaN;
  let prevUp = false; // ma1up[1] (false before bar 0)
  let prevDown = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const prevMa = i > 0 ? ma1[i - 1] : NaN;
    const ma1up = gt(ma1[i], prevMa);
    const ma1down = lt(ma1[i], prevMa);
    maColor[i] = ma1up ? GREEN : ma1down ? RED : YELLOW;

    const buySignal = ma1up && !prevUp;
    const sellSignal = ma1down && !prevDown;
    prevUp = ma1up;
    prevDown = ma1down;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);

    if (buySignal) {
      buyTrigger = b.high;
      buyStop = b.low;
    } else if (!ma1up) {
      buyTrigger = NaN;
      buyStop = NaN;
    }
    if (sellSignal) {
      sellTrigger = b.low;
      sellStop = b.high;
    } else if (!ma1down) {
      sellTrigger = NaN;
      sellStop = NaN;
    }
    buyTrig[i] = buyTrigger;
    buyStp[i] = buyStop;
    sellTrig[i] = sellTrigger;
    sellStp[i] = sellStop;

    // barcolor(buySignal and close > open ? #1cff78 : na, "Buy Bar Color"),
    // barcolor(sellSignal and close < open ? #FF0000 : na, "Sell Bar Color") (never both on one bar)
    if (sellSignal && lt(b.close, b.open)) barColors.push({ time: b.time, color: RED });
    else if (buySignal && gt(b.close, b.open)) barColors.push({ time: b.time, color: GREEN });

    // plotshape(buySignal, "9.1 BUY Shape", shape.arrowup, location.belowbar, size.small, text = "BUY 9.1")
    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'arrowUp', color: GREEN, size: 'small', text: 'BUY 9.1',
        textColor: GREEN });
    }
    // plotshape(sellSignal, "9.1 SELL Shape", shape.arrowdown, location.abovebar, size.small, text = "SELL 9.1")
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'arrowDown', color: RED, size: 'small', text: 'SELL 9.1',
        textColor: RED });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: ma1[i], color: maColor[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.showMa2 ? ma2[i] : NaN, color: PURPLE })),
      plot2: bars.map((b, i) => ({ time: b.time, value: buyTrig[i], color: GREEN })),
      plot3: bars.map((b, i) => ({ time: b.time, value: buyStp[i], color: GREEN_60 })),
      plot4: bars.map((b, i) => ({ time: b.time, value: sellTrig[i], color: RED })),
      plot5: bars.map((b, i) => ({ time: b.time, value: sellStp[i], color: RED_60 })),
    },
    markers,
    barColors,
    // alertcondition(buySignal, "9.1 Buy Alert") / alertcondition(sellSignal, "9.1 Sell Alert")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '9.1 Buy Alert', message: '9.1 Setup - BUY Signal' },
  { id: 'alert1', title: '9.1 Sell Alert', message: '9.1 Setup - SELL Signal' },
];

export const Setup91Ema50 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
