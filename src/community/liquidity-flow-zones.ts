/**
 * Liquidity Flow Zones (LFZ)
 *
 * The last confirmed swing high (pivot high of `pivotLen` bars on each side) is the buy side liquidity level, the
 * last swing low the sell side liquidity level. A bearish sweep is a bar whose high goes above the last swing high
 * by more than atrMult * ATR and that closes back below it; a bullish sweep is a bar whose low goes below the last
 * swing low by more than atrMult * ATR and that closes back above it. Sweeps give BUY / SELL triangles and a green /
 * red background.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Liquidity Sweep' and 'Bearish Liquidity Sweep' on the
 * sweep bars.
 *
 * Reference: "Liquidity Flow Zones (LFZ)" by ReubenMiles
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ExpertTraderASK
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LiquidityFlowZonesInputs {
  /** Pivot length on each side of a swing */
  pivotLen: number;
  /** ATR length */
  atrLen: number;
  /** Sweep filter in ATR */
  atrMult: number;
  /** Show the liquidity levels */
  showZones: boolean;
}

export const defaultInputs: LiquidityFlowZonesInputs = {
  pivotLen: 5,
  atrLen: 14,
  atrMult: 0.2,
  showZones: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Swing Length', defval: 5, min: 2 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrMult', type: 'float', title: 'Sweep Filter (ATR)', defval: 0.2, step: 0.05 },
  { id: 'showZones', type: 'bool', title: 'Show Liquidity Levels', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Buy Side Liquidity', color: color.red, lineWidth: 2, style: 'linebr' },
  { id: 'plot1', title: 'Sell Side Liquidity', color: color.lime, lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'Liquidity Flow Zones (LFZ)',
  shortTitle: 'Liquidity Flow Zones (LFZ)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Pine default plotshape text colour */
const PINE_TEXT = '#2962FF';

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityFlowZonesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const atr = A(ta.atr(bars, cfg.atrLen));
  const ph = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.pivotLen, cfg.pivotLen));
  const pl = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.pivotLen, cfg.pivotLen));

  const bullBg = String(color.new(color.green, 90));
  const bearBg = String(color.new(color.red, 90));
  const plot0 = [];
  const plot1 = [];
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  let lastHigh = NaN; // var float lastHigh = na
  let lastLow = NaN;
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    if (!isNaN(ph[i])) lastHigh = ph[i];
    if (!isNaN(pl[i])) lastLow = pl[i];
    plot0.push({ time, value: cfg.showZones ? lastHigh : NaN, color: color.red });
    plot1.push({ time, value: cfg.showZones ? lastLow : NaN, color: color.lime });

    const bearSweep = !isNaN(lastHigh) && gt(b.high, lastHigh + atr[i] * cfg.atrMult) && lt(b.close, lastHigh);
    const bullSweep = !isNaN(lastLow) && lt(b.low, lastLow - atr[i] * cfg.atrMult) && gt(b.close, lastLow);
    bullFlags.push(bullSweep);
    bearFlags.push(bearSweep);
    if (bullSweep) {
      markers.push({ time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'small', text: 'BUY',
        textColor: PINE_TEXT });
    }
    if (bearSweep) {
      markers.push({ time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small', text: 'SELL',
        textColor: PINE_TEXT });
    }
    if (bullSweep) bgColors.push({ time, color: bullBg });
    else if (bearSweep) bgColors.push({ time, color: bearBg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    bgColors,
    // alertcondition(bullSweep, "Bullish Liquidity Sweep") / alertcondition(bearSweep, "Bearish Liquidity Sweep")
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Liquidity Sweep', message: 'Bullish Liquidity Sweep detected' },
  { id: 'alert1', title: 'Bearish Liquidity Sweep', message: 'Bearish Liquidity Sweep detected' },
];

export const LiquidityFlowZones = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
