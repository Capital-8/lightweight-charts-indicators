/**
 * Ichimoku Oscillator
 *
 * Oscillator of four stacked layers from the Ichimoku lines (conversion / base / leading span B lengths 8 / 13 / 26,
 * lagging span 13): CloudMin / CloudMax = the cloud displacement - 1 bars back; Oscline = close - CloudMin (above) or
 * close - CloudMax; Lagging adds the close against the cloud one more displacement back (2 x (displacement - 1));
 * ConvBase adds conversion - base, the cloud layer adds lead 1 - lead 2 (positive parts in an uptrend, negative in a
 * downtrend). Each layer is na until its inputs exist. The trend (-4..4) counts the layers on the side of the close,
 * kept against whipsaws by the ATR tolerance (ta.atr, from bar atrLen - 1); it colours the background from bar 0
 * (the zone colour #d1d4dc without transparency while the trend is 0). Layer colours as the original: cloud by the
 * mtrend side, ConvBase by conversion >= base, Lagging by the close against the cloud (transparent inside it),
 * Oscline the zone colour inside the cloud. No zero line.
 * Shapes: an X on the cloud layer when a full trend (+/-4) ends, triangles at 0 on a new full uptrend / downtrend, and
 * a small X on the cloud layer when a profitable full trend gives a partial take-profit signal (Kijun / Tenkan cross,
 * or EMA / cloud cross when "Take Partial Profit by EMA" is on). With "Bounce Off Support/Resistance" (off by
 * default), small triangles at 0 on the additional entries: a full trend whose close leaves the cloud zone the bar
 * after a close inside it.
 * Alerts (alert() calls, `alertCalls` of the result), as the original: "Close Position" when a full trend ends, main
 * Buy / Sell on a new full trend, additional Buy / Sell on a bounce off the zone, "Take Partial Profit" on a partial
 * take-profit signal; the first "close" of the message is replaced by the close price.
 *
 * Reference: "Ichimoku Oscillator"
 */

import { ta, str, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData, BgColorData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

type AlertFreq = 'once_per_bar' | 'once_per_bar_close';

export interface IchimokuOscillatorInputs {
  conversionPeriods: number;
  basePeriods: number;
  laggingSpan: number;
  displacement: number;
  /** Use ATR (protection from whipsaw) */
  useAtr: boolean;
  /** ATR length */
  atrLen: number;
  /** ATR multiplier */
  atrMult: number;
  emaLen: number;
  /** Bounce Off Support/Resistance: additional entries when the price bounces off the cloud zone */
  bounceOff: boolean;
  /** Take Partial Profit by EMA */
  emaTakePartialProfit: boolean;
  /** Main Buy/Sell Alert */
  mainAlert: boolean;
  /** Buy alert message ("close" is replaced by the close price) */
  alertLongMsg: string;
  /** Sell alert message */
  alertShortMsg: string;
  /** Additional Buy/Sell Alert (bounce off the zone) */
  addAlert: boolean;
  /** Additional Buy alert message */
  alertAddLongMsg: string;
  /** Additional Sell alert message */
  alertAddShortMsg: string;
  /** Frequency of the Buy / Sell alerts */
  mainFrequency: AlertFreq;
  /** Close Position Alert */
  closeAlert: boolean;
  /** Take Partial Profit Alert */
  closePartAlert: boolean;
  /** Close Position message */
  closeMainMsg: string;
  /** Take Partial Profit message */
  closePartMsg: string;
  /** Frequency of the Close Position / Take Partial Profit alerts */
  closeFrequency: AlertFreq;
}

export const defaultInputs: IchimokuOscillatorInputs = {
  conversionPeriods: 8,
  basePeriods: 13,
  laggingSpan: 26,
  displacement: 13,
  useAtr: true,
  atrLen: 9,
  atrMult: 2.0,
  emaLen: 9,
  bounceOff: false,
  emaTakePartialProfit: true,
  mainAlert: true,
  alertLongMsg: 'Buy / Main, Close = close',
  alertShortMsg: 'Sell / Main, Close = close',
  addAlert: true,
  alertAddLongMsg: 'Buy / Additonal, Close = close',
  alertAddShortMsg: 'Sell / Additonal, Close = close',
  mainFrequency: 'once_per_bar_close',
  closeAlert: true,
  closePartAlert: true,
  closeMainMsg: 'Close Position, Close = close',
  closePartMsg: 'Take Partial Profit, Close = close',
  closeFrequency: 'once_per_bar',
};

export const inputConfig: InputConfig[] = [
  { id: 'conversionPeriods', type: 'int', title: 'Conversion Line Length', defval: 8, min: 1, group: 'Setup' },
  { id: 'basePeriods', type: 'int', title: 'Base Line Length', defval: 13, min: 1, group: 'Setup' },
  { id: 'laggingSpan', type: 'int', title: 'Leading Span B Length', defval: 26, min: 1, group: 'Setup' },
  { id: 'displacement', type: 'int', title: 'Lagging Span', defval: 13, min: 1, group: 'Setup' },
  { id: 'useAtr', type: 'bool', title: 'Use ATR', defval: true, tooltip: 'Protection from Whipsaw', group: 'Setup' },
  { id: 'atrLen', type: 'int', title: ' Length', defval: 9, min: 1, group: 'Setup' },
  { id: 'atrMult', type: 'float', title: ' Mult', defval: 2.0, min: 0.1, step: 0.1, group: 'Setup' },
  {
    id: 'bounceOff', type: 'bool', title: 'Bounce Off Support/Resistance', defval: false,
    tooltip: 'Enables the Additional Entries when price bounce off Support/Resistance Zone',
  },
  { id: 'emaLen', type: 'int', title: 'EMA Length', defval: 9, min: 1 },
  { id: 'emaTakePartialProfit', type: 'bool', title: 'Take Partial Profit by EMA', defval: true },
  { id: 'mainAlert', type: 'bool', title: 'Main Buy/Sell Alert', defval: true, group: 'Alerts' },
  { id: 'alertLongMsg', type: 'string', title: ' Long message', defval: 'Buy / Main, Close = close', group: 'Alerts' },
  { id: 'alertShortMsg', type: 'string', title: ' Short message', defval: 'Sell / Main, Close = close', group: 'Alerts' },
  { id: 'addAlert', type: 'bool', title: 'Additional Buy/Sell Alert', defval: true, group: 'Alerts' },
  {
    id: 'alertAddLongMsg', type: 'string', title: ' Long message', defval: 'Buy / Additonal, Close = close',
    group: 'Alerts',
  },
  {
    id: 'alertAddShortMsg', type: 'string', title: ' Short message', defval: 'Sell / Additonal, Close = close',
    group: 'Alerts',
  },
  {
    id: 'mainFrequency', type: 'string', title: ' Frequency', defval: 'once_per_bar_close',
    options: ['once_per_bar_close', 'once_per_bar'], group: 'Alerts',
  },
  { id: 'closeAlert', type: 'bool', title: 'Close Position Alert', defval: true, group: 'Alerts' },
  { id: 'closePartAlert', type: 'bool', title: 'Take Partial Profit Alert', defval: true, group: 'Alerts' },
  {
    id: 'closeMainMsg', type: 'string', title: ' Close Position Message', defval: 'Close Position, Close = close',
    group: 'Alerts',
  },
  {
    id: 'closePartMsg', type: 'string', title: ' Take Partial Profit Message',
    defval: 'Take Partial Profit, Close = close', group: 'Alerts',
  },
  {
    id: 'closeFrequency', type: 'string', title: ' Frequency', defval: 'once_per_bar',
    options: ['once_per_bar_close', 'once_per_bar'], group: 'Alerts',
  },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Cloud', color: '#004600', lineWidth: 1, style: 'area' },
  { id: 'plot1', title: 'ConvBase', color: '#008200', lineWidth: 1, style: 'area' },
  { id: 'plot2', title: 'Lagging', color: '#00BE00', lineWidth: 1, style: 'area' },
  { id: 'plot3', title: 'Oscillator', color: '#00FA00', lineWidth: 1, style: 'area' },
  { id: 'plot4', title: 'EMA', color: '#d1c4e9', lineWidth: 1 },
];

export const metadata = {
  title: 'Ichimoku Oscillator',
  shortTitle: 'IchiOsc',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<IchimokuOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { conversionPeriods, basePeriods, laggingSpan, displacement, emaLen } = cfg;
  const n = bars.length;

  const closeArr = bars.map((b) => b.close);

  // donchian(len) = math.avg(ta.lowest(len), ta.highest(len)): na until the window is full
  const donchian = (len: number): number[] => {
    const out: number[] = new Array(n).fill(NaN);
    for (let i = len - 1; i < n; i++) {
      let hi = -Infinity, lo = Infinity;
      for (let k = i - len + 1; k <= i; k++) {
        if (bars[k].high > hi) hi = bars[k].high;
        if (bars[k].low < lo) lo = bars[k].low;
      }
      out[i] = (lo + hi) / 2;
    }
    return out;
  };
  const tenkanArr = donchian(conversionPeriods);
  const kijunArr = donchian(basePeriods);
  const leadLine1Arr = tenkanArr.map((v, i) => (v + kijunArr[i]) / 2);
  const leadLine2Arr = donchian(laggingSpan);

  // na-propagating math.min / math.max and history access
  const at = (arr: number[], i: number) => (i >= 0 ? arr[i] : NaN);
  const pmin = (x: number, y: number) => (isNaN(x) || isNaN(y) ? NaN : Math.min(x, y));
  const pmax = (x: number, y: number) => (isNaN(x) || isNaN(y) ? NaN : Math.max(x, y));
  const d = displacement - 1;
  // CloudMin / CloudMax = min / max(leadLine1[displacement - 1], leadLine2[displacement - 1])
  const cloudMinArr = closeArr.map((_, i) => pmin(at(leadLine1Arr, i - d), at(leadLine2Arr, i - d)));
  const cloudMaxArr = closeArr.map((_, i) => pmax(at(leadLine1Arr, i - d), at(leadLine2Arr, i - d)));

  // tole = useatr ? ta.atr(atrlen) * atrmul : 0 (true range of bar 0 = high - low; rma seeded with the mean of the
  // first atrlen true ranges, so the ATR exists from bar atrlen - 1)
  const atrArr: number[] = new Array(n).fill(NaN);
  {
    let prev = NaN, sum = 0;
    for (let i = 0; i < n; i++) {
      const h = bars[i].high, l = bars[i].low;
      const tr = i === 0 ? h - l : Math.max(h - l, Math.abs(h - closeArr[i - 1]), Math.abs(l - closeArr[i - 1]));
      if (isNaN(prev)) {
        sum += tr;
        if (i === cfg.atrLen - 1) prev = sum / cfg.atrLen;
      } else {
        prev = (prev * (cfg.atrLen - 1) + tr) / cfg.atrLen;
      }
      atrArr[i] = prev;
    }
  }

  // var int mtrend = 0 / var int trend = 0 / var float entrylevel = na, and the layers of the oscillator
  const mtrend: number[] = new Array(n).fill(0);
  const oscLine: number[] = new Array(n).fill(NaN);
  const lagging: number[] = new Array(n).fill(NaN);
  const convBase: number[] = new Array(n).fill(NaN);
  const cloud: number[] = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(0);
  const entryLevel: number[] = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    const c = closeArr[i];
    const cMin = cloudMinArr[i], cMax = cloudMaxArr[i];
    const prevM = i > 0 ? mtrend[i - 1] : 0;
    // mtrend := close > CloudMax ? 1 : close < CloudMin ? -1 : mtrend
    const m = c > cMax ? 1 : c < cMin ? -1 : prevM;
    mtrend[i] = m;

    // first layer
    oscLine[i] = m === 1 ? c - cMin : c - cMax;
    // second layer: CloudMax[displacement - 1] / CloudMin[displacement - 1], the lead lines 2 x (displacement - 1)
    // bars back
    lagging[i] = oscLine[i] + (m === 1 ? pmax(c - at(cloudMaxArr, i - d), 0) : pmin(c - at(cloudMinArr, i - d), 0));
    // third layer
    const tk = tenkanArr[i], kj = kijunArr[i];
    convBase[i] = lagging[i] + (m === 1 ? pmax(tk - kj, 0) : pmin(tk - kj, 0));
    // fourth layer
    const l1 = leadLine1Arr[i], l2 = leadLine2Arr[i];
    cloud[i] = convBase[i] + (m === 1 ? pmax(l1 - l2, 0) : pmin(l1 - l2, 0));

    // ta.change(...) > 0 / < 0: false while a value is na
    const dTk = tk - at(tenkanArr, i - 1), dKj = kj - at(kijunArr, i - 1);
    const anyRising = dTk > 0 || dKj > 0;
    const anyFalling = dTk < 0 || dKj < 0;
    const convoverbase = tk >= kj;
    const baseoverconv = tk <= kj;
    const cloudup = l1 >= l2;
    const clouddn = l1 <= l2;
    const tole = cfg.useAtr ? atrArr[i] * cfg.atrMult : 0;

    let trend = i > 0 ? trendArr[i - 1] : 0;
    let entry = i > 0 ? entryLevel[i - 1] : NaN;
    // mtrend[1] is na on the first bar
    const prevMtrend = i > 0 ? mtrend[i - 1] : NaN;
    if (m === 1) {
      trend = prevMtrend === -1 ? 0 : trend;
      if (trend < 4 && c > cMax) {
        trend = (lagging[i] > oscLine[i] ? 1 : 0) + (convoverbase && anyRising ? 1 : 0) + (cloudup ? 1 : 0) + 1;
        if (trend === 4) entry = c;
      } else {
        // a na tolerance (ATR warm-up) keeps the trend
        trend = tk < kj - tole ? 0 : trend;
      }
    } else if (m === -1) {
      trend = prevMtrend === 1 ? 0 : trend;
      if (trend > -4 && c < cMin) {
        trend = (lagging[i] < oscLine[i] ? -1 : 0) - (baseoverconv && anyFalling ? 1 : 0) - (clouddn ? 1 : 0) - 1;
        if (trend === -4) entry = c;
      } else {
        trend = tk > kj + tole ? 0 : trend;
      }
    }
    trendArr[i] = trend;
    entryLevel[i] = entry;
  }

  // EMA of cloud layer
  const cloudSeries = Series.fromArray(bars, cloud);
  const emaLine = ta.ema(cloudSeries, emaLen).toArray();

  // plot colours of the original: cloud = mtrend == 1 ? upcol4 : dbcol4; ConvBase = conversionLine >= baseLine ?
  // upcol3 : dbcol3; Lagging = close > CloudMax ? upcol2 : close < CloudMin ? dbcol2 : transparent; Oscline =
  // inthecloud ? inSRcolor : close > CloudMax ? upcol1 : dbcol1 (comparisons with a na value are false)
  const IN_SR = '#d1d4dc';
  const makePlot = (arr: number[], colorAt: (i: number) => string) =>
    arr.map((v, i) => {
      if (isNaN(v)) return { time: bars[i].time, value: NaN };
      return { time: bars[i].time, value: v, color: colorAt(i) };
    });

  const plot0 = makePlot(cloud, (i) => (mtrend[i] === 1 ? '#004600' : '#460000'));
  const plot1 = makePlot(convBase, (i) => (tenkanArr[i] >= kijunArr[i] ? '#008200' : '#820000'));
  const plot2 = makePlot(lagging, (i) => {
    const c = closeArr[i];
    return c > cloudMaxArr[i] ? '#00BE00' : c < cloudMinArr[i] ? '#BE0000' : 'transparent';
  });
  const plot3 = makePlot(oscLine, (i) => {
    const c = closeArr[i];
    if (c >= cloudMinArr[i] && c <= cloudMaxArr[i]) return IN_SR;
    return c > cloudMaxArr[i] ? '#00FA00' : '#FA0000';
  });
  const plot4 = emaLine.map((v, i) => ({
    time: bars[i].time,
    value: v == null ? NaN : v,
  }));

  // Pine markers (ids: the original's plotshape outputs shape0..shape5) and alert() calls
  const LONG_COL = '#FFFFFF';
  const SHORT_COL = '#FFEB3B';
  const EMA_COL = '#d1c4e9';
  // getClose(message) => str.replace(message, "close", str.tostring(close)): the first occurrence
  const getClose = (message: string, i: number) => message.replace('close', str.tostring(closeArr[i]));
  const crossAt = (a: ArrayLike<number | null>, b: ArrayLike<number | null>, i: number) => {
    const v = a[i] ?? NaN, w = b[i] ?? NaN, pv = a[i - 1] ?? NaN, pw = b[i - 1] ?? NaN;
    return v > w && pv <= pw;
  };
  // inthecloud = close >= CloudMin and close <= CloudMax (false while CloudMin / CloudMax is na)
  const cloudMinAt = (i: number) => at(cloudMinArr, i);
  const cloudMaxAt = (i: number) => at(cloudMaxArr, i);
  const inTheCloud = (i: number) => {
    const c = at(closeArr, i);
    return c >= cloudMinAt(i) && c <= cloudMaxAt(i);
  };
  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  for (let i = 1; i < n; i++) {
    const t = bars[i].time;
    const c = closeArr[i];
    const trend = trendArr[i];
    const changed = trend !== trendArr[i - 1];
    // closetrade = ta.change(trend) != 0 and math.abs(trend[1]) == 4
    // plotshape(cloud, color = closetrade ? (trend[1] > 0 ? long : short) : na, xcross, absolute, size.small)
    const closetrade = changed && Math.abs(trendArr[i - 1]) === 4;
    if (closetrade) {
      // plotted at the cloud value (no shape while it is na)
      if (!isNaN(cloud[i])) markers.push({
        time: t, position: 'atPriceMiddle', price: cloud[i], shape: 'xcross',
        color: trendArr[i - 1] > 0 ? LONG_COL : SHORT_COL, size: 'small', id: 'shape0',
      });
      if (cfg.closeAlert) alertCalls.push({ time: t, message: getClose(cfg.closeMainMsg, i), freq: cfg.closeFrequency });
    }
    // uptrend = trend == 4 and ta.change(trend) != 0: plotshape(0, triangleup, absolute, size.small)
    const uptrend = trend === 4 && changed;
    if (uptrend) {
      markers.push({
        time: t, position: 'atPriceMiddle', price: 0, shape: 'triangleUp', color: LONG_COL, size: 'small', text: '',
        id: 'shape1',
      });
      if (cfg.mainAlert) alertCalls.push({ time: t, message: getClose(cfg.alertLongMsg, i), freq: cfg.mainFrequency });
    }
    // bouncbackup = bounceoff and trend == 4 and close > CloudMax and inthecloud[1]:
    // plotshape(0, triangleup, absolute, size.tiny); alert(alertaddlongmsg) with addalert
    const bouncbackup = cfg.bounceOff && trend === 4 && c > cloudMaxAt(i) && inTheCloud(i - 1);
    if (bouncbackup) {
      markers.push({
        time: t, position: 'atPriceMiddle', price: 0, shape: 'triangleUp', color: LONG_COL, size: 'tiny', text: '',
        id: 'shape2',
      });
      if (cfg.addAlert) alertCalls.push({ time: t, message: getClose(cfg.alertAddLongMsg, i), freq: cfg.mainFrequency });
    }
    // downtrend = trend == -4 and ta.change(trend) != 0: plotshape(0, triangledown, absolute, size.small)
    const downtrend = trend === -4 && changed;
    if (downtrend) {
      markers.push({
        time: t, position: 'atPriceMiddle', price: 0, shape: 'triangleDown', color: SHORT_COL, size: 'small', text: '',
        id: 'shape3',
      });
      if (cfg.mainAlert) alertCalls.push({ time: t, message: getClose(cfg.alertShortMsg, i), freq: cfg.mainFrequency });
    }
    // bouncbackdn = bounceoff and trend == -4 and close < CloudMin and inthecloud[1]:
    // plotshape(0, triangledown, absolute, size.tiny); alert(alertaddshortmsg) with addalert
    const bouncbackdn = cfg.bounceOff && trend === -4 && c < cloudMinAt(i) && inTheCloud(i - 1);
    if (bouncbackdn) {
      markers.push({
        time: t, position: 'atPriceMiddle', price: 0, shape: 'triangleDown', color: SHORT_COL, size: 'tiny', text: '',
        id: 'shape4',
      });
      if (cfg.addAlert) alertCalls.push({ time: t, message: getClose(cfg.alertAddShortMsg, i), freq: cfg.mainFrequency });
    }
    // Partial take profit: plotshape(cloud, color = posexitcol, absolute, xcross, size.tiny); alert on partclose
    const convcrossbase = crossAt(tenkanArr, kijunArr, i);
    const basecrosscons = crossAt(kijunArr, tenkanArr, i);
    const emacrosscloud = crossAt(emaLine, cloud, i);
    const cloudcrossema = crossAt(cloud, emaLine, i);
    const ematk = cfg.emaTakePartialProfit;
    const profitable = (trend === 4 && c > entryLevel[i]) || (trend === -4 && c < entryLevel[i]);
    const posexitcol = !profitable ? null
      : trend === 4 && basecrosscons ? LONG_COL
        : trend === 4 && emacrosscloud && ematk ? EMA_COL
          : trend === -4 && convcrossbase ? SHORT_COL
            : trend === -4 && cloudcrossema && ematk ? EMA_COL
              : null;
    if (posexitcol && !isNaN(cloud[i])) {
      markers.push({
        time: t, position: 'atPriceMiddle', price: cloud[i], shape: 'xcross', color: posexitcol, size: 'tiny',
        id: 'shape5',
      });
    }
    const partclose = (trend === 4 && basecrosscons) || (trend === 4 && emacrosscloud && ematk)
      || (trend === -4 && convcrossbase) || (trend === -4 && cloudcrossema && ematk);
    if (partclose && cfg.closePartAlert) {
      alertCalls.push({ time: t, message: getClose(cfg.closePartMsg, i), freq: cfg.closeFrequency });
    }
  }

  // bgcolor(coloredbg ? trend > 0 ? bgcolup : trend < 0 ? bgcoldn : inSRcolor : na) on every bar (trend starts at 0)
  // uptmult = 159 + math.pow(trend, 3); bgcolup = rgb(0, uptmult, 0, bgtransp) (default green uptrend)
  // dntmult = 159 - math.pow(trend, 3); bgcoldn = rgb(0, 0, dntmult, bgtransp) (default blue downtrend)
  // inSRcolor (#d1d4dc) has no transparency: the zone background is opaque
  const bgtransp = 60; // default 60% transparency -> alpha = 0.4
  const bgAlpha = 1 - bgtransp / 100;
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = trendArr[i];
    let col: string;
    if (t > 0) {
      const intensity = Math.max(0, Math.min(255, Math.round(159 + Math.pow(t, 3))));
      col = `rgba(0, ${intensity}, 0, ${bgAlpha})`;
    } else if (t < 0) {
      const intensity = Math.max(0, Math.min(255, Math.round(159 - Math.pow(t, 3))));
      col = `rgba(0, 0, ${intensity}, ${bgAlpha})`;
    } else {
      // in the support / resistance zone (trend == 0): inSRcolor
      col = IN_SR;
    }
    bgColors.push({ time: bars[i].time, color: col, id: 'bgcolor0' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3, 'plot4': plot4 },
    markers,
    bgColors,
    alertCalls,
  };
}

export const IchimokuOscillator = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
