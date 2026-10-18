/**
 * Aura Trend & Candlestick Matrix
 *
 * A trend cloud between a fast and a slow EMA of the close: the trend is bullish when the fast EMA is above the slow
 * EMA, bearish when it is below (else neutral, drawn as bearish). The EMA lines, the cloud and the bar colours take
 * the trend colour. The last confirmed pivot high / low (pivotLen bars on each side) is drawn as a resistance /
 * support level. Three candlestick pattern families are marked only when they agree with the trend: hammer /
 * shooting star (shadow and body proportions of the bar range), bullish / bearish engulfing (the body wraps the
 * previous body and is 1.2 times larger) and morning / evening star (three-bar reversal).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Setup' / 'Bearish Setup', any bullish / bearish pattern
 * aligned with the trend.
 *
 * Reference: "Aura Trend & Candlestick Matrix [Pineify]" by Pineify
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Pineify
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AuraTrendCandlestickMatrixInputs {
  /** Fast EMA length */
  fastLen: number;
  /** Slow EMA length */
  slowLen: number;
  /** Colour the price bars with the trend colour */
  colorBars: boolean;
  showHams: boolean;
  showEng: boolean;
  showStars: boolean;
  /** Pivot length (bars on each side) of the support / resistance levels */
  pivotLen: number;
}

export const defaultInputs: AuraTrendCandlestickMatrixInputs = {
  fastLen: 20,
  slowLen: 50,
  colorBars: true,
  showHams: true,
  showEng: true,
  showStars: true,
  pivotLen: 10,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLen', type: 'int', title: 'Fast EMA Length', defval: 20, min: 1, group: 'Trend Cloud Settings' },
  { id: 'slowLen', type: 'int', title: 'Slow EMA Length', defval: 50, min: 1, group: 'Trend Cloud Settings' },
  { id: 'colorBars', type: 'bool', title: 'Color Candles Based on Trend', defval: true, group: 'Trend Cloud Settings' },
  { id: 'showHams', type: 'bool', title: 'Show Hammers / Shooting Stars', defval: true, group: 'Candlestick Patterns' },
  { id: 'showEng', type: 'bool', title: 'Show Engulfing Patterns', defval: true, group: 'Candlestick Patterns' },
  { id: 'showStars', type: 'bool', title: 'Show Morning / Evening Stars', defval: true, group: 'Candlestick Patterns' },
  { id: 'pivotLen', type: 'int', title: 'Pivot Detection Length', defval: 10, min: 3, group: 'Support & Resistance' },
];

const GREEN = '#089981';
const RED = '#F23645';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast Trend Line', color: GREEN, lineWidth: 2 },
  { id: 'plot1', title: 'Slow Trend Line', color: String(color.new(GREEN, 50)), lineWidth: 2 },
  { id: 'plot2', title: 'Dynamic Resistance', color: String(color.new(RED, 40)), lineWidth: 2, style: 'circles' },
  { id: 'plot3', title: 'Dynamic Support', color: String(color.new(GREEN, 40)), lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'Aura Trend & Candlestick Matrix [Pineify]',
  shortTitle: 'Aura PAT Matrix',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AuraTrendCandlestickMatrixInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // Trend cloud
  const fastEma = A(ta.ema(S(bars.map((b) => b.close)), cfg.fastLen));
  const slowEma = A(ta.ema(S(bars.map((b) => b.close)), cfg.slowLen));
  const trend = fastEma.map((f, i) => (gt(f, slowEma[i]) ? 1 : lt(f, slowEma[i]) ? -1 : 0));
  const slowGreen = String(color.new(GREEN, 50));
  const slowRed = String(color.new(RED, 50));
  const fillGreen = String(color.new(GREEN, 85));
  const fillRed = String(color.new(RED, 85));

  // Support / resistance: the last confirmed pivot high / low
  const ph = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.pivotLen, cfg.pivotLen));
  const pl = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.pivotLen, cfg.pivotLen));
  const resLevel: number[] = new Array(n);
  const supLevel: number[] = new Array(n);
  let res = NaN; // var float resLevel = na
  let sup = NaN; // var float supLevel = na
  for (let i = 0; i < n; i++) {
    if (!isNaN(ph[i])) res = ph[i];
    if (!isNaN(pl[i])) sup = pl[i];
    resLevel[i] = res;
    supLevel[i] = sup;
  }

  // Candlestick patterns
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const NaB = { open: NaN, high: NaN, low: NaN, close: NaN };
  const msGreen = String(color.new(GREEN, 20));
  const msRed = String(color.new(RED, 20));
  const bullFlags: boolean[] = [], bearFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const b1 = i >= 1 ? bars[i - 1] : NaB;
    const b2 = i >= 2 ? bars[i - 2] : NaB;
    const t = b.time;

    // barcolor(colorBars ? (trend == 1 ? GREEN : RED) : na)
    if (cfg.colorBars) barColors.push({ time: t, color: trend[i] === 1 ? GREEN : RED });

    const rc = lt(b.close, b.open);
    const gc = gt(b.close, b.open);
    const cTop = Math.max(b.open, b.close);
    const cBot = Math.min(b.open, b.close);
    const hlWidth = b.high - b.low;
    const bodWidth = cTop - cBot;

    const prevRc = lt(b1.close, b1.open);
    const prevGc = gt(b1.close, b1.open);
    const prevCTop = Math.max(b1.open, b1.close);
    const prevCBot = Math.min(b1.open, b1.close);
    const prevBodWidth = prevCTop - prevCBot;

    const hwPer = gt(hlWidth, 0) ? (b.high - cTop) / hlWidth : 0;
    const lwPer = gt(hlWidth, 0) ? (cBot - b.low) / hlWidth : 0;
    const bPer = gt(hlWidth, 0) ? bodWidth / hlWidth : 0;
    const doji = lt(bodWidth, hlWidth * 0.1);

    const hammer = gt(lwPer, bPer * 2) && lt(bPer, 0.5) && lt(hwPer, 0.15) && !doji && gc;
    const sstar = gt(hwPer, bPer * 2) && lt(bPer, 0.5) && lt(lwPer, 0.15) && !doji && rc;

    const bullEngulfing = prevRc && gc && gt(bodWidth, prevBodWidth * 1.2) && lt(cBot, prevCBot) && gt(cTop, prevCTop);
    const bearEngulfing = prevGc && rc && gt(bodWidth, prevBodWidth * 1.2) && gt(cTop, prevCTop) && lt(cBot, prevCBot);

    const prev2Rc = lt(b2.close, b2.open);
    const prev2Gc = gt(b2.close, b2.open);
    const prev2CTop = Math.max(b2.open, b2.close);
    const prev2CBot = Math.min(b2.open, b2.close);
    const mid2 = (prev2CTop + prev2CBot) / 2;

    const morningStar = prev2Rc && gc && lt(bodWidth, prevBodWidth * 0.5) && gt(cTop, prev2CTop) && gt(b.close, mid2);
    const eveningStar = prev2Gc && rc && lt(bodWidth, prevBodWidth * 0.5) && lt(cBot, prev2CBot) && lt(b.close, mid2);

    // Pattern alignment with the trend cloud
    const validBullEng = cfg.showEng && bullEngulfing && trend[i] === 1;
    const validBearEng = cfg.showEng && bearEngulfing && trend[i] === -1;
    const validHammer = cfg.showHams && hammer && trend[i] === 1;
    const validSstar = cfg.showHams && sstar && trend[i] === -1;
    const validMStar = cfg.showStars && morningStar && trend[i] === 1;
    const validEStar = cfg.showStars && eveningStar && trend[i] === -1;
    // alertcondition(valid_bull_eng or valid_hammer or valid_m_star) / (valid_bear_eng or valid_sstar or valid_e_star)
    bullFlags.push(validBullEng || validHammer || validMStar);
    bearFlags.push(validBearEng || validSstar || validEStar);
    if (cfg.showEng && bullEngulfing && trend[i] === 1) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: GREEN, size: 'small' });
    }
    if (cfg.showEng && bearEngulfing && trend[i] === -1) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: RED, size: 'small' });
    }
    if (cfg.showHams && hammer && trend[i] === 1) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'H', textColor: color.white,
        size: 'tiny' });
    }
    if (cfg.showHams && sstar && trend[i] === -1) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'S', textColor: color.white,
        size: 'tiny' });
    }
    if (cfg.showStars && morningStar && trend[i] === 1) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: msGreen, text: 'MS',
        textColor: color.white, size: 'tiny' });
    }
    if (cfg.showStars && eveningStar && trend[i] === -1) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: msRed, text: 'ES',
        textColor: color.white, size: 'tiny' });
    }
  }

  const resCol = String(color.new(RED, 40));
  const supCol = String(color.new(GREEN, 40));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(fastEma, "Fast Trend Line", color = trend == 1 ? GREEN : RED, linewidth = 2)
      plot0: bars.map((b, i) => ({ time: b.time, value: fastEma[i], color: trend[i] === 1 ? GREEN : RED })),
      // plot(slowEma, "Slow Trend Line", color = trend == 1 ? color.new(GREEN, 50) : color.new(RED, 50), linewidth = 2)
      plot1: bars.map((b, i) => ({ time: b.time, value: slowEma[i], color: trend[i] === 1 ? slowGreen : slowRed })),
      // plot(resLevel, "Dynamic Resistance", color.new(RED, 40), style = plot.style_circles, linewidth = 2)
      plot2: bars.map((b, i) => ({ time: b.time, value: resLevel[i], color: resCol })),
      // plot(supLevel, "Dynamic Support", color.new(GREEN, 40), style = plot.style_circles, linewidth = 2)
      plot3: bars.map((b, i) => ({ time: b.time, value: supLevel[i], color: supCol })),
    },
    fills: [
      // fill(p1, p2, color = trend == 1 ? color.new(GREEN, 85) : color.new(RED, 85), title = "Aura Cloud")
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Aura Cloud' },
        colors: trend.map((x) => (x === 1 ? fillGreen : fillRed)) },
    ],
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Setup', message: 'Aura Matrix: Bullish Pattern detected aligned with the Trend Cloud!' },
  { id: 'alert1', title: 'Bearish Setup', message: 'Aura Matrix: Bearish Pattern detected aligned with the Trend Cloud!' },
];

export const AuraTrendCandlestickMatrix = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
