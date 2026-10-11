/**
 * Volume-Trend Order Block Engine [BigBeluga]
 *
 * A SuperTrend built on the average bar range, with order blocks taken from the pivots of the trend.
 * - Trend stop: hl2 -/+ multiplier x the simple average of (high - low). The bands ratchet as a SuperTrend and the
 *   trend flips when the close breaks the band. The line is cut on the bar of a flip. A gradient fill runs from
 *   the close (coloured) to the trend stop (transparent).
 * - Order block: in an uptrend each pivot low gives a zone from the bottom of the body of the pivot bar down by one
 *   average range; in a downtrend each pivot high gives a zone from the top of the body up by one average range. A
 *   new zone is only taken when it does not overlap the active one. The zone is split in two boxes by the share of
 *   the volume of up bars ("Buy") and down bars ("Sell") in the bars from the pivot to its confirmation. The two
 *   boxes of the active zone grow to the current bar; they are deleted when the price leaves the zone on the wrong
 *   side (option). At most 500 boxes are kept.
 * - Retest signals: a cross below the bar when the low crosses over the top of the active zone, a cross above the
 *   bar when the high crosses under its bottom, when the volume share is above the minimum, on a bar that is not a
 *   pivot confirmation and not a trend flip.
 *
 * Chart context (optional third argument):
 * - `chart.lastBarConfirmed`: a retest signal is only given on a closed bar. Without it every bar is taken as
 *   closed.
 *
 * Reference: "Volume-Trend Order Block Engine [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, math, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface VolumeTrendOrderBlockEngineInputs {
  stLen: number;
  stMult: number;
  showFill: boolean;
  cloudBullCol: string;
  cloudBearCol: string;
  pivotLen: number;
  bullCol: string;
  bearCol: string;
  txtCol: string;
  deleteOnBreak: boolean;
  showBullRetest: boolean;
  bullVolPct: number;
  bullSigCol: string;
  showBearRetest: boolean;
  bearVolPct: number;
  bearSigCol: string;
}

export const defaultInputs: VolumeTrendOrderBlockEngineInputs = {
  stLen: 50,
  stMult: 3.5,
  showFill: true,
  cloudBullCol: '#00ffcc',
  cloudBearCol: '#ff007f',
  pivotLen: 7,
  bullCol: '#00ffcc',
  bearCol: '#ff007f',
  txtCol: '#e0e0e0',
  deleteOnBreak: true,
  showBullRetest: true,
  bullVolPct: 50.0,
  bullSigCol: '#00ffcc',
  showBearRetest: true,
  bearVolPct: 50.0,
  bearSigCol: '#ff007f',
};

const GP_ST = 'Custom Supertrend Settings';
const GP_CLOUD = 'Trend Cloud Settings';
const GP_OB = 'Order Block Settings';
const GP_FILT = 'Retest Filter Settings';

export const inputConfig: InputConfig[] = [
  { id: 'stLen', type: 'int', title: 'Volatility SMA Length', defval: 50, group: GP_ST, tooltip: 'Number of candles used to calculate the average range (High - Low).' },
  { id: 'stMult', type: 'float', title: 'Multiplier', defval: 3.5, step: 0.1, group: GP_ST, tooltip: 'Multiplication factor for the custom volatility band.' },
  { id: 'showFill', type: 'bool', title: 'Show Trend Cloud Fill', defval: true, group: GP_ST, tooltip: 'Enables or disables the background color shading between the close price and the trailing stop line.' },
  { id: 'cloudBullCol', type: 'color', title: 'Bullish Cloud Color', defval: '#00ffcc', group: GP_CLOUD },
  { id: 'cloudBearCol', type: 'color', title: 'Bearish Cloud Color', defval: '#ff007f', group: GP_CLOUD },
  { id: 'pivotLen', type: 'int', title: 'Pivot Strength', defval: 7, min: 1, group: GP_OB, tooltip: 'The number of bars required to confirm a swing high or swing low pivot (Left & Right strength).' },
  { id: 'bullCol', type: 'color', title: 'Bullish OB Color', defval: '#00ffcc', group: GP_OB, tooltip: 'Color used for both zones inside a Bullish Order Block.' },
  { id: 'bearCol', type: 'color', title: 'Bearish OB Color', defval: '#ff007f', group: GP_OB, tooltip: 'Color used for both zones inside a Bearish Order Block.' },
  { id: 'txtCol', type: 'color', title: 'OB Text Label Color', defval: '#e0e0e0', group: GP_OB, tooltip: 'Color of the Buy % and Sell % text inside the order blocks.' },
  { id: 'deleteOnBreak', type: 'bool', title: 'Delete OB on Complete Break', defval: true, group: GP_OB, tooltip: 'If enabled, order blocks will be automatically deleted from the chart once price completely breaks past them.' },
  { id: 'showBullRetest', type: 'bool', title: 'Bullish Retest Signals', defval: true, group: GP_FILT, inline: 'bull_ret', tooltip: 'Enable or disable signals when price cross above the Bullish OB top.' },
  { id: 'bullVolPct', type: 'float', title: 'Min Buy %', defval: 50.0, min: 0.0, max: 100.0, step: 5.0, group: GP_FILT, inline: 'bull_ret', tooltip: 'Minimum Buy Volume percentage required in the original pivot window.' },
  { id: 'bullSigCol', type: 'color', title: 'Color', defval: '#00ffcc', group: GP_FILT, inline: 'bull_ret' },
  { id: 'showBearRetest', type: 'bool', title: 'Bearish Retest Signals', defval: true, group: GP_FILT, inline: 'bear_ret', tooltip: 'Enable or disable signals when price cross below the Bearish OB bottom.' },
  { id: 'bearVolPct', type: 'float', title: 'Min Sell %', defval: 50.0, min: 0.0, max: 100.0, step: 5.0, group: GP_FILT, inline: 'bear_ret', tooltip: 'Minimum Sell Volume percentage required in the original pivot window.' },
  { id: 'bearSigCol', type: 'color', title: 'Color', defval: '#ff007f', group: GP_FILT, inline: 'bear_ret' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend Stop', color: '#00ffcc', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Close Price Reference', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Volume-Trend Order Block Engine [BigBeluga]',
  shortTitle: 'Volume-Trend Order Block Engine [BigBeluga]',
  overlay: true,
};

/** indicator(max_boxes_count = 500) */
const MAX_BOXES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  border: string;
  text: string;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeTrendOrderBlockEngineInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'markers'> & { boxes: BoxData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const stLen = Math.trunc(cfg.stLen);
  const pivotLen = Math.trunc(cfg.pivotLen);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const customAtr = A(ta.sma(new Series(bars, (b) => b.high - b.low), stLen));
  const pivotLow = A(ta.pivotlow(new Series(bars, (b) => b.low), pivotLen, pivotLen));
  const pivotHigh = A(ta.pivothigh(new Series(bars, (b) => b.high), pivotLen, pivotLen));

  // Live boxes in creation order: a creation that brings the count above max + 5 deletes the oldest until max
  // remain. The two boxes that the `var` variables of the script refer to are never deleted by this rule, but they
  // count. A deleted box ignores later changes.
  const boxes: Bx[] = [];
  let activeTopBox: Bx | null = null;
  let activeBotBox: Bx | null = null;
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    boxes.push(o);
    return o;
  };
  const limit = () => {
    if (boxes.length <= MAX_BOXES + 5) return;
    for (let k = 0; k < boxes.length && boxes.length > MAX_BOXES; ) {
      if (boxes[k] === activeTopBox || boxes[k] === activeBotBox) k++;
      else boxes.splice(k, 1)[0].deleted = true;
    }
  };
  const deleteBox = (b: Bx | null) => {
    if (!b || b.deleted) return;
    b.deleted = true;
    boxes.splice(boxes.indexOf(b), 1);
  };
  const setRight = (b: Bx | null, x: number) => {
    if (b && !b.deleted) b.right = x;
  };

  let activeTop = NaN;
  let activeBot = NaN;
  let activeBuyRatio = NaN;
  let activeObTrend = 0;

  /** get_window_volume_ratio(lookback_len): share of the volume of the bars with close >= open */
  const windowVolumeRatio = (i: number, lookback: number): number => {
    let buyVol = 0.0;
    let sellVol = 0.0;
    for (let k = 0; k <= lookback; k++) {
      const b = i - k >= 0 ? bars[i - k] : null;
      const volume = b ? (b.volume ?? NaN) : NaN;
      if (b && ge(b.close, b.open)) buyVol += volume;
      else sellVol += volume;
    }
    const total = buyVol + sellVol;
    return gt(total, 0) ? buyVol / total : 0.5;
  };

  const upperBand: number[] = new Array(n);
  const lowerBand: number[] = new Array(n);
  const marketTrend: number[] = new Array(n);
  const trendStop: number[] = new Array(n);
  const activeTopArr: number[] = new Array(n);
  const activeBotArr: number[] = new Array(n);
  const buyRatioArr: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const src = (b.high + b.low) / 2;
    const prevClose = i > 0 ? bars[i - 1].close : NaN;
    let upper = src + cfg.stMult * customAtr[i];
    let lower = src - cfg.stMult * customAtr[i];
    const prevLowerBand = nz(i > 0 ? lowerBand[i - 1] : NaN);
    const prevUpperBand = nz(i > 0 ? upperBand[i - 1] : NaN);
    lower = gt(lower, prevLowerBand) || lt(prevClose, prevLowerBand) ? lower : prevLowerBand;
    upper = lt(upper, prevUpperBand) || gt(prevClose, prevUpperBand) ? upper : prevUpperBand;
    lowerBand[i] = lower;
    upperBand[i] = upper;
    const prevSuperTrend = i > 0 ? trendStop[i - 1] : NaN;
    let trend: number;
    if (i === 0 || Number.isNaN(customAtr[i - 1])) trend = 1;
    else if (eq(prevSuperTrend, prevUpperBand)) trend = gt(b.close, upper) ? 1 : -1;
    else trend = lt(b.close, lower) ? -1 : 1;
    marketTrend[i] = trend;
    trendStop[i] = trend === 1 ? lower : upper;

    const pIdx = i - pivotLen;
    const isOverlapping = (newTop: number, newBot: number) =>
      (Number.isNaN(activeTop) || Number.isNaN(activeBot) ? false : !(gt(newBot, activeTop) || lt(newTop, activeBot)));
    const orderBlock = (obTop: number, obBot: number, isBull: boolean) => {
      if (isOverlapping(obTop, obBot)) return;
      if (activeTopBox) {
        setRight(activeTopBox, pIdx);
        setRight(activeBotBox, pIdx);
      }
      activeTop = obTop;
      activeBot = obBot;
      activeObTrend = isBull ? 1 : -1;
      const buyRatio = windowVolumeRatio(i, pivotLen);
      activeBuyRatio = buyRatio;
      const sellRatio = 1.0 - buyRatio;
      const splitPrice = activeBot + (activeTop - activeBot) * buyRatio;
      const topText = 'Sell: ' + str.tostring(math.round(sellRatio * 100)) + '%';
      const botText = 'Buy: ' + str.tostring(math.round(buyRatio * 100)) + '%';
      const css = isBull ? cfg.bullCol : cfg.bearCol;
      const border = String(color.new(css, 40));
      activeTopBox = newBox({
        left: pIdx, top: activeTop, right: i, bottom: splitPrice, bg: String(color.new(css, isBull ? 85 : 75)), border, text: topText,
      });
      limit();
      activeBotBox = newBox({
        left: pIdx, top: splitPrice, right: i, bottom: activeBot, bg: String(color.new(css, isBull ? 75 : 85)), border, text: botText,
      });
      limit();
    };

    // 1. Uptrend order blocks (pivot lows)
    if (trend === 1 && !Number.isNaN(pivotLow[i])) {
      const obTop = Math.min(bars[pIdx].open, bars[pIdx].close);
      orderBlock(obTop, obTop - customAtr[i], true);
    }
    // 2. Downtrend order blocks (pivot highs)
    if (trend === -1 && !Number.isNaN(pivotHigh[i])) {
      const obBot = Math.max(bars[pIdx].open, bars[pIdx].close);
      orderBlock(obBot + customAtr[i], obBot, false);
    }

    // Deletion when the price leaves the zone
    if (cfg.deleteOnBreak && !Number.isNaN(activeTop) && !Number.isNaN(activeBot)) {
      const isBroken = (activeObTrend === 1 && lt(b.high, activeBot)) || (activeObTrend === -1 && gt(b.low, activeTop));
      if (isBroken) {
        deleteBox(activeTopBox);
        deleteBox(activeBotBox);
        activeTop = NaN;
        activeBot = NaN;
        activeObTrend = 0;
      }
    }

    // Right edge on the current bar
    if (activeTopBox && activeBotBox) {
      setRight(activeTopBox, i);
      setRight(activeBotBox, i);
    }

    activeTopArr[i] = activeTop;
    activeBotArr[i] = activeBot;
    buyRatioArr[i] = activeBuyRatio;
  }

  // ta.crossover(low, active_top) / ta.crossunder(high, active_bot): they run on every bar
  const S = (a: number[]) => Series.fromArray(bars, a);
  const crossOver = ta.crossover(new Series(bars, (b) => b.low), S(activeTopArr)).toArray();
  const crossUnder = ta.crossunder(new Series(bars, (b) => b.high), S(activeBotArr)).toArray();
  const bullThreshold = cfg.bullVolPct / 100.0;
  const bearThreshold = cfg.bearVolPct / 100.0;

  const plot0: Array<{ time: number; value: number; color?: string }> = [];
  const plot1: Array<{ time: number; value: number }> = [];
  const markers: MarkerData[] = [];
  const topColor: Array<string | null> = [];
  const fillBull = String(color.new(cfg.cloudBullCol, 80));
  const fillBear = String(color.new(cfg.cloudBearCol, 80));
  for (let i = 0; i < n; i++) {
    const time = bars[i].time as number;
    // market_trend != market_trend[1]: false on the first bar (na)
    const marketChange = i > 0 && marketTrend[i] !== marketTrend[i - 1];
    const confirmed = i < n - 1 || lastConfirmed;
    const stop = marketChange ? NaN : trendStop[i];
    plot0.push({
      time, value: Number.isFinite(stop) ? stop : NaN, color: marketTrend[i] === 1 ? cfg.cloudBullCol : cfg.cloudBearCol,
    });
    plot1.push({ time, value: bars[i].close });
    topColor.push(cfg.showFill ? (marketTrend[i] === 1 ? fillBull : fillBear) : null);

    const buyRetest = !!crossOver[i] && cfg.showBullRetest && Number.isNaN(pivotLow[i]) && !Number.isNaN(activeTopArr[i])
      && ge(buyRatioArr[i], bullThreshold) && !marketChange && confirmed;
    const sellRetest = !!crossUnder[i] && Number.isNaN(pivotHigh[i]) && cfg.showBearRetest && !Number.isNaN(activeBotArr[i])
      && ge(1.0 - buyRatioArr[i], bearThreshold) && !marketChange && confirmed;
    if (buyRetest) markers.push({ time, position: 'belowBar', shape: 'cross', color: cfg.bullSigCol, size: 'tiny' });
    if (sellRetest) markers.push({ time, position: 'aboveBar', shape: 'cross', color: cfg.bearSigCol, size: 'tiny' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // fill(price_plot, st_plot, close, trend_stop, fill_color, color(na))
    fills: [{
      plot1: 'plot1', plot2: 'plot0',
      gradient: {
        topValue: bars.map((b) => b.close),
        bottomValue: trendStop.map((v) => (Number.isFinite(v) ? v : NaN)),
        topColor,
        bottomColor: bars.map((): string | null => null),
      },
    }],
    markers,
    // a box with an na coordinate is not drawn
    boxes: boxes.filter((b) => !Number.isNaN(b.top) && !Number.isNaN(b.bottom)).map((b) => ({
      time1: bars[b.left].time as number, price1: b.top, time2: bars[b.right].time as number, price2: b.bottom,
      bgColor: b.bg, borderColor: b.border, text: b.text, textColor: cfg.txtCol, textSize: 'small' as const,
      textVAlign: 'center' as const, textHAlign: 'right' as const,
    })),
  };
}

export const VolumeTrendOrderBlockEngine = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
