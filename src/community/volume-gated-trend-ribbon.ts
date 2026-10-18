/**
 * Volume-Gated Trend Ribbon [QuantAlgo]
 *
 * The close is "gated" by volume: the gated close only takes the new close on bars whose volume is at least
 * SMA(volume, period) * multiplier, and keeps its last value on the other bars. A fast and a slow moving average
 * (15 types) of the gated close (VWMA: of the raw close) form a ribbon with two intermediate lines
 * (0.67 / 0.33 blends) and three fills of decreasing opacity from the slow to the fast line. The ribbon is bullish
 * when the fast MA is above the slow MA; bars can take the trend colour.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Trend Signal' / 'Bearish Trend Signal' on the bar the trend
 * state (1 when the fast MA is above the slow MA, else -1) turns to 1 / -1, 'Trend Change' on either.
 *
 * Reference: "Volume-Gated Trend Ribbon [QuantAlgo]" by QuantAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

const MA_TYPES = ['SMA', 'EMA', 'WMA', 'RMA', 'HMA', 'VWMA', 'DEMA', 'TEMA', 'ALMA', 'LSMA', 'SMMA', 'KAMA', 'ZLEMA', 'T3', 'VIDYA'];
const COLOR_PAIRS: Record<string, [string, string]> = {
  Classic: ['#00ff00', '#ff0000'],
  Aqua: ['#00bfff', '#ff8c00'],
  Cosmic: ['#49ffce', '#9932cc'],
  Ember: ['#ff6600', '#00cccc'],
  Neon: ['#ffff00', '#ff00ff'],
};

export interface VolumeGatedTrendRibbonInputs {
  /** Volume multiplier: a bar is significant when volume >= SMA(volume) * multiplier */
  volMult: number;
  /** Period of the average volume */
  volPeriod: number;
  /** Moving average type */
  maType: string;
  /** Fast MA length (HMA: at least 4) */
  fastLen: number;
  /** Slow MA length (at least fast length + 1) */
  slowLen: number;
  /** Default uses the inputs above; Fast Response 0.8 / 20 / 10 / 20; Smooth Trend 1.2 / 75 / 20 / 40 */
  presetConfig: string;
  /** Colour the price bars with the trend colour */
  enableBarColor: boolean;
  /** Colour preset; Custom uses bullColorInput / bearColorInput */
  colorPreset: string;
  bullColorInput: string;
  bearColorInput: string;
  /** Fill opacity 0..100 */
  fillOpacity: number;
}

export const defaultInputs: VolumeGatedTrendRibbonInputs = {
  volMult: 1.0,
  volPeriod: 50,
  maType: 'EMA',
  fastLen: 15,
  slowLen: 30,
  presetConfig: 'Default',
  enableBarColor: false,
  colorPreset: 'Custom',
  bullColorInput: '#00ffaa',
  bearColorInput: '#ff0000',
  fillOpacity: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'volMult', type: 'float', title: 'Volume Multiplier', defval: 1.0, min: 0.5, max: 3.0, step: 0.1 },
  { id: 'volPeriod', type: 'int', title: 'Volume Period', defval: 50, min: 1 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA', options: MA_TYPES },
  { id: 'fastLen', type: 'int', title: 'Fast Length', defval: 15, min: 1 },
  { id: 'slowLen', type: 'int', title: 'Slow Length', defval: 30, min: 1 },
  { id: 'presetConfig', type: 'string', title: 'Preset Configuration', defval: 'Default', options: ['Default', 'Fast Response', 'Smooth Trend'] },
  { id: 'enableBarColor', type: 'bool', title: 'Enable Bar Coloring', defval: false },
  { id: 'colorPreset', type: 'string', title: 'Color Preset', defval: 'Custom', options: ['Classic', 'Aqua', 'Cosmic', 'Ember', 'Neon', 'Custom'] },
  { id: 'bullColorInput', type: 'color', title: 'Bullish Color', defval: '#00ffaa' },
  { id: 'bearColorInput', type: 'color', title: 'Bearish Color', defval: '#ff0000' },
  { id: 'fillOpacity', type: 'int', title: 'Fill Opacity', defval: 100, min: 0, max: 100 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot1', title: 'Mid-Fast MA', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot2', title: 'Mid-Slow MA', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot3', title: 'Slow MA', color: '#00ffaa', lineWidth: 1 },
  { id: 'plot4', title: 'Fast Edge', color: '#00ffaa', lineWidth: 2 },
  { id: 'plot5', title: 'Slow Edge', color: '#00ffaa', lineWidth: 2 },
];

export const metadata = {
  title: 'Volume-Gated Trend Ribbon [QuantAlgo]',
  shortTitle: 'Volume-Gated Trend Ribbon',
  overlay: true,
};

/** Pine float comparisons with the 1e-10 tolerance (false with na) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => b - a <= EPS;
/** Pine x != 0 (false when x is na) */
const ne0 = (x: number) => Math.abs(x) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeGatedTrendRibbonInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  let { volMult, volPeriod, fastLen, slowLen } = cfg;
  if (cfg.presetConfig === 'Fast Response') {
    volMult = 0.8;
    volPeriod = 20;
    fastLen = 10;
    slowLen = 20;
  } else if (cfg.presetConfig === 'Smooth Trend') {
    volMult = 1.2;
    volPeriod = 75;
    fastLen = 20;
    slowLen = 40;
  }
  const maType = cfg.maType;
  const [bullColor, bearColor] = COLOR_PAIRS[cfg.colorPreset] ?? [cfg.bullColorInput, cfg.bearColorInput];
  // fastPeriod = maType == 'HMA' ? math.max(fastLen, 4) : fastLen; slowPeriod = math.max(slowLen, fastPeriod + 1)
  const fastPeriod = maType === 'HMA' ? Math.max(fastLen, 4) : fastLen;
  const slowPeriod = Math.max(slowLen, fastPeriod + 1);

  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);

  // avgVol = ta.sma(volume, volPeriod); highVol = volume >= avgVol * volMult
  const avgVol = A(ta.sma(S(volume), volPeriod));
  // var float gatedClose = close; if highVol: gatedClose := close
  const gated: number[] = new Array(n);
  let gatedVar = NaN;
  for (let i = 0; i < n; i++) {
    if (i === 0) gatedVar = close[0];
    if (ge(volume[i], avgVol[i] * volMult)) gatedVar = close[i];
    gated[i] = gatedVar;
  }

  const ema = (src: number[], len: number) => A(ta.ema(S(src), len));
  const gd = (src: number[], len: number, factor: number) => {
    const e1 = ema(src, len);
    const e2 = ema(e1, len);
    return e1.map((v, i) => v * (1 + factor) - e2[i] * factor);
  };
  /** smma: result := na(result[1]) ? ta.sma(src, len) : (result[1] * (len - 1) + src) / len */
  const smma = (src: number[], len: number) => {
    // ta.sma only runs while result[1] is na: consecutive bars from bar 0, so it is the plain SMA there
    const sma = A(ta.sma(S(src), len));
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const prev = i > 0 ? out[i - 1] : NaN;
      out[i] = isNaN(prev) ? sma[i] : (prev * (len - 1) + src[i]) / len;
    }
    return out;
  };
  /** kama: er = vol != 0 ? change / vol : 0; sc = (er * (fastSC - slowSC) + slowSC)^2 */
  const kama = (src: number[], len: number) => {
    const absDiff = src.map((v, i) => (i > 0 ? Math.abs(v - src[i - 1]) : NaN));
    const vol = A(math.sum(S(absDiff), len) as Series);
    const fastSC = 2.0 / 3;
    const slowSC = 2.0 / 31;
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const change = Math.abs(src[i] - (i - len >= 0 ? src[i - len] : NaN));
      const er = ne0(vol[i]) ? change / vol[i] : 0;
      const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
      const prev = i > 0 ? out[i - 1] : NaN;
      out[i] = isNaN(prev) ? src[i] : prev + sc * (src[i] - prev);
    }
    return out;
  };
  /** zlema: lag = (len - 1) / 2; ta.ema(src + (src - src[lag]), len) */
  const zlema = (src: number[], len: number) => {
    const lag = Math.floor((len - 1) / 2);
    return ema(src.map((v, i) => v + (v - (i - lag >= 0 ? src[i - lag] : NaN))), len);
  };
  /** vidya: cmo = (upSum + dnSum) != 0 ? |(upSum - dnSum) / (upSum + dnSum)| : 0 */
  const vidya = (src: number[], len: number) => {
    const mom = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
    // math.max(na, 0) is na
    const upSum = A(math.sum(S(mom.map((m) => (isNaN(m) ? NaN : Math.max(m, 0)))), len) as Series);
    const dnSum = A(math.sum(S(mom.map((m) => (isNaN(m) ? NaN : Math.max(-m, 0)))), len) as Series);
    const alpha = 2.0 / (len + 1);
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const tot = upSum[i] + dnSum[i];
      const cmo = ne0(tot) ? Math.abs((upSum[i] - dnSum[i]) / tot) : 0;
      const prev = i > 0 ? out[i - 1] : NaN;
      out[i] = isNaN(prev) ? src[i] : src[i] * alpha * cmo + prev * (1 - alpha * cmo);
    }
    return out;
  };

  const ma = (src: number[], len: number): number[] => {
    switch (maType) {
      case 'SMA': return A(ta.sma(S(src), len));
      case 'EMA': return ema(src, len);
      case 'WMA': return A(ta.wma(S(src), len));
      case 'RMA': return A(ta.rma(S(src), len));
      case 'HMA': return A(ta.hma(S(src), len));
      case 'VWMA': return A(ta.vwma(S(src), len, S(volume)));
      case 'DEMA': {
        const e1 = ema(src, len);
        const e2 = ema(e1, len);
        return e1.map((v, i) => 2 * v - e2[i]);
      }
      case 'TEMA': {
        const e1 = ema(src, len);
        const e2 = ema(e1, len);
        const e3 = ema(e2, len);
        return e1.map((v, i) => 3 * (v - e2[i]) + e3[i]);
      }
      case 'ALMA': return A(ta.alma(S(src), len, 0.85, 6));
      case 'LSMA': return A(ta.linreg(S(src), len, 0));
      case 'SMMA': return smma(src, len);
      case 'KAMA': return kama(src, len);
      case 'ZLEMA': return zlema(src, len);
      case 'T3': return gd(gd(gd(src, len, 0.7), len, 0.7), len, 0.7);
      case 'VIDYA': return vidya(src, len);
      default: return ema(src, len);
    }
  };
  // volMA(gatedSrc, rawSrc, len) => maType == 'VWMA' ? ta.vwma(rawSrc, len) : ma(gatedSrc, len)
  const volMA = (len: number) => (maType === 'VWMA' ? A(ta.vwma(S(close), len, S(volume))) : ma(gated, len));

  const fastMA = volMA(fastPeriod);
  const slowMA = volMA(slowPeriod);

  // outerOp = 100 - math.round(fillOpacity * 0.8); innerOp: * 0.6; coreOp: * 0.4
  const outerOp = 100 - Math.round(cfg.fillOpacity * 0.8);
  const innerOp = 100 - Math.round(cfg.fillOpacity * 0.6);
  const coreOp = 100 - Math.round(cfg.fillOpacity * 0.4);
  const c = (col: string, transp: number) => String(color.new(col, transp));

  type Point = { time: number; value: number; color: string };
  const plots: Point[][] = Array.from({ length: 6 }, () => []);
  const fillCols: string[][] = [[], [], []];
  const barColors: BarColorData[] = [];
  // trendState := bullish ? 1 : -1; longSignal = trendState == 1 and trendState[1] != 1 (na on the first bar: false)
  const longFlags: boolean[] = [], shortFlags: boolean[] = [], changeFlags: boolean[] = [];
  let prevState = NaN;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const state = gt(fastMA[i], slowMA[i]) ? 1 : -1;
    const longSignal = state === 1 && i > 0 && prevState !== 1;
    const shortSignal = state === -1 && i > 0 && prevState !== -1;
    longFlags.push(longSignal);
    shortFlags.push(shortSignal);
    changeFlags.push(longSignal || shortSignal);
    prevState = state;
    const f = fastMA[i];
    const s = slowMA[i];
    // bullish = fastMA > slowMA; trendCol = bullish ? bullColor : bearColor
    const trendCol = gt(f, s) ? bullColor : bearColor;
    const line = c(trendCol, 80);
    plots[0].push({ time: t, value: f, color: line });
    plots[1].push({ time: t, value: f * 0.67 + s * 0.33, color: line });
    plots[2].push({ time: t, value: f * 0.33 + s * 0.67, color: line });
    plots[3].push({ time: t, value: s, color: line });
    plots[4].push({ time: t, value: f, color: c(trendCol, 0) });
    plots[5].push({ time: t, value: s, color: c(trendCol, 0) });
    fillCols[0].push(c(trendCol, coreOp));
    fillCols[1].push(c(trendCol, innerOp));
    fillCols[2].push(c(trendCol, outerOp));
    // barcolor(enableBarColor ? trendCol : na)
    if (cfg.enableBarColor) barColors.push({ time: t, color: trendCol });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: Object.fromEntries(plots.map((p, k) => [`plot${k}`, p])),
    fills: [
      // fill(pMidSlow, pSlow, 'Core Fill'); fill(pMidFast, pMidSlow, 'Inner Fill'); fill(pFast, pMidFast, 'Outer Fill')
      { plot1: 'plot2', plot2: 'plot3', colors: fillCols[0] },
      { plot1: 'plot1', plot2: 'plot2', colors: fillCols[1] },
      { plot1: 'plot0', plot2: 'plot1', colors: fillCols[2] },
    ],
    markers: [],
    barColors,
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags, changeFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Trend Signal', message: 'Volume-Gated Ribbon: Trend changed to BULLISH {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert1', title: 'Bearish Trend Signal', message: 'Volume-Gated Ribbon: Trend changed to BEARISH {{exchange}}:{{ticker}} - {{interval}}' },
  { id: 'alert2', title: 'Trend Change', message: 'Volume-Gated Ribbon: Trend direction changed - Check chart {{exchange}}:{{ticker}} - {{interval}}' },
];

export const VolumeGatedTrendRibbon = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
