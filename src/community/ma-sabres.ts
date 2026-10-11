/**
 * MA Sabres
 *
 * A moving average of the close (SMA, EMA, RMA, Hull, WMA, VWMA, DEMA or TEMA). A bullish reversal is a bar where the
 * average rises after it fell for "Previous Trend Duration" bars in a row (as measured on the bar before); a bearish
 * reversal is the opposite. A reversal draws three circles on the low (bullish) or high (bearish) of the bar before,
 * and a curved "sabre" (a polyline) that starts there and points Length bars ahead, 2 ATR(14) away from that price.
 * At most 100 sabres are kept.
 *
 * Reference: "MA Sabres [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PolylineData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface MaSabresInputs {
  /** Moving average type */
  type: 'SMA' | 'EMA' | 'SMMA (RMA)' | 'HullMA' | 'WMA' | 'VWMA' | 'DEMA' | 'TEMA' | 'NONE';
  /** Moving average length */
  len: number;
  /** Reversal after this number of bars in the same direction */
  count: number;
  colUp: string;
  colDn: string;
  colMa: string;
}

export const defaultInputs: MaSabresInputs = {
  type: 'TEMA',
  len: 50,
  count: 20,
  colUp: '#2962ff',
  colDn: '#f23645',
  colMa: '#787b86',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'type', type: 'string', title: 'MA Type', defval: 'TEMA', group: 'MA',
    options: ['SMA', 'EMA', 'SMMA (RMA)', 'HullMA', 'WMA', 'VWMA', 'DEMA', 'TEMA', 'NONE'],
  },
  { id: 'len', type: 'int', title: 'Length', defval: 50, group: 'MA' },
  {
    id: 'count', type: 'int', title: 'Previous Trend Duration', defval: 20, group: 'MA',
    tooltip: 'Reversal after x bars in the same direction',
  },
  { id: 'colUp', type: 'color', title: 'Bullish', defval: '#2962ff', group: 'Colours' },
  { id: 'colDn', type: 'color', title: 'Bearish', defval: '#f23645', group: 'Colours' },
  { id: 'colMa', type: 'color', title: 'MA', defval: '#787b86', group: 'Colours' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA', color: '#787b86', lineWidth: 1 },
];

export const metadata = {
  title: 'MA Sabres [LuxAlgo]',
  shortTitle: 'LuxAlgo - MA Sabres',
  overlay: true,
};

/** indicator(max_polylines_count = 100) */
const MAX_POLYLINES = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MaSabresInputs> = {},
): Omit<IndicatorResult, 'markers' | 'polylines'> & { markers: MarkerData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const len = cfg.len;

  // method ma(type, length): the three EMAs run on every bar, whatever the type
  const ema1 = ta.ema(close, len);
  const ema2 = ta.ema(ema1, len);
  const ema3 = ta.ema(ema2, len);
  const e1 = A(ema1);
  const e2 = A(ema2);
  const e3 = A(ema3);
  let ma: number[];
  switch (cfg.type) {
    case 'SMA': ma = A(ta.sma(close, len)); break;
    case 'EMA': ma = e1; break;
    case 'SMMA (RMA)': ma = A(ta.rma(close, len)); break;
    case 'HullMA': ma = A(ta.hma(close, len)); break;
    case 'WMA': ma = A(ta.wma(close, len)); break;
    case 'VWMA': ma = A(ta.vwma(close, len, Series.fromArray(bars, bars.map((b) => b.volume ?? NaN)))); break;
    case 'DEMA': ma = e1.map((v, i) => 2 * v - e2[i]); break;
    case 'TEMA': ma = e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]); break;
    default: ma = new Array(n).fill(NaN);
  }
  const maSeries = Series.fromArray(bars, ma);
  const fl = ta.falling(maSeries, cfg.count).toArray().map((v) => !!v);
  const rs = ta.rising(maSeries, cfg.count).toArray().map((v) => !!v);
  const atr = A(ta.atr(bars, 14));
  const interval = barInterval(bars);

  const colUp50 = String(color.new(cfg.colUp, 50));
  const colUp65 = String(color.new(cfg.colUp, 65));
  const colDn50 = String(color.new(cfg.colDn, 50));
  const colDn65 = String(color.new(cfg.colDn, 65));

  const markers: MarkerData[] = [];
  let polylines: PolylineData[] = [];
  // n + (len / 2 - 1): the bar index of a chart point is an integer (the fraction of an odd length is dropped)
  const mid = Math.trunc(len / 2 - 1);
  const sabre = (i: number, base: number, dir: 1 | -1, lineColor: string, fillColor: string) => {
    const a = atr[i];
    const pt = (index: number, price: number) => ({ time: barTime(bars, index, interval), price });
    polylines.push({
      points: [
        pt(i - 1, base - (dir * a) / 15),
        pt(i + mid, base + (dir * a) / 2.5),
        pt(i + len, base + dir * a * 2),
        pt(i + mid, base + (dir * a) / 2.5),
        pt(i - 1, base + (dir * a) / 15),
      ],
      curved: true,
      closed: false,
      lineColor,
      fillColor,
    });
    // polyline.new: when the creation brings the count above max + 5, the oldest are deleted until max remain
    if (polylines.length > MAX_POLYLINES + 5) polylines = polylines.slice(polylines.length - MAX_POLYLINES);
  };

  for (let i = 1; i < n; i++) {
    const up = fl[i - 1] && gt(ma[i], ma[i - 1]);
    const dn = rs[i - 1] && lt(ma[i], ma[i - 1]);
    const low1 = bars[i - 1].low;
    const high1 = bars[i - 1].high;
    const time = bars[i - 1].time; // offset = -1
    if (up) {
      // a polyline with an na price (no ATR yet) is created but not drawn
      if (!isNaN(atr[i])) sabre(i, low1, 1, cfg.colUp, colUp50);
      // plotshape(up ? low[1] : na, location.absolute, shape.circle, size tiny / small / normal, offset = -1)
      markers.push({ time, position: 'atPriceMiddle', price: low1, shape: 'circle', color: cfg.colUp, size: 'tiny' });
      markers.push({ time, position: 'atPriceMiddle', price: low1, shape: 'circle', color: colUp50, size: 'small' });
      markers.push({ time, position: 'atPriceMiddle', price: low1, shape: 'circle', color: colUp65, size: 'normal' });
    }
    if (dn) {
      if (!isNaN(atr[i])) sabre(i, high1, -1, cfg.colDn, colDn50);
      markers.push({ time, position: 'atPriceMiddle', price: high1, shape: 'circle', color: cfg.colDn, size: 'tiny' });
      markers.push({ time, position: 'atPriceMiddle', price: high1, shape: 'circle', color: colDn50, size: 'small' });
      markers.push({ time, position: 'atPriceMiddle', price: high1, shape: 'circle', color: colDn65, size: 'normal' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: bars.map((b, i) => ({ time: b.time, value: ma[i], color: cfg.colMa })) },
    markers,
    polylines,
  };
}

export const MaSabres = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
