/**
 * ANDROMEDA - TrendSync
 *
 * Two moving averages (EMA or SMA) of the close, MACD and a short RSI. The trend is up when the MACD histogram is
 * positive, MA 1 is above MA 2 and MA 2 rises (down: the mirror). A buy signal is an uptrend bar where the low
 * crosses under MA 1 or MA 2; a sell signal is a downtrend bar where the high crosses over MA 1 or MA 2. The MAs are
 * blue / red / grey by the trend; bars are orange when the RSI is above the overbought or below the oversold level,
 * else blue / red by the trend.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): "ALERTA DE COMPRA" on a buy signal and
 * "ALERTA DE VENDA" on a sell signal.
 *
 * Reference: "ANDROMEDA - TrendSync" by Pedro_Canto
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { AlertCall, BarColorData, MarkerData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface AndromedaTrendSyncInputs {
  /** Length of moving average 1 */
  emaLength1: number;
  /** Length of moving average 2 */
  emaLength2: number;
  /** Type of moving average 1 */
  maType1: 'EMA' | 'SMA';
  /** Type of moving average 2 */
  maType2: 'EMA' | 'SMA';
  /** MACD fast length */
  fastLength: number;
  /** MACD slow length */
  slowLength: number;
  /** MACD signal length */
  signalLength: number;
  /** RSI source */
  rsiSource: SourceType;
  /** RSI length */
  rsiLength: number;
  /** RSI overbought level */
  rsiOverbought: number;
  /** RSI oversold level */
  rsiOversold: number;
  /** Bar colour when the RSI is overbought */
  rsiOverColor: string;
  /** Bar colour when the RSI is oversold */
  rsiUnderColor: string;
}

export const defaultInputs: AndromedaTrendSyncInputs = {
  emaLength1: 9,
  emaLength2: 20,
  maType1: 'EMA',
  maType2: 'EMA',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  rsiSource: 'hlc3',
  rsiLength: 6,
  rsiOverbought: 80,
  rsiOversold: 20,
  rsiOverColor: color.orange,
  rsiUnderColor: color.orange,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaLength1', type: 'int', title: 'Período da Média Móvel 1', defval: 9 },
  { id: 'emaLength2', type: 'int', title: 'Período da Média Móvel 2', defval: 20 },
  { id: 'maType1', type: 'string', title: 'Tipo da Média Móvel 1', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'maType2', type: 'string', title: 'Tipo da Média Móvel 2', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'fastLength', type: 'int', title: 'MACD Média Curta', defval: 12 },
  { id: 'slowLength', type: 'int', title: 'MACD Média Longa', defval: 26 },
  { id: 'signalLength', type: 'int', title: 'MACD Linha de Sinal', defval: 9 },
  { id: 'rsiSource', type: 'source', title: 'Fonte do RSI', defval: 'hlc3' },
  { id: 'rsiLength', type: 'int', title: 'Período RSI', defval: 6, min: 1 },
  { id: 'rsiOverbought', type: 'int', title: 'Nível Sobrecompra RSI', defval: 80 },
  { id: 'rsiOversold', type: 'int', title: 'Nível Sobrevenda RSI', defval: 20 },
  { id: 'rsiOverColor', type: 'color', title: 'Cor Sobrecompra', defval: color.orange },
  { id: 'rsiUnderColor', type: 'color', title: 'Cor Sobrevenda', defval: color.orange },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Média Móvel 1', color: color.gray, lineWidth: 1 },
  { id: 'plot1', title: 'Média Móvel 2', color: color.gray, lineWidth: 3 },
];

export const metadata = {
  title: 'ANDROMEDA - TrendSync',
  shortTitle: 'ANDROMEDA - TrendSync',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/**
 * One ta.crossover / ta.crossunder call site: compared with the last bar where the call ran with both values not na
 * (a tie there counts). A call on the right side of a lazy `or` only runs (and keeps its history) when it is reached.
 * Exact comparisons: ta.crossover / ta.crossunder do not use the 1e-10 tolerance of the operators.
 */
function crossSite(over: boolean) {
  let pa = NaN;
  let pb = NaN;
  return (a: number, b: number): boolean => {
    const r = over ? a > b && pa <= pb : a < b && pa >= pb;
    if (!isNaN(a) && !isNaN(b)) {
      pa = a;
      pb = b;
    }
    return r;
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AndromedaTrendSyncInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  // ma(src, len, type) => type == "EMA" ? ta.ema(src, len) : ta.sma(src, len) (the type is fixed for the run)
  const ma = (len: number, type: string) => A(type === 'EMA' ? ta.ema(close, len) : ta.sma(close, len));
  const ma1 = ma(cfg.emaLength1, cfg.maType1);
  const ma2 = ma(cfg.emaLength2, cfg.maType2);
  const [, , macdHistS] = ta.macd(close, cfg.fastLength, cfg.slowLength, cfg.signalLength);
  const macdHist = A(macdHistS);
  const rsi = A(ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLength));

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const alertCalls: AlertCall[] = [];
  const cuMa1 = crossSite(false);
  const cuMa2 = crossSite(false);
  const coMa1 = crossSite(true);
  const coMa2 = crossSite(true);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const slope = i > 0 ? ma2[i] - ma2[i - 1] : NaN; // ma2_slope = ma2 - ma2[1]
    const trendBuy = gt(macdHist[i], 0) && gt(ma1[i], ma2[i]) && gt(slope, 0);
    const trendSell = lt(macdHist[i], 0) && lt(ma1[i], ma2[i]) && lt(slope, 0);
    // ta.crossunder(low, ma1) or ta.crossunder(low, ma2): lazy `or`, the second call runs only when the first is false
    const crossUnder = cuMa1(b.low, ma1[i]) || cuMa2(b.low, ma2[i]);
    const crossOver = coMa1(b.high, ma1[i]) || coMa2(b.high, ma2[i]);
    const buySignal = trendBuy && crossUnder;
    const sellSignal = trendSell && crossOver;
    // if buy_signal: alert("ALERTA DE COMPRA", alert.freq_once_per_bar) / if sell_signal: alert("ALERTA DE VENDA", ...)
    if (buySignal) alertCalls.push({ time: b.time, message: 'ALERTA DE COMPRA', freq: 'once_per_bar' });
    if (sellSignal) alertCalls.push({ time: b.time, message: 'ALERTA DE VENDA', freq: 'once_per_bar' });

    const maColor = trendBuy ? color.blue : trendSell ? color.red : color.gray;
    plot0.push({ time: b.time, value: ma1[i], color: maColor });
    plot1.push({ time: b.time, value: ma2[i], color: maColor });

    // final_bar_color = not na(rsi_color) ? rsi_color : (trend_buy ? color.blue : trend_sell ? color.red : na)
    const rsiColor = gt(rsi[i], cfg.rsiOverbought) ? cfg.rsiOverColor : lt(rsi[i], cfg.rsiOversold) ? cfg.rsiUnderColor : null;
    const barColor = rsiColor ?? (trendBuy ? color.blue : trendSell ? color.red : null);
    if (barColor !== null) barColors.push({ time: b.time, color: barColor });

    // plotshape(buy_signal, "Buy Signal", shape.triangleup, location.belowbar, color.green, size = size.small)
    if (buySignal) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    // plotshape(sell_signal, "Sell Signal", shape.triangledown, location.abovebar, color.red, size = size.small)
    if (sellSignal) markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    barColors,
    alertCalls,
  };
}

export const AndromedaTrendSync = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
