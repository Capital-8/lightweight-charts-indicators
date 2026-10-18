/**
 * Profit Maximizer (PMax)
 *
 * ATR-based trailing stop applied to a moving average (not raw close).
 * SuperTrend-style logic on the MA value determines trend direction.
 * Alerts (alertcondition, `alerts` of the result): the original's six conditions, crosses of the MA and of the price
 * (close) with PMax (any cross, crossover, crossunder), on the plotted values.
 *
 * Reference: "Profit Maximizer PMax"
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ProfitMaximizerInputs {
  atrPeriod: number;
  atrMult: number;
  maLength: number;
  maType: string;
  showSignalsC: boolean;
}

export const defaultInputs: ProfitMaximizerInputs = {
  atrPeriod: 10,
  atrMult: 3.0,
  maLength: 10,
  maType: 'ema',
  showSignalsC: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'ATR Period', defval: 10, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 3.0, min: 0.1, step: 0.1 },
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 10, min: 1 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'ema', options: ['sma', 'ema', 'wma', 'hma'] },
  { id: 'showSignalsC', type: 'bool', title: 'Show Price Crossing Signals', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'PMax', color: '#2962FF', lineWidth: 2 },
  { id: 'plot1', title: 'MA', color: '#FF6D00', lineWidth: 1 },
];

export const metadata = {
  title: 'Profit Maximizer',
  shortTitle: 'PMax',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<ProfitMaximizerInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { atrPeriod, atrMult, maLength, maType, showSignalsC } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const src = getSourceSeries(bars, 'close');

  // Calculate MA based on type
  let maSeries;
  switch (maType) {
    case 'sma': maSeries = ta.sma(src, maLength); break;
    case 'wma': maSeries = ta.wma(src, maLength); break;
    case 'hma': maSeries = ta.hma(src, maLength); break;
    default: maSeries = ta.ema(src, maLength); break;
  }
  const maArr = maSeries.toArray();

  const atrArr = ta.atr(bars, atrPeriod).toArray();

  // SuperTrend-style trailing stop on MA
  const pmaxArr: number[] = new Array(n);
  const dirArr: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const ma = maArr[i] ?? 0;
    const atr = (atrArr[i] ?? 0) * atrMult;
    const up = ma - atr;
    const dn = ma + atr;

    if (i === 0) {
      pmaxArr[i] = up;
      dirArr[i] = 1;
      continue;
    }

    const prevDir = dirArr[i - 1];
    const prevPmax = pmaxArr[i - 1];
    const prevMa = maArr[i - 1] ?? 0;

    const trailUp = prevMa > prevPmax && prevDir === 1 ? Math.max(up, prevPmax) : up;
    const trailDn = prevMa < prevPmax && prevDir === -1 ? Math.min(dn, prevPmax) : dn;

    if (prevDir === 1) {
      if (ma < trailUp) {
        dirArr[i] = -1;
        pmaxArr[i] = trailDn;
      } else {
        dirArr[i] = 1;
        pmaxArr[i] = trailUp;
      }
    } else {
      if (ma > trailDn) {
        dirArr[i] = 1;
        pmaxArr[i] = trailUp;
      } else {
        dirArr[i] = -1;
        pmaxArr[i] = trailDn;
      }
    }
  }

  const warmup = Math.max(atrPeriod, maLength);

  // Markers: buy when MA crosses above PMax, sell when MA crosses below PMax
  // Pine: buySignalk = crossover(MAvg, PMax)
  const markers: MarkerData[] = [];
  for (let i = warmup + 1; i < n; i++) {
    const maCur = maArr[i] ?? 0;
    const maPrev = maArr[i - 1] ?? 0;
    const pmaxCur = pmaxArr[i];
    const pmaxPrev = pmaxArr[i - 1];
    // crossover: prev MA <= prev PMax and cur MA > cur PMax
    if (maPrev <= pmaxPrev && maCur > pmaxCur) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#26A69A', text: 'Buy', id: 'shape0' });
    }
    // crossunder: prev MA >= prev PMax and cur MA < cur PMax
    if (maPrev >= pmaxPrev && maCur < pmaxCur) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#EF5350', text: 'Sell', id: 'shape1' });
    }

    // Pine: buySignalc = crossover(src, PMax), sellSignalc = crossunder(src, PMax)
    if (showSignalsC) {
      const closeCur = bars[i].close;
      const closePrev = bars[i - 1].close;
      if (closePrev <= pmaxPrev && closeCur > pmaxCur) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#0F18BF', text: 'Buy', id: 'shape2' });
      }
      if (closePrev >= pmaxPrev && closeCur < pmaxCur) {
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#0F18BF', text: 'Sell', id: 'shape3' });
      }
    }
  }

  // Fill between ohlc4 (price) and PMax: green when MAvg>PMax, red when MAvg<PMax
  // Pine: fill(mPlot, pALL, title="UpTrend Highligter", color=longFillColor) and the "DownTrend Highligter" fill
  const upFillColors: string[] = [];
  const downFillColors: string[] = [];
  for (let i = 0; i < n; i++) {
    const on = i >= warmup;
    upFillColors.push(on && dirArr[i] === 1 ? 'rgba(38,166,154,0.15)' : 'rgba(0,0,0,0)');
    downFillColors.push(on && dirArr[i] !== 1 ? 'rgba(239,83,80,0.15)' : 'rgba(0,0,0,0)');
  }

  const plot0 = pmaxArr.map((v, i) => {
    if (i < warmup) return { time: bars[i].time, value: NaN };
    const color = dirArr[i] === 1 ? '#26A69A' : '#EF5350';
    return { time: bars[i].time, value: v, color };
  });

  const plot1 = maArr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || v == null) ? NaN : v,
  }));

  // Alerts on the plotted values (na before the warm-up compares false): cross(a, b) = crossover or crossunder
  const maVals = plot1.map((p) => p.value);
  const pmaxVals = plot0.map((p) => p.value);
  const closeVals = bars.map((b) => b.close);
  const maOver = crossedOver(maVals, pmaxVals), maUnder = crossedUnder(maVals, pmaxVals);
  const pxOver = crossedOver(closeVals, pmaxVals), pxUnder = crossedUnder(closeVals, pmaxVals);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'UpTrend Highligter', color: 'rgba(38,166,154,0.15)' }, colors: upFillColors },
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'DownTrend Highligter', color: 'rgba(239,83,80,0.15)' }, colors: downFillColors },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [
      maOver.map((v, i) => v || maUnder[i]), maOver, maUnder,
      pxOver.map((v, i) => v || pxUnder[i]), pxOver, pxUnder,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cross Alert', message: 'PMax - Moving Avg Crossing!' },
  { id: 'alert1', title: 'Crossover Alarm', message: 'Moving Avg BUY SIGNAL!' },
  { id: 'alert2', title: 'Crossunder Alarm', message: 'Moving Avg SELL SIGNAL!' },
  { id: 'alert3', title: 'Price Cross Alert', message: 'PMax - Price Crossing!' },
  { id: 'alert4', title: 'Price Crossover Alarm', message: 'PRICE OVER PMax - BUY SIGNAL!' },
  { id: 'alert5', title: 'Price Crossunder Alarm', message: 'PRICE UNDER PMax - SELL SIGNAL!' },
];

export const ProfitMaximizer = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
