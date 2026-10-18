/**
 * EMA + SuperTrend Combo
 *
 * Overlay with 5 EMAs + SuperTrend + NovaWave cloud (fast/slow EMA + fill) +
 * Signal MA + 3 DMAs + Buy/Sell labels on NovaWave fast/slow crossover.
 * The EMA / SMA plots (5 EMAs, NovaWave EMAs and signal SMA, DMAs) start on the first bar where their ta.ema /
 * ta.sma has a value (bar length - 1, seeded with the SMA); a DMA displacement shifts its SMA by that many bars.
 *
 * Plots (the original's titles / colours, in its order):
 *   plot0..plot4: ema_01..ema_05 (#E0FFFF, #ff0040, #1900ff width 2, #87CEFA, #FAFAD2)
 *   plot7: bodyMiddle (open + close) / 2 (hidden, for the fills)
 *   plot5: Up Trend (ta.supertrend(factor, ATR length) where direction < 0, green, linebr)
 *   plot6: Down Trend (the supertrend elsewhere, red, linebr); no supertrend on the bars where the ATR is na
 *   plot8: NovaWave Fast EMA (#D8EDFC)
 *   plot9: NovaWave Slow EMA (#7AE671)
 *   plot10: NovaWave Signal MA (purple)
 *   plot11: DMA 20     (fuchsia, lineWidth 2)
 *   plot12: DMA 50     (yellow, lineWidth 2)
 *   plot13: DMA 200    (teal, lineWidth 2)
 *
 * Fills:
 *   bodyMiddle <-> upTrend (green 90% transparent)
 *   bodyMiddle <-> downTrend (red 90% transparent)
 *   NovaWave Fast <-> NovaWave Slow (green / red 80% transparent from fast > slow)
 *
 * Markers (the original's label.new labels):
 *   BUY (label up at the low) on the bars where the NovaWave fast EMA crosses over the slow EMA (ta.crossover: from the
 *   first bar where both EMAs have a value on the bar before), SELL (label down at the high) on the crossunders; green
 *   / red, small, white text. As the original's labels (default max_labels_count = 50), only the newest 50 are kept.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal', true on the bars where the NovaWave
 * fast EMA crosses above / below the slow EMA.
 *
 * Reference: "EMA+Super" by All_in_Traders
 */

import { ta, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EMASuperTrendInputs {
  ema1Len: number;
  ema2Len: number;
  ema3Len: number;
  ema4Len: number;
  ema5Len: number;
  emaSrc: SourceType;
  atrLen: number;
  factor: number;
  nwFastLen: number;
  nwSlowLen: number;
  nwSignalLen: number;
  dmaSrc: SourceType;
  dmaDisp20: number;
  dmaDisp50: number;
  dmaDisp200: number;
}

export const defaultInputs: EMASuperTrendInputs = {
  ema1Len: 9,
  ema2Len: 21,
  ema3Len: 50,
  ema4Len: 100,
  ema5Len: 200,
  emaSrc: 'close',
  atrLen: 10,
  factor: 4.0,
  nwFastLen: 9,
  nwSlowLen: 21,
  nwSignalLen: 10,
  dmaSrc: 'close',
  dmaDisp20: 0,
  dmaDisp50: 0,
  dmaDisp200: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'ema1Len', type: 'int', title: 'EMA 9', defval: 9, min: 1 },
  { id: 'ema2Len', type: 'int', title: 'EMA 21', defval: 21, min: 1 },
  { id: 'ema3Len', type: 'int', title: 'EMA 50', defval: 50, min: 1 },
  { id: 'ema4Len', type: 'int', title: 'EMA 100', defval: 100, min: 1 },
  { id: 'ema5Len', type: 'int', title: 'EMA 200', defval: 200, min: 1 },
  { id: 'emaSrc', type: 'source', title: 'EMA Source', defval: 'close' },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 10, min: 1 },
  { id: 'factor', type: 'float', title: 'SuperTrend Factor', defval: 4.0, min: 0.01, step: 0.01 },
  { id: 'nwFastLen', type: 'int', title: 'NovaWave Fast EMA', defval: 9, min: 1 },
  { id: 'nwSlowLen', type: 'int', title: 'NovaWave Slow EMA', defval: 21, min: 1 },
  { id: 'nwSignalLen', type: 'int', title: 'NovaWave Signal MA', defval: 10, min: 1 },
  { id: 'dmaSrc', type: 'source', title: 'DMA Source', defval: 'close' },
  { id: 'dmaDisp20', type: 'int', title: 'DMA 20 Displacement', defval: 0 },
  { id: 'dmaDisp50', type: 'int', title: 'DMA 50 Displacement', defval: 0 },
  { id: 'dmaDisp200', type: 'int', title: 'DMA 200 Displacement', defval: 0 },
];

/** Pine version 6 colours of the original */
const GREEN = '#4CAF50';
const RED = '#F23645';
const TRANSPARENT = 'rgba(0,0,0,0)';
const ST_UP_FILL = String(color.new(GREEN, 90));
const ST_DOWN_FILL = String(color.new(RED, 90));
const NW_BULL_FILL = String(color.new(GREEN, 80));
const NW_BEAR_FILL = String(color.new(RED, 80));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ema_01', color: '#E0FFFF', lineWidth: 1 },
  { id: 'plot1', title: 'ema_02', color: '#ff0040', lineWidth: 1 },
  { id: 'plot2', title: 'ema_03', color: '#1900ff', lineWidth: 2 },
  { id: 'plot3', title: 'ema_04', color: '#87CEFA', lineWidth: 1 },
  { id: 'plot4', title: 'ema_05', color: '#FAFAD2', lineWidth: 1 },
  { id: 'plot7', title: 'Plot', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Up Trend', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 'plot6', title: 'Down Trend', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'plot8', title: 'NovaWave Fast EMA', color: '#D8EDFC', lineWidth: 1 },
  { id: 'plot9', title: 'NovaWave Slow EMA', color: '#7AE671', lineWidth: 1 },
  { id: 'plot10', title: 'NovaWave Signal MA', color: '#9C27B0', lineWidth: 1 },
  { id: 'plot11', title: 'DMA 20', color: '#E040FB', lineWidth: 2 },
  { id: 'plot12', title: 'DMA 50', color: '#FDD835', lineWidth: 2 },
  { id: 'plot13', title: 'DMA 200', color: '#089981', lineWidth: 2 },
];

export const metadata = {
  title: 'EMA + SuperTrend',
  shortTitle: 'EMA+ST',
  overlay: true,
};

/** indicator() default max_labels_count */
const MAX_LABELS = 50;

export function calculate(
  bars: Bar[],
  inputs: Partial<EMASuperTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const {
    ema1Len, ema2Len, ema3Len, ema4Len, ema5Len, emaSrc,
    atrLen, factor,
    nwFastLen, nwSlowLen, nwSignalLen,
    dmaSrc, dmaDisp20, dmaDisp50, dmaDisp200,
  } = { ...defaultInputs, ...inputs };

  const n = bars.length;
  const emaSrcSeries = getSourceSeries(bars, emaSrc);

  // ====== 5 EMAs ======
  const ema1Arr = ta.ema(emaSrcSeries, ema1Len).toArray();
  const ema2Arr = ta.ema(emaSrcSeries, ema2Len).toArray();
  const ema3Arr = ta.ema(emaSrcSeries, ema3Len).toArray();
  const ema4Arr = ta.ema(emaSrcSeries, ema4Len).toArray();
  const ema5Arr = ta.ema(emaSrcSeries, ema5Len).toArray();

  // ====== SuperTrend ======
  // [supertrend, direction] = ta.supertrend(factor, atrPeriod): bands hl2 -+ factor * atr, each kept from the bar
  // before unless it moves toward the price or the close of the bar before is beyond it (prev band nz() = 0);
  // direction 1 (down) while atr[1] is na, else -1 (up) / 1 from the close against the band of the trend.
  // Bars where atr is na: no supertrend (both plots na).
  const atrArr = ta.atr(bars, atrLen).toArray().map((v) => v ?? NaN);
  const dirArr: number[] = new Array(n).fill(NaN);
  const stArr: number[] = new Array(n).fill(NaN);
  let prevLower = NaN;
  let prevUpper = NaN;
  for (let i = 0; i < n; i++) {
    const atr = atrArr[i];
    if (Number.isNaN(atr)) continue;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const pl = Number.isNaN(prevLower) ? 0 : prevLower;
    const pu = Number.isNaN(prevUpper) ? 0 : prevUpper;
    const c1 = i > 0 ? bars[i - 1].close : NaN;
    let lower = hl2 - factor * atr;
    let upper = hl2 + factor * atr;
    lower = lower > pl || c1 < pl ? lower : pl;
    upper = upper < pu || c1 > pu ? upper : pu;
    let dir: number;
    if (i === 0 || Number.isNaN(atrArr[i - 1])) dir = 1;
    else if (stArr[i - 1] === pu) dir = bars[i].close > upper ? -1 : 1;
    else dir = bars[i].close < lower ? 1 : -1;
    dirArr[i] = dir;
    stArr[i] = dir === -1 ? lower : upper;
    prevLower = lower;
    prevUpper = upper;
  }

  // ====== NovaWave Cloud ======
  const closeSeries = getSourceSeries(bars, 'close');
  const nwFastArr = ta.ema(closeSeries, nwFastLen).toArray();
  const nwSlowArr = ta.ema(closeSeries, nwSlowLen).toArray();
  const nwSignalArr = ta.sma(closeSeries, nwSignalLen).toArray();

  // ====== 3 DMAs (Displaced Moving Averages) ======
  const dmaSrcSeries = getSourceSeries(bars, dmaSrc);
  const dma20Arr = ta.sma(dmaSrcSeries, 20).toArray();
  const dma50Arr = ta.sma(dmaSrcSeries, 50).toArray();
  const dma200Arr = ta.sma(dmaSrcSeries, 200).toArray();

  // --- Helpers ---
  // The plots start on the first bar of their series: ta.ema / ta.sma have a value from bar length - 1
  const makePlot = (arr: (number | null)[]) =>
    arr.map((v, i) => ({
      time: bars[i].time,
      value: (v == null || isNaN(v as number)) ? NaN : v as number,
    }));

  const displace = (arr: (number | null)[], disp: number): (number | null)[] => {
    if (disp === 0) return arr;
    const result: (number | null)[] = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      const srcIdx = i - disp;
      if (srcIdx >= 0 && srcIdx < n) result[i] = arr[srcIdx];
    }
    return result;
  };

  // --- Build plots ---

  // plot0..4: 5 EMAs
  const plot0 = makePlot(ema1Arr);
  const plot1 = makePlot(ema2Arr);
  const plot2 = makePlot(ema3Arr);
  const plot3 = makePlot(ema4Arr);
  const plot4 = makePlot(ema5Arr);

  // plot5: plot(direction < 0 ? supertrend : na, "Up Trend", color.green, style = linebr)
  const plot5 = stArr.map((v, i) => ({ time: bars[i].time, value: dirArr[i] < 0 ? v : NaN }));
  // plot6: plot(direction < 0 ? na : supertrend, "Down Trend", color.red, style = linebr)
  const plot6 = stArr.map((v, i) => ({ time: bars[i].time, value: dirArr[i] < 0 ? NaN : v }));
  // plot7: bodyMiddle = plot((open + close) / 2, display = display.none), used by the SuperTrend fills
  const plot7 = bars.map((b) => ({ time: b.time, value: (b.open + b.close) / 2 }));

  // plot8..10: NovaWave
  const plot8 = makePlot(nwFastArr);
  const plot9 = makePlot(nwSlowArr);
  const plot10 = makePlot(nwSignalArr);

  // plot11..13: DMAs
  const plot11 = makePlot(displace(dma20Arr, dmaDisp20));
  const plot12 = makePlot(displace(dma50Arr, dmaDisp50));
  const plot13 = makePlot(displace(dma200Arr, dmaDisp200));

  // --- Fills ---

  // fill(bodyMiddle, upTrend, color.new(color.green, 90), fillgaps = false) / fill(bodyMiddle, downTrend,
  // color.new(color.red, 90)): drawn where both plots have a value
  const stFillUpColors = plot5.map((p) => (Number.isNaN(p.value) ? TRANSPARENT : ST_UP_FILL));
  const stFillDownColors = plot6.map((p) => (Number.isNaN(p.value) ? TRANSPARENT : ST_DOWN_FILL));

  // NovaWave cloud fill: green when fast > slow, red otherwise
  const nwFillColors: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (nwFastArr[i] == null || nwSlowArr[i] == null || isNaN(nwFastArr[i] as number) || isNaN(nwSlowArr[i] as number)) {
      nwFillColors[i] = TRANSPARENT;
    } else {
      // nw_cloud_color = nw_bull ? color.new(color.green, 80) : color.new(color.red, 80)
      nwFillColors[i] = (nwFastArr[i] as number) > (nwSlowArr[i] as number) ? NW_BULL_FILL : NW_BEAR_FILL;
    }
  }

  // --- Markers: the original's labels ---
  // buy_signal = ta.crossover(nw_fast, nw_slow): label.new(bar_index, low, "BUY", color = color.green,
  // style = label.style_label_up, textcolor = color.white, size = size.small); sell_signal = ta.crossunder(...):
  // label.new(bar_index, high, "SELL", color = color.red, style = label.style_label_down, ...)
  const buySignal = crossedOver(nwFastArr, nwSlowArr);
  const sellSignal = crossedUnder(nwFastArr, nwSlowArr);
  const allMarkers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    if (buySignal[i]) {
      allMarkers.push({ time: bars[i].time, position: 'atPriceBottom', price: bars[i].low, shape: 'labelUp',
        color: color.green, text: 'BUY', textColor: color.white, size: 'small' });
    }
    if (sellSignal[i]) {
      allMarkers.push({ time: bars[i].time, position: 'atPriceTop', price: bars[i].high, shape: 'labelDown',
        color: color.red, text: 'SELL', textColor: color.white, size: 'small' });
    }
  }
  // Default max_labels_count = 50: the oldest labels are deleted
  const markers = allMarkers.slice(-MAX_LABELS);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3, 'plot4': plot4,
      'plot5': plot5, 'plot6': plot6, 'plot7': plot7,
      'plot8': plot8, 'plot9': plot9, 'plot10': plot10,
      'plot11': plot11, 'plot12': plot12, 'plot13': plot13,
    },
    fills: [
      { plot1: 'plot7', plot2: 'plot5', options: { color: ST_UP_FILL }, colors: stFillUpColors },
      { plot1: 'plot7', plot2: 'plot6', options: { color: ST_DOWN_FILL }, colors: stFillDownColors },
      { plot1: 'plot8', plot2: 'plot9', options: { color: NW_BULL_FILL }, colors: nwFillColors },
    ],
    markers,
    // alertcondition(buy_signal = ta.crossover(nw_fast, nw_slow)) / alertcondition(sell_signal = ta.crossunder(...))
    alerts: alertStates(alertConditions, bars, [buySignal, sellSignal]),
  } as Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'BUY signal: Fast EMA crossed above Slow EMA' },
  { id: 'alert1', title: 'Sell Signal', message: 'SELL signal: Fast EMA crossed below Slow EMA' },
];

export const EMASupertrend = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
