/**
 * Kalman Trend Levels [BigBeluga]
 *
 * Two Kalman filters of the close (short and long length; measurement noise 0.01 * length, process noise
 * 0.1 / length). The trend is up while the short filter is above the long one. When the trend turns up, a label
 * with the close (rounded to one decimal) is placed at the short filter and a box from the low to the low + half the
 * 200-bar ATR starts; when it turns down, a label and a box from the high down by half the ATR. While the trend does
 * not change, both latest boxes are extended to the current bar. Optional retest labels mark the bar before a high
 * that falls back under the bottom of the latest down box ("x") or a low that moves back above the top of the
 * latest up box ("+"). The two filters are plotted with a gradient fill between them, and the candles are coloured
 * by the trend and the 2-bar slope of the short filter.
 *
 * Reference: "Kalman Trend Levels [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, math, color, label, box, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, PlotCandleData } from '../types';

export interface KalmanTrendLevelsInputs {
  /** Length of the short Kalman filter */
  shortLen: number;
  /** Length of the long Kalman filter */
  longLen: number;
  /** Retest Signals */
  retestSig: boolean;
  /** Candle Color */
  candleColor: boolean;
  /** Up colour */
  upperCol: string;
  /** Down colour */
  lowerCol: string;
}

export const defaultInputs: KalmanTrendLevelsInputs = {
  shortLen: 50,
  longLen: 150,
  retestSig: false,
  candleColor: true,
  upperCol: '#13bd6e',
  lowerCol: '#af0d4b',
};

export const inputConfig: InputConfig[] = [
  { id: 'shortLen', type: 'int', title: 'short_len', defval: 50 },
  { id: 'longLen', type: 'int', title: 'long_len', defval: 150 },
  { id: 'retestSig', type: 'bool', title: 'Retest Signals', defval: false },
  { id: 'candleColor', type: 'bool', title: 'Candle Color', defval: true },
  { id: 'upperCol', type: 'color', title: 'up', defval: '#13bd6e', inline: 'colors' },
  { id: 'lowerCol', type: 'color', title: 'dn', defval: '#af0d4b', inline: 'colors' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Short Kalman', color: '#13bd6e', lineWidth: 1 },
  { id: 'plot1', title: 'Long Kalman', color: '#13bd6e', lineWidth: 2 },
];

export const metadata = {
  title: 'Kalman Trend Levels [BigBeluga]',
  shortTitle: 'Kalman Trend Levels [BigBeluga]',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;
/** color.gray of Pine v5 */
const GRAY = '#787B86';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);

/** kalman_filter(src, length, R = 0.01, Q = 0.1): one call site, `var` state kept across the bars */
function kalmanFilter(src: number[], length: number, R = 0.01, Q = 0.1): number[] {
  const out: number[] = new Array(src.length);
  let estimate = NaN;
  let errorEst = 1.0;
  const errorMeas = R * length;
  for (let i = 0; i < src.length; i++) {
    // if na(estimate): estimate := src[1]
    if (Number.isNaN(estimate)) estimate = i >= 1 ? src[i - 1] : NaN;
    const prediction = estimate;
    const kalmanGain = errorEst / (errorEst + errorMeas);
    estimate = prediction + kalmanGain * (src[i] - prediction);
    errorEst = (1 - kalmanGain) * errorEst + Q / length;
    out[i] = estimate;
  }
  return out;
}

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<KalmanTrendLevelsInputs> = {},
): Omit<IndicatorResult, 'labels' | 'boxes' | 'plotCandles'> & {
  labels: LabelData[]; boxes: BoxData[]; plotCandles: Record<string, PlotCandleData[]>;
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const upperCol = cfg.upperCol;
  const lowerCol = cfg.lowerCol;
  const close = bars.map((b) => b.close);

  // float atr = ta.atr(200) * 0.5
  const atr = ta.atr(bars, 200).toArray().map((v) => (v ?? NaN) * 0.5);
  const shortKalman = kalmanFilter(close, cfg.shortLen);
  const longKalman = kalmanFilter(close, cfg.longLen);

  resetDrawings({ label: MAX_OBJECTS, box: MAX_OBJECTS });
  const lowerBox = varDrawing<Box>(); // var lower_box = box(na)
  const upperBox = varDrawing<Box>(); // var upper_box = box(na)
  const upBox = String(color.new(upperCol, 60));
  const dnBox = String(color.new(lowerCol, 60));
  const bottomOf = (b: Box | undefined) => (b ? box.get_bottom(b) : NaN);
  const topOf = (b: Box | undefined) => (b ? box.get_top(b) : NaN);

  const plots: Record<string, Point[]> = { plot0: [], plot1: [] };
  const fillBottom: Array<string | null> = [];
  const fillTop: Array<string | null> = [];
  const candles: PlotCandleData[] = [];
  let prevTrendUp = false;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const s = shortKalman[i];
    const s2 = i >= 2 ? shortKalman[i - 2] : NaN;
    const trendUp = gt(s, longKalman[i]);
    const trendCol = trendUp ? upperCol : lowerCol;
    const trendCol1 = gt(s, s2) ? upperCol : lowerCol;
    const candleCol = cfg.candleColor
      ? (trendUp && gt(s, s2) ? upperCol : !trendUp && lt(s, s2) ? lowerCol : GRAY)
      : 'transparent';

    // ta.change(trend_up): the trend of the bar before differs (false on the first bar)
    const changed = i > 0 && trendUp !== prevTrendUp;
    if (trendUp && !prevTrendUp) {
      label.new(i, s, '🡹\n' + str.tostring(math.round(b.close, 1)), 'bar_index', 'price', 'transparent', 'label_up',
        upperCol, 'normal');
      lowerBox.value = box.new(i, b.low + atr[i], i, b.low, 'transparent', undefined, undefined, undefined, undefined, upBox);
    }
    if (!changed && lowerBox.value) box.set_right(lowerBox.value, i);
    if (prevTrendUp && !trendUp) {
      label.new(i, s, str.tostring(math.round(b.close, 1)) + '\n🢃', 'bar_index', 'price', 'transparent', 'label_down',
        lowerCol, 'normal');
      upperBox.value = box.new(i, b.high, i, b.high - atr[i], 'transparent', undefined, undefined, undefined, undefined, dnBox);
    }
    if (!changed && upperBox.value) box.set_right(upperBox.value, i);

    if (cfg.retestSig && i >= 1) {
      const p = bars[i - 1];
      const ubBottom = bottomOf(upperBox.value);
      if (lt(b.high, ubBottom) && ge(p.high, ubBottom)) {
        label.new(i - 1, p.high, 'x', 'bar_index', 'price', 'transparent', 'label_down', lowerCol, 'normal');
      }
      const lbTop = topOf(lowerBox.value);
      if (gt(b.low, lbTop) && ge(lbTop, p.low)) {
        label.new(i - 1, p.low, '+', 'bar_index', 'price', 'transparent', 'label_up', upperCol, 'normal');
      }
    }
    prevTrendUp = trendUp;

    plots.plot0.push({ time: b.time, value: s, color: trendCol1 });
    plots.plot1.push({ time: b.time, value: longKalman[i], color: trendCol });
    // fill(p1, p2, short_kalman, long_kalman, na, color.new(trend_col, 80))
    fillTop.push(null);
    fillBottom.push(String(color.new(trendCol, 80)));
    // plotcandle(open, high, low, close, color = candle_col, wickcolor = candle_col, bordercolor = candle_col)
    candles.push({
      time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
      color: candleCol, wickColor: candleCol, borderColor: candleCol,
    });
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [{
      plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' },
      gradient: { topValue: shortKalman, bottomValue: longKalman, topColor: fillTop, bottomColor: fillBottom },
    }],
    plotCandles: { candles },
    labels: drawn.labels ?? [],
    boxes: drawn.boxes ?? [],
  };
}

export const KalmanTrendLevels = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
