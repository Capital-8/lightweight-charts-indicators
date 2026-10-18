/**
 * Super SuperTrend Three Line
 *
 * Three SuperTrend lines at different ATR multipliers for layered
 * trend confirmation. Arrows (the original's plotarrow outputs, `arrows` of the result) on each trend flip, and
 * shapes at the bottom of the pane where the close crosses each line.
 *
 * Reference: "Super SuperTrend" (community)
 */

import { ta, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type ArrowData } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';

export interface SuperSupertrendInputs {
  atrLen: number;
  mult1: number;
  mult2: number;
  mult3: number;
}

export const defaultInputs: SuperSupertrendInputs = {
  atrLen: 10,
  mult1: 1.0,
  mult2: 2.0,
  mult3: 3.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 10, min: 1 },
  { id: 'mult1', type: 'float', title: 'Multiplier 1', defval: 1.0, min: 0.1, step: 0.1 },
  { id: 'mult2', type: 'float', title: 'Multiplier 2', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'mult3', type: 'float', title: 'Multiplier 3', defval: 3.0, min: 0.1, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ST1', color: '#26A69A', lineWidth: 1 },
  { id: 'plot1', title: 'ST2', color: '#2962FF', lineWidth: 2 },
  { id: 'plot2', title: 'ST3', color: '#FF6D00', lineWidth: 2 },
];

export const metadata = {
  title: 'Super SuperTrend',
  shortTitle: 'SST',
  overlay: true,
};

function calcSuperTrend(bars: Bar[], atrArr: (number | null)[], mult: number): { st: number[]; dir: number[] } {
  const n = bars.length;
  const st: number[] = new Array(n);
  const dir: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const atr = (atrArr[i] ?? 0) * mult;
    const up = hl2 - atr;
    const dn = hl2 + atr;

    if (i === 0) {
      st[i] = up;
      dir[i] = 1;
      continue;
    }

    const prevDir = dir[i - 1];
    const prevSt = st[i - 1];
    const close = bars[i].close;
    const prevClose = bars[i - 1].close;

    // Trailing logic
    const trailUp = prevClose > prevSt && prevDir === 1 ? Math.max(up, prevSt) : up;
    const trailDn = prevClose < prevSt && prevDir === -1 ? Math.min(dn, prevSt) : dn;

    if (prevDir === 1) {
      // Was bullish
      if (close < trailUp) {
        dir[i] = -1;
        st[i] = trailDn;
      } else {
        dir[i] = 1;
        st[i] = trailUp;
      }
    } else {
      // Was bearish
      if (close > trailDn) {
        dir[i] = 1;
        st[i] = trailUp;
      } else {
        dir[i] = -1;
        st[i] = trailDn;
      }
    }
  }

  return { st, dir };
}

export function calculate(bars: Bar[], inputs: Partial<SuperSupertrendInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; arrows: ArrowData[]; plotCandles: Record<string, PlotCandleData[]> } {
  const { atrLen, mult1, mult2, mult3 } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const atrArr = ta.atr(bars, atrLen).toArray();

  const st1 = calcSuperTrend(bars, atrArr, mult1);
  const st2 = calcSuperTrend(bars, atrArr, mult2);
  const st3 = calcSuperTrend(bars, atrArr, mult3);

  const warmup = atrLen;

  const makePlot = (data: { st: number[]; dir: number[] }) =>
    data.st.map((v, i) => {
      if (i < warmup) return { time: bars[i].time, value: NaN };
      const color = data.dir[i] === 1 ? '#26A69A' : '#EF5350';
      return { time: bars[i].time, value: v, color };
    });

  // Arrows (the original's plotarrow outputs, `arrows` of the result):
  // plotarrow(TrendK == 1 and TrendK[1] == -1 ? TrendK : na, "UpSTArrowK", colorup = lime, transp = 0)
  // plotarrow(TrendK == -1 and TrendK[1] == 1 ? TrendK : na, "DnSTArrowK", colordown = red, transp = 0)
  // Shapes at the bottom (plotshape outputs): close crossing over (under) each line, ids shape0..shape5 in the
  // original's order (UpShape1 / DownShape1 for ST1, UpShape2 / DownShape2 for ST2, UpShape1 / DownShape2 for ST3)
  const markers: MarkerData[] = [];
  const arrows: ArrowData[] = [];
  const LIME = '#00FF00', RED = '#FF0000', YELLOW = '#FFFF00', GREEN = '#008000';
  const allSTs = [
    { data: st1, up: 'shape0', down: 'shape1', upShape: 'flag' as const, upColor: YELLOW, arrowUp: 'arrow0', arrowDn: 'arrow1' },
    { data: st2, up: 'shape2', down: 'shape3', upShape: 'triangleUp' as const, upColor: GREEN, arrowUp: 'arrow2', arrowDn: 'arrow3' },
    { data: st3, up: 'shape4', down: 'shape5', upShape: 'triangleUp' as const, upColor: GREEN, arrowUp: 'arrow4', arrowDn: 'arrow5' },
  ];

  for (let i = warmup + 1; i < n; i++) {
    const time = bars[i].time;
    for (const { data, up, down, upShape, upColor, arrowUp, arrowDn } of allSTs) {
      // Trend flip arrows
      if (data.dir[i] === 1 && data.dir[i - 1] === -1) {
        arrows.push({ time, id: arrowUp, value: 1, color: LIME });
      } else if (data.dir[i] === -1 && data.dir[i - 1] === 1) {
        arrows.push({ time, id: arrowDn, value: -1, color: RED });
      }

      // cross(close, Tsl) and close > Tsl / cross(Tsl, close) and close < Tsl
      const close = bars[i].close;
      const prevClose = bars[i - 1].close;
      const stVal = data.st[i];
      const prevStVal = data.st[i - 1];
      const crossAbove = close > stVal && prevClose <= prevStVal;
      const crossBelow = close < stVal && prevClose >= prevStVal;
      if (crossAbove) markers.push({ time, position: 'bottom', shape: upShape, color: upColor, id: up });
      if (crossBelow) markers.push({ time, position: 'bottom', shape: 'triangleDown', color: RED, id: down });
    }
  }

  // plotCandles: Pine plots regular OHLC candles colored by trend
  // plotcandle(open, high, low, close, color=(open < close) ? green : red, wickcolor=gray)
  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    candles.push({
      time: bars[i].time,
      open: bars[i].open,
      high: bars[i].high,
      low: bars[i].low,
      close: bars[i].close,
      color: bars[i].open < bars[i].close ? '#26A69A' : '#EF5350',
      wickColor: '#787B86',
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': makePlot(st1),
      'plot1': makePlot(st2),
      'plot2': makePlot(st3),
    },
    markers,
    arrows,
    plotCandles: { candle0: candles },
  };
}

export const SuperSupertrend = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
