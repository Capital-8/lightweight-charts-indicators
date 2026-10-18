/**
 * EMA & MACD Strategy with SL/TP
 *
 * An EMA channel (EMA of the high and EMA of the low) with a long EMA of the close as trend filter, and the MACD
 * histogram. BUY: the channel is above the long EMA, the histogram is positive, the close crossed over the channel
 * top and the histogram crossed over zero within the last `lookbackPeriod` bars, and one of the two crosses is on
 * this bar. SELL is the mirror. On a signal the stop-loss is the opposite channel line and the take-profit is the
 * close plus (or minus) the risk times the reward ratio; both lines are removed when price crosses the stop-loss.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Alert' and 'Sell Alert', true on the BUY / SELL bars.
 *
 * Reference: "EMA & MACD Strategy with SL/TP" by mamachi-
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © mamachi-
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EmaMacdStrategyWithSlTpInputs {
  /** EMA channel length */
  emaShortLen: number;
  /** Long EMA length (trend filter) */
  emaLongLen: number;
  /** MACD fast length */
  macdFast: number;
  /** MACD slow length */
  macdSlow: number;
  /** MACD signal length */
  macdSignal: number;
  /** Bars during which a cross stays valid */
  lookbackPeriod: number;
  /** Reward / risk ratio of the take-profit */
  rewardRatio: number;
}

export const defaultInputs: EmaMacdStrategyWithSlTpInputs = {
  emaShortLen: 15,
  emaLongLen: 200,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
  lookbackPeriod: 3,
  rewardRatio: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaShortLen', type: 'int', title: 'EMAチャネル期間', defval: 15, min: 1 },
  { id: 'emaLongLen', type: 'int', title: '長期EMA(環境認識)期間', defval: 200, min: 1 },
  { id: 'macdFast', type: 'int', title: 'MACD 短期(Fast)', defval: 12, min: 1 },
  { id: 'macdSlow', type: 'int', title: 'MACD 長期(Slow)', defval: 26, min: 1 },
  { id: 'macdSignal', type: 'int', title: 'MACD シグナル', defval: 9, min: 1 },
  { id: 'lookbackPeriod', type: 'int', title: '条件成立の有効期限 (本数)', defval: 3, min: 0 },
  { id: 'rewardRatio', type: 'float', title: 'リスクリワード比 (利確/損切)', defval: 1.5, step: 0.1 },
];

const CHANNEL_COL = String(color.new(color.blue, 50));
const FILL_COL = String(color.new(color.blue, 90));
const SL_COL = String(color.new(color.red, 0));
const TP_COL = String(color.new(color.green, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA High', color: CHANNEL_COL, lineWidth: 1 },
  { id: 'plot1', title: 'EMA Low', color: CHANNEL_COL, lineWidth: 1 },
  { id: 'plot2', title: 'EMA 200', color: color.red, lineWidth: 2 },
  { id: 'plot3', title: 'Stop Loss', color: SL_COL, lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Take Profit', color: TP_COL, lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'EMA & MACD Strategy with SL/TP',
  shortTitle: 'EMA_MACD_SLTP',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<EmaMacdStrategyWithSlTpInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));

  const emaHighS = ta.ema(S(bars.map((b) => b.high)), cfg.emaShortLen);
  const emaLowS = ta.ema(S(bars.map((b) => b.low)), cfg.emaShortLen);
  const emaHigh = A(emaHighS);
  const emaLow = A(emaLowS);
  const ema200 = A(ta.ema(close, cfg.emaLongLen));
  const [, , macdHistS] = ta.macd(close, cfg.macdFast, cfg.macdSlow, cfg.macdSignal);
  const macdHist = A(macdHistS);

  // Crosses (exact comparisons, oakscriptjs)
  const priceCrossUnderLowS = ta.crossunder(close, emaLowS);
  const priceCrossOverHighS = ta.crossover(close, emaHighS);
  const histCrossUnderZeroS = ta.crossunder(macdHistS, 0);
  const histCrossOverZeroS = ta.crossover(macdHistS, 0);
  const priceCrossUnderLow = A(priceCrossUnderLowS);
  const priceCrossOverHigh = A(priceCrossOverHighS);
  const histCrossUnderZero = A(histCrossUnderZeroS);
  const histCrossOverZero = A(histCrossOverZeroS);

  const barsSincePriceLow = A(ta.barssince(priceCrossUnderLowS));
  const barsSincePriceHigh = A(ta.barssince(priceCrossOverHighS));
  const barsSinceHistLow = A(ta.barssince(histCrossUnderZeroS));
  const barsSinceHistHigh = A(ta.barssince(histCrossOverZeroS));

  const lb = cfg.lookbackPeriod;
  const slLine: number[] = new Array(n);
  const tpLine: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  let sl = NaN; // var float slLine = na
  let tp = NaN; // var float tpLine = na
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const isAbove200 = gt(emaLow[i], ema200[i]);
    const isBelow200 = lt(emaHigh[i], ema200[i]);
    const longCondition = isAbove200 && gt(macdHist[i], 0) && le(barsSincePriceHigh[i], lb)
      && le(barsSinceHistHigh[i], lb) && (priceCrossOverHigh[i] === 1 || histCrossOverZero[i] === 1);
    const shortCondition = isBelow200 && lt(macdHist[i], 0) && le(barsSincePriceLow[i], lb)
      && le(barsSinceHistLow[i], lb) && (priceCrossUnderLow[i] === 1 || histCrossUnderZero[i] === 1);

    longFlags.push(longCondition);
    shortFlags.push(shortCondition);

    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    if (longCondition) {
      sl = emaLow[i];
      tp = b.close + (b.close - sl) * cfg.rewardRatio;
    } else if (shortCondition) {
      sl = emaHigh[i];
      tp = b.close - (sl - b.close) * cfg.rewardRatio;
    } else if ((lt(b.low, sl) && gt(prevClose, sl)) || (gt(b.high, sl) && lt(prevClose, sl))) {
      sl = NaN;
      tp = NaN;
    }
    slLine[i] = sl;
    tpLine[i] = tp;

    // plotshape(longCondition, shape.triangleup, location.belowbar, color.green, size.small, text = 'BUY')
    if (longCondition) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small',
        text: 'BUY', textColor: color.blue });
    }
    // plotshape(shortCondition, shape.triangledown, location.abovebar, color.red, size.small, text = 'SELL')
    if (shortCondition) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small',
        text: 'SELL', textColor: color.blue });
    }
  }

  const P = (vals: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: vals[i], color: c }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(emaHigh, CHANNEL_COL),
      plot1: P(emaLow, CHANNEL_COL),
      plot2: P(ema200, color.red),
      plot3: P(slLine, SL_COL),
      plot4: P(tpLine, TP_COL),
    },
    // fill(p_high, p_low, color = color.new(color.blue, 90), title = 'Channel Fill')
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: FILL_COL, title: 'Channel Fill' } }],
    markers,
    // alertcondition(longCondition, 'Buy Alert') / alertcondition(shortCondition, 'Sell Alert')
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'EMAチャネル: 買いサイン (SL: {{plot_4}}, TP: {{plot_5}})' },
  { id: 'alert1', title: 'Sell Alert', message: 'EMAチャネル: 売りサイン (SL: {{plot_4}}, TP: {{plot_5}})' },
];

export const EmaMacdStrategyWithSlTp = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
