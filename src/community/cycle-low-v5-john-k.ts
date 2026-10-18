/**
 * Cycle Low (RSI + StochRSI)
 *
 * A cycle low signal from an RSI cross up through the oversold level and a StochRSI %K cross up through %D
 * (StochRSI = position of the RSI in its range over `len_stoch` bars, 50 on a flat range; %K = SMA, %D = SMA of
 * %K). Both crosses must happen on the same bar, or within one bar with the tolerance option. The previous bar must
 * be oversold on the RSI or on StochRSI (both in strict mode), and a score (RSI cross, StochRSI cross, RSI previous
 * oversold, StochRSI previous oversold: one point each) must reach the threshold. An optional anchor level (the
 * close of the bar that opens at the anchor time, or a manual price, times a multiplier) limits the signals to
 * closes near that level and is drawn as a line.
 * Alerts (alertcondition, `alerts` of the result): 'Cycle Low', true on the bars of the signal (also with the markers
 * hidden).
 *
 * Reference: "Cycle Low (RSI + StochRSI) – v1.1 (Strict + Score, Overlay)" by John_Kal
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CycleLowRsiStochRsiInputs {
  src: SourceType;
  lenRsi: number;
  rsiOs: number;
  lenStoch: number;
  stochK: number;
  stochD: number;
  stochOs: number;
  oneBarTolerance: boolean;
  requirePrevOS: boolean;
  strictMode: boolean;
  scoreThreshold: number;
  useAnchor: boolean;
  /** Anchor candle open time (Unix ms, UTC) */
  anchorTime: number;
  useManualAnchorPrice: boolean;
  anchorPriceManual: number;
  anchorMult: number;
  anchorTol: number;
  plotLabels: boolean;
  /** Pine input "Background highlight?": the script has no bgcolor, so it changes nothing */
  showBg: boolean;
}

export const defaultInputs: CycleLowRsiStochRsiInputs = {
  src: 'close',
  lenRsi: 14,
  rsiOs: 33.0,
  lenStoch: 14,
  stochK: 3,
  stochD: 3,
  stochOs: 20.0,
  oneBarTolerance: true,
  requirePrevOS: true,
  strictMode: false,
  scoreThreshold: 3,
  useAnchor: false,
  anchorTime: 1735689600000,
  useManualAnchorPrice: false,
  anchorPriceManual: 0.0,
  anchorMult: 1.0,
  anchorTol: 0.02,
  plotLabels: true,
  showBg: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'lenRsi', type: 'int', title: 'RSI Length', defval: 14, min: 2 },
  { id: 'rsiOs', type: 'float', title: 'RSI Oversold (0–100)', defval: 33.0, min: 5, max: 60 },
  { id: 'lenStoch', type: 'int', title: 'StochRSI Length', defval: 14, min: 2 },
  { id: 'stochK', type: 'int', title: 'Stoch %K Smoothing', defval: 3, min: 1 },
  { id: 'stochD', type: 'int', title: 'Stoch %D Smoothing', defval: 3, min: 1 },
  { id: 'stochOs', type: 'float', title: 'StochRSI Oversold (0–100)', defval: 20.0, min: 1, max: 50 },
  { id: 'oneBarTolerance', type: 'bool', title: 'Allow RSI & Stoch crosses within 1 bar?', defval: true },
  { id: 'requirePrevOS', type: 'bool', title: 'Require prior oversold on RSI or Stoch?', defval: true },
  { id: 'strictMode', type: 'bool', title: 'Strict Mode (RSI<rsi_os & Stoch<stoch_os on previous bar)', defval: false },
  { id: 'scoreThreshold', type: 'int', title: 'Score threshold (0–4)', defval: 3, min: 0, max: 4 },
  { id: 'useAnchor', type: 'bool', title: 'Use Cycle Anchor Level?', defval: false },
  { id: 'anchorTime', type: 'time', title: 'Anchor Candle Time (UTC)', defval: 1735689600000 },
  { id: 'useManualAnchorPrice', type: 'bool', title: 'Use Manual Anchor Price?', defval: false },
  { id: 'anchorPriceManual', type: 'float', title: 'Manual Anchor Price', defval: 0.0, step: 0.0001 },
  { id: 'anchorMult', type: 'float', title: 'Anchor Range Multiplier', defval: 1.0, step: 0.001 },
  { id: 'anchorTol', type: 'float', title: 'Anchor proximity tolerance (fraction)', defval: 0.02, min: 0.0, max: 1.0, step: 0.001 },
  { id: 'plotLabels', type: 'bool', title: 'Plot signal markers?', defval: true },
  { id: 'showBg', type: 'bool', title: 'Background highlight?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Anchor Projection', color: color.gray, lineWidth: 1 },
];

export const metadata = {
  title: 'Cycle Low (RSI + StochRSI) – v1.1 (Strict + Score, Overlay)',
  shortTitle: 'Cycle Low (RSI + StochRSI) – v1.1 (Strict + Score, Overlay)',
  overlay: true,
};

/** Pine float comparisons: 1e-10 tolerance, na compares false */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<CycleLowRsiStochRsiInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // RSI and StochRSI
  const rsiS = ta.rsi(getSourceSeries(bars, cfg.src), cfg.lenRsi);
  const rsi = A(rsiS);
  const ll = A(ta.lowest(rsiS, cfg.lenStoch));
  const hh = A(ta.highest(rsiS, cfg.lenStoch));
  // stoch_raw = (hh == ll) ? 50 : (rsi - ll) / (hh - ll) * 100
  const stochRaw = rsi.map((r, i) => (eq(hh[i], ll[i]) ? 50 : ((r - ll[i]) / (hh[i] - ll[i])) * 100));
  const kS = ta.sma(S(stochRaw), cfg.stochK);
  const k = A(kS);
  const dS = ta.sma(kS, cfg.stochD);
  const d = A(dS);

  // Events: ta.crossover compares exactly; ta.barssince of each
  const rsiCrossUp = A(ta.crossover(rsiS, cfg.rsiOs)).map((v) => v === 1);
  const stCrossUp = A(ta.crossover(kS, dS)).map((v) => v === 1);

  const markers: MarkerData[] = [];
  const plot0: { time: number; value: number; color: string }[] = [];
  let barsRsi = NaN;
  let barsSt = NaN;
  let anchorPriceDetected = NaN; // var float anchor_price_detected = na
  const cycleLowFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (rsiCrossUp[i]) barsRsi = 0;
    else if (!isNaN(barsRsi)) barsRsi++;
    if (stCrossUp[i]) barsSt = 0;
    else if (!isNaN(barsSt)) barsSt++;
    const nzRsi = isNaN(barsRsi) ? 1e6 : barsRsi;
    const nzSt = isNaN(barsSt) ? 1e6 : barsSt;
    const crossOk = cfg.oneBarTolerance ? nzRsi <= 1 && nzSt <= 1 : nzRsi === 0 && nzSt === 0;

    // rsi_prev_os = rsi[1] < rsi_os; st_prev_os = math.min(k[1], d[1]) < stoch_os (na compares false)
    const rsiPrevOs = i > 0 && lt(rsi[i - 1], cfg.rsiOs);
    const stPrevOs = i > 0 && lt(Math.min(k[i - 1], d[i - 1]), cfg.stochOs);
    const prevOk = cfg.requirePrevOS ? rsiPrevOs || stPrevOs : true;
    const strictOk = rsiPrevOs && stPrevOs;
    const score = (rsiCrossUp[i] ? 1 : 0) + (stCrossUp[i] ? 1 : 0) + (rsiPrevOs ? 1 : 0) + (stPrevOs ? 1 : 0);
    const oscOk = crossOk && (cfg.strictMode ? strictOk : prevOk) && score >= cfg.scoreThreshold;

    // if (time == anchor_time): anchor_price_detected := close (bar open time in Unix ms)
    if (b.time * 1000 === cfg.anchorTime) anchorPriceDetected = b.close;
    const finalAnchorPrice = cfg.useManualAnchorPrice ? cfg.anchorPriceManual : anchorPriceDetected;
    let projLevel = NaN;
    if (cfg.useAnchor && !isNaN(finalAnchorPrice)) projLevel = finalAnchorPrice * cfg.anchorMult;
    // near_anchor: not na(proj_level) and proj_level != 0 and |close - proj| / |proj| <= anchor_tol
    const nearAnchor = cfg.useAnchor
      ? !isNaN(projLevel) && !eq(projLevel, 0) && le(Math.abs(b.close - projLevel) / Math.abs(projLevel), cfg.anchorTol)
      : true;

    const cycleLow = oscOk && nearAnchor;
    cycleLowFlags.push(cycleLow);
    // plotshape(plot_labels and cycleLow, shape.triangleup, size.small, color.lime, location.belowbar, text = "CL")
    if (cfg.plotLabels && cycleLow) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'small', text: 'CL', textColor: '#2962FF' });
    }
    plot0.push({ time: b.time, value: cfg.useAnchor && !isNaN(projLevel) ? projLevel : NaN, color: color.gray });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    // alertcondition(cycleLow, "Cycle Low", "Cycle Low on {{ticker}} {{interval}}")
    alerts: alertStates(alertConditions, bars, [cycleLowFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cycle Low', message: 'Cycle Low on {{ticker}} {{interval}}' },
];

export const CycleLowRsiStochRsi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
