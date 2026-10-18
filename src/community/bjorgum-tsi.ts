/**
 * Bjorgum TSI
 *
 * True Strength Index with signal line, fill, and OB/OS detection.
 * TSI = 100 * EMA(EMA(momentum, longLen), shortLen) / EMA(EMA(abs(momentum), longLen), shortLen)
 * Signal = EMA(TSI, signalLen)
 * Fast/Slow speed presets. Bar histogram for TSI-signal spread.
 * As the original (theme "Classic Bj"): the candles from 0 to the TSI-signal spread (plotcandle, no colour in this
 * theme), bars coloured on a curl in overbought / oversold ("Ob/Os Curl Color"), background on a cross up in oversold
 * / down in overbought ("Show Ob/Os Cross").
 *
 * Alerts (alertcondition, `alerts` of the result): the original's 11 conditions (TSI crossing its signal, curls,
 * moves into overbought / oversold, curls and crosses inside them).
 *
 * Reference: "Bjorgum TSI" community indicator
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BgColorData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'TSI cross up', message: 'TSI crossed up on {{interval}} chart. Price is {{close}}' },
  { id: 'alert1', title: 'TSI cross down', message: 'TSI crossed down on {{interval}} chart. Price is {{close}}' },
  { id: 'alert2', title: 'TSI cross', message: 'TSI crossed on {{interval}} chart. Price is {{close}}' },
  { id: 'alert3', title: 'TSI Curl Up', message: 'TSI curled up on {{interval}} chart. Price is {{close}}' },
  { id: 'alert4', title: 'TSI Curl Down', message: 'TSI curled down on {{interval}} chart. Price is {{close}}' },
  { id: 'alert5', title: 'TSI Overbought', message: 'TSI moved in to overbought on {{interval}} chart. Price is {{close}}' },
  { id: 'alert6', title: 'TSI Oversold', message: 'TSI moved in to oversold on {{interval}} chart. Price is {{close}}' },
  { id: 'alert7', title: 'TSI Curl Overbought', message: 'TSI Curled Down In Overbought on {{interval}} chart. Price is {{close}}' },
  { id: 'alert8', title: 'TSI Curl Oversold', message: 'TSI Curled Up In Oversold on {{interval}} chart. Price is {{close}}' },
  { id: 'alert9', title: 'TSI Cross Down Overbought', message: 'TSI Crossed Down In Overbought on {{interval}} chart. Price is {{close}}' },
  { id: 'alert10', title: 'TSI Cross Up Oversold', message: 'TSI Crossed Up In Oversold on {{interval}} chart. Price is {{close}}' },
];

export interface BjorgumTSIInputs {
  speedInput: string;
  obValue: number;
  osValue: number;
  showLines: boolean;
  showMid: boolean;
  /** Show Ob/Os Cross: background on a cross up in oversold / down in overbought */
  showHiLo: boolean;
  /** Ob/Os Curl Color: bar colours */
  showCurl: boolean;
  /** Show White Bars: the other bars white (with "Ob/Os Curl Color") */
  blankBars: boolean;
  longfLen: number;
  shortfLen: number;
  signalfLen: number;
  longsLen: number;
  shortsLen: number;
  signalsLen: number;
}

export const defaultInputs: BjorgumTSIInputs = {
  speedInput: 'Fast',
  obValue: 30,
  osValue: -30,
  showLines: true,
  showMid: true,
  showHiLo: false,
  showCurl: false,
  blankBars: false,
  longfLen: 25,
  shortfLen: 5,
  signalfLen: 14,
  longsLen: 25,
  shortsLen: 13,
  signalsLen: 13,
};

export const inputConfig: InputConfig[] = [
  { id: 'speedInput', type: 'string', title: 'Speed', defval: 'Fast', options: ['Fast', 'Slow'] },
  { id: 'obValue', type: 'int', title: 'Overbought', defval: 30 },
  { id: 'osValue', type: 'int', title: 'Oversold', defval: -30 },
  { id: 'showLines', type: 'bool', title: 'Show OB/OS Lines', defval: true },
  { id: 'showMid', type: 'bool', title: 'Show Midline', defval: true },
  { id: 'showHiLo', type: 'bool', title: 'Show Ob/Os Cross', defval: false },
  { id: 'showCurl', type: 'bool', title: 'Ob/Os Curl Color', defval: false },
  { id: 'blankBars', type: 'bool', title: 'Show White Bars', defval: false },
  { id: 'longfLen', type: 'int', title: 'Fast Long Length', defval: 25, min: 1 },
  { id: 'shortfLen', type: 'int', title: 'Fast Short Length', defval: 5, min: 1 },
  { id: 'signalfLen', type: 'int', title: 'Fast Signal Length', defval: 14, min: 1 },
  { id: 'longsLen', type: 'int', title: 'Slow Long Length', defval: 25, min: 1 },
  { id: 'shortsLen', type: 'int', title: 'Slow Short Length', defval: 13, min: 1 },
  { id: 'signalsLen', type: 'int', title: 'Slow Signal Length', defval: 13, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TSI', color: '#2962FF', lineWidth: 2 },
  { id: 'plot1', title: 'Signal', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot2', title: 'Bar Hi', color: '#26A69A', lineWidth: 4, style: 'histogram' },
  { id: 'plot3', title: 'Bar Lo', color: '#EF5350', lineWidth: 4, style: 'histogram' },
  { id: 'h1', title: 'Level', color: 'transparent', lineWidth: 0, display: 'none' },
  { id: 'h2', title: 'Level', color: 'transparent', lineWidth: 0, display: 'none' },
  { id: 'p6', title: 'Plot', color: 'transparent', lineWidth: 0, display: 'none' },
  { id: 'p7', title: 'Plot', color: 'transparent', lineWidth: 0, display: 'none' },
];

export const metadata = {
  title: 'Bjorgum TSI',
  shortTitle: 'BTSI',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<BjorgumTSIInputs> = {},
): IndicatorResult & {
  plotCandles: Record<string, PlotCandleData[]>; barColors: BarColorData[]; bgColors: BgColorData[];
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };

  // Select speed preset
  const longLen = cfg.speedInput === 'Fast' ? cfg.longfLen : cfg.longsLen;
  const shortLen = cfg.speedInput === 'Fast' ? cfg.shortfLen : cfg.shortsLen;
  const signalLen = cfg.speedInput === 'Fast' ? cfg.signalfLen : cfg.signalsLen;

  // Momentum: close - close[1]
  const momArr: number[] = [NaN];
  for (let i = 1; i < bars.length; i++) {
    momArr.push(bars[i].close - bars[i - 1].close);
  }
  const absMomArr = momArr.map(v => isNaN(v) ? NaN : Math.abs(v));

  // TSI = 100 * EMA(EMA(mom, longLen), shortLen) / EMA(EMA(abs(mom), longLen), shortLen)
  const momSeries = new Series(bars, (_, i) => momArr[i]);
  const absMomSeries = new Series(bars, (_, i) => absMomArr[i]);

  const dsPC = ta.ema(ta.ema(momSeries, longLen), shortLen);
  const dsAbsPC = ta.ema(ta.ema(absMomSeries, longLen), shortLen);

  const dsPCArr = dsPC.toArray();
  const dsAbsPCArr = dsAbsPC.toArray();

  const tsiArr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    const num = dsPCArr[i];
    const den = dsAbsPCArr[i];
    if (num == null || den == null || den === 0) {
      tsiArr.push(NaN);
    } else {
      tsiArr.push(100 * num / den);
    }
  }

  // Signal = EMA(tsi, signalLen)
  const tsiSeries = new Series(bars, (_, i) => tsiArr[i]);
  const signalArr = ta.ema(tsiSeries, signalLen).toArray();

  const warmup = longLen + shortLen;

  // TSI line colored by direction
  const tsiPlot = tsiArr.map((v, i) => {
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const prev = i > 0 ? tsiArr[i - 1] : NaN;
    const color = !isNaN(prev) && v >= prev ? '#2962FF' : '#FF6D00';
    return { time: bars[i].time, value: v, color };
  });

  // Signal line colored by direction
  const sigPlot = signalArr.map((v, i) => {
    if (i < warmup || v == null || isNaN(v)) return { time: bars[i].time, value: NaN };
    const prev = i > 0 ? (signalArr[i - 1] ?? NaN) : NaN;
    const color = !isNaN(prev) && v >= prev ? '#2962FF' : '#FF6D00';
    return { time: bars[i].time, value: v, color };
  });

  // Bar histogram: diff = tsi - signal
  // barHi = max(0, diff), barLo = min(0, diff)
  // Color: OB curl down or OS curl up get special colors
  const barHiPlot = tsiArr.map((tsi, i) => {
    const sig = signalArr[i] ?? NaN;
    if (i < warmup || isNaN(tsi) || isNaN(sig)) return { time: bars[i].time, value: NaN };
    const diff = tsi - sig;
    const barHi = Math.max(0, diff);
    if (barHi === 0) return { time: bars[i].time, value: NaN };

    // OB curl down: tsi was above obValue and is now declining
    const prevTsi = i > 0 ? tsiArr[i - 1] : NaN;
    const obCurl = !isNaN(prevTsi) && prevTsi >= cfg.obValue && tsi < prevTsi;
    const color = obCurl ? '#FF5252' : '#26A69A';
    return { time: bars[i].time, value: barHi, color };
  });

  const barLoPlot = tsiArr.map((tsi, i) => {
    const sig = signalArr[i] ?? NaN;
    if (i < warmup || isNaN(tsi) || isNaN(sig)) return { time: bars[i].time, value: NaN };
    const diff = tsi - sig;
    const barLo = Math.min(0, diff);
    if (barLo === 0) return { time: bars[i].time, value: NaN };

    // OS curl up: tsi was below osValue and is now rising
    const prevTsi = i > 0 ? tsiArr[i - 1] : NaN;
    const osCurl = !isNaN(prevTsi) && prevTsi <= cfg.osValue && tsi > prevTsi;
    const color = osCurl ? '#00E676' : '#EF5350';
    return { time: bars[i].time, value: barLo, color };
  });

  // Fill between TSI and signal
  const fillColors = tsiArr.map((tsi, i) => {
    const sig = signalArr[i] ?? NaN;
    if (i < warmup || isNaN(tsi) || isNaN(sig)) return 'transparent';
    return tsi >= sig ? 'rgba(41,98,255,0.15)' : 'rgba(255,109,0,0.15)';
  });

  // Pine: isClassic = themeInput == "Classic Bj" (default; this port has no theme input), isBeachy false
  const isClassic = true;
  const ob = cfg.obValue;
  const os = cfg.osValue;
  const obFillColor = '#33FF57'; // Pine: isBeachy ? #FFD700 : #33FF57
  const osFillColor = '#33FF57'; // Pine: isBeachy ? #FF6B6B : #33FF57
  const bullBgColor = '#80FFFF'; // Pine: isBeachy ? #FFD700 : #80FFFF
  const bearBgColor = '#FF80FF'; // Pine: isBeachy ? #FF6B6B : #FF80FF
  const perBar = <T>(f: (i: number) => T): T[] => bars.map((_, i) => f(i));
  const hidden = (f: (i: number) => number) => bars.map((b, i) => ({ time: b.time, value: f(i) }));

  // Pine: h1 = hline(isClassic ? na : oBotInput, ...); h2 = hline(isClassic ? na : oSoldInput, ...)
  const h1Plot = hidden(() => (isClassic ? NaN : ob));
  const h2Plot = hidden(() => (isClassic ? NaN : os));
  // Pine: p6 = plot(oBotInput, display = display.none); p7 = plot(oSoldInput, display = display.none)
  const p6Plot = hidden(() => ob);
  const p7Plot = hidden(() => os);

  // Pine: obValue = showObFill ? oBotInput : na (showObFill = tsl > oBotInput and not isClassic)
  const obValueArr = perBar((i) => (signalArr[i] > ob && !isClassic ? ob : NaN));
  // Pine: osValue = showOsFill ? oSoldInput : na (showOsFill = tsl < oSoldInput and not isClassic)
  const osValueArr = perBar((i) => (signalArr[i] < os && !isClassic ? os : NaN));

  const gradientFills = [
    // Pine: fill(h2, h1, oBotInput, 5, color.new(obFillColor, 80), color(na), fillgaps = true)
    { plot1: 'h2', plot2: 'h1', options: { title: 'Plots Background' }, gradient: {
      topValue: perBar(() => ob), bottomValue: perBar(() => 5),
      topColor: perBar((): string | null => color.new_color(obFillColor, 80) as string),
      bottomColor: perBar((): string | null => null) } },
    // Pine: fill(h2, h1, -5, oSoldInput, color(na), color.new(osFillColor, 80), fillgaps = true)
    { plot1: 'h2', plot2: 'h1', options: { title: 'Plots Background' }, gradient: {
      topValue: perBar(() => -5), bottomValue: perBar(() => os),
      topColor: perBar((): string | null => null),
      bottomColor: perBar((): string | null => color.new_color(osFillColor, 80) as string) } },
    // Pine: fill(p2, p6, oBotInput + 50, obValue, color.new(bearBgColor, 30), color.new(bearBgColor, 90), fillgaps = true)
    { plot1: 'plot1', plot2: 'p6', options: { title: 'Plots Background' }, gradient: {
      topValue: perBar(() => ob + 50), bottomValue: obValueArr,
      topColor: perBar((): string | null => color.new_color(bearBgColor, 30) as string),
      bottomColor: perBar((): string | null => color.new_color(bearBgColor, 90) as string) } },
    // Pine: fill(p2, p7, osValue, oSoldInput - 50, color.new(bullBgColor, 90), color.new(bullBgColor, 30), fillgaps = true)
    { plot1: 'plot1', plot2: 'p7', options: { title: 'Plots Background' }, gradient: {
      topValue: osValueArr, bottomValue: perBar(() => os - 50),
      topColor: perBar((): string | null => color.new_color(bullBgColor, 90) as string),
      bottomColor: perBar((): string | null => color.new_color(bullBgColor, 30) as string) } },
  ];
  // Pine: fill(p1, p2, tsi, tsl, fillColor2, color.new(fillColor2, 70), fillgaps = true, display = displayFill)
  // is not returned: displayFill = isClassic ? display.none : display.all, and FillData has no display option.

  // HLines
  const hlines: Array<{ value: number; options: { color: string; linestyle: 'solid' | 'dashed' | 'dotted'; linewidth?: number; title: string } }> = [];
  if (cfg.showLines) {
    hlines.push({ value: cfg.obValue, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'OB' } });
    hlines.push({ value: cfg.osValue, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'OS' } });
  }
  if (cfg.showMid) {
    hlines.push({ value: 0, options: { color: '#787B86', linestyle: 'dotted' as const, title: 'Zero' } });
  }

  // Conditions of the original
  const n = bars.length;
  const tsi = tsiArr;
  const tsl = signalArr.map((v) => v ?? NaN);
  const prevOf = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);
  const crossUp = crossedOver(tsi, tsl);
  const crossDn = crossedUnder(tsi, tsl);
  const crossAny = crossUp.map((v, i) => v || crossDn[i]);
  const curlUp = perBar((i) => tsi[i] > prevOf(tsi, i) && tsi[i] < tsl[i]);
  const curlDn = perBar((i) => tsi[i] < prevOf(tsi, i) && tsi[i] > tsl[i]);
  const overBought = perBar((i) => tsi[i] > ob && tsi[i] < prevOf(tsi, i) && prevOf(tsi, i) > prevOf(tsl, i));
  const overSold = perBar((i) => tsi[i] < os && tsi[i] > prevOf(tsi, i) && prevOf(tsi, i) < prevOf(tsl, i));
  const tsiXUp = crossedOver(tsi, ob);
  const tsiXDn = crossedUnder(tsi, os);
  const osCrossUp = perBar((i) => crossUp[i] && tsi[i] <= os);
  const obCrossDn = perBar((i) => crossDn[i] && tsi[i] >= ob);

  // plotcandle(barLo, barLo, barHi, barHi, color = isClassic ? na : ..., bordercolor = isClassic ? na : ...,
  // wickcolor = color(na), display = display.pane): barHi = max(0, diff), barLo = min(0, diff)
  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const diff = tsi[i] - tsl[i];
    if (isNaN(diff)) continue;
    const barHi = Math.max(0, 0 + diff);
    const barLo = Math.min(0, 0 + diff);
    candles.push({ time: bars[i].time, open: barLo, high: barLo, low: barHi, close: barHi,
      color: 'transparent', borderColor: 'transparent', wickColor: 'transparent' });
  }

  // barcolor(showCurlInput ? barColor : na): barColor = overBought ? obBar : overSold ? osBar : blankBars ? neBar : na
  const barColors: BarColorData[] = [];
  if (cfg.showCurl) {
    for (let i = 0; i < n; i++) {
      const c = overBought[i] ? '#ff0000' : overSold[i] ? '#17ff00' : cfg.blankBars ? '#ffffff' : null;
      if (c !== null) barColors.push({ time: bars[i].time, color: c, id: 'barcolor0' });
    }
  }
  // bgcolor(osCrossUp and showHiLoInput ? color.new(oBotColInput, 80) : na), bgcolor(obCrossDn and showHiLoInput ?
  // color.new(oSoldColInput, 80) : na) (theme "Classic Bj")
  const bgColors: BgColorData[] = [];
  if (cfg.showHiLo) {
    const osBg = String(color.new('#ff0000', 80));
    const obBg = String(color.new('#64b5f6', 80));
    for (let i = 0; i < n; i++) {
      if (osCrossUp[i]) bgColors.push({ time: bars[i].time, color: osBg, id: 'bgcolor0' });
      if (obCrossDn[i]) bgColors.push({ time: bars[i].time, color: obBg, id: 'bgcolor1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': tsiPlot, 'plot1': sigPlot, 'plot2': barHiPlot, 'plot3': barLoPlot,
      'h1': h1Plot, 'h2': h2Plot, 'p6': p6Plot, 'p7': p7Plot,
    },
    hlines,
    // Pine order: the 4 gradient fills above, then fill(p1, p2, fillColor1, fillgaps = true)
    fills: [...gradientFills, { plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: fillColors }],
    plotCandles: { candle: candles },
    barColors,
    bgColors,
    alerts: alertStates(alertConditions, bars, [
      crossUp, crossDn, crossAny, curlUp, curlDn, tsiXUp, tsiXDn, overBought, overSold, obCrossDn, osCrossUp,
    ]),
  };
}

export const BjorgumTSI = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
