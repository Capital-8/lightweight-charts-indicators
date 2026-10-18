/**
 * Matrix Series
 *
 * Oscillator drawn as candles: ys1 = (high + low + 2 close) / 4, rk5 = (ys1 - ema(ys1)) * 200 / stdev(ys1),
 * up = ema(ema(rk5)), down = ema(up) (all over the Smoother length). Each series exists from the first bar where
 * its input series exists (rk5 from bar Smoother - 1, up from 3 x (Smoother - 1), down from 4 x (Smoother - 1)).
 * Dynamic zones: highest / lowest of cci(close, Price Period) over the Sup/Res Period, as two lines. OB/OS
 * crosses above / below the candles past the Overbought / Oversold levels, and two optional level lines. Colours
 * of the original's Pine version: green #008000 (up > down candles, resistance line) and red #FF0000.
 *
 * Reference: "Matrix Series" (community)
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData } from '../types';

export interface MatrixSeriesInputs {
  smoother: number;
  supResPeriod: number;
  supResPercentage: number;
  pricePeriod: number;
  ob: number;
  os: number;
  showOBOS: boolean;
  dynamic: boolean;
}

export const defaultInputs: MatrixSeriesInputs = {
  smoother: 5,
  supResPeriod: 50,
  supResPercentage: 100,
  pricePeriod: 16,
  ob: 200,
  os: -200,
  showOBOS: false,
  dynamic: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'smoother', type: 'int', title: 'Smoother', defval: 5, min: 1 },
  { id: 'supResPeriod', type: 'int', title: 'Sup/Res Period', defval: 50, min: 1 },
  { id: 'supResPercentage', type: 'int', title: 'Sup/Res Percentage', defval: 100, min: 1 },
  { id: 'pricePeriod', type: 'int', title: 'Price Period', defval: 16, min: 1 },
  { id: 'ob', type: 'int', title: 'Overbought', defval: 200 },
  { id: 'os', type: 'int', title: 'Oversold', defval: -200 },
  { id: 'showOBOS', type: 'bool', title: 'Show OB/OS', defval: false },
  { id: 'dynamic', type: 'bool', title: 'Dynamic Zones', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'resistance', title: 'Resistance Line', color: '#008000', lineWidth: 1 },
  { id: 'support', title: 'Support Line', color: '#FF0000', lineWidth: 1 },
  { id: 'obMarker', title: 'OB Cross', color: '#00FFFF', lineWidth: 2, style: 'cross' },
  { id: 'osMarker', title: 'OS Cross', color: '#00FFFF', lineWidth: 2, style: 'cross' },
];

export const metadata = {
  title: 'Matrix Series',
  shortTitle: 'MTX',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<MatrixSeriesInputs> = {}): Omit<IndicatorResult, 'markers'> & { plotCandles: { candle0: PlotCandleData[] } } {
  const { smoother, supResPeriod, supResPercentage, pricePeriod, ob, os, showOBOS, dynamic } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const nn = smoother;

  // Pine: ys1 = (high+low+close*2)/4, then series of EMA/stdev transforms
  const ys1Series = new Series(bars, (b) => (b.high + b.low + b.close * 2) / 4);
  const rk3 = ta.ema(ys1Series, nn);
  const rk4 = ta.stdev(ys1Series, nn);
  const rk3Arr = rk3.toArray();
  const rk4Arr = rk4.toArray();

  const rk5Arr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ys1Val = (bars[i].high + bars[i].low + bars[i].close * 2) / 4;
    const r3 = rk3Arr[i] ?? NaN;
    const r4 = rk4Arr[i] ?? NaN;
    // na while ema / stdev warm up; a division by a zero stdev is na
    rk5Arr[i] = (r4 !== 0 && !isNaN(r4) && !isNaN(r3)) ? (ys1Val - r3) * 200 / r4 : NaN;
  }
  const rk5Series = new Series(bars, (_b, i) => rk5Arr[i]);
  const rk6 = ta.ema(rk5Series, nn);
  const upSeries = ta.ema(rk6, nn);
  const downSeries = ta.ema(upSeries, nn);
  const upArr = upSeries.toArray();
  const downArr = downSeries.toArray();

  // Pine: plotcandle(Oo,Hh,Ll,Cc,color=vcolor)
  const candles: PlotCandleData[] = bars.map((b, i) => {
    const up = upArr[i] ?? NaN;
    const dn = downArr[i] ?? NaN;
    if (isNaN(up) || isNaN(dn)) {
      return { time: b.time, open: NaN, high: NaN, low: NaN, close: NaN };
    }
    // Pine: Oo = iff(up<down, up, down), Hh=Oo, Ll=iff(up<down, down, up), Cc=Ll
    // vcolor = Oo > Cc ? red : up > down ? green : red
    const Oo = up < dn ? up : dn;
    const Ll = up < dn ? dn : up;
    const color = up > dn ? '#008000' : '#FF0000';
    return { time: b.time, open: Oo, high: Oo, low: Ll, close: Ll, color };
  });

  // -------S/R Zones------
  // Pine: C3 = cci(close, Pds) — uses close as source, not hlc3
  const closeSeries = new Series(bars, (b) => b.close);
  const cciArr = ta.cci(closeSeries, pricePeriod).toArray();
  // highest / lowest over the last Lookback bars (na values skipped), na until the window is full
  const value2Arr: number[] = new Array(n).fill(NaN);
  const value3Arr: number[] = new Array(n).fill(NaN);
  for (let i = supResPeriod - 1; i < n; i++) {
    let hi = NaN, lo = NaN;
    for (let k = i - supResPeriod + 1; k <= i; k++) {
      const v = cciArr[k];
      if (v == null || isNaN(v)) continue;
      if (isNaN(hi) || v > hi) hi = v;
      if (isNaN(lo) || v < lo) lo = v;
    }
    value2Arr[i] = hi;
    value3Arr[i] = lo;
  }

  // Pine: ResistanceLine = Value3 + Value5, SupportLine = Value2 - Value5
  const resistancePlot = bars.map((b, i) => {
    if (!dynamic || isNaN(value2Arr[i]) || isNaN(value3Arr[i])) {
      return { time: b.time, value: NaN };
    }
    const v2 = value2Arr[i];
    const v3 = value3Arr[i];
    const v4 = v2 - v3;
    const v5 = v4 * (supResPercentage / 100);
    return { time: b.time, value: v3 + v5 };
  });

  const supportPlot = bars.map((b, i) => {
    if (!dynamic || isNaN(value2Arr[i]) || isNaN(value3Arr[i])) {
      return { time: b.time, value: NaN };
    }
    const v2 = value2Arr[i];
    const v3 = value3Arr[i];
    const v4 = v2 - v3;
    const v5 = v4 * (supResPercentage / 100);
    return { time: b.time, value: v2 - v5 };
  });

  // --Overbought/Oversold/Warning Detail
  // Pine: UPshape = up > ob and up>down ? highest(up,1)+20 : up>ob and up<down ? highest(down,1)+20 : na
  // Pine: DOWNshape = down < os and up>down ? lowest(down,1)-20 : down<os and up<down ? lowest(up,1)-20 : na
  // Pine: plot(UPshape, style=cross, color=aqua, linewidth=2)
  // Pine: plot(DOWNshape, style=cross, color=aqua, linewidth=2)
  const obMarkerPlot = bars.map((b, i) => {
    const up = upArr[i] ?? NaN;
    const dn = downArr[i] ?? NaN;
    if (isNaN(up) || isNaN(dn)) return { time: b.time, value: NaN };
    let val = NaN;
    if (up > ob && up > dn) {
      val = up + 20;
    } else if (up > ob && up < dn) {
      val = dn + 20;
    }
    return { time: b.time, value: val };
  });

  const osMarkerPlot = bars.map((b, i) => {
    const up = upArr[i] ?? NaN;
    const dn = downArr[i] ?? NaN;
    if (isNaN(up) || isNaN(dn)) return { time: b.time, value: NaN };
    let val = NaN;
    if (dn < os && up > dn) {
      val = dn - 20;
    } else if (dn < os && up < dn) {
      val = up - 20;
    }
    return { time: b.time, value: val };
  });

  // Pine: hline(x1), hline(x2) where x1=OBOS?ob:false, x2=OBOS?os:false
  const hlines: any[] = [];
  if (showOBOS) {
    hlines.push({ value: ob, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'Overbought' } });
    hlines.push({ value: os, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'Oversold' } });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'resistance': resistancePlot,
      'support': supportPlot,
      'obMarker': obMarkerPlot,
      'osMarker': osMarkerPlot,
    },
    hlines,
    plotCandles: { candle0: candles },
  };
}

export const MatrixSeries = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
