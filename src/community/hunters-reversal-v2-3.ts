/**
 * Hunters Reversal v2.3
 *
 * Reversal signals from three criteria on prominent pivots (ta.pivothigh / ta.pivotlow, left / right bars; a pivot
 * counts when it is more than prominence * ATR(14) away from the SMA(close, 20) of the pivot bar):
 * - liquidity sweep: a bar whose high pierces the highest prominent pivot high of the last `sweepPivotLookback` bars
 *   (by min..max ATR) and closes back below it, confirmed `sweepConfirmBars` bars later when
 *   ta.highest(high, sweepConfirmBars + 1), called only on the confirmation bars, does not exceed the sweep high
 *   (mirror for lows); drawn on the sweep bar
 * - RSI divergence: a higher pivot high with a lower RSI than the previous pivot high, 15..80 bars apart (mirror)
 * - extension: a pivot high at or above ta.highest(high, extStrongPivotBars)[pivotRight], called only on the pivot
 *   bars, and more than extMinATR * ATR above the EMA (mirror)
 * A cooldown per direction filters the signals; a BIG triangle marks a signal when at least `bigTierMin` criteria
 * fired in the last `clusterWindow` bars; an X marks a move of invalATR * ATR beyond the signal bar high / low within
 * `invalBars` bars. An EMA reference line is drawn.
 * Alerts (alertcondition, `alerts` of the result): the original's 8 conditions (sweep, divergence, extension and BIG
 * per direction), true on the bar the signal is found (not moved back by the plot offsets).
 *
 * Reference: "Hunters Reversal v2.3" by d_jaeger
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, callsite, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface HuntersReversalV23Inputs {
  pivotLeft: number;
  /** Pivot right bars (confirmation delay) */
  pivotRight: number;
  /** Min pivot prominence (ATR) */
  pivotProminenceATR: number;
  /** Prominence lookback bars (SMA length) */
  pivotProminenceBars: number;
  useSweep: boolean;
  /** How far back to find the prior pivot being swept */
  sweepPivotLookback: number;
  sweepMinPenetration: number;
  sweepMaxPenetration: number;
  /** Bars after the sweep candle without a new extreme */
  sweepConfirmBars: number;
  useDiv: boolean;
  rsiLen: number;
  divLookback: number;
  divMinDistance: number;
  useExt: boolean;
  extEMALen: number;
  extMinATR: number;
  extStrongPivotBars: number;
  /** Cooldown bars (per direction) */
  cooldownBars: number;
  clusterWindow: number;
  bigTierMin: number;
  useInval: boolean;
  invalBars: number;
  invalATR: number;
  showSweep: boolean;
  showDiv: boolean;
  showExt: boolean;
  showBig: boolean;
  showEMA: boolean;
}

export const defaultInputs: HuntersReversalV23Inputs = {
  pivotLeft: 15,
  pivotRight: 5,
  pivotProminenceATR: 1.0,
  pivotProminenceBars: 20,
  useSweep: true,
  sweepPivotLookback: 100,
  sweepMinPenetration: 0.1,
  sweepMaxPenetration: 1.0,
  sweepConfirmBars: 3,
  useDiv: true,
  rsiLen: 14,
  divLookback: 80,
  divMinDistance: 15,
  useExt: true,
  extEMALen: 50,
  extMinATR: 3.0,
  extStrongPivotBars: 30,
  cooldownBars: 20,
  clusterWindow: 8,
  bigTierMin: 2,
  useInval: true,
  invalBars: 8,
  invalATR: 0.6,
  showSweep: true,
  showDiv: true,
  showExt: true,
  showBig: true,
  showEMA: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLeft', type: 'int', title: 'Pivot Left Bars', defval: 15, min: 2, group: '1. Pivot Detection' },
  { id: 'pivotRight', type: 'int', title: 'Pivot Right Bars (confirmation delay)', defval: 5, min: 1, group: '1. Pivot Detection' },
  { id: 'pivotProminenceATR', type: 'float', title: 'Min Pivot Prominence (ATR)', defval: 1.0, step: 0.1, group: '1. Pivot Detection' },
  { id: 'pivotProminenceBars', type: 'int', title: 'Prominence Lookback Bars', defval: 20, group: '1. Pivot Detection' },
  { id: 'useSweep', type: 'bool', title: 'Enable Liquidity Sweep Detection', defval: true, group: '2. Liquidity Sweep' },
  { id: 'sweepPivotLookback', type: 'int', title: 'Sweep Pivot Lookback', defval: 100, group: '2. Liquidity Sweep' },
  { id: 'sweepMinPenetration', type: 'float', title: 'Min Penetration (ATR)', defval: 0.1, step: 0.05, group: '2. Liquidity Sweep' },
  { id: 'sweepMaxPenetration', type: 'float', title: 'Max Penetration (ATR)', defval: 1.0, step: 0.1, group: '2. Liquidity Sweep' },
  { id: 'sweepConfirmBars', type: 'int', title: 'Confirm Bars (no new extreme)', defval: 3, min: 1, group: '2. Liquidity Sweep' },
  { id: 'useDiv', type: 'bool', title: 'Enable RSI Divergence', defval: true, group: '3. RSI Divergence' },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, group: '3. RSI Divergence' },
  { id: 'divLookback', type: 'int', title: 'Max Bars Back for Prior Pivot', defval: 80, group: '3. RSI Divergence' },
  { id: 'divMinDistance', type: 'int', title: 'Min Bars Between Pivots', defval: 15, group: '3. RSI Divergence' },
  { id: 'useExt', type: 'bool', title: 'Enable Pivot + Extension', defval: true, group: '4. Pivot + Extension' },
  { id: 'extEMALen', type: 'int', title: 'EMA Length', defval: 50, group: '4. Pivot + Extension' },
  { id: 'extMinATR', type: 'float', title: 'Min Distance from EMA (ATR)', defval: 3.0, step: 0.1, group: '4. Pivot + Extension' },
  { id: 'extStrongPivotBars', type: 'int', title: 'Extension: Pivot Must Be Extreme in N Bars', defval: 30, group: '4. Pivot + Extension' },
  { id: 'cooldownBars', type: 'int', title: 'Cooldown Bars (per direction)', defval: 20, min: 0, group: '5. Signal Cooldown' },
  { id: 'clusterWindow', type: 'int', title: 'Cluster Window (bars)', defval: 8, min: 1, max: 20, group: '6. Tier Classification' },
  { id: 'bigTierMin', type: 'int', title: 'Big Triangle: Min Criteria', defval: 2, min: 1, max: 3, group: '6. Tier Classification' },
  { id: 'useInval', type: 'bool', title: 'Show Invalidation Marks (X)', defval: true, group: '7. Invalidation' },
  { id: 'invalBars', type: 'int', title: 'Invalidation Window', defval: 8, group: '7. Invalidation' },
  { id: 'invalATR', type: 'float', title: 'Invalidation Distance (ATR)', defval: 0.6, step: 0.1, group: '7. Invalidation' },
  { id: 'showSweep', type: 'bool', title: 'Show Sweep Signals', defval: true, group: '8. Visual' },
  { id: 'showDiv', type: 'bool', title: 'Show Divergence Signals', defval: true, group: '8. Visual' },
  { id: 'showExt', type: 'bool', title: 'Show Extension Signals', defval: true, group: '8. Visual' },
  { id: 'showBig', type: 'bool', title: 'Show Big (cluster) Signals', defval: true, group: '8. Visual' },
  { id: 'showEMA', type: 'bool', title: 'Show EMA Reference', defval: true, group: '8. Visual' },
];

const EMA_COLOR = String(color.new(color.gray, 60));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Reference', color: EMA_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Hunters Reversal v2.3',
  shortTitle: 'HuntersRev',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bear Liquidity Sweep', message: 'HuntersRev v2.3: Bear Sweep on {{ticker}}' },
  { id: 'alert1', title: 'Bull Liquidity Sweep', message: 'HuntersRev v2.3: Bull Sweep on {{ticker}}' },
  { id: 'alert2', title: 'Bear Divergence', message: 'HuntersRev v2.3: Bear Divergence on {{ticker}}' },
  { id: 'alert3', title: 'Bull Divergence', message: 'HuntersRev v2.3: Bull Divergence on {{ticker}}' },
  { id: 'alert4', title: 'Bear Extension', message: 'HuntersRev v2.3: Bear Extension on {{ticker}}' },
  { id: 'alert5', title: 'Bull Extension', message: 'HuntersRev v2.3: Bull Extension on {{ticker}}' },
  { id: 'alert6', title: 'Bear BIG (cluster)', message: 'HuntersRev v2.3: BEAR CLUSTER on {{ticker}}' },
  { id: 'alert7', title: 'Bull BIG (cluster)', message: 'HuntersRev v2.3: BULL CLUSTER on {{ticker}}' },
];

export function calculate(
  bars: Bar[],
  inputs: Partial<HuntersReversalV23Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const pr = cfg.pivotRight;
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  const rsiVal = A(ta.rsi(S(close), cfg.rsiLen));
  const atrVal = A(ta.atr(bars, 14));
  const emaVal = A(ta.ema(S(close), cfg.extEMALen));
  const pivotHighRaw = A(ta.pivothigh(S(high), cfg.pivotLeft, pr));
  const pivotLowRaw = A(ta.pivotlow(S(low), cfg.pivotLeft, pr));
  const recentAvg = A(ta.sma(S(close), cfg.pivotProminenceBars));

  // Pivot history (var)
  let lastPivotHigh = NaN;
  let lastPivotHighBar = NaN;
  let lastPivotHighRSI = NaN;
  let prevPivotHigh = NaN;
  let prevPivotHighBar = NaN;
  let prevPivotHighRSI = NaN;
  let lastPivotLow = NaN;
  let lastPivotLowBar = NaN;
  let lastPivotLowRSI = NaN;
  let prevPivotLow = NaN;
  let prevPivotLowBar = NaN;
  let prevPivotLowRSI = NaN;
  const recentPivotHighs: number[] = [];
  const recentPivotHighBars: number[] = [];
  const recentPivotLows: number[] = [];
  const recentPivotLowBars: number[] = [];
  let pendingBearSweepHigh = NaN;
  let pendingBearSweepBar = NaN;
  let pendingBullSweepLow = NaN;
  let pendingBullSweepBar = NaN;
  let lastBearSignalBar = NaN;
  let lastBullSignalBar = NaN;
  let lastBearLevel = NaN;
  let lastBearBar = NaN;
  let lastBullLevel = NaN;
  let lastBullBar = NaN;

  // ta.highest / ta.lowest inside the sweep confirmation blocks: history kept by bar
  const maxSinceSite = callsite.highestByBar();
  const minSinceSite = callsite.lowestByBar();
  // ta.highest(high, extStrongPivotBars)[pivotRight] / ta.lowest(...)[pivotRight] inside the extension blocks:
  // the call keeps its window by bar; the [pivotRight] history of its result is read by bar, and a bar where the block
  // does not run holds the result of the last run (na before the first run)
  const strongHighSite = callsite.highestByBar();
  const strongLowSite = callsite.lowestByBar();
  const strongHighHist: number[] = new Array(n).fill(NaN);
  const strongLowHist: number[] = new Array(n).fill(NaN);
  const bs = {
    bearSweep: callsite.barssince(), bearDiv: callsite.barssince(), bearExt: callsite.barssince(),
    bullSweep: callsite.barssince(), bullDiv: callsite.barssince(), bullExt: callsite.barssince(),
  };

  const markers: MarkerData[] = [];
  const interval = barInterval(bars);
  // id: the original's plotshape output (shape0..shape9 in declaration order)
  const mark = (
    id: string, i: number, offset: number, bear: boolean, c: string, size: 'tiny' | 'small' | 'large', x = false,
  ) => {
    const j = i + offset;
    if (j < 0) return;
    markers.push({
      time: barTime(bars, j, interval), position: bear ? 'aboveBar' : 'belowBar',
      shape: x ? 'xcross' : bear ? 'triangleDown' : 'triangleUp', color: c, size, id,
    });
  };
  // alertcondition flags, in the original's order
  const flags: boolean[][] = Array.from({ length: 8 }, () => new Array(n).fill(false));
  const invalColor = String(color.new(color.maroon, 30));

  for (let i = 0; i < n; i++) {
    const h = high[i];
    const l = low[i];
    const c = close[i];
    const atr = atrVal[i];

    // Prominent pivots
    const recentAvgAtPivot = at(recentAvg, i - pr);
    const atrAtPivot = at(atrVal, i - pr);
    const phRaw = pivotHighRaw[i];
    const plRaw = pivotLowRaw[i];
    const pivotHigh = !isNaN(phRaw) && gt(phRaw - recentAvgAtPivot, atrAtPivot * cfg.pivotProminenceATR) ? phRaw : NaN;
    const pivotLow = !isNaN(plRaw) && gt(recentAvgAtPivot - plRaw, atrAtPivot * cfg.pivotProminenceATR) ? plRaw : NaN;

    if (!isNaN(pivotHigh)) {
      prevPivotHigh = lastPivotHigh;
      prevPivotHighBar = lastPivotHighBar;
      prevPivotHighRSI = lastPivotHighRSI;
      lastPivotHigh = pivotHigh;
      lastPivotHighBar = i - pr;
      lastPivotHighRSI = at(rsiVal, i - pr);
    }
    if (!isNaN(pivotLow)) {
      prevPivotLow = lastPivotLow;
      prevPivotLowBar = lastPivotLowBar;
      prevPivotLowRSI = lastPivotLowRSI;
      lastPivotLow = pivotLow;
      lastPivotLowBar = i - pr;
      lastPivotLowRSI = at(rsiVal, i - pr);
    }

    // Signal 1: liquidity sweep
    if (!isNaN(pivotHigh)) {
      recentPivotHighs.push(pivotHigh);
      recentPivotHighBars.push(i - pr);
      while (recentPivotHighBars.length > 0 && i - recentPivotHighBars[0] > cfg.sweepPivotLookback) {
        recentPivotHighs.shift();
        recentPivotHighBars.shift();
      }
    }
    if (!isNaN(pivotLow)) {
      recentPivotLows.push(pivotLow);
      recentPivotLowBars.push(i - pr);
      while (recentPivotLowBars.length > 0 && i - recentPivotLowBars[0] > cfg.sweepPivotLookback) {
        recentPivotLows.shift();
        recentPivotLowBars.shift();
      }
    }
    const priorPivotHigh = recentPivotHighs.length > 0 ? Math.max(...recentPivotHighs) : NaN;
    const priorPivotLow = recentPivotLows.length > 0 ? Math.min(...recentPivotLows) : NaN;
    const penetrationHigh = !isNaN(priorPivotHigh) ? h - priorPivotHigh : 0.0;
    const penetrationLow = !isNaN(priorPivotLow) ? priorPivotLow - l : 0.0;

    const bearSweepCandidate = cfg.useSweep && !isNaN(priorPivotHigh) && gt(h, priorPivotHigh) && lt(c, priorPivotHigh)
      && ge(penetrationHigh, atr * cfg.sweepMinPenetration) && le(penetrationHigh, atr * cfg.sweepMaxPenetration);
    const bullSweepCandidate = cfg.useSweep && !isNaN(priorPivotLow) && lt(l, priorPivotLow) && gt(c, priorPivotLow)
      && ge(penetrationLow, atr * cfg.sweepMinPenetration) && le(penetrationLow, atr * cfg.sweepMaxPenetration);

    if (bearSweepCandidate) {
      pendingBearSweepHigh = h;
      pendingBearSweepBar = i;
    }
    if (bullSweepCandidate) {
      pendingBullSweepLow = l;
      pendingBullSweepBar = i;
    }

    let bearSweep = false;
    let bullSweep = false;
    if (!isNaN(pendingBearSweepBar) && i - pendingBearSweepBar === cfg.sweepConfirmBars) {
      const maxSinceCandidate = maxSinceSite(i, h, cfg.sweepConfirmBars + 1);
      if (le(maxSinceCandidate, pendingBearSweepHigh)) bearSweep = true;
      pendingBearSweepHigh = NaN;
      pendingBearSweepBar = NaN;
    }
    if (!isNaN(pendingBullSweepBar) && i - pendingBullSweepBar === cfg.sweepConfirmBars) {
      const minSinceCandidate = minSinceSite(i, l, cfg.sweepConfirmBars + 1);
      if (ge(minSinceCandidate, pendingBullSweepLow)) bullSweep = true;
      pendingBullSweepLow = NaN;
      pendingBullSweepBar = NaN;
    }

    // Signal 2: RSI divergence
    let bearDivRaw = false;
    if (cfg.useDiv && !isNaN(pivotHigh) && !isNaN(prevPivotHigh) && !isNaN(prevPivotHighRSI)) {
      const barsApart = i - pr - prevPivotHighBar;
      if (barsApart >= cfg.divMinDistance && barsApart <= cfg.divLookback) {
        if (gt(pivotHigh, prevPivotHigh) && lt(at(rsiVal, i - pr), prevPivotHighRSI)) bearDivRaw = true;
      }
    }
    let bullDivRaw = false;
    if (cfg.useDiv && !isNaN(pivotLow) && !isNaN(prevPivotLow) && !isNaN(prevPivotLowRSI)) {
      const barsApart = i - pr - prevPivotLowBar;
      if (barsApart >= cfg.divMinDistance && barsApart <= cfg.divLookback) {
        if (lt(pivotLow, prevPivotLow) && gt(at(rsiVal, i - pr), prevPivotLowRSI)) bullDivRaw = true;
      }
    }

    // Signal 3: pivot + extension
    let bearExtRaw = false;
    let bullExtRaw = false;
    strongHighHist[i] = i > 0 ? strongHighHist[i - 1] : NaN;
    strongLowHist[i] = i > 0 ? strongLowHist[i - 1] : NaN;
    if (cfg.useExt && !isNaN(pivotHigh)) {
      const pivotBarHigh = at(high, i - pr);
      const pivotBarEMA = at(emaVal, i - pr);
      const pivotBarATR = at(atrVal, i - pr);
      strongHighHist[i] = strongHighSite(i, h, cfg.extStrongPivotBars);
      const pivotIsStrong = ge(pivotBarHigh, at(strongHighHist, i - pr));
      if (pivotIsStrong && gt(pivotBarHigh - pivotBarEMA, pivotBarATR * cfg.extMinATR)) bearExtRaw = true;
    }
    if (cfg.useExt && !isNaN(pivotLow)) {
      const pivotBarLow = at(low, i - pr);
      const pivotBarEMA = at(emaVal, i - pr);
      const pivotBarATR = at(atrVal, i - pr);
      strongLowHist[i] = strongLowSite(i, l, cfg.extStrongPivotBars);
      const pivotIsStrong = le(pivotBarLow, at(strongLowHist, i - pr));
      if (pivotIsStrong && gt(pivotBarEMA - pivotBarLow, pivotBarATR * cfg.extMinATR)) bullExtRaw = true;
    }

    // Cooldown
    const bearCooldownOk = isNaN(lastBearSignalBar) || i - lastBearSignalBar >= cfg.cooldownBars;
    const bullCooldownOk = isNaN(lastBullSignalBar) || i - lastBullSignalBar >= cfg.cooldownBars;
    const bearSweepFinal = bearSweep && bearCooldownOk;
    const bullSweepFinal = bullSweep && bullCooldownOk;
    const bearDivFinal = bearDivRaw && bearCooldownOk;
    const bullDivFinal = bullDivRaw && bullCooldownOk;
    const bearExtFinal = bearExtRaw && bearCooldownOk;
    const bullExtFinal = bullExtRaw && bullCooldownOk;
    if (bearSweepFinal || bearDivFinal || bearExtFinal) lastBearSignalBar = i;
    if (bullSweepFinal || bullDivFinal || bullExtFinal) lastBullSignalBar = i;

    // Tier classification: ta.barssince(x) <= clusterWindow (na compares false)
    const recent = (v: number) => v <= cfg.clusterWindow;
    const bearCriteriaCount = (recent(bs.bearSweep(bearSweepFinal)) ? 1 : 0)
      + (recent(bs.bearDiv(bearDivFinal)) ? 1 : 0) + (recent(bs.bearExt(bearExtFinal)) ? 1 : 0);
    const bullCriteriaCount = (recent(bs.bullSweep(bullSweepFinal)) ? 1 : 0)
      + (recent(bs.bullDiv(bullDivFinal)) ? 1 : 0) + (recent(bs.bullExt(bullExtFinal)) ? 1 : 0);
    const hasAnyBearSignal = bearSweepFinal || bearDivFinal || bearExtFinal;
    const hasAnyBullSignal = bullSweepFinal || bullDivFinal || bullExtFinal;
    const bearBig = hasAnyBearSignal && bearCriteriaCount >= cfg.bigTierMin;
    const bullBig = hasAnyBullSignal && bullCriteriaCount >= cfg.bigTierMin;

    // Invalidation
    if (hasAnyBearSignal) {
      lastBearLevel = h;
      lastBearBar = i;
    }
    if (hasAnyBullSignal) {
      lastBullLevel = l;
      lastBullBar = i;
    }
    const bearInvalidated = cfg.useInval && !isNaN(lastBearLevel) && i <= lastBearBar + cfg.invalBars
      && gt(h, lastBearLevel + atr * cfg.invalATR);
    const bullInvalidated = cfg.useInval && !isNaN(lastBullLevel) && i <= lastBullBar + cfg.invalBars
      && lt(l, lastBullLevel - atr * cfg.invalATR);
    if (bearInvalidated) lastBearLevel = NaN;
    if (bullInvalidated) lastBullLevel = NaN;

    // Plot shapes (sweeps at offset -sweepConfirmBars, divergences and extensions at offset -pivotRight)
    if (cfg.showSweep && bearSweepFinal) mark('shape0', i, -cfg.sweepConfirmBars, true, color.fuchsia, 'small');
    if (cfg.showSweep && bullSweepFinal) mark('shape1', i, -cfg.sweepConfirmBars, false, color.aqua, 'small');
    if (cfg.showDiv && bearDivFinal) mark('shape2', i, -pr, true, color.red, 'small');
    if (cfg.showDiv && bullDivFinal) mark('shape3', i, -pr, false, color.green, 'small');
    if (cfg.showExt && bearExtFinal) mark('shape4', i, -pr, true, color.orange, 'small');
    if (cfg.showExt && bullExtFinal) mark('shape5', i, -pr, false, color.lime, 'small');
    if (cfg.showBig && bearBig) mark('shape6', i, 0, true, color.red, 'large');
    if (cfg.showBig && bullBig) mark('shape7', i, 0, false, color.green, 'large');
    if (cfg.useInval && bearInvalidated) mark('shape8', i, 0, true, invalColor, 'tiny', true);
    if (cfg.useInval && bullInvalidated) mark('shape9', i, 0, false, invalColor, 'tiny', true);

    [bearSweepFinal, bullSweepFinal, bearDivFinal, bullDivFinal, bearExtFinal, bullExtFinal, bearBig, bullBig]
      .forEach((f, k) => { flags[k][i] = f; });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: cfg.showEMA ? emaVal[i] : NaN, color: EMA_COLOR })),
    },
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

export const HuntersReversalV23 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
