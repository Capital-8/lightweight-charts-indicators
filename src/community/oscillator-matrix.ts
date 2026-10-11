/**
 * Oscillator Matrix
 *
 * Money Flow: the SMAs over mfLength bars of the volume of the bars where hlc3 rises and where it falls give
 * (up - down) / (up + down) (0 when the total is not positive), smoothed by an EMA, multiplied and clamped to
 * -1..1. Hyper Wave: the MACD line (EMA fast - EMA slow of the close) divided by the 50-bar SMA of the close, scaled
 * by its highest absolute value over 100 bars, smoothed by an EMA and clamped to -1..1. A confluence score (signs and
 * overflows of both lines) colours the background and the candles. Strong signals: Money Flow crosses the -0.7 /
 * 0.7 levels while Hyper Wave is beyond -0.5 / 0.5; weak signals: Hyper Wave crosses 0 while Money Flow is inside
 * the levels. Threshold bands at 0.7..1 and -0.7..-1 and a zero band at -0.1..0.1.
 *
 * Last bar: the three zero lines and the fill between them are drawn on closed bars only. The port reads the state of
 * the last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Oscillator Matrix [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData, PlotCandleData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface OscillatorMatrixInputs {
  mfLength: number;
  mfSmooth: number;
  mfMultiplier: number;
  /** Not used by the calculation (kept as in the Pine script) */
  thresholdPeriod: number;
  /** Not used by the calculation (kept as in the Pine script) */
  thresholdMult: number;
  hwFast: number;
  hwSlow: number;
  /** Not used by the plotted outputs (signal line of the MACD only) */
  hwSignal: number;
  hwSmooth: number;
  showMoneyFlow: boolean;
  showHyperWave: boolean;
  showThresholds: boolean;
  showOverflow: boolean;
  showConfluence: boolean;
  showSignals: boolean;
  bullColor: string;
  bearColor: string;
  neutralColor: string;
}

export const defaultInputs: OscillatorMatrixInputs = {
  mfLength: 14,
  mfSmooth: 3,
  mfMultiplier: 2.0,
  thresholdPeriod: 50,
  thresholdMult: 1.618,
  hwFast: 12,
  hwSlow: 26,
  hwSignal: 9,
  hwSmooth: 3,
  showMoneyFlow: true,
  showHyperWave: true,
  showThresholds: true,
  showOverflow: true,
  showConfluence: true,
  showSignals: true,
  bullColor: '#00D4AA',
  bearColor: '#FF6B7A',
  neutralColor: '#6B7280',
};

export const inputConfig: InputConfig[] = [
  { id: 'mfLength', type: 'int', title: 'Money Flow Length', defval: 14, min: 1, max: 100, group: 'Money Flow' },
  { id: 'mfSmooth', type: 'int', title: 'Money Flow Smoothing', defval: 3, min: 1, max: 20, group: 'Money Flow' },
  { id: 'mfMultiplier', type: 'float', title: 'Money Flow Multiplier', defval: 2.0, min: 0.1, max: 10.0, step: 0.1, group: 'Money Flow' },
  { id: 'thresholdPeriod', type: 'int', title: 'Threshold Period', defval: 50, min: 10, max: 200, group: 'Thresholds' },
  { id: 'thresholdMult', type: 'float', title: 'Threshold Multiplier', defval: 1.618, min: 0.5, max: 5.0, step: 0.1, group: 'Thresholds' },
  { id: 'hwFast', type: 'int', title: 'Hyper Wave Fast', defval: 12, min: 1, max: 50, group: 'Hyper Wave' },
  { id: 'hwSlow', type: 'int', title: 'Hyper Wave Slow', defval: 26, min: 1, max: 100, group: 'Hyper Wave' },
  { id: 'hwSignal', type: 'int', title: 'Hyper Wave Signal', defval: 9, min: 1, max: 50, group: 'Hyper Wave' },
  { id: 'hwSmooth', type: 'int', title: 'Hyper Wave Smoothing', defval: 3, min: 1, max: 10, group: 'Hyper Wave' },
  { id: 'showMoneyFlow', type: 'bool', title: 'Show Money Flow', defval: true, group: 'Display' },
  { id: 'showHyperWave', type: 'bool', title: 'Show Hyper Wave', defval: true, group: 'Display' },
  { id: 'showThresholds', type: 'bool', title: 'Show Thresholds', defval: true, group: 'Display' },
  { id: 'showOverflow', type: 'bool', title: 'Show Overflow', defval: true, group: 'Display' },
  { id: 'showConfluence', type: 'bool', title: 'Show Confluence Zones', defval: true, group: 'Display' },
  { id: 'showSignals', type: 'bool', title: 'Show Reversal Signals', defval: true, group: 'Display' },
  { id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00D4AA', group: 'Colors' },
  { id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#FF6B7A', group: 'Colors' },
  { id: 'neutralColor', type: 'color', title: 'Neutral Color', defval: '#6B7280', group: 'Colors' },
];

const UPPER_COL = '#FF6B7A';
const LOWER_COL = '#00D4AA';
/** grayc: color.new(color.gray, 50) on confirmed bars (all historical bars) */
const GRAY_C = String(color.new(color.gray, 50));
/** grayc on a bar that is still open */
const GRAY_OPEN = String(color.new(color.gray, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MF Upper Threshold', color: UPPER_COL, lineWidth: 1 },
  { id: 'plot1', title: 'MF Upper Threshold', color: UPPER_COL, lineWidth: 1, display: 'pane' },
  { id: 'plot2', title: 'MF Lower Threshold', color: LOWER_COL, lineWidth: 1 },
  { id: 'plot3', title: 'MF Lower Threshold', color: LOWER_COL, lineWidth: 1, display: 'pane' },
  { id: 'plot4', title: 'MF Overflow Bull', color: String(color.new('#00D4AA', 30)), lineWidth: 4, style: 'circles' },
  { id: 'plot5', title: 'MF Overflow Bear', color: String(color.new('#FF6B7A', 30)), lineWidth: 4, style: 'circles' },
  { id: 'plot6', title: 'Zero Upper', color: GRAY_C, lineWidth: 1, style: 'linebr', display: 'pane' },
  { id: 'plot7', title: 'Zero Line', color: GRAY_C, lineWidth: 1, display: 'pane' },
  { id: 'plot8', title: 'Zero Lower', color: GRAY_C, lineWidth: 1, style: 'linebr', display: 'pane' },
  { id: 'plot9', title: 'Hyper Wave', color: '#00D4AA', lineWidth: 2 },
  { id: 'plot10', title: 'Money Flow', color: '#00D4AA', lineWidth: 3 },
];

export const metadata = {
  title: 'Oscillator Matrix [Alpha Extract]',
  shortTitle: 'Oscillator Matrix [Alpha Extract]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<OscillatorMatrixInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]> } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // Money Flow
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  const upVolume = bars.map((b, i) => (i > 0 && gt(tp[i], tp[i - 1]) ? b.volume ?? NaN : 0));
  const downVolume = bars.map((b, i) => (i > 0 && lt(tp[i], tp[i - 1]) ? b.volume ?? NaN : 0));
  const upVolSum = A(ta.sma(S(upVolume), cfg.mfLength));
  const downVolSum = A(ta.sma(S(downVolume), cfg.mfLength));
  const mfRatio = bars.map((_b, i) => {
    const total = upVolSum[i] + downVolSum[i];
    return gt(total, 0) ? (upVolSum[i] - downVolSum[i]) / total : 0;
  });
  const moneyFlow = A(ta.ema(S(mfRatio), cfg.mfSmooth)).map((v) => Math.max(-1, Math.min(1, v * cfg.mfMultiplier)));

  // Hyper Wave
  const fastMa = A(ta.ema(S(close), cfg.hwFast));
  const slowMa = A(ta.ema(S(close), cfg.hwSlow));
  const priceBase = A(ta.sma(S(close), 50));
  const macdNorm = bars.map((_b, i) => (fastMa[i] - slowMa[i]) / priceBase[i]);
  const macdRange = A(ta.highest(S(macdNorm.map(Math.abs)), 100));
  const hwRaw = bars.map((_b, i) => (gt(macdRange[i], 0) ? macdNorm[i] / macdRange[i] : 0));
  const hyperWave = A(ta.ema(S(hwRaw), cfg.hwSmooth)).map((v) => Math.max(-1, Math.min(1, v)));

  const bull = cfg.bullColor;
  const bear = cfg.bearColor;
  const bull40 = String(color.new(bull, 40));
  const bear40 = String(color.new(bear, 40));
  const bull60 = String(color.new(bull, 60));
  const neutral20 = String(color.new(cfg.neutralColor, 20));
  const bull30 = String(color.new(bull, 30));
  const bear30 = String(color.new(bear, 30));
  const bull88 = String(color.new(bull, 88));
  const bear88 = String(color.new(bear, 88));
  const bull94 = String(color.new(bull, 94));
  const bear94 = String(color.new(bear, 94));
  const bull0 = String(color.new(bull, 0));
  const bear0 = String(color.new(bear, 0));

  const plots: Record<string, Point[]> = {};
  for (let k = 0; k <= 10; k++) plots[`plot${k}`] = [];
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];
  // ta.crossover(a, b): a > b and a[1] <= b[1]; ta.crossunder(a, b): a < b and a[1] >= b[1] (exact, no 1e-10 tolerance)
  const crossover = (a: number[], b: number, i: number) => i > 0 && a[i] > b && a[i - 1] <= b;
  const crossunder = (a: number[], b: number, i: number) => i > 0 && a[i] < b && a[i - 1] >= b;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const mf = moneyFlow[i];
    const hw = hyperWave[i];
    const mfOverflowBull = gt(mf, 0.8);
    const mfOverflowBear = lt(mf, -0.8);
    const hwOverflowBull = gt(hw, 0.6);
    const hwOverflowBear = lt(hw, -0.6);
    const confluenceBull = (gt(mf, 0) ? 1 : 0) + (gt(hw, 0) ? 1 : 0) + (mfOverflowBull ? 1 : 0) + (hwOverflowBull ? 1 : 0);
    const confluenceBear = (lt(mf, 0) ? 1 : 0) + (lt(hw, 0) ? 1 : 0) + (mfOverflowBear ? 1 : 0) + (hwOverflowBear ? 1 : 0);
    const strength = confluenceBull > confluenceBear ? confluenceBull / 4 : -confluenceBear / 4;

    const strongBuy = crossover(moneyFlow, -0.7, i) && lt(hw, -0.5);
    const strongSell = crossunder(moneyFlow, 0.7, i) && gt(hw, 0.5);
    const weakBuy = crossover(hyperWave, 0, i) && gt(mf, -0.7);
    const weakSell = crossunder(hyperWave, 0, i) && lt(mf, 0.7);

    const mfColor = gt(mf, 0.7) ? bull : lt(mf, -0.7) ? bear : gt(mf, 0) ? bull40 : bear40;
    const hwColor = gt(hw, 0.5) ? bull : lt(hw, -0.5) ? bear : gt(hw, 0) ? bull60 : neutral20;

    plots.plot0.push({ time: t, value: cfg.showThresholds ? 0.7 : NaN, color: UPPER_COL });
    plots.plot1.push({ time: t, value: cfg.showThresholds ? 1 : NaN, color: UPPER_COL });
    plots.plot2.push({ time: t, value: cfg.showThresholds ? -0.7 : NaN, color: LOWER_COL });
    plots.plot3.push({ time: t, value: cfg.showThresholds ? -1 : NaN, color: LOWER_COL });
    plots.plot4.push({ time: t, value: cfg.showOverflow && mfOverflowBull ? 0.9 : NaN, color: bull30 });
    plots.plot5.push({ time: t, value: cfg.showOverflow && mfOverflowBear ? -0.9 : NaN, color: bear30 });
    // color grayc = color.new(color.gray, 100); if barstate.isconfirmed grayc := color.new(color.gray, 50)
    const grayc = barIsConfirmed(i) ? GRAY_C : GRAY_OPEN;
    plots.plot6.push({ time: t, value: 0.1, color: grayc });
    plots.plot7.push({ time: t, value: 0, color: grayc });
    plots.plot8.push({ time: t, value: -0.1, color: grayc });
    plots.plot9.push({ time: t, value: cfg.showHyperWave ? hw : NaN, color: hwColor });
    plots.plot10.push({ time: t, value: cfg.showMoneyFlow ? mf : NaN, color: mfColor });

    // bgcolor(show_confluence ? confluence_bg_color : na)
    const bg = gt(strength, 0.5) ? bull88 : lt(strength, -0.5) ? bear88 : gt(strength, 0) ? bull94 : lt(strength, 0) ? bear94 : null;
    if (cfg.showConfluence && bg) bgColors.push({ time: t, color: bg });

    if (cfg.showSignals) {
      if (strongBuy) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: bull0, size: 'tiny', forceOverlay: true });
      if (strongSell) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: bear0, size: 'tiny', forceOverlay: true });
      if (weakBuy) markers.push({ time: t, position: 'belowBar', shape: 'circle', color: bull40, size: 'tiny', forceOverlay: true });
      if (weakSell) markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: bear40, size: 'tiny', forceOverlay: true });
    }

    // plotcandle(open, high, low, close, color = candlecolor, wickcolor = candlecolor, bordercolor = candlecolor,
    //   force_overlay = true, display = display.pane); candlecolor na: the candle is not drawn
    const cc = gt(strength, 0) ? bull0 : lt(strength, 0) ? bear0 : 'transparent';
    const b = bars[i];
    candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, color: cc, wickColor: cc, borderColor: cc,
      forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      // fill(up1, up2, color = color.new(#FF6B7A, 80))
      { plot1: 'plot0', plot2: 'plot1', colors: new Array<string>(n).fill(String(color.new(UPPER_COL, 80))) },
      // fill(low1, low2, color = color.new(#00D4AA, 80))
      { plot1: 'plot2', plot2: 'plot3', colors: new Array<string>(n).fill(String(color.new(LOWER_COL, 80))) },
      // fill(hline1, hline3, color = barstate.isconfirmed ? color.new(color.gray, 50) : na)
      { plot1: 'plot6', plot2: 'plot8', colors: bars.map((_b, i) => (barIsConfirmed(i) ? GRAY_C : 'transparent')) },
    ],
    markers,
    bgColors,
    plotCandles: { candleColoring: candles },
  };
}

export const OscillatorMatrix = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
