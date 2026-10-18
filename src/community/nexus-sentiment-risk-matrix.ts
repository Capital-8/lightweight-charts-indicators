/**
 * Nexus Sentiment & Risk Matrix
 *
 * Sentiment = average of RSI(close, len), SMA(Stochastic(len), 3) and the CCI(close, len) mapped to 0..100
 * (above 100 -> 100, below -100 -> 0, else (CCI + 100) / 2), coloured by a gradient from the bearish colour (0) to
 * the bullish colour (100), with gradient fills to the 50 line. Risk direction (Chandelier model): 1 when the close
 * is above lowest low + ATR * mult, -1 when it is below highest high - ATR * mult, else unchanged. BUY when the risk
 * direction rises while the sentiment is above 50, SELL when it falls while the sentiment is below 50.
 *
 * Alerts (alertcondition, `alerts` of the result): "Nexus Buy Signal" (BUY) and "Nexus Sell Signal" (SELL).
 *
 * Reference: "Nexus Sentiment & Risk Matrix [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Pineify
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition() calls, in declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Nexus Buy Signal', message: 'Risk-On: Bullish Sentiment & Risk metrics aligned.' },
  { id: 'alert1', title: 'Nexus Sell Signal', message: 'Risk-Off: Bearish Sentiment & Risk metrics aligned.' },
];

export interface NexusSentimentRiskMatrixInputs {
  /** Shared length of RSI, Stochastic and CCI */
  len: number;
  /** ATR / highest / lowest length of the Chandelier model */
  atrLen: number;
  /** ATR multiplier of the Chandelier levels */
  atrMult: number;
}

export const defaultInputs: NexusSentimentRiskMatrixInputs = {
  len: 14,
  atrLen: 22,
  atrMult: 3.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Oscillator Length', defval: 14, min: 1 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 22, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 3.0, min: 0.1, step: 0.1 },
];

const BULL = '#089981';
const BEAR = '#f23645';
const NEUTRAL = '#787b86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Equilibrium Level', color: String(color.new(NEUTRAL, 50)), lineWidth: 1 },
  { id: 'plot1', title: 'Nexus Sentiment', color: BULL, lineWidth: 2 },
];

export const metadata = {
  title: 'Nexus Sentiment & Risk Matrix [Pineify]',
  shortTitle: 'Nexus S&R [Pineify]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<NexusSentimentRiskMatrixInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));

  // Sentiment
  const rsiVal = A(ta.rsi(close, cfg.len));
  const stochVal = A(ta.sma(ta.stoch(close, high, low, cfg.len), 3));
  const cciRaw = A(ta.cci(close, cfg.len));
  const sentiment: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = cciRaw[i];
    // cciRaw > 100 ? 100 : cciRaw < -100 ? 0 : (cciRaw + 100) / 2
    const cciNorm = gt(c, 100) ? 100 : lt(c, -100) ? 0 : (c + 100) / 2;
    // math.avg: na when an argument is na
    sentiment[i] = (rsiVal[i] + stochVal[i] + cciNorm) / 3;
  }

  // Risk (Chandelier)
  const atrValue = A(ta.atr(bars, cfg.atrLen));
  const highestHigh = A(ta.highest(high, cfg.atrLen));
  const lowestLow = A(ta.lowest(low, cfg.atrLen));
  const riskDir: number[] = new Array(n);
  let dir = 1; // var int riskDir = 1
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const chandLong = highestHigh[i] - atrValue[i] * cfg.atrMult;
    const chandShort = lowestLow[i] + atrValue[i] * cfg.atrMult;
    // riskDir := close > nz(chandShort, high) ? 1 : close < nz(chandLong, low) ? -1 : riskDir
    const shortLvl = isNaN(chandShort) ? b.high : chandShort;
    const longLvl = isNaN(chandLong) ? b.low : chandLong;
    dir = gt(b.close, shortLvl) ? 1 : lt(b.close, longLvl) ? -1 : dir;
    riskDir[i] = dir;
  }

  const fill0Top = String(color.new(BULL, 70));
  const fill0Bottom = String(color.new(BULL, 90));
  const fill1Top = String(color.new(BEAR, 90));
  const fill1Bottom = String(color.new(BEAR, 70));
  const midColor = String(color.new(NEUTRAL, 50));

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const buySignal: boolean[] = new Array(n).fill(false);
  const sellSignal: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const s = sentiment[i];
    plot0.push({ time: t, value: 50, color: midColor });
    plot1.push({ time: t, value: s, color: color.from_gradient(s, 0, 100, BEAR, BULL) });
    // ta.change(riskDir) > 0 and sentiment > 50 / ta.change(riskDir) < 0 and sentiment < 50 (na on bar 0)
    const ch = i > 0 ? riskDir[i] - riskDir[i - 1] : NaN;
    buySignal[i] = gt(ch, 0) && gt(s, 50);
    sellSignal[i] = lt(ch, 0) && lt(s, 50);
    if (gt(ch, 0) && gt(s, 50)) {
      markers.push({ time: t, position: 'bottom', shape: 'triangleUp', color: BULL, text: 'BUY', textColor: BULL, size: 'small' });
    }
    if (lt(ch, 0) && lt(s, 50)) {
      markers.push({ time: t, position: 'top', shape: 'triangleDown', color: BEAR, text: 'SELL', textColor: BEAR, size: 'small' });
    }
  }

  // fill(pSent, pMid, top_value = math.max(sentiment, 50), bottom_value = 50, color.new(bull, 70), color.new(bull, 90))
  // fill(pMid, pSent, top_value = 50, bottom_value = math.min(sentiment, 50), color.new(bear, 90), color.new(bear, 70))
  // math.max / math.min: na when the sentiment is na
  const fills = [
    { plot1: 'plot1', plot2: 'plot0', options: { title: 'Bullish Zone' },
      gradient: {
        topValue: sentiment.map((s) => Math.max(s, 50)),
        bottomValue: new Array<number>(n).fill(50),
        topColor: new Array<string | null>(n).fill(fill0Top),
        bottomColor: new Array<string | null>(n).fill(fill0Bottom),
      } },
    { plot1: 'plot0', plot2: 'plot1', options: { title: 'Bearish Zone' },
      gradient: {
        topValue: new Array<number>(n).fill(50),
        bottomValue: sentiment.map((s) => Math.min(s, 50)),
        topColor: new Array<string | null>(n).fill(fill1Top),
        bottomColor: new Array<string | null>(n).fill(fill1Bottom),
      } },
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills,
    markers,
    alerts: alertStates(alertConditions, bars, [buySignal, sellSignal]),
  };
}

export const NexusSentimentRiskMatrix = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
