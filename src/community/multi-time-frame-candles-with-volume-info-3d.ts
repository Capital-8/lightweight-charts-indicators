/**
 * Multi Time Frame Candles with Volume Info / 3D
 *
 * Builds the candles of a higher timeframe from the chart bars (open of the first bar of the period, highest high,
 * lowest low, last close, sum of the volumes; a new candle on each bar where `time(tf)` changes) and keeps the last
 * "Number of Candles" of them. They are drawn with lines in the indicator pane, the newest "Start Bar" bars to the
 * left of the last bar and 8 bars apart: a body line (candle width), two wick lines and a volume bar below the
 * candles (scaled to 45 % of the price range of the candles), with a volume label (K / M / B) under each candle.
 * The "3D Effect" adds a shadow line behind each line (shifted one bar right and 1/20 of the range down) and a
 * background colour; without it a dotted zero line of the volume bars is drawn. A label shows the time from
 * `timenow` to the close of the higher-timeframe candle. When the chart bar makes the highest high (lowest
 * low) of the candles, a blue line marks the high (low) of the older candles and the shadows fade.
 *
 * Chart context: `syminfo.mintick` (height of a body with open = close), `timenow`, the time zone and session of
 * the symbol (higher-timeframe periods and their close time). The close time is that of the last completed
 * higher-timeframe candle (`security` without lookahead on historical bars), or of the last bar on the chart
 * timeframe. Without a context the close time follows a 24x7 UTC calendar.
 *
 * Alerts (alertcondition, `alerts` of the result): 'New High' / 'New Low', true on the bars whose high (low) is the
 * highest high (lowest low) of the candles.
 *
 * Reference: "Multi Time Frame Candles with Volume" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  str, timeframe, line, label, periodClose, resetDrawings, setDrawingBar, drawingOutputs, varDrawing,
  type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { type ChartContext, mintickOf, nowOf } from '../chart-context';
import { chartTimeframe, hasCalendar, higherTimeframeBars, periodChanges } from '../anchor-period';

export interface MultiTimeFrameCandlesWithVolumeInfo3dInputs {
  /** Time Frame of the candles */
  timeframe: string;
  numofcandles: number;
  colorup: string;
  colordown: string;
  colorwick: string;
  colorvolup: string;
  colorvoldown: string;
  colortimeclose: string;
  colorshadow: string;
  backcolor: string;
  candlewidth: number;
  startbar: number;
  effect3d: boolean;
}

export const defaultInputs: MultiTimeFrameCandlesWithVolumeInfo3dInputs = {
  timeframe: 'D',
  numofcandles: 8,
  colorup: '#00E676',
  colordown: '#FF5252',
  colorwick: '#787B86',
  colorvolup: '#b2b5be',
  colorvoldown: '#787b86',
  colortimeclose: '#2196F3',
  colorshadow: '#363A45',
  backcolor: '#5d606b',
  candlewidth: 30,
  startbar: 15,
  effect3d: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'timeframe', type: 'timeframe', title: 'Time Frame', defval: 'D' },
  { id: 'numofcandles', type: 'int', title: 'Number of Candles', defval: 8, min: 1, max: 10 },
  { id: 'colorup', type: 'color', title: 'Color Up', defval: '#00E676' },
  { id: 'colordown', type: 'color', title: 'Color Down', defval: '#FF5252' },
  { id: 'colorwick', type: 'color', title: 'Wick Color', defval: '#787B86' },
  { id: 'colorvolup', type: 'color', title: 'Volume Color Up', defval: '#b2b5be' },
  { id: 'colorvoldown', type: 'color', title: 'Volume Color Down', defval: '#787b86' },
  { id: 'colortimeclose', type: 'color', title: 'Time Text Color', defval: '#2196F3' },
  { id: 'colorshadow', type: 'color', title: 'Shadow Color', defval: '#363A45' },
  { id: 'backcolor', type: 'color', title: 'Background Color', defval: '#5d606b' },
  { id: 'candlewidth', type: 'int', title: 'Candle Width', defval: 30, min: 1, max: 40 },
  { id: 'startbar', type: 'int', title: 'Start Bar', defval: 15, min: 15 },
  { id: 'effect3d', type: 'bool', title: '3D Effect', defval: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Multi Time Frame Candles with Volume',
  shortTitle: 'Multi Time Frame Candles with Volume',
  overlay: false,
};

/** study(max_lines_count = 100) */
const MAX_LINES = 100;
/** Pine v4 colour constants */
const BLUE = '#2196F3';
const WHITE = '#FFFFFF';
const GRAY = '#787B86';

const EPS = 1e-10;
/** Pine `==` (within 1e-10; na compares false) */
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** timetostring(): days, hours, minutes and (below one day) seconds of a duration in seconds */
function timetostring(t: number): string {
  const d = Math.floor(t / 86400);
  const h = Math.floor((t - d * 86400) / 3600);
  const m = Math.floor((t - d * 86400 - h * 3600) / 60);
  const s = Math.floor(t - d * 86400 - h * 3600 - m * 60);
  let ret = d > 0 ? `${str.tostring(d)}D ` : '';
  ret += h > 0 ? `${str.tostring(h)}H ` : '';
  ret += m > 0 ? `${str.tostring(m)}m ` : '';
  if (d === 0) ret += s > 0 ? `${str.tostring(s)}s ` : '';
  return ret;
}

/** get_vol(): the volume in B / M / K */
function getVol(vol: number): [number, string] {
  if (vol >= 1e9) return [vol / 1e9, 'B'];
  if (vol >= 1e6) return [vol / 1e6, 'M'];
  if (vol >= 1e3) return [vol / 1e3, 'K'];
  return [vol, ''];
}

/**
 * `security(syminfo.tickerid, tf, time_close)` on the last bar, in ms: the close time of the last bar on the chart
 * timeframe; for a higher timeframe the close time of the latest completed period (na when there is none), also
 * when the last bar is still open (as the reference runs show).
 */
function lastTimeClose(bars: Bar[], tf: string, chart?: ChartContext): number {
  const n = bars.length;
  const unit = bars[0].time >= 1e12 ? 1 : 1000;
  const chartTf = chartTimeframe(bars, chart);
  if (chartTf === '') return NaN;
  const context = hasCalendar(chart)
    ? { timeframe: chartTf, timezone: chart!.timezone, session: chart!.session, regularSession: chart!.regularSession }
    : { timeframe: chartTf, timezone: 'Etc/UTC', session: '24x7' };
  const ctx = { ...context, timeUnit: unit === 1 ? 'ms' as const : 's' as const };
  const higher = tf.trim() !== '' && timeframe.in_seconds(tf) > timeframe.in_seconds(chartTf);
  if (!higher) return periodClose(bars[n - 1].time, chartTf, ctx);
  const periods = higherTimeframeBars(bars, tf, chart);
  const latest = periods.latest[n - 1];
  if (latest < 0) return NaN;
  return periodClose(bars[periods.first[latest]].time, tf, ctx);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MultiTimeFrameCandlesWithVolumeInfo3dInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const num = Math.trunc(cfg.numofcandles);
  const width = Math.trunc(cfg.candlewidth);
  const startbar = Math.trunc(cfg.startbar);
  const effect3d = cfg.effect3d;
  const mintick = mintickOf(chart);
  const result = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
  };
  if (n === 0) return { ...result, bgColors: [], alerts: alertStates(alertConditions, bars, []) };
  const newHighFlags = new Array<boolean>(n).fill(false);
  const newLowFlags = new Array<boolean>(n).fill(false);

  // newbar = change(time(Timeframe)) != 0 (false on the first bar)
  const newbar = periodChanges(bars, cfg.timeframe, chart);

  resetDrawings({ line: MAX_LINES });
  // var candles = array.new_float(numofcandles * 5, na): open, high, low, close, volume of each candle
  const candles: number[] = new Array(num * 5).fill(NaN);
  const candlelines: Line[] = [];
  const volumelines: Line[] = [];
  const volumelabels: ReturnType<typeof label.new>[] = [];
  const shadows: Line[] = [];
  const volzeroline = varDrawing<Line>();
  const highline = varDrawing<Line>();
  const lowline = varDrawing<Line>();
  let clock: ReturnType<typeof label.new> | undefined;
  const distance = 8;
  const sdistanceX = 1;
  const bgColors: BgColorData[] = [];
  const nowMs = nowOf(chart);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const volume = b.volume ?? NaN;
    if (newbar[i]) {
      for (let x = num * 5 - 1; x >= 5; x--) candles[x] = candles[x - 5];
      candles[0] = b.open;
      candles[1] = b.high;
      candles[2] = b.low;
      candles[3] = b.close;
      candles[4] = volume;
    } else {
      candles[1] = Math.max(candles[1], b.high);
      candles[2] = Math.min(candles[2], b.low);
      candles[3] = b.close;
      candles[4] = candles[4] + volume;
    }

    if (i === 0) {
      for (let x = 0; x < num; x++) {
        if (effect3d) {
          shadows[x * 4] = line.new(i, b.close, i, b.close, 'bar_index', 'none', cfg.colorshadow, 'solid', width);
          shadows[x * 4 + 1] = line.new(i, b.close, i, b.close, 'bar_index', 'none', cfg.colorshadow, 'solid', 3);
          shadows[x * 4 + 2] = line.new(i, b.close, i, b.close, 'bar_index', 'none', cfg.colorshadow, 'solid', 3);
          shadows[x * 4 + 3] = line.new(i, b.close, i, b.close, 'bar_index', 'none', cfg.colorshadow, 'solid', width);
        }
        candlelines[x * 3] = line.new(i, b.close, i, b.close, 'bar_index', 'none', BLUE, 'solid', width);
        candlelines[x * 3 + 1] = line.new(i, b.close, i, b.close, 'bar_index', 'none', effect3d ? WHITE : cfg.colorwick, 'solid', 3);
        candlelines[x * 3 + 2] = line.new(i, b.close, i, b.close, 'bar_index', 'none', effect3d ? WHITE : cfg.colorwick, 'solid', 3);
        volumelines[x] = line.new(i, b.close, i, b.close, 'bar_index', 'none', BLUE, 'solid', width);
        volumelabels[x] = label.new(i, b.close, '', 'bar_index', 'price', BLUE, 'none', BLUE);
      }
    }

    // max / min levels of the candles
    let maxlevel = arrayMin(candles);
    let minlevel = arrayMax(candles);
    const volarray: number[] = [];
    for (let x = 0; x < num; x++) {
      maxlevel = Math.max(maxlevel, candles[x * 5 + 1]);
      minlevel = Math.min(minlevel, candles[x * 5 + 2]);
      volarray.push(candles[x * 5 + 4]);
    }

    if (effect3d) bgColors.push({ time: b.time, color: cfg.backcolor });
    const cw = (maxlevel - minlevel) / 20;

    // normalization
    const volzerolevel = minlevel - 0.5 * (maxlevel - minlevel);
    const norm = 0.45 * (maxlevel - minlevel);
    const maxvol = arrayMax(volarray);
    for (let x = 0; x < num; x++) volarray[x] = norm * volarray[x] / maxvol;

    // zero line
    if (!effect3d) {
      if (!volzeroline.value) {
        volzeroline.value = line.new(i, volzerolevel, i - 1, volzerolevel, 'bar_index', 'both', GRAY, 'dotted');
      }
      line.set_xy1(volzeroline.value, i, volzerolevel);
      line.set_xy2(volzeroline.value, i - 1, volzerolevel);
    }

    const sdistanceY = -cw;
    const startloc = i - startbar;

    // time to close of the higher-timeframe candle: the label text of the last bar
    if (i === 0) {
      clock = label.new(startloc, b.close, '', 'bar_index', 'price', BLUE, 'none', cfg.colortimeclose);
    }
    label.set_xy(clock!, startloc + 9, candles[0]);
    if (i === n - 1) {
      const timeclose = (lastTimeClose(bars, cfg.timeframe, chart) - nowMs) / 1000;
      label.set_text(clock!, timetostring(timeclose));
    }

    const newhigh = eq(b.high, maxlevel);
    const newlow = eq(b.low, minlevel);
    newHighFlags[i] = newhigh;
    newLowFlags[i] = newlow;
    if (highline.value) line.delete(highline.value);
    if (lowline.value) line.delete(lowline.value);
    if (newhigh && num > 1) {
      let h = candles[7];
      for (let x = 1; x < num; x++) h = Math.max(h, candles[x * 5 + 1]);
      highline.value = line.new(startloc - 8 * (num - 1) - 2, h, startloc - 3, h, 'bar_index', 'none', BLUE, 'solid', 3);
    }
    if (newlow && num > 1) {
      let l = candles[6];
      for (let x = 1; x < num; x++) l = Math.min(l, candles[x * 5 + 2]);
      lowline.value = line.new(startloc - 8 * (num - 1) - 2, l, startloc - 3, l, 'bar_index', 'none', BLUE, 'solid', 3);
    }

    // shadows
    if (effect3d) {
      const fade = newhigh || newlow;
      for (let x = 0; x < num; x++) {
        const sx = startloc - x * distance + sdistanceX;
        const o = candles[x * 5];
        const c = candles[x * 5 + 3];
        line.set_xy1(shadows[x * 4], sx, o + sdistanceY);
        line.set_xy2(shadows[x * 4], sx, c + sdistanceY);
        line.set_color(shadows[x * 4], fade ? 'rgba(255, 255, 255, 0.05)' : cfg.colorshadow);

        line.set_xy1(shadows[x * 4 + 1], sx, Math.max(o, c) + sdistanceY);
        line.set_xy2(shadows[x * 4 + 1], sx, candles[x * 5 + 1] + sdistanceY);
        line.set_color(shadows[x * 4 + 1], fade ? 'rgba(255, 255, 255, 0)' : cfg.colorshadow);

        line.set_xy1(shadows[x * 4 + 2], sx, Math.min(o, c) + sdistanceY);
        line.set_xy2(shadows[x * 4 + 2], sx, candles[x * 5 + 2] + sdistanceY);
        line.set_color(shadows[x * 4 + 2], fade ? 'rgba(255, 255, 255, 0)' : cfg.colorshadow);

        line.set_xy1(shadows[x * 4 + 3], sx, volzerolevel + sdistanceY);
        line.set_xy2(shadows[x * 4 + 3], sx, volarray[x] + volzerolevel + sdistanceY);
      }
    }

    // candles, volume lines and labels
    for (let x = 0; x < num; x++) {
      const cx = startloc - x * distance;
      const o = candles[x * 5];
      const c = candles[x * 5 + 3];
      const up = c >= o || eq(c, o);
      line.set_xy1(volumelines[x], cx, volzerolevel);
      line.set_xy2(volumelines[x], cx, volarray[x] + volzerolevel);
      line.set_color(volumelines[x], up ? cfg.colorvolup : cfg.colorvoldown);

      const [rvol, rmul] = getVol(candles[x * 5 + 4]);
      label.set_xy(volumelabels[x], cx, volzerolevel - 0.2 * (maxlevel - minlevel));
      label.set_text(volumelabels[x], str.tostring(rvol, '#.##') + rmul);
      label.set_textcolor(volumelabels[x], up ? cfg.colorup : cfg.colordown);

      // open == close: a body of one tick
      const candleh = eq(c, o) ? mintick : 0;
      line.set_xy1(candlelines[x * 3], cx, o);
      line.set_xy2(candlelines[x * 3], cx, c + candleh);
      line.set_color(candlelines[x * 3], up ? cfg.colorup : cfg.colordown);

      line.set_xy1(candlelines[x * 3 + 1], cx, Math.max(o, c));
      line.set_xy2(candlelines[x * 3 + 1], cx, candles[x * 5 + 1]);

      line.set_xy1(candlelines[x * 3 + 2], cx, Math.min(o, c));
      line.set_xy2(candlelines[x * 3 + 2], cx, candles[x * 5 + 2]);
    }
  }
  setDrawingBar(null);

  // alertcondition(newhigh, 'New High') / alertcondition(newlow, 'New Low')
  return { ...result, bgColors, ...drawingOutputs(bars), alerts: alertStates(alertConditions, bars, [newHighFlags, newLowFlags]) };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'New High', message: 'New High' },
  { id: 'alert1', title: 'New Low', message: 'New Low' },
];

/** array.min (na skipped; na when no value) */
function arrayMin(a: number[]): number {
  let m = NaN;
  for (const v of a) if (!Number.isNaN(v) && (Number.isNaN(m) || v < m)) m = v;
  return m;
}

/** array.max (na skipped; na when no value) */
function arrayMax(a: number[]): number {
  let m = NaN;
  for (const v of a) if (!Number.isNaN(v) && (Number.isNaN(m) || v > m)) m = v;
  return m;
}

export const MultiTimeFrameCandlesWithVolumeInfo3d = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
