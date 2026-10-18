/**
 * Universal Large Orders Proxy
 *
 * Buy / sell pressure of each bar: volume * close position in the range (or 1 - position) * (1 + body / range).
 * Each pressure gets a z-score against the SMA and the standard deviation of the previous `lookback` bars. A buy
 * signal needs a z-score above `sigma`, a volume above `volMult` times the previous average volume, a range above
 * `rangeMult` times the previous average range, a bullish body of at least `bodyMin` of the range, a close near the
 * high and a small upper wick (and the close above the EMA with the trend filter); sell signals mirror it. A cooldown
 * of `cooldownBars` bars applies after a signal. Circles at (low + close) / 2 (buy) or (high + close) / 2 (sell) are
 * small, medium or large for a z-score above sigma, sigma + 1 or sigma + 2.
 * Alerts (alertcondition, `alerts` of the result): 'Large Buy Pressure' / 'Large Sell Pressure' on every buy / sell
 * signal (z-score above sigma), 'Extreme Buy Pressure' / 'Extreme Sell Pressure' above sigma + 2.
 *
 * Reference: "Universal Large Orders Proxy" by boss11233
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { taCore, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface UniversalLargeOrdersProxyInputs {
  lookback: number;
  /** Pressure z-score threshold */
  sigma: number;
  /** Minimal volume vs the average volume */
  volMult: number;
  /** Minimal range vs the average range */
  rangeMult: number;
  /** Minimal body part of the range */
  bodyMin: number;
  /** Close near the extreme (part of the range) */
  extremePct: number;
  /** Maximal opposite wick part of the range */
  wickMax: number;
  useTrend: boolean;
  emaLen: number;
  cooldownBars: number;
  buyColor: string;
  sellColor: string;
  showBuys: boolean;
  showSells: boolean;
  showEMA: boolean;
}

export const defaultInputs: UniversalLargeOrdersProxyInputs = {
  lookback: 30,
  sigma: 2.3,
  volMult: 1.35,
  rangeMult: 1.15,
  bodyMin: 0.45,
  extremePct: 0.8,
  wickMax: 0.35,
  useTrend: false,
  emaLen: 50,
  cooldownBars: 1,
  buyColor: 'rgba(0, 230, 118, 0.65)',
  sellColor: 'rgba(242, 54, 69, 0.65)',
  showBuys: true,
  showSells: true,
  showEMA: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback', defval: 30, min: 10, max: 200 },
  { id: 'sigma', type: 'float', title: 'Pressure Sigma', defval: 2.3, min: 0.5, step: 0.1 },
  { id: 'volMult', type: 'float', title: 'Min Volume vs Average', defval: 1.35, min: 1.0, step: 0.05 },
  { id: 'rangeMult', type: 'float', title: 'Min Range vs Average', defval: 1.15, min: 1.0, step: 0.05 },
  { id: 'bodyMin', type: 'float', title: 'Min Body % of Range', defval: 0.45, min: 0.1, max: 1.0, step: 0.05 },
  { id: 'extremePct', type: 'float', title: 'Close Near Extreme %', defval: 0.8, min: 0.5, max: 1.0, step: 0.05 },
  { id: 'wickMax', type: 'float', title: 'Max Opposite Wick %', defval: 0.35, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'useTrend', type: 'bool', title: 'Use Trend Filter', defval: false },
  { id: 'emaLen', type: 'int', title: 'Trend EMA Length', defval: 50, min: 1 },
  { id: 'cooldownBars', type: 'int', title: 'Signal Cooldown Bars', defval: 1, min: 0, max: 20 },
  { id: 'buyColor', type: 'color', title: 'Buy Circle', defval: 'rgba(0, 230, 118, 0.65)' },
  { id: 'sellColor', type: 'color', title: 'Sell Circle', defval: 'rgba(242, 54, 69, 0.65)' },
  { id: 'showBuys', type: 'bool', title: 'Show Buy Signals', defval: true },
  { id: 'showSells', type: 'bool', title: 'Show Sell Signals', defval: true },
  { id: 'showEMA', type: 'bool', title: 'Show EMA', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA', color: String(color.new(color.yellow, 0)), lineWidth: 1 },
];

export const metadata = {
  title: 'Universal Large Orders Proxy',
  shortTitle: 'Large Orders Final',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<UniversalLargeOrdersProxyInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lb = cfg.lookback;
  const na = (v: number | null | undefined) => (v === null || v === undefined ? NaN : v);

  // Core candle stats
  const rng = bars.map((b) => b.high - b.low);
  const bodyPct: number[] = new Array(n);
  const upperWick: number[] = new Array(n);
  const lowerWick: number[] = new Array(n);
  const closePos: number[] = new Array(n);
  const buyPressure: number[] = new Array(n);
  const sellPressure: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const r = rng[i];
    const zero = eq(r, 0.0);
    const body = Math.abs(b.close - b.open);
    bodyPct[i] = zero ? 0.0 : body / r;
    upperWick[i] = zero ? 0.0 : (b.high - Math.max(b.open, b.close)) / r;
    lowerWick[i] = zero ? 0.0 : (Math.min(b.open, b.close) - b.low) / r;
    closePos[i] = zero ? 0.5 : (b.close - b.low) / r;
    const rangeBoost = zero ? 0.0 : 1.0 + bodyPct[i];
    const vol = b.volume ?? NaN;
    buyPressure[i] = zero ? 0.0 : vol * closePos[i] * rangeBoost;
    sellPressure[i] = zero ? 0.0 : vol * (1.0 - closePos[i]) * rangeBoost;
  }

  // ta.*(x, lookback)[1]
  const prev = (a: Array<number | null>) => a.map((_v, i) => (i > 0 ? na(a[i - 1]) : NaN));
  const avgBuy = prev(taCore.sma(buyPressure, lb));
  const stdBuy = prev(taCore.stdev(buyPressure, lb));
  const avgSell = prev(taCore.sma(sellPressure, lb));
  const stdSell = prev(taCore.stdev(sellPressure, lb));
  const volume = bars.map((b) => b.volume ?? NaN);
  const avgVol = prev(taCore.sma(volume, lb));
  const avgRange = prev(taCore.sma(rng, lb));
  const ema = taCore.ema(bars.map((b) => b.close), cfg.emaLen).map(na);

  const markers: MarkerData[] = [];
  const plot0 = [];
  const emaColor = String(color.new(color.yellow, 0));
  let lastBuyBar = NaN;
  let lastSellBar = NaN;
  const flags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // A plain division: x / 0 is +-infinity (0 / 0 NaN); stdBuy == 0.0 is the Pine guard
    const buyZ = eq(stdBuy[i], 0.0) ? 0.0 : (buyPressure[i] - avgBuy[i]) / stdBuy[i];
    const sellZ = eq(stdSell[i], 0.0) ? 0.0 : (sellPressure[i] - avgSell[i]) / stdSell[i];
    const highVol = gt(volume[i], avgVol[i] * cfg.volMult);
    const wideRange = gt(rng[i], avgRange[i] * cfg.rangeMult);
    const closeNearHigh = ge(closePos[i], cfg.extremePct);
    const closeNearLow = le(closePos[i], 1.0 - cfg.extremePct);
    const goodBullShape = gt(b.close, b.open) && ge(bodyPct[i], cfg.bodyMin) && closeNearHigh
      && le(upperWick[i], cfg.wickMax);
    const goodBearShape = lt(b.close, b.open) && ge(bodyPct[i], cfg.bodyMin) && closeNearLow
      && le(lowerWick[i], cfg.wickMax);
    const bullTrendOk = !cfg.useTrend || gt(b.close, ema[i]);
    const bearTrendOk = !cfg.useTrend || lt(b.close, ema[i]);

    const buyBase = cfg.showBuys && highVol && wideRange && goodBullShape && bullTrendOk;
    const sellBase = cfg.showSells && highVol && wideRange && goodBearShape && bearTrendOk;
    const rawBuy1 = buyBase && gt(buyZ, cfg.sigma);
    const rawBuy2 = buyBase && gt(buyZ, cfg.sigma + 1.0);
    const rawBuy3 = buyBase && gt(buyZ, cfg.sigma + 2.0);
    const rawSell1 = sellBase && gt(sellZ, cfg.sigma);
    const rawSell2 = sellBase && gt(sellZ, cfg.sigma + 1.0);
    const rawSell3 = sellBase && gt(sellZ, cfg.sigma + 2.0);

    // Cooldown filter (integer bar counts)
    const buyCooldownOk = isNaN(lastBuyBar) || i - lastBuyBar > cfg.cooldownBars;
    const sellCooldownOk = isNaN(lastSellBar) || i - lastSellBar > cfg.cooldownBars;
    const buy1 = rawBuy1 && buyCooldownOk;
    const buy2 = rawBuy2 && buyCooldownOk;
    const buy3 = rawBuy3 && buyCooldownOk;
    const sell1 = rawSell1 && sellCooldownOk;
    const sell2 = rawSell2 && sellCooldownOk;
    const sell3 = rawSell3 && sellCooldownOk;
    if (buy1 || buy2 || buy3) lastBuyBar = i;
    if (sell1 || sell2 || sell3) lastSellBar = i;
    flags[0].push(buy1);
    flags[1].push(sell1);
    flags[2].push(buy3);
    flags[3].push(sell3);

    // math.avg(low, close) / math.avg(high, close); plotshape(..., shape.circle, location.absolute)
    const buyPos = (b.low + b.close) / 2;
    const sellPos = (b.high + b.close) / 2;
    const circle = (price: number, c: string, size: 'small' | 'normal' | 'large', id: string) => {
      if (!isNaN(price)) markers.push({ time: b.time, position: 'atPriceMiddle', price, shape: 'circle', color: c, size, id });
    };
    if (buy1 && !buy2) circle(buyPos, cfg.buyColor, 'small', 'shape0');
    if (buy2 && !buy3) circle(buyPos, cfg.buyColor, 'normal', 'shape1');
    if (buy3) circle(buyPos, cfg.buyColor, 'large', 'shape2');
    if (sell1 && !sell2) circle(sellPos, cfg.sellColor, 'small', 'shape3');
    if (sell2 && !sell3) circle(sellPos, cfg.sellColor, 'normal', 'shape4');
    if (sell3) circle(sellPos, cfg.sellColor, 'large', 'shape5');

    plot0.push({ time: b.time, value: cfg.showEMA ? ema[i] : NaN, color: emaColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    // alertcondition(buy1) / (sell1) / (buy3) / (sell3)
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Large Buy Pressure', message: 'Large buy pressure detected' },
  { id: 'alert1', title: 'Large Sell Pressure', message: 'Large sell pressure detected' },
  { id: 'alert2', title: 'Extreme Buy Pressure', message: 'Extreme buy pressure detected' },
  { id: 'alert3', title: 'Extreme Sell Pressure', message: 'Extreme sell pressure detected' },
];

export const UniversalLargeOrdersProxy = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
