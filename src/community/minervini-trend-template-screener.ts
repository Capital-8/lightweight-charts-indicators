/**
 * Minervini Trend Template Screener (self-contained momentum screener)
 *
 * A BUY bar passes every enabled filter:
 * - Trend Template: close above SMA 150 and SMA 200, SMA 150 above SMA 200, SMA 200 above its value slopeLookback
 *   bars ago, SMA 50 above SMA 150 and SMA 200, close above SMA 50, close at least minAboveLowPct % above the 52-week
 *   low and at most maxOffHighPct % below the 52-week high (highest high / lowest low of lookback52w bars);
 * - mid-term momentum: the return over midLen bars (close / nz(close[midLen], close) - 1) >= midMinPct %;
 * - short-term momentum: the same over shortLen bars >= shortMinPct %;
 * - volume spike (off by default): volume >= SMA(volume, volLen) * volMult;
 * - VCP ATR contraction: SMA(ATR % of close, atrShort) < SMA(ATR % of close, atrLong) * atrRatio.
 * A BUY bar gets a BUY label below the bar and a green background.
 * Alerts (alertcondition, `alerts` of the result): 'BUY', true on the BUY bars.
 *
 * Reference: "Minervini Trend Template Screener (v5)" by hibinomasakazu1991
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY', message: 'BUY: conditions met' },
];

export interface MinerviniTrendTemplateScreenerInputs {
  /** Use Trend Template */
  useTT: boolean;
  /** SMA 50 */
  len50: number;
  /** SMA 150 */
  len150: number;
  /** SMA 200 */
  len200: number;
  /** Lookback 52w days */
  lookback52w: number;
  /** Min pct above 52w low */
  minAboveLowPct: number;
  /** Max pct off 52w high */
  maxOffHighPct: number;
  /** SMA200 slope lookback */
  slopeLookback: number;
  /** Use mid term momentum */
  useMidMomentum: boolean;
  /** Mid lookback days */
  midLen: number;
  /** Min mid return pct */
  midMinPct: number;
  /** Use short term momentum */
  useShortMomentum: boolean;
  /** Short lookback days */
  shortLen: number;
  /** Min short return pct */
  shortMinPct: number;
  /** Use volume spike */
  useVolumeSpike: boolean;
  /** Volume MA length */
  volLen: number;
  /** Volume spike mult */
  volMult: number;
  /** Use VCP ATR contraction */
  useVCP: boolean;
  /** ATR length */
  atrLen: number;
  /** ATRpct short MA */
  atrShort: number;
  /** ATRpct long MA */
  atrLong: number;
  /** Contraction ratio */
  atrRatio: number;
}

export const defaultInputs: MinerviniTrendTemplateScreenerInputs = {
  useTT: true,
  len50: 50,
  len150: 150,
  len200: 200,
  lookback52w: 252,
  minAboveLowPct: 30.0,
  maxOffHighPct: 25.0,
  slopeLookback: 20,
  useMidMomentum: true,
  midLen: 126,
  midMinPct: 20.0,
  useShortMomentum: true,
  shortLen: 21,
  shortMinPct: 5.0,
  useVolumeSpike: false,
  volLen: 50,
  volMult: 1.5,
  useVCP: true,
  atrLen: 14,
  atrShort: 10,
  atrLong: 50,
  atrRatio: 0.9,
};

export const inputConfig: InputConfig[] = [
  { id: 'useTT', type: 'bool', title: 'Use Trend Template', defval: true },
  { id: 'len50', type: 'int', title: 'SMA 50', defval: 50, min: 1 },
  { id: 'len150', type: 'int', title: 'SMA 150', defval: 150, min: 1 },
  { id: 'len200', type: 'int', title: 'SMA 200', defval: 200, min: 1 },
  { id: 'lookback52w', type: 'int', title: 'Lookback 52w days', defval: 252, min: 50 },
  { id: 'minAboveLowPct', type: 'float', title: 'Min pct above 52w low', defval: 30.0, step: 0.5 },
  { id: 'maxOffHighPct', type: 'float', title: 'Max pct off 52w high', defval: 25.0, step: 0.5 },
  { id: 'slopeLookback', type: 'int', title: 'SMA200 slope lookback', defval: 20, min: 1 },
  { id: 'useMidMomentum', type: 'bool', title: 'Use mid term momentum', defval: true },
  { id: 'midLen', type: 'int', title: 'Mid lookback days', defval: 126, min: 1 },
  { id: 'midMinPct', type: 'float', title: 'Min mid return pct', defval: 20.0, step: 0.5 },
  { id: 'useShortMomentum', type: 'bool', title: 'Use short term momentum', defval: true },
  { id: 'shortLen', type: 'int', title: 'Short lookback days', defval: 21, min: 1 },
  { id: 'shortMinPct', type: 'float', title: 'Min short return pct', defval: 5.0, step: 0.5 },
  { id: 'useVolumeSpike', type: 'bool', title: 'Use volume spike', defval: false },
  { id: 'volLen', type: 'int', title: 'Volume MA length', defval: 50, min: 1 },
  { id: 'volMult', type: 'float', title: 'Volume spike mult', defval: 1.5, min: 1.0, step: 0.1 },
  { id: 'useVCP', type: 'bool', title: 'Use VCP ATR contraction', defval: true },
  { id: 'atrLen', type: 'int', title: 'ATR length', defval: 14, min: 1 },
  { id: 'atrShort', type: 'int', title: 'ATRpct short MA', defval: 10, min: 1 },
  { id: 'atrLong', type: 'int', title: 'ATRpct long MA', defval: 50, min: 1 },
  { id: 'atrRatio', type: 'float', title: 'Contraction ratio', defval: 0.9, min: 0.5, max: 1.0, step: 0.01 },
];

// No plot(): the outputs are a plotshape label and a background colour
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'SelfContained Momentum Screener (TT+Momentum+Vol+VCP) w/BUY',
  shortTitle: 'SelfContained Momentum Screener (TT+Momentum+Vol+VCP) w/BUY',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MinerviniTrendTemplateScreenerInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const volume = new Series(bars, (b) => b.volume ?? NaN);

  // ===== Trend Template =====
  const sma50 = arr(ta.sma(close, cfg.len50));
  const sma150 = arr(ta.sma(close, cfg.len150));
  const sma200 = arr(ta.sma(close, cfg.len200));
  const hi52 = arr(ta.highest(high, cfg.lookback52w));
  const lo52 = arr(ta.lowest(low, cfg.lookback52w));

  // ===== Volume spike =====
  const volMA = arr(ta.sma(volume, cfg.volLen));

  // ===== VCP (ATR contraction) =====
  const atr = arr(ta.atr(bars, cfg.atrLen));
  const atrPctArr = bars.map((b, i) => (atr[i] / b.close) * 100);
  const atrPct = new Series(bars, (_b, i) => atrPctArr[i]);
  const atrShortMA = arr(ta.sma(atrPct, cfg.atrShort));
  const atrLongMA = arr(ta.sma(atrPct, cfg.atrLong));

  const bg = String(color.new(color.green, 85));
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyFlags: boolean[] = [];
  bars.forEach((b, i) => {
    const c = b.close;
    const sma200Back = i - cfg.slopeLookback >= 0 ? sma200[i - cfg.slopeLookback] : NaN;

    const tt1 = gt(c, sma150[i]) && gt(c, sma200[i]);
    const tt2 = gt(sma150[i], sma200[i]);
    const tt3 = gt(sma200[i], sma200Back);
    const tt4 = gt(sma50[i], sma150[i]) && gt(sma50[i], sma200[i]);
    const tt5 = gt(c, sma50[i]);
    const tt6 = ge(c, lo52[i] * (1 + cfg.minAboveLowPct / 100));
    const tt7 = ge(c, hi52[i] * (1 - cfg.maxOffHighPct / 100));
    const ttPass = tt1 && tt2 && tt3 && tt4 && tt5 && tt6 && tt7;

    // ===== Mid-term momentum: nz(close[midLen], close) =====
    const midBack = i - cfg.midLen >= 0 ? bars[i - cfg.midLen].close : NaN;
    const midClose = isNaN(midBack) ? c : midBack;
    const midMomentumPct = (c / midClose - 1) * 100;
    const midPass = ge(midMomentumPct, cfg.midMinPct);

    // ===== Short-term momentum =====
    const shortBack = i - cfg.shortLen >= 0 ? bars[i - cfg.shortLen].close : NaN;
    const shortClose = isNaN(shortBack) ? c : shortBack;
    const shortMomentumPct = (c / shortClose - 1) * 100;
    const shortPass = ge(shortMomentumPct, cfg.shortMinPct);

    const volSpike = ge(b.volume ?? NaN, volMA[i] * cfg.volMult);
    const vcpPass = lt(atrShortMA[i], atrLongMA[i] * cfg.atrRatio);

    // ===== Final pass =====
    const p1 = !cfg.useTT || ttPass;
    const p2 = !cfg.useMidMomentum || midPass;
    const p3 = !cfg.useShortMomentum || shortPass;
    const p4 = !cfg.useVolumeSpike || volSpike;
    const p5 = !cfg.useVCP || vcpPass;
    const buy = p1 && p2 && p3 && p4 && p5;
    buyFlags.push(buy);

    if (buy) {
      // plotshape(buy, "BUY label", shape.labelup, text = "BUY", location.belowbar, size.tiny): Pine default colour
      // and text colour (color.blue)
      markers.push({ time: b.time, position: 'belowBar', shape: 'labelUp', color: color.blue, text: 'BUY',
        textColor: color.blue, size: 'tiny' });
      // bgcolor(buy ? color.new(color.green, 85) : na)
      bgColors.push({ time: b.time, color: bg });
    }
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
    // alertcondition(buy, title = "BUY")
    alerts: alertStates(alertConditions, bars, [buyFlags]),
  };
}

export const MinerviniTrendTemplateScreener = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
