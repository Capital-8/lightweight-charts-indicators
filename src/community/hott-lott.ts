/**
 * HIGH and LOW Optimized Trend Tracker (HOTT LOTT)
 *
 * Applies OTT (Optimized Trend Tracker) to highest-high and lowest-low
 * with selectable MA types. HOTT tracks upper trend, LOTT tracks lower trend.
 * Bar colors indicate breakout direction. VAR (the default MA) follows the original: na values count as 0 (nz), the
 * up / down moves are those of the source and their 9-bar sums are na before the 9th bar.
 * Alerts (alertcondition, `alerts` of the result): 'Price Crossover Alarm' when the close crosses over HOTT[2],
 * 'Price Crossunder Alarm' when it crosses under LOTT[2].
 *
 * Reference: "HOTT-LOTT" by KivancOzbilgic
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface HottLottInputs {
  ottPeriod: number;
  percent: number;
  hlLength: number;
  maType: string;
}

export const defaultInputs: HottLottInputs = {
  ottPeriod: 2,
  percent: 0.6,
  hlLength: 10,
  maType: 'VAR',
};

export const inputConfig: InputConfig[] = [
  { id: 'ottPeriod', type: 'int', title: 'OTT Period', defval: 2, min: 1 },
  { id: 'percent', type: 'float', title: 'Percent', defval: 0.6, min: 0.01, step: 0.1 },
  { id: 'hlLength', type: 'int', title: 'HL Length', defval: 10, min: 1 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'VAR', options: ['SMA', 'EMA', 'WMA', 'DEMA', 'TMA', 'VAR', 'WWMA', 'ZLEMA', 'TSF', 'HULL'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'hott', title: 'HOTT', color: '#2196F3', lineWidth: 2 },
  { id: 'lott', title: 'LOTT', color: '#EF5350', lineWidth: 2 },
];

export const metadata = {
  title: 'HOTT LOTT',
  shortTitle: 'HOTTLOTT',
  overlay: true,
};

/** Compute a selectable MA over a plain number array, returning a plain number array. */
function computeMA(bars: Bar[], srcArr: number[], length: number, maType: string): number[] {
  const n = srcArr.length;
  const srcSeries = new Series(bars, (_b, i) => srcArr[i]);

  switch (maType) {
    case 'SMA':
      return ta.sma(srcSeries, length).toArray().map(v => v ?? NaN);

    case 'EMA':
      return ta.ema(srcSeries, length).toArray().map(v => v ?? NaN);

    case 'WMA':
      return ta.wma(srcSeries, length).toArray().map(v => v ?? NaN);

    case 'DEMA': {
      const ema1 = ta.ema(srcSeries, length);
      const ema2 = ta.ema(ema1, length);
      const e1 = ema1.toArray();
      const e2 = ema2.toArray();
      return e1.map((v, i) => {
        const a = v ?? NaN;
        const b = e2[i] ?? NaN;
        return isNaN(a) || isNaN(b) ? NaN : 2 * a - b;
      });
    }

    case 'TMA': {
      const halfLen = Math.ceil(length / 2);
      const sma1 = ta.sma(srcSeries, halfLen);
      const sma2Len = Math.floor(length / 2) + 1;
      return ta.sma(sma1, sma2Len).toArray().map(v => v ?? NaN);
    }

    case 'VAR': {
      const valpha = 2 / (length + 1);
      const result: number[] = new Array(n);
      const vud1: number[] = new Array(n);
      const vdd1: number[] = new Array(n);
      const vUD: number[] = new Array(n);
      const vDD: number[] = new Array(n);

      // Var_Func: vud1 = src > src[1] ? src - src[1] : 0 (na compares false); vUD = math.sum(vud1, 9) (na before 9
      // bars); vCMO = nz((vUD - vDD) / (vUD + vDD));
      // VAR := nz(valpha * abs(vCMO) * src) + (1 - valpha * abs(vCMO)) * nz(VAR[1])
      const nz = (v: number) => (Number.isFinite(v) ? v : 0);
      for (let i = 0; i < n; i++) {
        const s = srcArr[i];
        const s1 = i > 0 ? srcArr[i - 1] : NaN;

        vud1[i] = s > s1 ? s - s1 : 0;
        vdd1[i] = s < s1 ? s1 - s : 0;

        let sumUD = NaN;
        let sumDD = NaN;
        if (i >= 8) {
          sumUD = 0;
          sumDD = 0;
          for (let j = 0; j < 9; j++) {
            sumUD += vud1[i - j];
            sumDD += vdd1[i - j];
          }
        }
        vUD[i] = sumUD;
        vDD[i] = sumDD;

        const vCMO = nz((vUD[i] - vDD[i]) / (vUD[i] + vDD[i]));
        const prev = i > 0 ? result[i - 1] : NaN;
        result[i] = nz(valpha * Math.abs(vCMO) * s) + (1 - valpha * Math.abs(vCMO)) * nz(prev);
      }
      return result;
    }

    case 'WWMA': {
      const alpha = 1 / length;
      const result: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        if (i === 0) {
          result[i] = srcArr[i];
        } else {
          result[i] = alpha * srcArr[i] + (1 - alpha) * result[i - 1];
        }
      }
      return result;
    }

    case 'ZLEMA': {
      const lag = Math.floor((length - 1) / 2);
      const zSeries = new Series(bars, (_b, i) => {
        const s = srcArr[i];
        const lagged = i >= lag ? srcArr[i - lag] : srcArr[0];
        return s + (s - lagged);
      });
      return ta.ema(zSeries, length).toArray().map(v => v ?? NaN);
    }

    case 'TSF': {
      const lr0 = ta.linreg(srcSeries, length, 0).toArray();
      const lr1 = ta.linreg(srcSeries, length, 1).toArray();
      return lr0.map((v, i) => {
        const a = v ?? NaN;
        const b = lr1[i] ?? NaN;
        return isNaN(a) || isNaN(b) ? NaN : a + (a - b);
      });
    }

    case 'HULL': {
      const halfLen = Math.max(1, Math.floor(length / 2));
      const sqrtLen = Math.max(1, Math.round(Math.sqrt(length)));
      const wmaHalf = ta.wma(srcSeries, halfLen);
      const wmaFull = ta.wma(srcSeries, length);
      const diff = wmaHalf.mul(2).sub(wmaFull);
      return ta.wma(diff, sqrtLen).toArray().map(v => v ?? NaN);
    }

    default:
      return ta.ema(srcSeries, length).toArray().map(v => v ?? NaN);
  }
}

/** Compute OTT from a MA array, returning the OTT values. */
function computeOTT(maArr: number[], percent: number): number[] {
  const n = maArr.length;
  const longStop: number[] = new Array(n);
  const shortStop: number[] = new Array(n);
  const dir: number[] = new Array(n);
  const MT: number[] = new Array(n);
  const OTT: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const ma = maArr[i];
    if (isNaN(ma)) {
      longStop[i] = NaN;
      shortStop[i] = NaN;
      dir[i] = i > 0 ? dir[i - 1] : 1;
      MT[i] = NaN;
      OTT[i] = NaN;
      continue;
    }

    const fark = ma * percent * 0.01;

    // Long stop ratchets up
    const rawLong = ma - fark;
    if (i === 0 || isNaN(longStop[i - 1])) {
      longStop[i] = rawLong;
    } else {
      longStop[i] = (maArr[i - 1] > longStop[i - 1]) ? Math.max(rawLong, longStop[i - 1]) : rawLong;
    }

    // Short stop ratchets down
    const rawShort = ma + fark;
    if (i === 0 || isNaN(shortStop[i - 1])) {
      shortStop[i] = rawShort;
    } else {
      shortStop[i] = (maArr[i - 1] < shortStop[i - 1]) ? Math.min(rawShort, shortStop[i - 1]) : rawShort;
    }

    // Direction
    if (i === 0) {
      dir[i] = 1;
    } else if (ma > shortStop[i - 1]) {
      dir[i] = 1;
    } else if (ma < longStop[i - 1]) {
      dir[i] = -1;
    } else {
      dir[i] = dir[i - 1];
    }

    MT[i] = dir[i] === 1 ? longStop[i] : shortStop[i];
    OTT[i] = ma > MT[i] ? MT[i] * (200 + percent) / 200 : MT[i] * (200 - percent) / 200;
  }

  return OTT;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HottLottInputs> = {},
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const { ottPeriod, percent, hlLength, maType } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // Highest high and lowest low over hlLength
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const srcHigh = ta.highest(highSeries, hlLength).toArray().map(v => v ?? NaN);
  const srcLow = ta.lowest(lowSeries, hlLength).toArray().map(v => v ?? NaN);

  // Apply MA to both
  const maHigh = computeMA(bars, srcHigh, ottPeriod, maType);
  const maLow = computeMA(bars, srcLow, ottPeriod, maType);

  // Apply OTT to both
  const hottRaw = computeOTT(maHigh, percent);
  const lottRaw = computeOTT(maLow, percent);

  const warmup = Math.max(hlLength, ottPeriod) + 2;

  // 2-bar delay: nz(HOTT[2]), nz(LOTT[2])
  const hottPlot = bars.map((b, i) => {
    if (i < warmup + 2) return { time: b.time, value: NaN };
    const v = hottRaw[i - 2];
    return { time: b.time, value: isNaN(v) ? NaN : v };
  });

  const lottPlot = bars.map((b, i) => {
    if (i < warmup + 2) return { time: b.time, value: NaN };
    const v = lottRaw[i - 2];
    return { time: b.time, value: isNaN(v) ? NaN : v };
  });

  // Fill between HOTT and LOTT
  const fillColors = bars.map((_b, i) => {
    if (i < warmup + 2) return 'transparent';
    return 'rgba(153,21,255,0.2)';
  });

  // Bar colors: close > HOTT[2] → cyan, close < LOTT[2] → magenta
  const barColors: BarColorData[] = [];
  for (let i = warmup + 2; i < n; i++) {
    const h2 = hottRaw[i - 2];
    const l2 = lottRaw[i - 2];
    if (isNaN(h2) || isNaN(l2)) continue;
    if (bars[i].close > h2) {
      barColors.push({ time: bars[i].time as number, color: '#00FFFF' });
    } else if (bars[i].close < l2) {
      barColors.push({ time: bars[i].time as number, color: '#FF00FF' });
    }
  }

  // alertcondition(ta.crossover(close, HOTT[2])) / alertcondition(ta.crossunder(close, LOTT[2]))
  const closes = bars.map((b) => b.close);
  const hott2 = hottRaw.map((_v, i) => (i >= 2 ? hottRaw[i - 2] : NaN));
  const lott2 = lottRaw.map((_v, i) => (i >= 2 ? lottRaw[i - 2] : NaN));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { hott: hottPlot, lott: lottPlot },
    fills: [{ plot1: 'hott', plot2: 'lott', options: { color: 'rgba(153,21,255,0.5)' }, colors: fillColors }],
    barColors,
    alerts: alertStates(alertConditions, bars, [crossedOver(closes, hott2), crossedUnder(closes, lott2)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Crossover Alarm', message: 'PRICE OVER HOTT - BUY SIGNAL!' },
  { id: 'alert1', title: 'Price Crossunder Alarm', message: 'PRICE UNDER LOTT - SELL SIGNAL!' },
];

export const HottLott = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
