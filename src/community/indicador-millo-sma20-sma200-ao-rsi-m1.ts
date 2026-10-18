/**
 * Crypto M1 - SMA20 SMA200 RSI50 AO confirm (cooldown)
 *
 * Draws the fast SMA (20) and the slow SMA (200) of the close. A BUY label: the close is above the slow SMA, the close
 * crossed over the fast SMA at most `confirmBarsAO` bars ago, the Awesome Oscillator (SMA(hl2, 5) - SMA(hl2, 34))
 * crosses over 0 on this bar, the RSI is above the threshold and at least `cooldownBars` bars passed since the last
 * BUY. A SELL label is the mirror (close below the slow SMA, cross under the fast SMA, AO cross under 0, RSI below the
 * threshold). With "confirm on bar close", a signal needs a confirmed (closed) bar. The port reads the state of the
 * last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 * Alerts (alertcondition, `alerts` of the result): 'Buy' and 'Sell', true on the bars of the BUY / SELL signals.
 *
 * Reference: "Crypto M1 - SMA20 SMA200 RSI50 AO confirm (cooldown)" by hernangarcia_78
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, callsite, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface IndicadorMilloSma20Sma200AoRsiM1Inputs {
  /** Enable the BUY (long) signals */
  useLong: boolean;
  /** Enable the SELL (short) signals */
  useShort: boolean;
  /** Fast SMA length */
  smaFastLen: number;
  /** Slow SMA length (trend filter) */
  smaSlowLen: number;
  /** RSI length */
  rsiLen: number;
  /** RSI threshold */
  rsiThresh: number;
  /** Max bars between the close / fast SMA cross and the AO cross */
  confirmBarsAO: number;
  /** Cooldown bars per signal type */
  cooldownBars: number;
  /** Signal only on a confirmed (closed) bar */
  confirmClose: boolean;
}

export const defaultInputs: IndicadorMilloSma20Sma200AoRsiM1Inputs = {
  useLong: true,
  useShort: true,
  smaFastLen: 20,
  smaSlowLen: 200,
  rsiLen: 14,
  rsiThresh: 50.0,
  confirmBarsAO: 4,
  cooldownBars: 10,
  confirmClose: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'useLong', type: 'bool', title: 'Activar señales de COMPRA (Long)', defval: true },
  { id: 'useShort', type: 'bool', title: 'Activar señales de VENTA (Short)', defval: true },
  { id: 'smaFastLen', type: 'int', title: 'SMA rápida (20)', defval: 20, min: 1 },
  { id: 'smaSlowLen', type: 'int', title: 'SMA lenta (200) - filtro de tendencia', defval: 200, min: 5 },
  { id: 'rsiLen', type: 'int', title: 'RSI length', defval: 14, min: 2 },
  { id: 'rsiThresh', type: 'float', title: 'Umbral RSI (50)', defval: 50.0, step: 0.1 },
  { id: 'confirmBarsAO', type: 'int', title: 'Máx. velas para confirmar con AO', defval: 4, min: 0, max: 20 },
  { id: 'cooldownBars', type: 'int', title: 'Velas de cooldown por tipo de señal', defval: 10, min: 0, max: 500 },
  { id: 'confirmClose', type: 'bool', title: 'Confirmar al cierre de vela (anti-repaint)', defval: true },
];

const SMA_FAST_COL = String(color.new(color.teal, 0));
const SMA_SLOW_COL = String(color.new(color.orange, 0));
const BUY_COL = String(color.new(color.green, 0));
const SELL_COL = String(color.new(color.red, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SMA 20', color: SMA_FAST_COL, lineWidth: 2 },
  { id: 'plot1', title: 'SMA 200', color: SMA_SLOW_COL, lineWidth: 2 },
];

export const metadata = {
  title: 'Crypto M1 - SMA20 SMA200 RSI50 AO confirm (cooldown)',
  shortTitle: 'Crypto M1 - SMA20 SMA200 RSI50 AO confirm (cooldown)',
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
  inputs: Partial<IndicadorMilloSma20Sma200AoRsiM1Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const hl2 = Series.fromArray(bars, bars.map((b) => (b.high + b.low) / 2));

  const sma20 = A(ta.sma(close, cfg.smaFastLen));
  const sma200 = A(ta.sma(close, cfg.smaSlowLen));
  const rsiVal = A(ta.rsi(close, cfg.rsiLen));
  // AO manual: SMA(hl2, 5) - SMA(hl2, 34)
  const sma5 = A(ta.sma(hl2, 5));
  const sma34 = A(ta.sma(hl2, 34));

  // ta.crossover / ta.crossunder compare exactly; one call site each, called on every bar
  const priceUpSite = callsite.crossover();
  const priceDownSite = callsite.crossunder();
  const aoUpSite = callsite.crossover();
  const aoDownSite = callsite.crossunder();
  const sinceUpSite = callsite.barssince();
  const sinceDownSite = callsite.barssince();

  // var int lastBuyBar = na / lastSellBar = na. bar_index differences only: the bar index origin does not matter
  let lastBuyBar = NaN;
  let lastSellBar = NaN;

  const plot0 = [];
  const plot1 = [];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const aoVal = sma5[i] - sma34[i];
    const trendUp = gt(c, sma200[i]);
    const trendDn = lt(c, sma200[i]);
    const priceCrossUp = priceUpSite(c, sma20[i]);
    const priceCrossDown = priceDownSite(c, sma20[i]);
    const aoCrossUp = aoUpSite(aoVal, 0.0);
    const aoCrossDown = aoDownSite(aoVal, 0.0);
    const rsiAboveNow = gt(rsiVal[i], cfg.rsiThresh);
    const rsiBelowNow = lt(rsiVal[i], cfg.rsiThresh);

    // nz(ta.barssince(cond), 1000000)
    const sUp = sinceUpSite(priceCrossUp);
    const sDown = sinceDownSite(priceCrossDown);
    const barsSincePriceUp = isNaN(sUp) ? 1000000 : sUp;
    const barsSincePriceDown = isNaN(sDown) ? 1000000 : sDown;
    const buyConfirmWindow = le(barsSincePriceUp, cfg.confirmBarsAO);
    const sellConfirmWindow = le(barsSincePriceDown, cfg.confirmBarsAO);

    const buyCooldownOK = isNaN(lastBuyBar) || ge(i - lastBuyBar, cfg.cooldownBars);
    const sellCooldownOK = isNaN(lastSellBar) || ge(i - lastSellBar, cfg.cooldownBars);

    const rawBuy = cfg.useLong && trendUp && buyConfirmWindow && aoCrossUp && rsiAboveNow && buyCooldownOK;
    const rawSell = cfg.useShort && trendDn && sellConfirmWindow && aoCrossDown && rsiBelowNow && sellCooldownOK;
    const buySignal = rawBuy && (!cfg.confirmClose || barIsConfirmed(i));
    const sellSignal = rawSell && (!cfg.confirmClose || barIsConfirmed(i));
    if (buySignal) lastBuyBar = i;
    if (sellSignal) lastSellBar = i;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);

    const time = bars[i].time;
    plot0.push({ time, value: sma20[i], color: SMA_FAST_COL });
    plot1.push({ time, value: sma200[i], color: SMA_SLOW_COL });
    // plotshape(buySignal, "BUY", shape.labelup, location.belowbar, color.new(color.green, 0), text = "BUY",
    //   textcolor = color.white, size = size.tiny)
    if (buySignal) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: BUY_COL, text: 'BUY', textColor: color.white, size: 'tiny' });
    }
    if (sellSignal) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: SELL_COL, text: 'SELL', textColor: color.white, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    // alertcondition(buySignal, "Buy", ...) / alertcondition(sellSignal, "Sell", ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy', message: 'BUY - Precio cruza SMA20, RSI>50 y AO 0 up dentro de la ventana (cooldown activo)' },
  { id: 'alert1', title: 'Sell', message: 'SELL - Precio cruza SMA20, RSI<50 y AO 0 down dentro de la ventana (cooldown activo)' },
];

export const IndicadorMilloSma20Sma200AoRsiM1 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
