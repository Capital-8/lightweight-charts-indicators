/**
 * Mix1 : Ema Cross + Trend Channel
 *
 * Combines an EMA cross (EMA Fast 26 and EMA Medium 50 of the source), a trend moving average and a channel:
 * - MA Trend: the SMA (or EMA) of the close over `MA Trend` bars, one bar back, on the timeframe of "Select Higher
 *   Timeframe" (empty: the chart) with lookahead (each chart bar of a period shows the value of the period before).
 * - Channel: MA Trend +- ATR(MA Trend length) x "Channel Range Length". A bar whose open or close is inside the
 *   channel on both sides is a range bar (trend 0).
 * - Trend: 1 when the source is at or above the MA Trend and EMA Fast > EMA Medium, -1 when both are down, else 0
 *   ("Strategy 1" also gives 0 when the MA Trend is on the wrong side of the EMA Medium).
 * - Position state: Long on a trend of 1, Short on -1, closed when the trend or the EMA cross turns, or on the
 *   optional stop loss (SL % from the close of the entry bar, a cross of the close or a bar range over the level).
 *   "Position Type" limits the sides, "Period" the time range (with a grey background outside it).
 * Plots: the two EMAs with a fill, the MA Trend and the optional channel (trend colours), the stop loss line; labels
 * Long / Short, crosses Close / SL, optional Golden / Death Cross labels on the EMA Medium / MA Trend cross; bar
 * colours by trend. The seven alerts of the original have no output.
 *
 * A higher timeframe is built from the chart bars (the exchange calendar comes from the chart context); a timeframe
 * below the chart timeframe needs data the chart bars do not have: the port throws an Error.
 *
 * Reference: "Mix1 : Ema Cross + Trend Channel [Gu5]" by gu5tavo71
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © gu5tavo71 (Gustavo Cardelle)
 */

import {
  ta, Series, color, timeframe, callsite, mapToChart, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, BgColorData, MarkerData } from '../types';
import type { ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

export interface Mix1EmaCrossTrendChannelInputs {
  maSrc: 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'ohlc4' | 'hlcc4';
  maFast1: number;
  maFast2: number;
  maLen: number;
  maLenSel: 'EMA' | 'SMA';
  /** Timeframe of the MA Trend ('' = chart timeframe) */
  htf: string;
  rangeLen: number;
  slOn: boolean;
  sl: number;
  periodSw: boolean;
  /** Start of the period, UNIX ms */
  periodStar: number;
  /** End of the period, UNIX ms */
  periodEnd: number;
  posSel: 'Only Long' | 'Only Short' | 'Both';
  typeS: 'Strategy 1' | 'Strategy 2';
  barColOn: boolean;
  alertOn: boolean;
  channelOn: boolean;
  goldenOn: boolean;
}

export const defaultInputs: Mix1EmaCrossTrendChannelInputs = {
  maSrc: 'close',
  maFast1: 26,
  maFast2: 50,
  maLen: 200,
  maLenSel: 'SMA',
  htf: '',
  rangeLen: 0.618,
  slOn: false,
  sl: 2.618,
  periodSw: false,
  // timestamp('2020-01-01 00:00 GMT-3'), timestamp('2099-12-31 00:00 GMT-3')
  periodStar: 1577847600000,
  periodEnd: 4102369200000,
  posSel: 'Both',
  typeS: 'Strategy 2',
  barColOn: true,
  alertOn: true,
  channelOn: false,
  goldenOn: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'maSrc', type: 'source', title: 'MA Source', defval: 'close', group: 'EMAs' },
  { id: 'maFast1', type: 'int', title: 'EMA Fast', defval: 26, group: 'EMAs' },
  { id: 'maFast2', type: 'int', title: 'EMA Medium', defval: 50, group: 'EMAs' },
  { id: 'maLen', type: 'int', title: 'MA Trend', defval: 200, group: 'Trend Channel' },
  { id: 'maLenSel', type: 'string', title: 'MA Type', defval: 'SMA', options: ['EMA', 'SMA'], tooltip: 'EMA or SMA', group: 'Trend Channel' },
  { id: 'htf', type: 'timeframe', title: 'Select Higher Timeframe', defval: '', tooltip: 'Only for MA Trend', group: 'Trend Channel' },
  { id: 'rangeLen', type: 'float', title: 'Channel Range Length', defval: 0.618, tooltip: 'ATR of the MA Trend', group: 'Trend Channel' },
  { id: 'slOn', type: 'bool', title: '■ Stop Loss On/Off', defval: false, group: 'Stop Loss' },
  { id: 'sl', type: 'float', title: 'SL %', defval: 2.618, step: 0.1, group: 'Stop Loss' },
  { id: 'periodSw', type: 'bool', title: '■ Period On/Off', defval: false, group: 'Period' },
  { id: 'periodStar', type: 'time', title: 'Start Time', defval: 1577847600000, group: 'Period' },
  { id: 'periodEnd', type: 'time', title: 'End Time', defval: 4102369200000, group: 'Period' },
  {
    id: 'posSel', type: 'string', title: 'Position Type', defval: 'Both', options: ['Only Long', 'Only Short', 'Both'],
    tooltip: 'Only Long, Only shortE or Both', group: 'Strategy',
  },
  {
    id: 'typeS', type: 'string', title: 'Strategy Type', defval: 'Strategy 2', options: ['Strategy 1', 'Strategy 2'],
    tooltip: 'Strategy 1:\n Long, when the price (close) crosses the ema.\n Strategy 2:\n Long, only when ema goes up',
    group: 'Strategy',
  },
  { id: 'barColOn', type: 'bool', title: '■ Bar Color On/Off', defval: true, group: 'Display' },
  { id: 'alertOn', type: 'bool', title: '■ Alert On/Off', defval: true, group: 'Display' },
  {
    id: 'channelOn', type: 'bool', title: '■ Channel Range On/Off', defval: false, group: 'Display',
    tooltip: 'If the price (close) is over than the channel, the trend is bullish. If the price is under, bearish. And if the price is in the channel, it is in range',
  },
  { id: 'goldenOn', type: 'bool', title: '■ Golden Cross On/Off', defval: false },
];

const C_GREEN = '#006400';
const C_GREENLIGHT = '#388e3c';
const C_RED = '#8B0000';
const C_REDLIGHT = '#b71c1c';
const ORANGE = '#FF9800';
const YELLOW = '#FFEB3B';
const GRAY = '#787B86';
const WHITE = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Fast 1', color: String(color.new(ORANGE, 99)), lineWidth: 1 },
  { id: 'plot1', title: 'EMA Fast 2', color: String(color.new(ORANGE, 99)), lineWidth: 2 },
  { id: 'plot2', title: 'SMA Trend', color: ORANGE, lineWidth: 3 },
  { id: 'plot3', title: 'Top Channel', color: ORANGE, lineWidth: 1 },
  { id: 'plot4', title: 'Bottom Channel', color: ORANGE, lineWidth: 1 },
  { id: 'plot5', title: 'Stop Loss Line', color: C_RED, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Mix1 : Ema Cross + Trend Channel [Gu5]',
  shortTitle: 'Mix1',
  overlay: true,
};

/** Pine float comparisons with the 1e-10 rule; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

/**
 * request.security(syminfo.tickerid, tf, expr, lookahead = barmerge.lookahead_on): `expr` on the bars of timeframe
 * `tf` built from the chart bars; every chart bar of a period shows the value of that period.
 */
function securityLookahead(
  bars: Bar[], tf: string, chart: ChartContext | undefined, expr: (b: Bar[]) => number[],
): number[] {
  const chartTf = chartTimeframe(bars, chart);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) return expr(bars);
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`Mix1: the timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  }
  const { htf, group, latest } = higherTimeframeBars(bars, tf, chart);
  return mapToChart(expr(htf), group, latest, true, false);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<Mix1EmaCrossTrendChannelInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; barColors: BarColorData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const ms = (t: number) => (t >= 1e12 ? t : t * 1000);

  const src = A(getSourceSeries(bars, cfg.maSrc));
  const maFast1 = A(ta.ema(S(src), cfg.maFast1));
  const maFast2 = A(ta.ema(S(src), cfg.maFast2));
  // i_maLenSel == "SMA" ? ta.sma(close, i_maLen)[1] : ta.ema(close, i_maLen)[1]
  const maTrend = securityLookahead(bars, cfg.htf, chart, (b) => {
    const close = new Series(b, (x) => x.close);
    const ma = A(cfg.maLenSel === 'SMA' ? ta.sma(close, cfg.maLen) : ta.ema(close, cfg.maLen));
    return ma.map((_v, i) => (i > 0 ? ma[i - 1] : NaN));
  });
  const atr = A(ta.atr(bars, cfg.maLen));

  const maDir: number[] = new Array(n);
  const trendDir: number[] = new Array(n);
  const condition: number[] = new Array(n);
  const slLine: number[] = new Array(n);
  const longE: boolean[] = new Array(n);
  const shortE: boolean[] = new Array(n);
  const longX: boolean[] = new Array(n);
  const shortX: boolean[] = new Array(n);
  const longSL: boolean[] = new Array(n);
  const shortSL: boolean[] = new Array(n);
  const period: boolean[] = new Array(n);
  const rangeTop: number[] = new Array(n);
  const rangeBot: number[] = new Array(n);

  const longSide = cfg.posSel !== 'Only Short';
  const shortSide = cfg.posSel !== 'Only Long';
  const slUnder = callsite.crossunder();
  const slOver = callsite.crossover();
  let slTopBuff = NaN;
  let slBotBuff = NaN;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    maDir[i] = gt(maFast1[i], maFast2[i]) ? 1 : -1;
    const mt = maTrend[i];
    const maTrendDir = ge(src[i], mt) ? 1 : -1;
    const rangeAtr = atr[i] * cfg.rangeLen;
    rangeTop[i] = mt + rangeAtr;
    rangeBot[i] = mt - rangeAtr;
    const rangeCh = (le(b.open, rangeTop[i]) || le(b.close, rangeTop[i]))
      && (ge(b.open, rangeBot[i]) || ge(b.close, rangeBot[i]));
    const up = maTrendDir === 1 && maDir[i] === 1;
    const dn = maTrendDir === -1 && maDir[i] === -1;
    let td: number;
    if (cfg.typeS === 'Strategy 1') {
      td = rangeCh ? 0
        : up && gt(mt, maFast2[i]) ? 0
          : dn && lt(mt, maFast2[i]) ? 0
            : up ? 1 : dn ? -1 : 0;
    } else {
      td = rangeCh ? 0 : up ? 1 : dn ? -1 : 0;
    }
    trendDir[i] = td;
    const t = ms(b.time);
    period[i] = cfg.periodSw ? t >= cfg.periodStar && t <= cfg.periodEnd : true;

    const prev = i > 0 ? condition[i - 1] : NaN; // condition[1]
    const entryLong = longSide && td === 1 && period[i];
    const entryShort = shortSide && td === -1 && period[i];
    const exitLong = longSide && (td !== 1 || maDir[i] === -1) && eq(prev, 1) && period[i];
    const exitShort = shortSide && (td !== -1 || maDir[i] === 1) && eq(prev, -1) && period[i];

    const slEntry = cfg.slOn ? (b.close * cfg.sl) / 100 : NaN;
    const slTop = b.close + slEntry;
    const slBot = b.close - slEntry;
    // ta.valuewhen(cond, x, 0): x on the latest bar where cond is true
    if (ne(prev, 1) && entryLong) slTopBuff = slBot;
    if (ne(prev, -1) && entryShort) slBotBuff = slTop;
    const sl = eq(prev, -1) && entryLong ? slTopBuff
      : eq(prev, 1) && entryShort ? slBotBuff
        : eq(prev, 1) || entryLong ? slTopBuff
          : eq(prev, -1) || entryShort ? slBotBuff : NaN;
    slLine[i] = sl;
    // Pine v5: both sides of `and` / `or` run on every bar (the crossings keep a full history)
    const under = slUnder(b.close, sl);
    const over = slOver(b.close, sl);
    const inside = gt(b.high, sl) && lt(b.low, sl);
    const slLong = (eq(prev, 1) && under) || inside;
    const slShort = (eq(prev, -1) && over) || inside;

    const cond = ne(prev, 1) && entryLong ? 1
      : ne(prev, -1) && entryShort ? -1
        : eq(prev, 1) && slLong ? 0
          : eq(prev, -1) && slShort ? 0
            : ne(prev, 0) && exitLong ? 0
              : ne(prev, 0) && exitShort ? 0
                : isNaN(prev) ? 0 : prev;
    condition[i] = cond;
    longE[i] = ne(prev, 1) && cond === 1;
    shortE[i] = ne(prev, -1) && cond === -1;
    longX[i] = eq(prev, 1) && exitLong && !slLong;
    shortX[i] = eq(prev, -1) && exitShort && !slShort;
    longSL[i] = eq(prev, 1) && slLong;
    shortSL[i] = eq(prev, -1) && slShort;
  }

  // GCross / DCross = i_goldenOn ? ta.crossover / crossunder(maFast2, maTrend) : na
  const gCross = cfg.goldenOn ? A(ta.crossover(S(maFast2), S(maTrend))) : [];
  const dCross = cfg.goldenOn ? A(ta.crossunder(S(maFast2), S(maTrend))) : [];
  const slRising = A(ta.rising(S(slLine), 1));
  const slFalling = A(ta.falling(S(slLine), 1));

  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [],
  };
  const emasFill: string[] = new Array(n);
  const channelFill: string[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const C = (c: string, t: number) => String(color.new(c, t));

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    const td = trendDir[i];
    const md = maDir[i];
    const x = longX[i] || shortX[i];
    const base = x ? ORANGE : td === 1 && md === 1 ? C_GREEN : td === -1 && md === -1 ? C_RED : ORANGE;
    const cEmas = C(base, 99);
    emasFill[i] = C(base, 70);
    const mt = maTrend[i];
    const mtPrev = i > 0 ? maTrend[i - 1] : NaN;
    const cMaTrend = td === 0 ? C(ORANGE, 0)
      : td === 1 && lt(mtPrev, mt) ? C(C_GREEN, 0)
        : td === 1 && ge(mtPrev, mt) ? C(C_GREENLIGHT, 0)
          : td === -1 && lt(mtPrev, mt) ? C(C_REDLIGHT, 0)
            : td === -1 && ge(mtPrev, mt) ? C(C_RED, 0) : 'transparent';
    channelFill[i] = td === 0 ? C(ORANGE, 75) : td === 1 ? C(C_GREEN, 75) : C(C_RED, 75);
    const cSlLine = slRising[i] === 1 || slFalling[i] === 1 ? 'transparent' : C(C_RED, 0);
    const cBar = td === 0 ? C(ORANGE, 0)
      : td === 1 && le(b.open, b.close) ? C(C_GREEN, 0)
        : td === 1 && gt(b.open, b.close) ? C(C_GREENLIGHT, 0)
          : td === -1 && ge(b.open, b.close) ? C(C_RED, 0)
            : td === -1 && lt(b.open, b.close) ? C(C_REDLIGHT, 0) : C(ORANGE, 0);

    plots.plot0.push({ time, value: maFast1[i], color: cEmas });
    plots.plot1.push({ time, value: maFast2[i], color: cEmas });
    plots.plot2.push({ time, value: mt, color: cMaTrend });
    plots.plot3.push({ time, value: cfg.channelOn ? rangeTop[i] : NaN, color: cMaTrend });
    plots.plot4.push({ time, value: cfg.channelOn ? rangeBot[i] : NaN, color: cMaTrend });
    plots.plot5.push({ time, value: cfg.slOn && condition[i] !== 0 ? slLine[i] : NaN, color: cSlLine });

    if (cfg.alertOn) {
      // the series of Long / Short (high / low) is read as a bool: na and 0 draw nothing
      if (longE[i] && !isNaN(b.high) && b.high !== 0) {
        markers.push({ time, position: 'belowBar', shape: 'labelUp', color: C(C_GREEN, 0), text: 'Long', textColor: WHITE, size: 'normal' });
      }
      if (shortE[i] && !isNaN(b.low) && b.low !== 0) {
        markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: C(C_RED, 0), text: 'Short', textColor: WHITE, size: 'normal' });
      }
      if ((longX[i] || shortX[i]) && !isNaN(b.close)) {
        markers.push({ time, position: 'atPriceMiddle', price: b.close, shape: 'xcross', color: C(YELLOW, 0), text: 'Close', textColor: C(YELLOW, 0), size: 'small' });
      }
      if ((longSL[i] || shortSL[i]) && !isNaN(slLine[i])) {
        markers.push({ time, position: 'atPriceMiddle', price: slLine[i], shape: 'xcross', color: C(YELLOW, 0), text: 'SL', textColor: C(YELLOW, 0), size: 'small' });
      }
      if (cfg.goldenOn && gCross[i] === 1 && !isNaN(mt)) {
        markers.push({ time, position: 'atPriceBottom', price: mt, shape: 'labelUp', color: C(ORANGE, 0), text: 'Golden\nCross', textColor: WHITE, size: 'normal' });
      }
      if (cfg.goldenOn && dCross[i] === 1 && !isNaN(mt)) {
        markers.push({ time, position: 'atPriceTop', price: mt, shape: 'labelDown', color: C(ORANGE, 0), text: 'Death\nCross', textColor: WHITE, size: 'normal' });
      }
    }
    if (cfg.barColOn) barColors.push({ time, color: cBar });
    if (cfg.periodSw && !period[i]) bgColors.push({ time, color: C(GRAY, 90) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'EMAs Fill' }, colors: emasFill },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Channel' }, colors: channelFill },
    ],
    markers,
    barColors,
    bgColors,
  };
}

export const Mix1EmaCrossTrendChannel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
