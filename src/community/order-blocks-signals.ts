/**
 * Order Blocks with Signals (Sonarlab)
 *
 * Detects Order Blocks using Rate of Change (ROC) momentum.
 * Bearish OB: ROC crosses under -sensitivity, box at the first green candle 4..15 bars back (the current bar when
 * there is none). Bullish OB: ROC crosses over +sensitivity, box at the first red candle. No OB on the first cross
 * nor within 5 bars of the previous cross. Each box starts at its candle and extends to the right; it is deleted
 * (no longer drawn) when mitigated: previous close (or the wick) beyond the top / bottom. At most 20 boxes exist
 * (the oldest is deleted).
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): "Price inside Bearish OB" on a bar whose high is
 * above the bottom of a bearish OB ("Sell Signal" input), "Price inside Bullish OB" on a bar whose low is below the
 * top of a bullish OB ("Buy Signal" input), also on the bar that mitigates it (as the original). No Buy / Sell
 * markers: the original draws only the boxes.
 *
 * Reference: "Sonarlab - Order Blocks" by ClayeWeight
 */

import { type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BoxData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface OrderBlocksSignalsInputs {
  sensitivity: number;
  mitigationType: 'Close' | 'Wick';
  /** "Price inside Bullish OB" alert() calls; no effect on the other outputs */
  buyAlert: boolean;
  /** "Price inside Bearish OB" alert() calls; no effect on the other outputs */
  sellAlert: boolean;
}

export const defaultInputs: OrderBlocksSignalsInputs = {
  sensitivity: 28,
  mitigationType: 'Close',
  buyAlert: true,
  sellAlert: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'sensitivity', type: 'int', title: 'Sensitivity', defval: 28, min: 1 },
  { id: 'mitigationType', type: 'string', title: 'OB Mitigation Type', defval: 'Close', options: ['Close', 'Wick'] },
  { id: 'buyAlert', type: 'bool', title: 'Buy Signal', defval: true, group: 'Alerts',
    tooltip: 'An alert will be sent when price goes below the top of a bullish order block.' },
  { id: 'sellAlert', type: 'bool', title: 'Sell Signal', defval: true, group: 'Alerts',
    tooltip: 'An alert will be sent when price goes above the bottom of a bearish order block.' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Order Blocks with Signals',
  shortTitle: 'OBSignals',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<OrderBlocksSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { boxes: BoxData[]; alertCalls: AlertCall[] } {
  const { sensitivity, mitigationType, buyAlert, sellAlert } = { ...defaultInputs, ...inputs };
  const sens = sensitivity / 100;
  const n = bars.length;

  // Custom ROC: (open - open[4]) / open[4] * 100
  const pc: number[] = new Array(n).fill(NaN);
  for (let i = 4; i < n; i++) {
    pc[i] = (bars[i].open - bars[i - 4].open) / bars[i - 4].open * 100;
  }

  // The boxes of the script (box.new ... extend = extend.right), in creation order. A box deleted by the script
  // (mitigated) or by the drawing limit (max_boxes_count = 20: the oldest box goes) is no longer drawn; a box deleted
  // by the limit stays in its array with na top / bottom (no mitigation, no alert).
  interface OB { top: number; bottom: number; startIdx: number; type: 'bull' | 'bear'; alive: boolean }
  const MAX_BOXES = 20;
  const created: OB[] = [];
  const shortBoxes: OB[] = [];
  const longBoxes: OB[] = [];
  const newBox = (i: number, type: 'bull' | 'bear'): OB => {
    // for i = 4 to 15: the first green (bearish OB) / red (bullish OB) candle; none: the current bar (offset 0)
    let last = 0;
    for (let j = 4; j <= 15; j++) {
      const idx = i - j;
      if (idx < 0) break;
      const c = bars[idx];
      if (type === 'bear' ? c.close > c.open : c.close < c.open) { last = j; break; }
    }
    const src = bars[i - last];
    const ob: OB = { top: src.high, bottom: src.low, startIdx: i - last, type, alive: true };
    created.push(ob);
    const alive = created.filter((x) => x.alive);
    if (alive.length > MAX_BOXES) alive[0].alive = false;
    return ob;
  };

  const alertCalls: AlertCall[] = [];

  // var int cross_index = na
  let crossIndex = NaN;

  for (let i = 0; i < n; i++) {
    const prevPc = i > 0 ? pc[i - 1] : NaN;
    // ta.crossunder(pc, -sens) / ta.crossover(pc, sens) (false while pc or pc[1] is na)
    const crossUnder = pc[i] < -sens && prevPc >= -sens;
    const crossOver = pc[i] > sens && prevPc <= sens;
    const prevCrossIndex = crossIndex; // cross_index[1]
    if (crossUnder) crossIndex = i;
    if (crossOver) crossIndex = i;

    // cross_index - cross_index[1] > 5: false while cross_index[1] is na (no OB on the first cross)
    if (crossUnder && crossIndex - prevCrossIndex > 5) shortBoxes.push(newBox(i, 'bear'));
    if (crossOver && crossIndex - prevCrossIndex > 5) longBoxes.push(newBox(i, 'bull'));

    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    const bearMitigation = mitigationType === 'Close' ? prevClose : bars[i].high;
    const bullMitigation = mitigationType === 'Close' ? prevClose : bars[i].low;

    // alert('Price inside Bearish OB' / 'Price inside Bullish OB', alert.freq_once_per_bar): for every box of the
    // side whose bottom the high is above / whose top the low is below, also on the bar that mitigates it
    let bearInside = false;
    let bullInside = false;
    for (let j = shortBoxes.length - 1; j >= 0; j--) {
      const ob = shortBoxes[j];
      const top = ob.alive ? ob.top : NaN;
      const bot = ob.alive ? ob.bottom : NaN;
      if (bearMitigation > top) {
        shortBoxes.splice(j, 1);
        ob.alive = false;
      }
      if (bars[i].high > bot && sellAlert) bearInside = true;
    }
    for (let j = longBoxes.length - 1; j >= 0; j--) {
      const ob = longBoxes[j];
      const top = ob.alive ? ob.top : NaN;
      const bot = ob.alive ? ob.bottom : NaN;
      if (bullMitigation < bot) {
        longBoxes.splice(j, 1);
        ob.alive = false;
      }
      if (bars[i].low < top && buyAlert) bullInside = true;
    }
    // the bearish boxes are checked before the bullish ones
    if (bearInside) alertCalls.push({ time: bars[i].time, message: 'Price inside Bearish OB', freq: 'once_per_bar' });
    if (bullInside) alertCalls.push({ time: bars[i].time, message: 'Price inside Bullish OB', freq: 'once_per_bar' });
  }

  // The boxes still drawn: one bar wide at the OB candle, extended to the right
  const boxes: BoxData[] = created.filter((ob) => ob.alive).map((ob) => ({
    time1: bars[ob.startIdx].time,
    price1: ob.top,
    time2: bars[ob.startIdx].time,
    price2: ob.bottom,
    bgColor: ob.type === 'bull' ? 'rgba(100,196,172,0.15)' : 'rgba(80,108,211,0.15)',
    borderColor: ob.type === 'bull' ? '#5db49e' : '#4760bb',
    borderWidth: 1,
    extend: 'right' as const,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    alertCalls,
  };
}

export const OrderBlocksSignals = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
