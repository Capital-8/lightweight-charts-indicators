/**
 * Big Trades Bubbles, Absorptions and Deep Pressure
 *
 * Buy and sell pressure proxies from the close location in the bar range times the volume:
 * buy = (close - low) / range * volume, sell = (high - close) / range * volume. A proxy is an anomaly when its
 * z-score against the SMA / standard deviation of the previous `lookback` bars is above the sigma threshold.
 * Anomalies with a close in the upper (buy) or lower (sell) part of the bar and a large enough body give bubbles,
 * in three sizes by the z-score. Anomalies with a small body and a close that fights the direction give absorption
 * diamonds. Deep pressure dots mark bars where the SMA and the EMA of the net pressure (buy - sell) agree with the
 * close location.
 * Alerts (alertcondition, `alerts` of the result): big buy / sell, bull / bear absorption, deep buy / sell pressure.
 *
 * Reference: "Real-Time Big Trades Bubbles & Absorbtions & Deep Pressure" by samet_lezki
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © samet_lezki
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PineSize } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface BigTradesBubblesInputs {
  /** Lookback of the proxy SMA / standard deviation (previous bars) */
  lookback: number;
  /** Base sigma threshold of the z-score */
  sigmaBase: number;
  /** Show the small (weak) bubbles */
  showWeak: boolean;
  buyColor: string;
  sellColor: string;
  /** Bubble position: 'Inside Candle' or 'Above/Below Candle' */
  posMode: 'Inside Candle' | 'Above/Below Candle';
  /** Minimum body / range of a bubble bar */
  minBodyRatio: number;
  /** Require volume > the average volume of the previous `lookback` bars */
  useVolFilter: boolean;
  showAbsorption: boolean;
  /** Maximum body / range of an absorption bar */
  absBodyMax: number;
  absBuyColor: string;
  absSellColor: string;
  showDeepPressure: boolean;
  /** SMA length of the net pressure */
  dpLen: number;
  /** EMA length of the net pressure */
  dpEmaLen: number;
  dpBuyColor: string;
  dpSellColor: string;
}

const BUY_COLOR = String(color.new(color.lime, 51));
const SELL_COLOR = String(color.new(color.red, 51));
const ABS_BUY_COLOR = String(color.new(color.aqua, 0));
const ABS_SELL_COLOR = String(color.new(color.orange, 0));
const DP_BUY_COLOR = String(color.new(color.green, 0));
const DP_SELL_COLOR = String(color.new(color.maroon, 0));

export const defaultInputs: BigTradesBubblesInputs = {
  lookback: 2,
  sigmaBase: 1.5,
  showWeak: true,
  buyColor: BUY_COLOR,
  sellColor: SELL_COLOR,
  posMode: 'Inside Candle',
  minBodyRatio: 0.15,
  useVolFilter: false,
  showAbsorption: true,
  absBodyMax: 0.55,
  absBuyColor: ABS_BUY_COLOR,
  absSellColor: ABS_SELL_COLOR,
  showDeepPressure: true,
  dpLen: 10,
  dpEmaLen: 20,
  dpBuyColor: DP_BUY_COLOR,
  dpSellColor: DP_SELL_COLOR,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookback', type: 'int', title: 'Lookback', defval: 2, min: 1 },
  { id: 'sigmaBase', type: 'float', title: 'Base Sigma Threshold', defval: 1.5, min: 0.5, step: 0.1 },
  { id: 'showWeak', type: 'bool', title: 'Show Weak Signals', defval: true },
  { id: 'buyColor', type: 'color', title: 'Buy Bubble', defval: BUY_COLOR },
  { id: 'sellColor', type: 'color', title: 'Sell Bubble', defval: SELL_COLOR },
  { id: 'posMode', type: 'string', title: 'Bubble Position', defval: 'Inside Candle', options: ['Inside Candle', 'Above/Below Candle'] },
  { id: 'minBodyRatio', type: 'float', title: 'Min Body/Range Filter', defval: 0.15, min: 0.0, max: 1.0, step: 0.01 },
  { id: 'useVolFilter', type: 'bool', title: 'Require Volume > Average', defval: false },
  { id: 'showAbsorption', type: 'bool', title: 'Show Absorption Bars', defval: true },
  { id: 'absBodyMax', type: 'float', title: 'Max Body/Range For Absorption', defval: 0.55, min: 0.05, max: 1.0, step: 0.01 },
  { id: 'absBuyColor', type: 'color', title: 'Bull Absorption Color', defval: ABS_BUY_COLOR },
  { id: 'absSellColor', type: 'color', title: 'Bear Absorption Color', defval: ABS_SELL_COLOR },
  { id: 'showDeepPressure', type: 'bool', title: 'Show Deep Pressure', defval: true },
  { id: 'dpLen', type: 'int', title: 'Deep Pressure Length', defval: 10, min: 2, max: 20 },
  { id: 'dpEmaLen', type: 'int', title: 'Pressure EMA Length', defval: 20, min: 1, max: 20 },
  { id: 'dpBuyColor', type: 'color', title: 'Deep Buy Color', defval: DP_BUY_COLOR },
  { id: 'dpSellColor', type: 'color', title: 'Deep Sell Color', defval: DP_SELL_COLOR },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Close', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Real-Time Big Trades Bubbles & Absorbtions & Deep Pressure',
  shortTitle: 'BigTrades & Absorption & Presure',
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
  inputs: Partial<BigTradesBubblesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);

  // Base calculations
  const rng = bars.map((b) => b.high - b.low);
  const bodyRatio = bars.map((b, i) => (gt(rng[i], 0) ? Math.abs(b.close - b.open) / rng[i] : 0.0));
  const closeLoc = bars.map((b, i) => (gt(rng[i], 0) ? (b.close - b.low) / rng[i] : 0.5));
  const volume = bars.map((b) => b.volume ?? NaN);
  const buyProxy = bars.map((b, i) => (gt(rng[i], 0) ? ((b.close - b.low) / rng[i]) * volume[i] : 0.0));
  const sellProxy = bars.map((b, i) => (gt(rng[i], 0) ? ((b.high - b.close) / rng[i]) * volume[i] : 0.0));
  const netPressure = buyProxy.map((v, i) => v - sellProxy[i]);

  // ta.sma / ta.stdev of the proxies and ta.sma(volume) of the previous bars ([1])
  const smaBuy = A(ta.sma(S(buyProxy), cfg.lookback));
  const sdBuy = A(ta.stdev(S(buyProxy), cfg.lookback));
  const smaSell = A(ta.sma(S(sellProxy), cfg.lookback));
  const sdSell = A(ta.stdev(S(sellProxy), cfg.lookback));
  const smaVol = A(ta.sma(S(volume), cfg.lookback));

  const atrVal = A(ta.atr(bars, 14));
  const pressureMean = A(ta.sma(S(netPressure), cfg.dpLen));
  const pressureEma = A(ta.ema(S(netPressure), cfg.dpEmaLen));

  const markers: MarkerData[] = [];
  const flags: boolean[][] = [[], [], [], [], [], []];
  // id: the plotshape output (shape0..9 in the original's order)
  const shape = (id: string, time: number, price: number, s: 'circle' | 'diamond', c: string, size: PineSize) => {
    // plotshape(cond ? y : na, location = location.absolute): nothing drawn when y is na
    if (!isNaN(price)) markers.push({ id, time, position: 'atPriceMiddle', price, shape: s, color: c, size });
  };
  const inside = cfg.posMode === 'Inside Candle';
  const strong = cfg.sigmaBase + 1.5;
  const large = cfg.sigmaBase + 3.0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const avgBuy = prev(smaBuy, i);
    const stdBuy = prev(sdBuy, i);
    const avgSell = prev(smaSell, i);
    const stdSell = prev(sdSell, i);
    const avgVol = prev(smaVol, i);

    const buyZ = !isNaN(stdBuy) && gt(stdBuy, 0) ? (buyProxy[i] - avgBuy) / stdBuy : 0.0;
    const sellZ = !isNaN(stdSell) && gt(stdSell, 0) ? (sellProxy[i] - avgSell) / stdSell : 0.0;
    const buyAnomaly = gt(buyZ, cfg.sigmaBase);
    const sellAnomaly = gt(sellZ, cfg.sigmaBase);

    const buyQuality = gt(closeLoc[i], 0.55) && ge(bodyRatio[i], cfg.minBodyRatio);
    const sellQuality = lt(closeLoc[i], 0.45) && ge(bodyRatio[i], cfg.minBodyRatio);
    const volPass = !cfg.useVolFilter || gt(volume[i], avgVol);

    const finalBuy = buyAnomaly && buyQuality && volPass;
    const finalSell = sellAnomaly && sellQuality && volPass;
    const buyPlot = finalBuy && (cfg.showWeak || gt(buyZ, strong));
    const sellPlot = finalSell && (cfg.showWeak || gt(sellZ, strong));

    // Positioning
    const buyY = inside ? (b.low + b.close) / 2 : b.low - atrVal[i] * 0.15;
    const sellY = inside ? (b.high + b.close) / 2 : b.high + atrVal[i] * 0.15;

    // Size buckets
    const buySmall = buyPlot && le(buyZ, strong);
    const buyMedium = finalBuy && gt(buyZ, strong) && le(buyZ, large);
    const buyLarge = finalBuy && gt(buyZ, large);
    const sellSmall = sellPlot && le(sellZ, strong);
    const sellMedium = finalSell && gt(sellZ, strong) && le(sellZ, large);
    const sellLarge = finalSell && gt(sellZ, large);

    // Absorption
    const bullAbsorption = cfg.showAbsorption && buyAnomaly && volPass && le(bodyRatio[i], cfg.absBodyMax)
      && lt(closeLoc[i], 0.70);
    const bearAbsorption = cfg.showAbsorption && sellAnomaly && volPass && le(bodyRatio[i], cfg.absBodyMax)
      && gt(closeLoc[i], 0.30);

    // Deep pressure
    const deepBuy = cfg.showDeepPressure && gt(pressureMean[i], 0) && gt(pressureEma[i], 0) && gt(closeLoc[i], 0.45)
      && !finalSell;
    const deepSell = cfg.showDeepPressure && lt(pressureMean[i], 0) && lt(pressureEma[i], 0) && lt(closeLoc[i], 0.55)
      && !finalBuy;

    // Pine plotshape order: buy small / medium / large, sell small / medium / large, absorptions, deep pressure
    if (buySmall) shape('shape0', t, buyY, 'circle', cfg.buyColor, 'small');
    if (buyMedium) shape('shape1', t, buyY, 'circle', cfg.buyColor, 'normal');
    if (buyLarge) shape('shape2', t, buyY, 'circle', cfg.buyColor, 'large');
    if (sellSmall) shape('shape3', t, sellY, 'circle', cfg.sellColor, 'small');
    if (sellMedium) shape('shape4', t, sellY, 'circle', cfg.sellColor, 'normal');
    if (sellLarge) shape('shape5', t, sellY, 'circle', cfg.sellColor, 'large');
    if (bullAbsorption) shape('shape6', t, b.low - atrVal[i] * 0.08, 'diamond', cfg.absBuyColor, 'tiny');
    if (bearAbsorption) shape('shape7', t, b.high + atrVal[i] * 0.08, 'diamond', cfg.absSellColor, 'tiny');
    if (deepBuy) shape('shape8', t, b.low - atrVal[i] * 0.03, 'circle', cfg.dpBuyColor, 'tiny');
    if (deepSell) shape('shape9', t, b.high + atrVal[i] * 0.03, 'circle', cfg.dpSellColor, 'tiny');
    // alertcondition(finalBuy / finalSell / bullAbsorption / bearAbsorption / deepBuyPressure / deepSellPressure)
    [finalBuy, finalSell, bullAbsorption, bearAbsorption, deepBuy, deepSell].forEach((f, k) => flags[k].push(f));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(close)
      plot0: bars.map((b) => ({ time: b.time, value: b.close, color: '#2962FF' })),
    },
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Big Buy', message: 'Big Buy pressure detected' },
  { id: 'alert1', title: 'Big Sell', message: 'Big Sell pressure detected' },
  { id: 'alert2', title: 'Bull Absorption', message: 'Bull absorption detected' },
  { id: 'alert3', title: 'Bear Absorption', message: 'Bear absorption detected' },
  { id: 'alert4', title: 'Deep Buy Pressure', message: 'Deep buy pressure detected' },
  { id: 'alert5', title: 'Deep Sell Pressure', message: 'Deep sell pressure detected' },
];

export const BigTradesBubbles = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
