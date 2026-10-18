/**
 * Absorption Arrows v2
 *
 * Volume absorption in the wicks. The volume of each bar is compared with its percentiles (linear interpolation) over
 * a short, a medium and a long window, at three levels (Small / Medium / Big). A level is reached when the consensus
 * mode is met (any window, 2 of 3, or all 3). The bar gets the highest level only. When the middle of the bar range
 * is in the upper wick (selling absorption), a down arrow is drawn ATR(atrLen) * atrMult above the high; when it is
 * in the lower wick (buying absorption), an up arrow is drawn the same distance below the low. Arrow size follows
 * the level (small / normal / large). Bars whose middle is inside the body and whose volume reaches Medium or Big are
 * coloured green (bullish bar) or light red (bearish bar).
 *
 * Alerts (alertcondition, `alerts` of the result), on confirmed bars (every bar but the last one, unless the chart
 * context says the last bar is closed): 'Buying Absorption' (an up arrow), 'Selling Absorption' (a down arrow),
 * 'Absorption (Any)' (either) and 'Big Absorption Only' (a large arrow).
 *
 * Reference: "Absorption Arrows v2" by WaveWalker1
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface AbsorptionArrowsV2Inputs {
  /** Selling absorption only on bull bars, buying absorption only on bear bars */
  filterDir: boolean;
  smallPct: number;
  mediumPct: number;
  bigPct: number;
  consensusMode: 'Any Window' | 'Majority (2 of 3)' | 'All Windows (strictest)';
  shortLen: number;
  midLen: number;
  longLen: number;
  showSmall: boolean;
  showMedium: boolean;
  showBig: boolean;
  arrowUpColor: string;
  arrowDnColor: string;
  colorBars: boolean;
  atrLen: number;
  atrMult: number;
}

export const defaultInputs: AbsorptionArrowsV2Inputs = {
  filterDir: false,
  smallPct: 75,
  mediumPct: 90,
  bigPct: 97,
  consensusMode: 'Majority (2 of 3)',
  shortLen: 20,
  midLen: 50,
  longLen: 100,
  showSmall: true,
  showMedium: true,
  showBig: true,
  arrowUpColor: String(color.rgb(0, 255, 100)),
  arrowDnColor: String(color.rgb(255, 60, 60)),
  colorBars: true,
  atrLen: 14,
  atrMult: 0.3,
};

export const inputConfig: InputConfig[] = [
  { id: 'filterDir', type: 'bool', title: 'Filter by bar direction?', defval: false },
  { id: 'smallPct', type: 'float', title: 'Small Cluster Percentile', defval: 75, min: 50, max: 99, step: 1 },
  { id: 'mediumPct', type: 'float', title: 'Medium Cluster Percentile', defval: 90, min: 50, max: 99, step: 1 },
  { id: 'bigPct', type: 'float', title: 'Big Cluster Percentile', defval: 97, min: 50, max: 99, step: 1 },
  { id: 'consensusMode', type: 'string', title: 'Consensus Mode', defval: 'Majority (2 of 3)',
    options: ['Any Window', 'Majority (2 of 3)', 'All Windows (strictest)'] },
  { id: 'shortLen', type: 'int', title: 'Short Window', defval: 20, min: 5 },
  { id: 'midLen', type: 'int', title: 'Medium Window', defval: 50, min: 10 },
  { id: 'longLen', type: 'int', title: 'Long Window', defval: 100, min: 20 },
  { id: 'showSmall', type: 'bool', title: 'Show Small Arrows', defval: true },
  { id: 'showMedium', type: 'bool', title: 'Show Medium Arrows', defval: true },
  { id: 'showBig', type: 'bool', title: 'Show Big Arrows', defval: true },
  { id: 'arrowUpColor', type: 'color', title: 'Buy Arrow Color', defval: String(color.rgb(0, 255, 100)) },
  { id: 'arrowDnColor', type: 'color', title: 'Sell Arrow Color', defval: String(color.rgb(255, 60, 60)) },
  { id: 'colorBars', type: 'bool', title: 'Color Bars on Heavy Volume Body', defval: true },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 0.3, min: 0.1, step: 0.1 },
];

// No plot(): the outputs are plotshape markers and bar colours
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Absorption Arrows v2',
  shortTitle: 'Absorption Arrows v2',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<AbsorptionArrowsV2Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const volume = new Series(bars, (b) => b.volume ?? NaN);
  const pct = (len: number, p: number) => ta.percentile_linear_interpolation(volume, len, p).toArray();
  const vSmallS = pct(cfg.shortLen, cfg.smallPct);
  const vSmallM = pct(cfg.midLen, cfg.smallPct);
  const vSmallL = pct(cfg.longLen, cfg.smallPct);
  const vMedS = pct(cfg.shortLen, cfg.mediumPct);
  const vMedM = pct(cfg.midLen, cfg.mediumPct);
  const vMedL = pct(cfg.longLen, cfg.mediumPct);
  const vBigS = pct(cfg.shortLen, cfg.bigPct);
  const vBigM = pct(cfg.midLen, cfg.bigPct);
  const vBigL = pct(cfg.longLen, cfg.bigPct);
  const atr = ta.atr(bars, cfg.atrLen).toArray();

  const need = cfg.consensusMode === 'Any Window' ? 1 : cfg.consensusMode === 'Majority (2 of 3)' ? 2 : 3;
  const consensus = (pS: boolean, pM: boolean, pL: boolean) => (pS ? 1 : 0) + (pM ? 1 : 0) + (pL ? 1 : 0) >= need;

  const upColor = cfg.arrowUpColor;
  const dnColor = cfg.arrowDnColor;
  const bullBarColor = String(color.rgb(0, 255, 0));
  const bearBarColor = String(color.rgb(255, 132, 132));
  const sizes = ['small', 'normal', 'large'] as const;

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastConfirmed = lastBarConfirmedOf(chart);
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], anyFlags: boolean[] = [], bigFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const v = b.volume ?? NaN;
    const topBody = Math.max(b.open, b.close);
    const lowBody = Math.min(b.open, b.close);
    const midPrice = (b.high + b.low) / 2;
    const bullBar = gt(b.close, b.open);
    const bearBar = lt(b.close, b.open);
    const upperWick = ge(midPrice, topBody) && le(midPrice, b.high);
    const lowerWick = le(midPrice, lowBody) && ge(midPrice, b.low);

    const val = (a: (number | null | undefined)[]) => a[i] ?? NaN;
    const isBig = consensus(ge(v, val(vBigS)), ge(v, val(vBigM)), ge(v, val(vBigL)));
    const isMed = !isBig && consensus(ge(v, val(vMedS)), ge(v, val(vMedM)), ge(v, val(vMedL)));
    const isSmall = !isBig && !isMed && consensus(ge(v, val(vSmallS)), ge(v, val(vSmallM)), ge(v, val(vSmallL)));

    const validSell = upperWick && (cfg.filterDir ? bullBar : true);
    const validBuy = lowerWick && (cfg.filterDir ? bearBar : true);
    const sell = [isSmall && validSell && cfg.showSmall, isMed && validSell && cfg.showMedium, isBig && validSell && cfg.showBig];
    const buy = [isSmall && validBuy && cfg.showSmall, isMed && validBuy && cfg.showMedium, isBig && validBuy && cfg.showBig];

    // alertcondition((sigBuy... ) and barstate.isconfirmed, ...) in the original's order
    const confirmed = i < n - 1 || lastConfirmed;
    const anyBuy = buy[0] || buy[1] || buy[2];
    const anySell = sell[0] || sell[1] || sell[2];
    buyFlags.push(anyBuy && confirmed);
    sellFlags.push(anySell && confirmed);
    anyFlags.push((anyBuy || anySell) && confirmed);
    bigFlags.push((buy[2] || sell[2]) && confirmed);

    const atrOffset = val(atr) * cfg.atrMult;
    // plotshape(sig ? high + atrOffset : na, "", shape.arrowdown, location.absolute, arrowDnColor, size = ...)
    const sellPrice = b.high + atrOffset;
    const buyPrice = b.low - atrOffset;
    for (let k = 0; k < 3; k++) {
      if (sell[k] && Number.isFinite(sellPrice)) {
        markers.push({ time: b.time, position: 'atPriceMiddle', price: sellPrice, shape: 'arrowDown', color: dnColor,
          size: sizes[k], id: `shape${k}` });
      }
    }
    for (let k = 0; k < 3; k++) {
      if (buy[k] && Number.isFinite(buyPrice)) {
        markers.push({ time: b.time, position: 'atPriceMiddle', price: buyPrice, shape: 'arrowUp', color: upColor,
          size: sizes[k], id: `shape${k + 3}` });
      }
    }

    const insideBody = gt(midPrice, lowBody) && lt(midPrice, topBody);
    const heavyVolBody = isBig || isMed;
    // Two barcolor calls; the conditions exclude each other (bull bar / bear bar)
    if (cfg.colorBars && insideBody && heavyVolBody && bearBar) barColors.push({ time: b.time, color: bearBarColor });
    else if (cfg.colorBars && insideBody && heavyVolBody && bullBar) barColors.push({ time: b.time, color: bullBarColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, anyFlags, bigFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buying Absorption', message: 'Absorption Arrows v2: Buying absorption detected' },
  { id: 'alert1', title: 'Selling Absorption', message: 'Absorption Arrows v2: Selling absorption detected' },
  { id: 'alert2', title: 'Absorption (Any)', message: 'Absorption Arrows v2: Absorption event detected' },
  { id: 'alert3', title: 'Big Absorption Only', message: 'Absorption Arrows v2: HIGH CONVICTION absorption event detected' },
];

export const AbsorptionArrowsV2 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
