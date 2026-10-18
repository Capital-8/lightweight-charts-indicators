/**
 * Vdub FX SniperVX2 Color v2
 *
 * Overlay indicator (overlay=true) with:
 * - Candle body channel (highest/lowest of close over 13 bars), linebr, drawn only while the level is unchanged
 * - LB Resistance channel (self-referencing up/down), linebr, drawn only while the level is unchanged
 * - S/R lines: valuewhen(high >= highest(high, 6), high, 0) and valuewhen(low <= lowest(low, 6), low, 0),
 *   plotted on every bar with an na colour on the bars where the level changes
 * - EMA 13 and EMA 21 coloured by direction (lime rising, red falling, na colour otherwise)
 * - Hull MA (black, linewidth 3)
 * - Buy/Sell markers from TEMA/DEMA signal logic
 * - Supertrend arrows on trend change (the original's plotarrow outputs: `arrows` of the result)
 * - Fills: body channel (black), resistance (red), support (green)
 *
 * Pine v1/v2 source: plots without transp use transparency 35.
 *
 * Reference: "Vdub FX SniperVX2 Color v2" by Vdubus
 */

import { ta, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import type { ArrowData } from 'oakscriptjs';

export interface VdubSniperInputs {
  src: SourceType;
  channel2: boolean;
  channel: boolean;
  bodyChannelLen: number;
  bodyChannelPeriod: number;
  ema1Len: number;
  ema2Len: number;
  fastSignal: number;
  slowSignal: number;
  supertrendFactor: number;
  supertrendPeriod: number;
  sRLength: number;
  showHma: boolean;
  hmaSrc: SourceType;
  hmaBaseLength: number;
  hmaLengthScalar: number;
}

export const defaultInputs: VdubSniperInputs = {
  src: 'close',
  channel2: false,
  channel: false,
  bodyChannelLen: 34,
  bodyChannelPeriod: 13,
  ema1Len: 13,
  ema2Len: 21,
  fastSignal: 5,
  slowSignal: 8,
  supertrendFactor: 3,
  supertrendPeriod: 1,
  sRLength: 6,
  showHma: true,
  hmaSrc: 'close',
  hmaBaseLength: 8,
  hmaLengthScalar: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Candle body resistance Channel', defval: 'close' },
  { id: 'channel2', type: 'bool', title: 'Bar Channel On/Off', defval: false },
  { id: 'channel', type: 'bool', title: 'Resistance Channel 2 On/Off', defval: false },
  { id: 'bodyChannelLen', type: 'int', title: 'Candle Body Resistance Channel', defval: 34, min: 1 },
  { id: 'bodyChannelPeriod', type: 'int', title: 'Channel Period', defval: 13, min: 1 },
  { id: 'sRLength', type: 'int', title: 'Support / Resistance length:', defval: 6 },
  { id: 'ema1Len', type: 'int', title: 'EMA 1', defval: 13, min: 1 },
  { id: 'ema2Len', type: 'int', title: 'EMA 2', defval: 21, min: 1 },
  { id: 'fastSignal', type: 'int', title: 'Short Signal Generator', defval: 5, min: 1 },
  { id: 'slowSignal', type: 'int', title: 'slow', defval: 8, min: 1 },
  { id: 'supertrendFactor', type: 'int', title: 'Trend Transition Signal', defval: 3, min: 1, max: 1000 },
  { id: 'supertrendPeriod', type: 'int', title: 'Period', defval: 1, min: 1, max: 1000 },
  { id: 'showHma', type: 'bool', title: 'Display Hull MA Set:', defval: true },
  { id: 'hmaSrc', type: 'source', title: "Hull MA's Source:", defval: 'close' },
  { id: 'hmaBaseLength', type: 'int', title: "Hull MA's Base Length:", defval: 8, min: 1 },
  { id: 'hmaLengthScalar', type: 'int', title: "Hull MA's Length Scalar:", defval: 5, min: 0 },
];

// Pine v1/v2 colours (transparency 35 unless set): black #000000, red #FF0000, green #008000, lime #00FF00
const BLACK = '#000000a6';
const RED = '#FF0000a6';
const GREEN = '#008000a6';
const LIME = '#00FF00a6';

export const plotConfig: PlotConfig[] = [
  { id: 'channelTop', title: 'Candle body resistance level top', color: BLACK, lineWidth: 1, style: 'linebr' },
  { id: 'channelBottom', title: 'Candle body resistance level bottom', color: BLACK, lineWidth: 1, style: 'linebr' },
  { id: 'resistTop', title: 'Resistance Level top', color: RED, lineWidth: 1, style: 'linebr' },
  { id: 'resistBottom', title: 'Resistance level bottom', color: GREEN, lineWidth: 1, style: 'linebr' },
  { id: 'srTop', title: 'Plot', color: RED, lineWidth: 1 },
  { id: 'srBottom', title: 'Plot', color: GREEN, lineWidth: 1 },
  { id: 'ema1', title: 'EMA', color: LIME, lineWidth: 1 },
  { id: 'ema2', title: 'EMA Signal 2', color: LIME, lineWidth: 1 },
  { id: 'hullMA', title: 'Hull MA', color: BLACK, lineWidth: 3 },
];

export const metadata = {
  title: 'Vdub FX Sniper',
  shortTitle: 'VSniper',
  overlay: true,
};

type Pt = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<VdubSniperInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; arrows: ArrowData[] } {
  const {
    channel2, channel,
    bodyChannelPeriod,
    ema1Len, ema2Len,
    fastSignal, slowSignal,
    supertrendFactor, supertrendPeriod,
    sRLength,
    showHma, hmaSrc,
    hmaBaseLength, hmaLengthScalar,
  } = { ...defaultInputs, ...inputs };
  // Pine: src = input(close) only feeds out = sma(src, 34), which feeds bearish / bullish; none of them is plotted.

  const n = bars.length;
  const closeSeries = new Series(bars, (b) => b.close);
  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const closeArr = closeSeries.toArray();
  const highArr = highSeries.toArray();
  const lowArr = lowSeries.toArray();
  const nz = (v: number | undefined) => (v === undefined || isNaN(v) ? 0 : v);

  // ===== Candle body resistance Channel (ul2/ll2) =====
  // Pine: plot(channel2 ? last8h : last8h == nz(last8h[1]) ? last8h : na, style = linebr)
  const last8h = ta.highest(closeSeries, bodyChannelPeriod).toArray();
  const lastl8 = ta.lowest(closeSeries, bodyChannelPeriod).toArray();
  const stablePlot = (arr: number[], always: boolean): Pt[] =>
    bars.map((b, i) => {
      const v = arr[i];
      if (v == null || isNaN(v)) return { time: b.time, value: NaN };
      if (always) return { time: b.time, value: v };
      return { time: b.time, value: v === nz(arr[i - 1]) ? v : NaN };
    });
  const channelTopPlot = stablePlot(last8h, channel2);
  const channelBottomPlot = stablePlot(lastl8, channel2);

  // ===== LB Resistance Channel (ul/ll) =====
  // up = close<nz(up[1]) and close>down[1] ? nz(up[1]) : high
  // down = close<nz(up[1]) and close>down[1] ? nz(down[1]) : low
  const upArr: number[] = new Array(n);
  const downArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = closeArr[i];
    const prevUp = nz(upArr[i - 1]);
    const prevDown = i > 0 ? downArr[i - 1] : NaN; // down[1] (na on the first bar: comparison false)
    if (c < prevUp && c > prevDown) {
      upArr[i] = prevUp;
      downArr[i] = nz(prevDown);
    } else {
      upArr[i] = highArr[i];
      downArr[i] = lowArr[i];
    }
  }
  // Pine: plot(channel ? up : up == nz(up[1]) ? up : na, style = linebr)
  const resistTopPlot = stablePlot(upArr, channel);
  const resistBottomPlot = stablePlot(downArr, channel);

  // ===== Support and Resistance (RT2/RB2) =====
  // RSTT = valuewhen(high >= highest(high, RST), high, 0); RSTB = valuewhen(low <= lowest(low, RST), low, 0)
  // plot(RSTT, color = RSTT != RSTT[1] ? na : red): the value is plotted on every bar, transparent where it changes
  // (a comparison with na is na, so the colour stays red on the first bar with a value)
  const highestH = ta.highest(highSeries, sRLength).toArray();
  const lowestL = ta.lowest(lowSeries, sRLength).toArray();
  const rstt: number[] = new Array(n);
  const rstb: number[] = new Array(n);
  let lastT = NaN;
  let lastB = NaN;
  for (let i = 0; i < n; i++) {
    if (highArr[i] >= highestH[i]) lastT = highArr[i];
    if (lowArr[i] <= lowestL[i]) lastB = lowArr[i];
    rstt[i] = lastT;
    rstb[i] = lastB;
  }
  const levelPlot = (arr: number[], col: string): Pt[] =>
    bars.map((b, i) => {
      const v = arr[i];
      if (isNaN(v)) return { time: b.time, value: NaN };
      const prev = i > 0 ? arr[i - 1] : NaN;
      return { time: b.time, value: v, color: !isNaN(prev) && v !== prev ? 'transparent' : col };
    });
  const srTopPlot = levelPlot(rstt, RED);
  const srBottomPlot = levelPlot(rstb, GREEN);

  // ===== Trend colour EMA 1 / EMA 2 =====
  // direction = rising(ema0, 2) ? +1 : falling(ema0, 2) ? -1 : 0
  // plot(ema0, color = direction > 0 ? lime : direction < 0 ? red : na): value on every bar, na colour when 0
  const emaTrend = (len: number) => {
    const e = ta.ema(closeSeries, len);
    const eArr = e.toArray();
    const rising = ta.rising(e, 2).toArray();
    const falling = ta.falling(e, 2).toArray();
    const dir: number[] = eArr.map((_v, i) => (rising[i] ? 1 : falling[i] ? -1 : 0));
    const plot: Pt[] = bars.map((b, i) => {
      const v = eArr[i];
      if (v == null || isNaN(v)) return { time: b.time, value: NaN };
      return { time: b.time, value: v, color: dir[i] > 0 ? LIME : dir[i] < 0 ? RED : 'transparent' };
    });
    return { dir, plot };
  };
  const { dir: directionArr, plot: ema1Plot } = emaTrend(ema1Len);
  const { plot: ema2Plot } = emaTrend(ema2Len);

  // ===== Hull MA =====
  // plot(not show_hma ? na : hullma(hma_src, hma_base_length + hma_length_scalar * 6))
  const hmaLen = hmaBaseLength + hmaLengthScalar * 6;
  const hmaArr = ta.hma(getSourceSeries(bars, hmaSrc), hmaLen).toArray();
  const hullMAPlot = bars.map((b, i) => ({
    time: b.time,
    value: !showHma || hmaArr[i] == null ? NaN : hmaArr[i]!,
  }));

  // ===== Signal 1: TEMA/DEMA buy/sell markers =====
  // vh1 = ema(highest(avg(low,close), fast), 5)
  // vl1 = ema(lowest(avg(high,close), slow), 8)
  const avgLCSeries = new Series(bars, (b) => (b.low + b.close) / 2);
  const avgHCSeries = new Series(bars, (b) => (b.high + b.close) / 2);
  const vh1 = ta.ema(ta.highest(avgLCSeries, fastSignal), 5).toArray();
  const vl1 = ta.ema(ta.lowest(avgHCSeries, slowSignal), 8).toArray();

  // TEMA: e1=ema(close,1), e2=ema(e1,1), e3=ema(e2,1), tema = 1*(e1-e2)+e3
  const e1 = ta.ema(closeSeries, 1);
  const e2 = ta.ema(e1, 1);
  const e3 = ta.ema(e2, 1).toArray();
  const e1a = e1.toArray();
  const e2a = e2.toArray();
  const tema: number[] = e1a.map((v, i) => 1 * (v - e2a[i]) + e3[i]);

  // DEMA: ee1=ema(close,8), ee2=ema(ee1,5), dema = 2*ee1 - ee2
  const ee1 = ta.ema(closeSeries, 8);
  const ee2 = ta.ema(ee1, 5).toArray();
  const ee1a = ee1.toArray();
  const dema: number[] = ee1a.map((v, i) => 2 * v - ee2[i]);

  // signal = tema > dema ? max(vh1, vl1) : min(vh1, vl1)
  const signal: number[] = tema.map((t, i) => (t > dema[i] ? Math.max(vh1[i], vl1[i]) : Math.min(vh1[i], vl1[i])));

  const markers: MarkerData[] = [];

  for (let i = 2; i < n; i++) {
    const dir = directionArr[i];
    // is_call = tema > dema and signal > low and (signal-signal[1] > signal[1]-signal[2])
    const isCall = tema[i] > dema[i] && signal[i] > lowArr[i] &&
      (signal[i] - signal[i - 1] > signal[i - 1] - signal[i - 2]);
    // is_put = tema < dema and signal < high and (signal[1]-signal > signal[2]-signal[1])
    const isPut = tema[i] < dema[i] && signal[i] < highArr[i] &&
      (signal[i - 1] - signal[i] > signal[i - 2] - signal[i - 1]);

    if (isCall && dir > 0) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'arrowUp', color: GREEN, text: '*BUY*' });
    }
    if (isPut && dir < 0) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'arrowDown', color: RED, text: '*SELL*' });
    }
  }

  // ===== Signal 2: Supertrend arrows =====
  // Up=hl2-(Factor*atr(Pd)), Dn=hl2+(Factor*atr(Pd))
  // TrendUp=close[1]>TrendUp[1]? max(Up,TrendUp[1]) : Up
  // TrendDown=close[1]<TrendDown[1]? min(Dn,TrendDown[1]) : Dn
  // Trend = close > TrendDown[1] ? 1: close< TrendUp[1]? -1: nz(Trend[1],0)
  const atrArr = ta.atr(bars, supertrendPeriod).toArray();
  const trendUp: number[] = new Array(n).fill(NaN);
  const trendDown: number[] = new Array(n).fill(NaN);
  const trend: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const hl2 = (highArr[i] + lowArr[i]) / 2;
    const upVal = hl2 - supertrendFactor * atrArr[i];
    const dnVal = hl2 + supertrendFactor * atrArr[i];
    const c1 = i > 0 ? closeArr[i - 1] : NaN;
    const tu1 = i > 0 ? trendUp[i - 1] : NaN;
    const td1 = i > 0 ? trendDown[i - 1] : NaN;
    trendUp[i] = c1 > tu1 ? Math.max(upVal, tu1) : upVal;
    trendDown[i] = c1 < td1 ? Math.min(dnVal, td1) : dnVal;
    trend[i] = closeArr[i] > td1 ? 1 : closeArr[i] < tu1 ? -1 : (i > 0 ? trend[i - 1] : 0);
  }

  // plotarrow(Trend == 1 and Trend[1] == -1 ? Trend : na, "Up Entry Arrow", colorup = lime, transp = 85)
  // plotarrow(Trend == -1 and Trend[1] == 1 ? Trend : na, "Down Entry Arrow", colordown = red, transp = 85)
  const arrows: ArrowData[] = [];
  for (let i = 1; i < n; i++) {
    if (trend[i] === 1 && trend[i - 1] === -1) {
      arrows.push({ time: bars[i].time, id: 'arrow0', value: trend[i], color: '#00FF0026' });
    }
    if (trend[i] === -1 && trend[i - 1] === 1) {
      arrows.push({ time: bars[i].time, id: 'arrow1', value: trend[i], color: '#FF000026' });
    }
  }

  // Sort markers by time
  markers.sort((a, b) => a.time - b.time);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'channelTop': channelTopPlot,
      'channelBottom': channelBottomPlot,
      'resistTop': resistTopPlot,
      'resistBottom': resistBottomPlot,
      'srTop': srTopPlot,
      'srBottom': srBottomPlot,
      'ema1': ema1Plot,
      'ema2': ema2Plot,
      'hullMA': hullMAPlot,
    },
    fills: [
      // fill(ul2, ll2, color=black, transp=90) -- body channel
      { plot1: 'channelTop', plot2: 'channelBottom', options: { color: 'rgba(0,0,0,0.10)', title: 'Candle body resistance Channel' } },
      // fill(ul2, RT2, color=red, transp=75)
      { plot1: 'channelTop', plot2: 'srTop', options: { color: 'rgba(255,0,0,0.25)', title: 'Fill' } },
      // fill(ll2, RB2, color=green, transp=75)
      { plot1: 'channelBottom', plot2: 'srBottom', options: { color: 'rgba(0,128,0,0.25)', title: 'Fill' } },
    ],
    markers,
    arrows,
  };
}

export const VdubSniper = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
