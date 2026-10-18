/**
 * HTF Reversal Divergences [LuxAlgo]
 *
 * RSI pane with divergences and reversal candles of a higher timeframe drawn on the price chart:
 * - RSI(close, `RSI Length`), coloured by its side of 50, a mid line at 50 and a gradient fill between them; dashed
 *   levels at 70 / 30.
 * - Divergences on RSI pivots (`Pivot Left / Right Lookback`): a pivot low of the RSI above the previous one while the
 *   low is below the previous pivot low gives "Bull Div" (a line on the price chart, a line in the RSI pane and a
 *   label below the bar); the reverse on pivot highs gives "Bear Div".
 * - Reversal patterns of the `High Timeframe` bar that just completed (as `request.security` without lookahead gives
 *   `open[1] ... time_close[1]`), checked on the first chart bar of each new period of that timeframe: bullish /
 *   bearish engulfing, hammer and shooting star (pin bars). Each pattern draws a range box, a body box and a wick line
 *   over the time of that bar, and a label with the pattern name and the bar time (HH:mm, exchange time zone).
 * - "Show HTF PO3" (off by default): on the last bar, the latest `Candles to Show` periods of the timeframe drawn as
 *   candles `Right Offset` bars to the right of the last bar, built from the chart bars (open, high, low, close and
 *   the volume delta of up / down bars), with price markers and labels for the live period.
 * At most 500 lines, boxes and labels are kept.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close), each with its switch of the "Alerts"
 * group: "Bullish / Bearish RSI Divergence on <ticker>" on the bar a divergence is confirmed, "HTF Bullish / Bearish
 * Engulfing", "HTF Hammer" and "HTF Shooting Star on <ticker>" on the first bar of a period after such a bar.
 *
 * A `High Timeframe` lower than the chart timeframe needs the bars of that lower timeframe, which the chart bars do
 * not have: the port throws an Error when a pattern type is switched on with such a timeframe (the RSI, the
 * divergences and the PO3 candles do not use them).
 *
 * Chart context: exchange time zone and session (periods of the timeframe, pattern times), `syminfo.mintick` (PO3
 * prices), `chart.fg_color` (mid line).
 *
 * Reference: "HTF Reversal Divergences [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, timeframe, color, Series, line, box, label, resetDrawings, setDrawingBar, drawingOutputs, periodClose,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar, type SessionContext,
} from 'oakscriptjs';
import {
  mintickOf, timezoneOf, foregroundColorOf, tickerOf, type ChartContext,
} from '../chart-context';
import type { AlertCall } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;
import { chartTimeframe, periodChanges, higherTimeframeBars, hasCalendar } from '../anchor-period';

export interface HtfReversalDivergencesInputs {
  htfInput: string;
  showEngulfingInput: boolean;
  showPinBarsInput: boolean;
  bullPatternColInput: string;
  bearPatternColInput: string;
  showDivInput: boolean;
  rsiLenInput: number;
  lbRInput: number;
  lbLInput: number;
  bullDivColInput: string;
  bearDivColInput: string;
  showPo3Input: boolean;
  candleCountInput: number;
  po3OffsetInput: number;
  showPo3LabelsInput: boolean;
  showPo3DeltaInput: boolean;
  /** Alert switches (alert() calls of the result) */
  alertBullDivInput: boolean;
  alertBearDivInput: boolean;
  alertBullEngInput: boolean;
  alertBearEngInput: boolean;
  alertHammerInput: boolean;
  alertStarInput: boolean;
}

const BULL_COLOR = '#089981';
const BEAR_COLOR = '#F23645';
const NEUTRAL_COLOR = '#787B86';

export const defaultInputs: HtfReversalDivergencesInputs = {
  htfInput: '15',
  showEngulfingInput: true,
  showPinBarsInput: true,
  bullPatternColInput: BULL_COLOR,
  bearPatternColInput: BEAR_COLOR,
  showDivInput: true,
  rsiLenInput: 14,
  lbRInput: 5,
  lbLInput: 5,
  bullDivColInput: BULL_COLOR,
  bearDivColInput: BEAR_COLOR,
  showPo3Input: false,
  candleCountInput: 1,
  po3OffsetInput: 15,
  showPo3LabelsInput: true,
  showPo3DeltaInput: true,
  alertBullDivInput: true,
  alertBearDivInput: true,
  alertBullEngInput: true,
  alertBearEngInput: true,
  alertHammerInput: true,
  alertStarInput: true,
};

const G_HTF = 'HTF Reversal Patterns';
const G_DIV = 'RSI Divergence';
const G_PO3 = 'Advanced: HTF PO3';
const G_ALERTS = 'Alerts';

export const inputConfig: InputConfig[] = [
  { id: 'htfInput', type: 'timeframe', title: 'High Timeframe', defval: '15', group: G_HTF,
    tooltip: 'The timeframe to check for reversal patterns.' },
  { id: 'showEngulfingInput', type: 'bool', title: 'Show Engulfing Patterns', defval: true, group: G_HTF },
  { id: 'showPinBarsInput', type: 'bool', title: 'Show Pin Bars', defval: true, group: G_HTF,
    tooltip: 'Includes Hammer and Shooting Star patterns.' },
  { id: 'bullPatternColInput', type: 'color', title: 'Bullish Pattern Color', defval: BULL_COLOR, group: G_HTF, inline: 'Colors' },
  { id: 'bearPatternColInput', type: 'color', title: 'Bearish Pattern Color', defval: BEAR_COLOR, group: G_HTF, inline: 'Colors' },
  { id: 'showDivInput', type: 'bool', title: 'Show RSI Divergences', defval: true, group: G_DIV },
  { id: 'rsiLenInput', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: G_DIV },
  { id: 'lbRInput', type: 'int', title: 'Pivot Right Lookback', defval: 5, group: G_DIV },
  { id: 'lbLInput', type: 'int', title: 'Pivot Left Lookback', defval: 5, group: G_DIV },
  { id: 'bullDivColInput', type: 'color', title: 'Bullish Div Color', defval: BULL_COLOR, group: G_DIV, inline: 'Div Colors' },
  { id: 'bearDivColInput', type: 'color', title: 'Bearish Div Color', defval: BEAR_COLOR, group: G_DIV, inline: 'Div Colors' },
  { id: 'showPo3Input', type: 'bool', title: 'Show HTF PO3', defval: false, group: G_PO3,
    tooltip: 'Displays projected HTF candles to the right of price on the main chart.' },
  { id: 'candleCountInput', type: 'int', title: 'Candles to Show', defval: 1, min: 1, max: 10, group: G_PO3 },
  { id: 'po3OffsetInput', type: 'int', title: 'Right Offset (Bars)', defval: 15, min: 5, group: G_PO3 },
  { id: 'showPo3LabelsInput', type: 'bool', title: 'Show PO3 Price Labels', defval: true, group: G_PO3 },
  { id: 'showPo3DeltaInput', type: 'bool', title: 'Show PO3 Running Delta', defval: true, group: G_PO3 },
  { id: 'alertBullDivInput', type: 'bool', title: 'Bullish Divergence', defval: true, group: G_ALERTS },
  { id: 'alertBearDivInput', type: 'bool', title: 'Bearish Divergence', defval: true, group: G_ALERTS },
  { id: 'alertBullEngInput', type: 'bool', title: 'Bullish Engulfing', defval: true, group: G_ALERTS },
  { id: 'alertBearEngInput', type: 'bool', title: 'Bearish Engulfing', defval: true, group: G_ALERTS },
  { id: 'alertHammerInput', type: 'bool', title: 'Hammer', defval: true, group: G_ALERTS },
  { id: 'alertStarInput', type: 'bool', title: 'Shooting Star', defval: true, group: G_ALERTS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: BULL_COLOR, lineWidth: 2 },
  { id: 'plot1', title: 'Mid Line', color: String(color.new('#DBDBDB', 80)), lineWidth: 1, style: 'linebr' },
];

/** hline(70, "OB") / hline(30, "OS") with the default colours (the result `hlines` carry the input colours) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 70, title: 'OB', color: String(color.new(BEAR_COLOR, 50)), linestyle: 'dashed' },
  { id: 'hline_os', price: 30, title: 'OS', color: String(color.new(BULL_COLOR, 50)), linestyle: 'dashed' },
];

export const metadata = {
  title: 'HTF Reversal Divergences [LuxAlgo]',
  shortTitle: 'LuxAlgo - HTF Reversal Divergences',
  overlay: false,
};

/** indicator(max_labels_count = 500, max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
/** Text colour of a box without `text_color` in a v6 script */
const BOX_TEXT = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** The end (ms) of the period of `tf` that starts at `start` (ms), without the exchange calendar */
function periodEnd(start: number, tf: string): number {
  const info = timeframe.info(tf);
  if (info.ismonthly) {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + info.multiplier, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
  }
  return start + timeframe.in_seconds(tf) * 1000;
}

/** formatDelta(val) */
function formatDelta(val: number): string {
  const sign = gt(val, 0) ? '+' : '';
  const absVal = Math.abs(val);
  if (ge(absVal, 1000000)) return sign + str.format('{0,number,#.#}M', val / 1000000);
  if (ge(absVal, 1000)) return sign + str.format('{0,number,#.#}K', val / 1000);
  return sign + str.tostring(val);
}

interface HTFData {
  o: number;
  h: number;
  l: number;
  c: number;
  oIdx: number;
  hIdx: number;
  lIdx: number;
  delta: number;
  startTime: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HtfReversalDivergencesInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tz = timezoneOf(chart);
  const tick = mintickOf(chart);
  const fg = foregroundColorOf(chart);
  const ms = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const bullP = cfg.bullPatternColInput;
  const bearP = cfg.bearPatternColInput;
  const bullD = cfg.bullDivColInput;
  const bearD = cfg.bearDivColInput;
  const lbR = cfg.lbRInput;
  const htf = cfg.htfInput.trim() === '' ? chartTimeframe(bars, chart) : cfg.htfInput;
  const chartTf = chartTimeframe(bars, chart);
  const patternsOn = cfg.showEngulfingInput || cfg.showPinBarsInput;
  const ticker = tickerOf(chart);
  const alertCalls: AlertCall[] = [];

  // bool htfNewBar = nz(ta.change(time(htfInput))) != 0
  const htfNewBar = n > 0 ? periodChanges(bars, htf, chart) : [];

  // request.security(syminfo.tickerid, htfInput, [open[1], high[1], low[1], close[1], open[2], close[2], time[1],
  // time_close[1]]): the bars of the timeframe and, per chart bar, the latest completed one (no lookahead)
  let H: Bar[] = [];
  let latest: number[] = [];
  if (n > 0 && patternsOn) {
    const sameTf = chartTf === '' || timeframe.in_seconds(htf) === timeframe.in_seconds(chartTf);
    if (!sameTf && timeframe.in_seconds(htf) < timeframe.in_seconds(chartTf)) {
      throw new Error(`HTF Reversal Divergences: the timeframe "${htf}" is lower than the chart timeframe "${chartTf}": `
        + 'the chart bars do not have that data (choose a timeframe equal to or above the chart timeframe, or switch off '
        + 'the engulfing and pin bar patterns)');
    }
    if (sameTf) {
      H = bars;
      latest = bars.map((_b, i) => i);
    } else {
      const sec = higherTimeframeBars(bars, htf, chart);
      H = sec.htf;
      latest = sec.latest;
    }
  }
  // time_close of a bar of the timeframe: the library close with the exchange calendar, else the end of the period
  const htfCalendar: SessionContext | null = chart && hasCalendar(chart)
    ? { timeframe: htf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession, timeUnit: 'ms' }
    : null;
  const closes = new Map<number, number>();
  const htfClose = (k: number): number => {
    let c = closes.get(k);
    if (c !== undefined) return c;
    const start = H[k].time * ms;
    c = NaN;
    try {
      if (htfCalendar !== null) c = periodClose(start, htf, htfCalendar);
    } catch {
      // a time zone or a session that the library does not read: the end of the period
    }
    if (Number.isNaN(c)) c = periodEnd(start, htf);
    closes.set(k, c);
    return c;
  };

  const close = new Series(bars, (b) => b.close);
  const rsi = ta.rsi(close, cfg.rsiLenInput).toArray();
  const rsiS = Series.fromArray(bars, rsi);
  const phRsi = ta.pivothigh(rsiS, cfg.lbLInput, lbR).toArray();
  const plRsi = ta.pivotlow(rsiS, cfg.lbLInput, lbR).toArray();

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS });

  // PO3 tracking
  const htfHistory: HTFData[] = [];
  let curO = NaN;
  let curH = NaN;
  let curL = NaN;
  let curOIdx = NaN;
  let curHIdx = NaN;
  let curLIdx = NaN;
  let curDelta = 0;
  let curStartTime = NaN;

  let plPriceMem = NaN;
  let plRsiMem = NaN;
  let plIndexMem = NaN;
  let phPriceMem = NaN;
  let phRsiMem = NaN;
  let phIndexMem = NaN;

  const barDelta = (b: Bar) => (gt(b.close, b.open) ? (b.volume ?? NaN) : lt(b.close, b.open) ? -(b.volume ?? NaN) : 0);

  const drawHtfPattern = (name: string, h: number, l: number, o: number, c: number, tStart: number, tEnd: number,
    col: string, isBullish: boolean) => {
    const labelTxt = name + '\n' + str.format_time(tStart, 'HH:mm', tz);
    const midTime = Math.round((tStart + tEnd) / 2);
    const timeInset = Math.round((tEnd - tStart) * 0.1);
    box.new(tStart, h, tEnd, l, String(color.new(col, 50)), 1, undefined, undefined, 'bar_time', String(color.new(col, 90)),
      undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, true);
    box.new(tStart + timeInset, Math.max(o, c), tEnd - timeInset, Math.min(o, c), String(color.new(col, 20)), 1, undefined,
      undefined, 'bar_time', String(color.new(col, 60)), undefined, undefined, BOX_TEXT, undefined, undefined, undefined,
      undefined, true);
    line.new(midTime, h, midTime, l, 'bar_time', undefined, String(color.new(col, 20)), undefined, 1, true);
    label.new(midTime, isBullish ? l : h, labelTxt, 'bar_time', 'price', '#00000000', isBullish ? 'label_up' : 'label_down',
      col, 'small', undefined, undefined, undefined, true);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];

    if (cfg.showPo3Input) {
      if (htfNewBar[i]) {
        if (!isNaN(curO)) {
          htfHistory.unshift({ o: curO, h: curH, l: curL, c: bars[i - 1].close, oIdx: curOIdx, hIdx: curHIdx, lIdx: curLIdx,
            delta: curDelta, startTime: curStartTime });
          if (htfHistory.length > 10) htfHistory.pop();
        }
        curO = b.open;
        curH = b.high;
        curL = b.low;
        curOIdx = i;
        curHIdx = i;
        curLIdx = i;
        curDelta = barDelta(b);
        curStartTime = b.time * ms;
      } else {
        if (gt(b.high, curH) || isNaN(curH)) {
          curH = b.high;
          curHIdx = i;
        }
        if (lt(b.low, curL) || isNaN(curL)) {
          curL = b.low;
          curLIdx = i;
        }
        curDelta += barDelta(b);
      }
    }

    // HTF pattern logic
    const k = latest[i] ?? -1;
    const p1 = k >= 1 ? H[k - 1] : null;
    const p2 = k >= 2 ? H[k - 2] : null;
    const hOpen = p1 ? p1.open : NaN;
    const hHigh = p1 ? p1.high : NaN;
    const hLow = p1 ? p1.low : NaN;
    const hClose = p1 ? p1.close : NaN;
    const hPrevOpen = p2 ? p2.open : NaN;
    const hPrevClose = p2 ? p2.close : NaN;
    const hTimeStart = p1 ? p1.time * ms : NaN;

    const isBullEngulfing = cfg.showEngulfingInput && gt(hClose, hOpen) && lt(hPrevClose, hPrevOpen) && ge(hClose, hPrevOpen)
      && le(hOpen, hPrevClose);
    const isBearEngulfing = cfg.showEngulfingInput && lt(hClose, hOpen) && gt(hPrevClose, hPrevOpen) && le(hClose, hPrevOpen)
      && ge(hOpen, hPrevClose);
    const range = hHigh - hLow;
    const isHammer = cfg.showPinBarsInput && gt(Math.min(hOpen, hClose) - hLow, range * 0.6)
      && lt(Math.abs(hClose - hOpen), range * 0.3);
    const isShootingStar = cfg.showPinBarsInput && gt(hHigh - Math.max(hOpen, hClose), range * 0.6)
      && lt(Math.abs(hClose - hOpen), range * 0.3);
    const isBullPattern = isBullEngulfing || isHammer;
    const isBearPattern = isBearEngulfing || isShootingStar;

    // RSI divergences
    let bullDivConfirmed = false;
    let bearDivConfirmed = false;
    const rsiBack = i >= lbR ? rsi[i - lbR] : NaN;
    const back = i >= lbR ? bars[i - lbR] : null;
    if (!isNaN(plRsi[i] ?? NaN)) {
      const lowBack = back ? back.low : NaN;
      if (!isNaN(plPriceMem) && gt(rsiBack, plRsiMem) && lt(lowBack, plPriceMem)) {
        bullDivConfirmed = true;
        if (cfg.showDivInput) {
          line.new(plIndexMem, plPriceMem, i - lbR, lowBack, 'bar_index', undefined, bullD, undefined, 2, true);
          label.new(i - lbR, lowBack, 'Bull Div', 'bar_index', 'belowbar', '#00000000', 'label_up', bullD, 'small',
            undefined, undefined, undefined, true);
          line.new(plIndexMem, plRsiMem, i - lbR, rsiBack, 'bar_index', undefined, bullD, undefined, 2);
        }
      }
      plPriceMem = lowBack;
      plRsiMem = rsiBack;
      plIndexMem = i - lbR;
    }
    if (!isNaN(phRsi[i] ?? NaN)) {
      const highBack = back ? back.high : NaN;
      if (!isNaN(phPriceMem) && lt(rsiBack, phRsiMem) && gt(highBack, phPriceMem)) {
        bearDivConfirmed = true;
        if (cfg.showDivInput) {
          line.new(phIndexMem, phPriceMem, i - lbR, highBack, 'bar_index', undefined, bearD, undefined, 2, true);
          label.new(i - lbR, highBack, 'Bear Div', 'bar_index', 'abovebar', '#00000000', 'label_down', bearD, 'small',
            undefined, undefined, undefined, true);
          line.new(phIndexMem, phRsiMem, i - lbR, rsiBack, 'bar_index', undefined, bearD, undefined, 2);
        }
      }
      phPriceMem = highBack;
      phRsiMem = rsiBack;
      phIndexMem = i - lbR;
    }

    // HTF reversal pattern drawings
    if (htfNewBar[i] && !isNaN(hTimeStart)) {
      const hTimeEnd = htfClose(k - 1);
      if (isBullPattern) {
        drawHtfPattern(isBullEngulfing ? 'Bull Engulfing' : 'Hammer', hHigh, hLow, hOpen, hClose, hTimeStart, hTimeEnd, bullP, true);
      }
      if (isBearPattern) {
        drawHtfPattern(isBearEngulfing ? 'Bear Engulfing' : 'Shooting Star', hHigh, hLow, hOpen, hClose, hTimeStart, hTimeEnd, bearP, false);
      }
    }

    // Alerts: alert("... on " + syminfo.ticker, alert.freq_once_per_bar_close)
    const call = (message: string) => alertCalls.push({ time: b.time, message: message + ' on ' + ticker, freq: 'once_per_bar_close' });
    if (cfg.alertBullDivInput && bullDivConfirmed) call('Bullish RSI Divergence');
    if (cfg.alertBearDivInput && bearDivConfirmed) call('Bearish RSI Divergence');
    if (cfg.alertBullEngInput && htfNewBar[i] && isBullEngulfing) call('HTF Bullish Engulfing');
    if (cfg.alertBearEngInput && htfNewBar[i] && isBearEngulfing) call('HTF Bearish Engulfing');
    if (cfg.alertHammerInput && htfNewBar[i] && isHammer) call('HTF Hammer');
    if (cfg.alertStarInput && htfNewBar[i] && isShootingStar) call('HTF Shooting Star');

    // PO3 UI (last bar)
    if (i === n - 1 && cfg.showPo3Input) {
      const count = cfg.candleCountInput;
      const candleWidth = 6;
      const candleGap = 10;
      for (let p = 0; p <= count - 1; p++) {
        const isLive = p === count - 1;
        const data: HTFData | null = isLive
          ? { o: curO, h: curH, l: curL, c: b.close, oIdx: curOIdx, hIdx: curHIdx, lIdx: curLIdx, delta: curDelta, startTime: curStartTime }
          : (htfHistory.length > (count - 2) - p ? htfHistory[(count - 2) - p] : null);
        if (data === null) continue;
        const startIdx = i + cfg.po3OffsetInput + p * (candleWidth + candleGap);
        const endIdx = startIdx + candleWidth;
        const midIdx = (startIdx + endIdx) / 2;
        const baseColor = ge(data.c, data.o) ? bullP : bearP;
        const wickColor = isLive ? baseColor : String(color.new(baseColor, 70));
        line.new(midIdx, data.h, midIdx, data.l, 'bar_index', undefined, wickColor, undefined, 2, true);
        box.new(startIdx, Math.max(data.o, data.c), endIdx, Math.min(data.o, data.c), wickColor, undefined, undefined, undefined,
          undefined, String(color.new(baseColor, isLive ? 20 : 85)), undefined, undefined, BOX_TEXT, undefined, undefined,
          undefined, undefined, true);
        if (isLive) {
          line.new(data.oIdx, data.o, startIdx, data.o, 'bar_index', undefined, NEUTRAL_COLOR, 'dashed', undefined, true);
          line.new(data.hIdx, data.h, midIdx, data.h, 'bar_index', undefined, bullP, 'dashed', undefined, true);
          line.new(data.lIdx, data.l, midIdx, data.l, 'bar_index', undefined, bearP, 'dashed', undefined, true);
          line.new(i, data.c, endIdx, data.c, 'bar_index', undefined, baseColor, 'dashed', undefined, true);
          if (cfg.showPo3LabelsInput) {
            const priceLabel = (y: number, text: string, textColor: string) => label.new(endIdx + 1, y,
              text + str.tostring(y, 'mintick', tick), 'bar_index', 'price', '#00000000', 'label_left', textColor, 'small',
              undefined, undefined, undefined, true);
            priceLabel(data.o, 'Open: ', NEUTRAL_COLOR);
            priceLabel(data.h, 'High: ', bullP);
            priceLabel(data.l, 'Low: ', bearP);
            priceLabel(data.c, 'Close: ', baseColor);
          }
        }
        // int totalMins = timeframe.in_seconds(htfInput) / 60 (a v6 division keeps the fraction)
        const totalMins = timeframe.in_seconds(htf) / 60;
        const tfStr = ge(totalMins, 1440) ? str.tostring(totalMins / 1440) + 'D'
          : ge(totalMins, 60) ? str.tostring(totalMins / 60) + 'H' : str.tostring(totalMins) + 'm';
        label.new(midIdx, data.h, tfStr + (!isLive ? '\n' + str.format_time(data.startTime, 'HH:mm', tz) : ''), 'bar_index',
          'price', '#00000000', 'label_down', isLive ? NEUTRAL_COLOR : String(color.new(NEUTRAL_COLOR, 60)), 'normal',
          undefined, undefined, undefined, true);
        if (cfg.showPo3DeltaInput) {
          label.new(midIdx, data.l, 'Delta: ' + formatDelta(data.delta), 'bar_index', 'price', '#00000000', 'label_up',
            isLive ? (ge(data.delta, 0) ? bullP : bearP) : String(color.new(NEUTRAL_COLOR, 60)), 'normal',
            undefined, undefined, undefined, true);
        }
      }
    }
  }
  setDrawingBar(null);

  const midColor = String(color.new(fg, 80));
  const bullTop = String(color.new(bullD, 100));
  const bullBottom = String(color.new(bullD, 50));
  const bearTop = String(color.new(bearD, 50));
  const bearBottom = String(color.new(bearD, 100));
  const above = rsi.map((v) => gt(v, 50));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: rsi[i], color: above[i] ? bullD : bearD })),
      plot1: bars.map((b) => ({ time: b.time, value: 50, color: midColor })),
    },
    hlines: [
      { value: 70, options: { title: 'OB', color: String(color.new(bearD, 50)), linestyle: 'dashed' } },
      { value: 30, options: { title: 'OS', color: String(color.new(bullD, 50)), linestyle: 'dashed' } },
    ],
    fills: [
      // fill(midPlot, rsiPlot, 50, rsiValue, top_color, bottom_color)
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'Plots Background' },
        gradient: {
          topValue: new Array(n).fill(50),
          bottomValue: rsi,
          topColor: above.map((a) => (a ? bullTop : bearTop)),
          bottomColor: above.map((a) => (a ? bullBottom : bearBottom)),
        } },
    ],
    ...drawingOutputs(bars),
    alertCalls,
  };
}

export const HtfReversalDivergences = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  hasAlertFunction,
};
