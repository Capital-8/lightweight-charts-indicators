/**
 * Asset risk metrics
 *
 * Risk = risk source / last all-time high (running maximum of the high) * RSI / 100. The RSI is the RSI of the RSI
 * source, its moving average, the RSI of the VWAP, or the moving average of that RSI (VWAP mode and MA mode). The
 * risk is split in 20 bands of 5 % (above 95 %, 90 %, ..., above 0 %); each band has its own colour. A circle at the
 * spot price (ohlc4 by default) shows the band colour; the bars can be coloured too, and the last all-time high can be
 * drawn as a line.
 *
 * Timeframes: Pine `ta.vwap` resets on each new trading day (anchor timeframe.change("1D")). When each bar is one
 * trading day or more, it resets on every bar, so the VWAP is hlc3 of the bar (na when the volume is 0 or na). On
 * intraday bars (barInterval, the most frequent gap between bars, below one day) the reset needs the exchange time
 * zone and the session of the symbol: the port reads them from the optional third argument (see
 * src/chart-context.ts) and sums from the first bar of each trading day (from the first bar on the first day).
 * Without them calculate() throws an Error on intraday bars.
 *
 * Reference: "Asset risk metrics" by Sweettz
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { barInterval } from '../bar-time';
import type { ChartContext } from '../chart-context';
import { executeScript, timeframe as scriptTimeframe } from 'oakscriptjs/script';

export type AssetRiskMaType = 'SMA' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA' | 'HMA';

export interface AssetRiskMetricsInputs {
  /** Risk source */
  riskSource: SourceType;
  /** Price of the risk circles */
  riskSourceShape: SourceType;
  rsiSource: SourceType;
  rsiLength: number;
  /** MA type of the RSI */
  maType: AssetRiskMaType;
  rsiMALength: number;
  /** RSI length of the VWAP RSI */
  rsi2Length: number;
  /** MA type of the VWAP RSI */
  ma2Type: AssetRiskMaType;
  ma2Length: number;
  /** Use the RSI of the VWAP */
  vwapMode: boolean;
  /** Use the moving average of the RSI */
  maMode: boolean;
  /** Coloured circles */
  enableSpots: boolean;
  /** Coloured bars */
  insideBar: boolean;
  enable20: boolean;
  enable19: boolean;
  enable18: boolean;
  enable17: boolean;
  enable16: boolean;
  enable15: boolean;
  enable14: boolean;
  enable13: boolean;
  enable12: boolean;
  enable11: boolean;
  enable10: boolean;
  enable09: boolean;
  enable08: boolean;
  enable07: boolean;
  enable06: boolean;
  enable05: boolean;
  enable04: boolean;
  enable03: boolean;
  enable02: boolean;
  enable01: boolean;
  /** Last all-time high line */
  enableATHLine: boolean;
}

export const defaultInputs: AssetRiskMetricsInputs = {
  riskSource: 'high',
  riskSourceShape: 'ohlc4',
  rsiSource: 'close',
  rsiLength: 14,
  maType: 'SMA',
  rsiMALength: 14,
  rsi2Length: 14,
  ma2Type: 'SMA',
  ma2Length: 14,
  vwapMode: false,
  maMode: false,
  enableSpots: true,
  insideBar: false,
  enable20: true,
  enable19: true,
  enable18: true,
  enable17: true,
  enable16: true,
  enable15: true,
  enable14: true,
  enable13: true,
  enable12: true,
  enable11: true,
  enable10: true,
  enable09: true,
  enable08: true,
  enable07: true,
  enable06: true,
  enable05: true,
  enable04: true,
  enable03: true,
  enable02: true,
  enable01: true,
  enableATHLine: false,
};

const MA_TYPES: AssetRiskMaType[] = ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA', 'HMA'];

/** Bands from the highest (above 95 %) to the lowest (above 0 %): input id, threshold, colour */
const BANDS: Array<[keyof AssetRiskMetricsInputs, number, string]> = [
  ['enable20', 0.95, '#FF0090'],
  ['enable19', 0.90, '#FF0000'],
  ['enable18', 0.85, '#FF4800'],
  ['enable17', 0.80, '#FF8800'],
  ['enable16', 0.75, '#FFBB00'],
  ['enable15', 0.70, '#FFD900'],
  ['enable14', 0.65, '#FFF700'],
  ['enable13', 0.60, '#D4FF00'],
  ['enable12', 0.55, '#99FF00'],
  ['enable11', 0.50, '#00FF2F'],
  ['enable10', 0.45, '#00FF66'],
  ['enable09', 0.40, '#00FFAE'],
  ['enable08', 0.35, '#00FFF7'],
  ['enable07', 0.30, '#00D5FF'],
  ['enable06', 0.25, '#0099FF'],
  ['enable05', 0.20, '#0062FF'],
  ['enable04', 0.15, '#0022FF'],
  ['enable03', 0.10, '#3700FF'],
  ['enable02', 0.05, '#7B00FF'],
  ['enable01', 0.0, '#CC00FF'],
];

export const inputConfig: InputConfig[] = [
  { id: 'riskSource', type: 'source', title: 'Risk source', defval: 'high' },
  { id: 'riskSourceShape', type: 'source', title: 'Risk metric plotshape position', defval: 'ohlc4' },
  { id: 'rsiSource', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'maType', type: 'string', title: 'RSI MA Type', defval: 'SMA', options: MA_TYPES },
  { id: 'rsiMALength', type: 'int', title: 'RSI MA Length', defval: 14 },
  { id: 'rsi2Length', type: 'int', title: 'VWAP Length', defval: 14, min: 1 },
  { id: 'ma2Type', type: 'string', title: 'VWAP MA Type', defval: 'SMA', options: MA_TYPES },
  { id: 'ma2Length', type: 'int', title: 'VWAP MA Length', defval: 14 },
  { id: 'vwapMode', type: 'bool', title: 'Enable VWAP of RSI', defval: false },
  { id: 'maMode', type: 'bool', title: 'Enable MA of RSI', defval: false },
  { id: 'enableSpots', type: 'bool', title: 'Enable colored spots', defval: true },
  { id: 'insideBar', type: 'bool', title: 'Enable colored bars', defval: false },
  ...BANDS.map(([id, th]): InputConfig => (
    { id, type: 'bool', title: `Enable ${Math.round(th * 100)}% Risk marker`, defval: true })),
  { id: 'enableATHLine', type: 'bool', title: 'Enable Last ATH Line', defval: false },
];

const ATH_COLOR = '#ffffff60';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Risk since ATH', color: ATH_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Asset risk metrics',
  shortTitle: 'Risk metrics',
  overlay: true,
  precision: 3,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

const DAY_SECONDS = 86400;

/**
 * First bar of each trading day of the exchange on intraday bars (Pine timeframe.change("1D")), found by the library
 * from the time zone and the session of the chart context. Null when the context does not give both, or when the bars
 * are not intraday.
 */
function tradingDayStarts(bars: Bar[], chart?: ChartContext): boolean[] | null {
  const interval = barInterval(bars);
  if (chart?.timezone === undefined || chart.session === undefined || !(interval > 0 && interval < 86400)) return null;
  let change: Array<number | null> = [];
  const context = { ...chart, timeframe: chart.timeframe ?? timeframe.from_seconds(interval) };
  executeScript(() => { change = scriptTimeframe.change('1D').toArray(); }, bars, {}, context);
  return change.map((v) => v === 1);
}

/**
 * ta.vwap (hlc3) on intraday bars: sum(hlc3 * volume) / sum(volume) since the first bar of the trading day (since the
 * first bar on the first day)
 */
function intradayVwap(bars: Bar[], dayStarts: boolean[]): number[] {
  const hlc3 = Series.fromArray(bars, bars.map((b) => (b.high + b.low + b.close) / 3));
  const volume = Series.fromArray(bars, bars.map((b) => b.volume ?? NaN));
  const anchor = Series.fromArray(bars, dayStarts.map((v, i) => Number(i === 0 || v)));
  return ta.vwap(hlc3, volume, anchor).toArray().map((v) => v ?? NaN);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AssetRiskMetricsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const interval = barInterval(bars);
  const dayStarts = tradingDayStarts(bars, chart);
  if (interval > 0 && interval < DAY_SECONDS && dayStarts === null) {
    throw new Error(
      'Asset risk metrics supports daily and higher timeframes only: on intraday bars ta.vwap resets '
      + 'on each trading day, which needs the exchange time zone and session.',
    );
  }

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const vol = bars.map((b) => b.volume ?? NaN);

  // ma(source, length, type): only the branch of the selected type runs
  const ma = (source: number[], length: number, type: AssetRiskMaType): number[] => {
    const s = S(source);
    switch (type) {
      case 'SMA': return A(ta.sma(s, length));
      case 'EMA': return A(ta.ema(s, length));
      case 'SMMA (RMA)': return A(ta.rma(s, length));
      case 'WMA': return A(ta.wma(s, length));
      case 'VWMA': return A(ta.vwma(s, length, S(vol)));
      case 'HMA':
        if (length === 1 && n > 0) {
          throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
        }
        return A(ta.hma(s, length));
      default: return new Array(n).fill(NaN);
    }
  };

  // lastATH := math.max(high, nz(lastATH[1]))
  const lastATH: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? lastATH[i - 1] : NaN;
    lastATH[i] = Math.max(bars[i].high, isNaN(prev) ? 0 : prev);
  }

  const rsi = A(ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLength));
  const rsiMA = ma(rsi, cfg.rsiMALength, cfg.maType);
  // ta.vwap (hlc3, anchor timeframe.change("1D")). Intraday bars: the sums restart on each trading day of the
  // exchange. Daily or higher bars: a new anchor on every bar, so sum(hlc3 * volume) / sum(volume) over the bar
  // alone (0 / 0 = na when the volume is 0, na when it is na)
  const vwap = dayStarts ? intradayVwap(bars, dayStarts)
    : bars.map((b, i) => (((b.high + b.low + b.close) / 3) * vol[i]) / vol[i]);
  const rsi2 = A(ta.rsi(S(vwap), cfg.rsi2Length));
  const rsi2MA = ma(rsi2, cfg.ma2Length, cfg.ma2Type);

  const riskSource = A(getSourceSeries(bars, cfg.riskSource));
  const riskShape = A(getSourceSeries(bars, cfg.riskSourceShape));
  const metric = cfg.vwapMode ? (cfg.maMode ? rsi2MA : rsi2) : (cfg.maMode ? rsiMA : rsi);

  const plot0: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // riskFormula = riskSource / lastATH * metric / 100 (plain division)
    const riskFormula = ((riskSource[i] / lastATH[i]) * metric[i]) / 100;
    // risk20 = riskFormula > 0.95; riskK = riskFormula > threshold and not risk(K+1)
    const risk: boolean[] = new Array(BANDS.length);
    for (let k = 0; k < BANDS.length; k++) {
      risk[k] = gt(riskFormula, BANDS[k][1]) && (k === 0 || !risk[k - 1]);
    }
    // riskColor = risk20 ? (enable20 ? colour : na) : risk19 ? ... : na
    let riskColor: string | null = null;
    for (let k = 0; k < BANDS.length; k++) {
      if (risk[k]) {
        riskColor = cfg[BANDS[k][0]] ? BANDS[k][2] : null;
        break;
      }
    }

    plot0.push({ time: t, value: cfg.enableATHLine ? lastATH[i] : NaN, color: ATH_COLOR });
    // plotshape(enableSpots ? riskSourceShape : na, shape.circle, location.absolute, size.tiny, color = riskColor)
    if (cfg.enableSpots && riskColor !== null && !isNaN(riskShape[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: riskShape[i], shape: 'circle', color: riskColor,
        size: 'tiny' });
    }
    if (cfg.insideBar && riskColor !== null) barColors.push({ time: t, color: riskColor });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: metadata.precision },
    plots: { plot0 },
    markers,
    barColors,
  };
}

export const AssetRiskMetrics = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
