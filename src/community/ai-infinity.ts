/**
 * AI Infinity
 *
 * Candle colouring: green when the MACD line (12, 26, 9) is above its signal, pink otherwise. In Gradient mode the
 * shade is taken from a 151-step gradient (start -> mid -> end colour) at index floor(MACD strength * 150), with
 * MACD strength = |MACD - signal| / max(|signal|, 1e-10); the transparency is 20 - body / range * 15 (+10 when the
 * stochastic %K and %D (14, 3, 3) are both above 80 or both below 20), or a fixed 20 (Gradient) / 15 (Simple) when
 * the stochastic is overbought with a bullish MACD or oversold with a bearish MACD.
 * RSI-style levels: the 100-bar lowest low -> highest high range drawn at 0, 10, 40, 50, 60, 90 and 100 % (titled
 * RSI 0, RSI 20, RSI 40, RSI 50, RSI 60, RSI 80, RSI 100), coloured by the close above / below the 50 % level,
 * more transparent when far from the close. Glow bands of 0.5 / 0.8 / 1.0 ATR (Dynamic Transparency) or
 * 0.4 / 0.8 / 1.0 ATR (Direct Glow) above the 100 % level and below the 0 % level, filled.
 * Optional Alligator lines (SMMA of hl2 with volatility-adjusted lengths 13 / 8 / 5, shifted 8 / 5 / 3 bars back)
 * and EMAs (20 or 50, 100, 200) coloured by the close above / below them.
 *
 * Alerts (alertcondition, `alerts` of the result): the MACD line crossing over / under its signal and the RSI (RSI
 * length) crossing over 80 / under 20.
 *
 * Reference: "AI Infinity" by jonathanalbrecht_trader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Jonny86FXPro
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AiInfinityInputs {
  enableBarColor: boolean;
  /** Candle colour mode: 'Gradient' or 'Simple' */
  colorMode: 'Gradient' | 'Simple';
  bullColorStart: string;
  bullColorMid: string;
  bullColorEnd: string;
  bearColorStart: string;
  bearColorMid: string;
  bearColorEnd: string;
  bullColorSimple: string;
  bearColorSimple: string;
  enableAllLines: boolean;
  enableJaw: boolean;
  enableTeeth: boolean;
  enableLips: boolean;
  jawColor: string;
  teethColor: string;
  lipsColor: string;
  /** RSI length (used by the alert conditions only) */
  rsiLength: number;
  line100LongColor: string;
  line100ShortColor: string;
  line90LongColor: string;
  line90ShortColor: string;
  line50LongColor: string;
  line50ShortColor: string;
  line10LongColor: string;
  line10ShortColor: string;
  line0LongColor: string;
  line0ShortColor: string;
  colorLine60: string;
  transparency60: number;
  colorLine40: string;
  transparency40: number;
  atrLength: number;
  line100ColorDG: string;
  line100ColorMediumDG: string;
  line100ColorWeakDG: string;
  line0ColorDG: string;
  line0ColorMediumDG: string;
  line0ColorWeakDG: string;
  /** 'Dynamic Transparency' or 'Direct Glow' */
  glowMode: 'Dynamic Transparency' | 'Direct Glow';
  enableEma2050: boolean;
  /** '20' or '50' */
  chooseEmaLength: '20' | '50';
  ema2050UpColor: string;
  ema2050DownColor: string;
  enableEma100: boolean;
  ema100UpColor: string;
  ema100DownColor: string;
  enableEma200: boolean;
  ema200UpColor: string;
  ema200DownColor: string;
}

export const defaultInputs: AiInfinityInputs = {
  enableBarColor: true,
  colorMode: 'Gradient',
  bullColorStart: String(color.rgb(60, 240, 80)),
  bullColorMid: String(color.rgb(30, 200, 60)),
  bullColorEnd: String(color.rgb(10, 160, 140)),
  bearColorStart: String(color.rgb(255, 40, 120)),
  bearColorMid: String(color.rgb(255, 20, 140)),
  bearColorEnd: String(color.rgb(255, 0, 160)),
  bullColorSimple: String(color.rgb(60, 240, 80)),
  bearColorSimple: String(color.rgb(255, 0, 160)),
  enableAllLines: false,
  enableJaw: true,
  enableTeeth: true,
  enableLips: true,
  jawColor: '#696969',
  teethColor: '#696969',
  lipsColor: '#696969',
  rsiLength: 14,
  line100LongColor: String(color.rgb(0, 255, 200)),
  line100ShortColor: String(color.rgb(150, 255, 255)),
  line90LongColor: String(color.rgb(0, 200, 150)),
  line90ShortColor: String(color.rgb(100, 200, 255)),
  line50LongColor: '#00ff00',
  line50ShortColor: '#ff0055',
  line10LongColor: String(color.rgb(255, 200, 50)),
  line10ShortColor: String(color.rgb(255, 100, 150)),
  line0LongColor: String(color.rgb(255, 100, 50)),
  line0ShortColor: '#fc18a4',
  colorLine60: color.green,
  transparency60: 50,
  colorLine40: color.red,
  transparency40: 50,
  atrLength: 14,
  line100ColorDG: String(color.rgb(0, 180, 220)),
  line100ColorMediumDG: String(color.rgb(30, 150, 250)),
  line100ColorWeakDG: String(color.rgb(80, 200, 255)),
  line0ColorDG: String(color.rgb(0, 180, 220)),
  line0ColorMediumDG: String(color.rgb(30, 150, 250)),
  line0ColorWeakDG: String(color.rgb(80, 200, 255)),
  glowMode: 'Dynamic Transparency',
  enableEma2050: true,
  chooseEmaLength: '20',
  ema2050UpColor: color.green,
  ema2050DownColor: color.red,
  enableEma100: false,
  ema100UpColor: '#03f90c',
  ema100DownColor: '#ff0000',
  enableEma200: false,
  ema200UpColor: '#03f90c',
  ema200DownColor: '#ff0000',
};

const G_CANDLE = 'Candle Coloring';
const G_ALLIGATOR = 'Alligator Lines';
const G_RSI = 'RSI Settings';
const G_RSI_COLORS = 'RSI Line Colors';
const G_EMA = 'EMA Settings';
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  { id: 'enableBarColor', type: 'bool', title: 'Enable Candle Coloring', defval: true, group: G_CANDLE },
  { id: 'colorMode', type: 'string', title: 'Candle Color Mode', defval: 'Gradient', options: ['Gradient', 'Simple'], group: G_CANDLE },
  { id: 'bullColorStart', type: 'color', title: 'Bullish Start Color', defval: d.bullColorStart, inline: 'Bullish', group: G_CANDLE },
  { id: 'bullColorMid', type: 'color', title: 'Bullish Mid Color', defval: d.bullColorMid, inline: 'Bullish', group: G_CANDLE },
  { id: 'bullColorEnd', type: 'color', title: 'Bullish End Color', defval: d.bullColorEnd, inline: 'Bullish', group: G_CANDLE },
  { id: 'bearColorStart', type: 'color', title: 'Bearish Start Color', defval: d.bearColorStart, inline: 'Bearish', group: G_CANDLE },
  { id: 'bearColorMid', type: 'color', title: 'Bearish Mid Color', defval: d.bearColorMid, inline: 'Bearish', group: G_CANDLE },
  { id: 'bearColorEnd', type: 'color', title: 'Bearish End Color', defval: d.bearColorEnd, inline: 'Bearish', group: G_CANDLE },
  { id: 'bullColorSimple', type: 'color', title: 'Bullish Simple Color', defval: d.bullColorSimple, inline: 'Simple', group: G_CANDLE },
  { id: 'bearColorSimple', type: 'color', title: 'Bearish Simple Color', defval: d.bearColorSimple, inline: 'Simple', group: G_CANDLE },
  { id: 'enableAllLines', type: 'bool', title: 'Enable Alligator Lines', defval: false, group: G_ALLIGATOR },
  { id: 'enableJaw', type: 'bool', title: 'Enable Jaw Line', defval: true, group: G_ALLIGATOR },
  { id: 'enableTeeth', type: 'bool', title: 'Enable Teeth Line', defval: true, group: G_ALLIGATOR },
  { id: 'enableLips', type: 'bool', title: 'Enable Lips Line', defval: true, group: G_ALLIGATOR },
  { id: 'jawColor', type: 'color', title: 'Jaw Line Color', defval: '#696969', group: G_ALLIGATOR },
  { id: 'teethColor', type: 'color', title: 'Teeth Line Color', defval: '#696969', group: G_ALLIGATOR },
  { id: 'lipsColor', type: 'color', title: 'Lips Line Color', defval: '#696969', group: G_ALLIGATOR },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: G_RSI },
  { id: 'line100LongColor', type: 'color', title: 'Line 100 (Long)', defval: d.line100LongColor, group: G_RSI_COLORS },
  { id: 'line100ShortColor', type: 'color', title: 'Line 100 (Short)', defval: d.line100ShortColor, group: G_RSI_COLORS },
  { id: 'line90LongColor', type: 'color', title: 'Line 90 (Long)', defval: d.line90LongColor, group: G_RSI_COLORS },
  { id: 'line90ShortColor', type: 'color', title: 'Line 90 (Short)', defval: d.line90ShortColor, group: G_RSI_COLORS },
  { id: 'line50LongColor', type: 'color', title: 'Line 50 (Long)', defval: '#00ff00', group: G_RSI_COLORS },
  { id: 'line50ShortColor', type: 'color', title: 'Line 50 (Short)', defval: '#ff0055', group: G_RSI_COLORS },
  { id: 'line10LongColor', type: 'color', title: 'Line 10 (Long)', defval: d.line10LongColor, group: G_RSI_COLORS },
  { id: 'line10ShortColor', type: 'color', title: 'Line 10 (Short)', defval: d.line10ShortColor, group: G_RSI_COLORS },
  { id: 'line0LongColor', type: 'color', title: 'Line 0 (Long)', defval: d.line0LongColor, group: G_RSI_COLORS },
  { id: 'line0ShortColor', type: 'color', title: 'Line 0 (Short)', defval: '#fc18a4', group: G_RSI_COLORS },
  { id: 'colorLine60', type: 'color', title: 'RSI 60 Color', defval: color.green, group: G_RSI_COLORS },
  { id: 'transparency60', type: 'int', title: 'RSI 60 Transparency', defval: 50, min: 0, max: 100, group: G_RSI_COLORS },
  { id: 'colorLine40', type: 'color', title: 'RSI 40 Color', defval: color.red, group: G_RSI_COLORS },
  { id: 'transparency40', type: 'int', title: 'RSI 40 Transparency', defval: 50, min: 0, max: 100, group: G_RSI_COLORS },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'line100ColorDG', type: 'color', title: 'Line 100 Color (Direct Glow)', defval: d.line100ColorDG },
  { id: 'line100ColorMediumDG', type: 'color', title: 'Line 100 Medium Color (Direct Glow)', defval: d.line100ColorMediumDG },
  { id: 'line100ColorWeakDG', type: 'color', title: 'Line 100 Weak Color (Direct Glow)', defval: d.line100ColorWeakDG },
  { id: 'line0ColorDG', type: 'color', title: 'Line 0 Color (Direct Glow)', defval: d.line0ColorDG },
  { id: 'line0ColorMediumDG', type: 'color', title: 'Line 0 Medium Color (Direct Glow)', defval: d.line0ColorMediumDG },
  { id: 'line0ColorWeakDG', type: 'color', title: 'Line 0 Weak Color (Direct Glow)', defval: d.line0ColorWeakDG },
  { id: 'glowMode', type: 'string', title: 'Glow Mode', defval: 'Dynamic Transparency', options: ['Dynamic Transparency', 'Direct Glow'] },
  { id: 'enableEma2050', type: 'bool', title: 'Enable 20/50 EMA', defval: true, group: G_EMA },
  { id: 'chooseEmaLength', type: 'string', title: 'Which (20 or 50)?', defval: '20', options: ['20', '50'], group: G_EMA },
  { id: 'ema2050UpColor', type: 'color', title: '20/50 EMA Up Color', defval: color.green, group: G_EMA },
  { id: 'ema2050DownColor', type: 'color', title: '20/50 EMA Down Color', defval: color.red, group: G_EMA },
  { id: 'enableEma100', type: 'bool', title: 'Enable 100 EMA', defval: false, group: G_EMA },
  { id: 'ema100UpColor', type: 'color', title: '100 EMA Up Color', defval: '#03f90c', group: G_EMA },
  { id: 'ema100DownColor', type: 'color', title: '100 EMA Down Color', defval: '#ff0000', group: G_EMA },
  { id: 'enableEma200', type: 'bool', title: 'Enable 200 EMA', defval: false, group: G_EMA },
  { id: 'ema200UpColor', type: 'color', title: '200 EMA Up Color', defval: '#03f90c', group: G_EMA },
  { id: 'ema200DownColor', type: 'color', title: '200 EMA Down Color', defval: '#ff0000', group: G_EMA },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Jaw Line', color: '#696969', lineWidth: 2 },
  { id: 'plot1', title: 'Teeth Line', color: '#696969', lineWidth: 2 },
  { id: 'plot2', title: 'Lips Line', color: '#696969', lineWidth: 2 },
  { id: 'plot3', title: 'RSI 100', color: d.line100LongColor, lineWidth: 2 },
  { id: 'plot4', title: 'RSI 80', color: d.line90LongColor, lineWidth: 2 },
  { id: 'plot5', title: 'RSI 50', color: d.line50LongColor, lineWidth: 2 },
  { id: 'plot6', title: 'RSI 20', color: d.line10LongColor, lineWidth: 2 },
  { id: 'plot7', title: 'RSI 0', color: d.line0LongColor, lineWidth: 2 },
  { id: 'plot8', title: 'RSI 60', color: String(color.new(color.green, 50)), lineWidth: 1 },
  { id: 'plot9', title: 'RSI 40', color: String(color.new(color.red, 50)), lineWidth: 1 },
  { id: 'plot10', title: 'Line 100 Shadow 1', color: 'transparent', lineWidth: 1 },
  { id: 'plot11', title: 'Line 100 Shadow 2', color: 'transparent', lineWidth: 1 },
  { id: 'plot12', title: 'Line 100 Shadow 3', color: 'transparent', lineWidth: 1 },
  { id: 'plot13', title: 'Line 100 Glow', color: d.line100LongColor, lineWidth: 1 },
  { id: 'plot14', title: 'Line 0 Shadow 1', color: 'transparent', lineWidth: 1 },
  { id: 'plot15', title: 'Line 0 Shadow 2', color: 'transparent', lineWidth: 1 },
  { id: 'plot16', title: 'Line 0 Shadow 3', color: 'transparent', lineWidth: 1 },
  { id: 'plot17', title: 'Line 0 Glow', color: d.line0LongColor, lineWidth: 1 },
  { id: 'plot18', title: 'EMA (20 or 50)', color: color.green, lineWidth: 2 },
  { id: 'plot19', title: 'EMA 100', color: '#03f90c', lineWidth: 2 },
  { id: 'plot20', title: 'EMA 200', color: '#03f90c', lineWidth: 2 },
];

export const metadata = {
  title: 'AI Infinity',
  shortTitle: 'AI Infinity',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** Pine math.min: na when an argument is na */
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
/** clamp(value, minValue, maxValue) => value < minValue ? minValue : value > maxValue ? maxValue : value */
const clamp = (v: number, lo: number, hi: number) => (lt(v, lo) ? lo : gt(v, hi) ? hi : v);
/** An na colour (array.get with an na index): color.new(na, t) is black with transparency t */
const NA_COLOR = 'na';

/** The 151-step gradient start -> mid -> end of the Pine colour arrays */
function gradient(start: string, midC: string, end: string): string[] {
  const colorSteps = 150;
  const out: string[] = [];
  const ch = [color.r, color.g, color.b];
  for (let i = 0; i <= colorSteps; i++) {
    const weight = i / colorSteps;
    let rgb: number[];
    if (lt(weight, 0.5)) {
      const subWeight = weight * 2;
      rgb = ch.map((c) => Math.round(c(start) + subWeight * (c(midC) - c(start))));
    } else {
      const subWeight = (weight - 0.5) * 2;
      rgb = ch.map((c) => Math.round(c(midC) + subWeight * (c(end) - c(midC))));
    }
    out.push(String(color.rgb(rgb[0], rgb[1], rgb[2])));
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AiInfinityInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeS = S(bars.map((b) => b.close));
  const highS = S(bars.map((b) => b.high));
  const lowS = S(bars.map((b) => b.low));
  const t = (i: number) => bars[i].time;

  // Section 1: candle colouring
  const [macdS, signalS] = ta.macd(closeS, 12, 26, 9);
  const macdLine = A(macdS);
  const signalLine = A(signalS);
  const k = A(ta.sma(ta.stoch(closeS, highS, lowS, 14), 3));
  const dd = A(ta.sma(S(k), 3));
  const bullGrad = gradient(cfg.bullColorStart, cfg.bullColorMid, cfg.bullColorEnd);
  const bearGrad = gradient(cfg.bearColorStart, cfg.bearColorMid, cfg.bearColorEnd);
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const macdStrength = Math.abs(macdLine[i] - signalLine[i]) / Math.max(Math.abs(signalLine[i]), 1e-10);
    const isMacdPositive = gt(macdLine[i], signalLine[i]);
    const ob = gt(k[i], 80) && gt(dd[i], 80);
    const os = lt(k[i], 20) && lt(dd[i], 20);
    const bodyChange = Math.abs(b.close - b.open) / Math.max(b.high - b.low, 1e-10);
    const baseTransparency2 = 20 - bodyChange * (20 - 5);
    const finalTransparency = Math.min(baseTransparency2 + (ob || os ? 10 : 0), 100);
    // index = math.min(math.floor(macdStrength * 150), 149); array.get(..., na) is na
    const index = Math.min(Math.floor(macdStrength * 150), 150 - 1);
    const smoothBull = isNaN(index) ? NA_COLOR : bullGrad[index];
    const smoothBear = isNaN(index) ? NA_COLOR : bearGrad[index];
    const gradientMode = cfg.colorMode === 'Gradient';
    const bull = gradientMode ? smoothBull : cfg.bullColorSimple;
    const bear = gradientMode ? smoothBear : cfg.bearColorSimple;
    const fixed = gradientMode ? 20 : 15;
    let finalColor: string;
    if (isMacdPositive && !ob) finalColor = String(color.new(bull, finalTransparency));
    else if (isMacdPositive && ob) finalColor = String(color.new(bull, fixed));
    else if (!isMacdPositive && !os) finalColor = String(color.new(bear, finalTransparency));
    else finalColor = String(color.new(bear, fixed));
    if (cfg.enableBarColor) barColors.push({ time: b.time, color: finalColor });
  }

  // Section 2: Alligator lines
  const rawVolatility = A(ta.stdev(closeS, 20));
  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  // smma(src, length): var smmaVal; ta.sma(src, length) with a series length. The call is in the true branch of
  // `has_enough_data ? smma(hl2, len)[8] : na` but Pine runs it on every bar (the Alligator values exist
  // from bar 21, i.e. smma values of bar 13 / 16 / 18): on bars 0..20 its length is the constant 13 / 8 / 5.
  const smma = (base: number, lenOf: (vf: number) => number): number[] => {
    const out: number[] = new Array(n).fill(NaN);
    let smmaVal = NaN;
    for (let i = 0; i < n; i++) {
      const hasEnoughData = i > 20;
      const volatilityFactor = hasEnoughData ? (rawVolatility[i] / bars[i].close) * 100 : 0;
      const length = hasEnoughData ? lenOf(volatilityFactor) : base;
      let sma = NaN;
      if (i - length + 1 >= 0) {
        let sum = 0;
        for (let j = 0; j < length; j++) sum += hl2[i - j];
        sma = sum / length;
      }
      smmaVal = isNaN(smmaVal) ? sma : (smmaVal * (length - 1) + hl2[i]) / length;
      out[i] = smmaVal;
    }
    return out;
  };
  const jawS = smma(13, (vf) => Math.max(Math.round(13 + vf), 1));
  const teethS = smma(8, (vf) => Math.max(Math.round(8 + vf / 2), 1));
  const lipsS = smma(5, (vf) => Math.max(Math.round(5 + vf / 3), 1));
  // jaw = has_enough_data ? smma(...)[8] : na
  const back = (s: number[], i: number, k2: number) => (i > 20 && i - k2 >= 0 ? s[i - k2] : NaN);

  // Section 3: RSI lines on the 100-bar price range
  const highestPrice = A(ta.highest(highS, 100));
  const lowestPrice = A(ta.lowest(lowS, 100));
  const atrValue = A(ta.atr(bars, cfg.atrLength));
  const dt = cfg.glowMode === 'Dynamic Transparency';

  // EMAs (ta.ema only runs when enabled: the enable inputs are constant)
  const emaLen = cfg.chooseEmaLength === '20' ? 20 : 50;
  const nanArr = new Array(n).fill(NaN);
  const ema2050 = cfg.enableEma2050 ? A(ta.ema(closeS, emaLen)) : nanArr;
  const ema100 = cfg.enableEma100 ? A(ta.ema(closeS, 100)) : nanArr;
  const ema200 = cfg.enableEma200 ? A(ta.ema(closeS, 200)) : nanArr;

  type Point = { time: number; value: number; color?: string };
  const plots: Record<string, Point[]> = {};
  for (let p = 0; p <= 20; p++) plots[`plot${p}`] = [];
  const fillCols: string[][] = [[], [], [], [], [], []];
  const line60Color = String(color.new(cfg.colorLine60, cfg.transparency60));
  const line40Color = String(color.new(cfg.colorLine40, cfg.transparency40));

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const close = b.close;
    const hh = highestPrice[i];
    const ll = lowestPrice[i];
    const pos = (pct: number) => ll + (pct / 100.0) * (hh - ll);
    const line100Pos = pos(100.0);
    const line90Pos = pos(90.0);
    const line50Pos = pos(50.0);
    const line10Pos = pos(10.0);
    const line0Pos = pos(0.0);
    const line60Pos = pos(60.0);
    const line40Pos = pos(40.0);
    const isAbove50 = gt(close, line50Pos);
    const line100Color = isAbove50 ? cfg.line100LongColor : cfg.line100ShortColor;
    const line90Color = isAbove50 ? cfg.line90LongColor : cfg.line90ShortColor;
    const line50Color = isAbove50 ? cfg.line50LongColor : cfg.line50ShortColor;
    const line10Color = isAbove50 ? cfg.line10LongColor : cfg.line10ShortColor;
    const line0Color = isAbove50 ? cfg.line0LongColor : cfg.line0ShortColor;
    // getTransparency(linePos): a plain division by the range (x / 0 is +-infinity)
    const getTransparency = (linePos: number) => {
      const dist = Math.abs(close - linePos) / (hh - ll);
      const baseTransparency = min(80, dist * 100);
      return lt(dist, 0.05) ? baseTransparency / 2 : baseTransparency;
    };

    // Alligator
    const has = i > 20;
    const jaw = has ? back(jawS, i, 8) : NaN;
    const teeth = has ? back(teethS, i, 5) : NaN;
    const lips = has ? back(lipsS, i, 3) : NaN;
    plots.plot0.push({ time: t(i), value: cfg.enableAllLines && cfg.enableJaw ? jaw : NaN, color: cfg.jawColor });
    plots.plot1.push({ time: t(i), value: cfg.enableAllLines && cfg.enableTeeth ? teeth : NaN, color: cfg.teethColor });
    plots.plot2.push({ time: t(i), value: cfg.enableAllLines && cfg.enableLips ? lips : NaN, color: cfg.lipsColor });

    plots.plot3.push({ time: t(i), value: line100Pos, color: String(color.new(line100Color, getTransparency(line100Pos))) });
    plots.plot4.push({ time: t(i), value: line90Pos, color: String(color.new(line90Color, getTransparency(line90Pos))) });
    plots.plot5.push({ time: t(i), value: line50Pos, color: String(color.new(line50Color, getTransparency(line50Pos))) });
    plots.plot6.push({ time: t(i), value: line10Pos, color: String(color.new(line10Color, getTransparency(line10Pos))) });
    plots.plot7.push({ time: t(i), value: line0Pos, color: String(color.new(line0Color, getTransparency(line0Pos))) });
    plots.plot8.push({ time: t(i), value: line60Pos, color: line60Color });
    plots.plot9.push({ time: t(i), value: line40Pos, color: line40Color });

    // Glow bands
    const atr = atrValue[i];
    // getDynamicTransparency(line, 75): distance = |close - line| / atr (a plain division)
    const dynTransparency = (line: number) => {
      const distance = Math.abs(close - line) / atr;
      const distanceFact = clamp(1 - distance, 0, 1);
      return clamp(75 + distanceFact * 20, 0, 100);
    };
    const up = dt ? [1.0, 0.8, 0.5] : [0.4, 0.8, 1.0];
    const tr100 = dt ? dynTransparency(line100Pos) : 75;
    const tr0 = dt ? dynTransparency(line0Pos) : 75;
    const c100 = dt ? [line100Color, line100Color, line100Color] : [cfg.line100ColorDG, cfg.line100ColorMediumDG, cfg.line100ColorWeakDG];
    const c0 = dt ? [line0Color, line0Color, line0Color] : [cfg.line0ColorDG, cfg.line0ColorMediumDG, cfg.line0ColorWeakDG];
    for (let j = 0; j < 3; j++) {
      plots[`plot${10 + j}`].push({ time: t(i), value: line100Pos + atr * up[j] });
      plots[`plot${14 + j}`].push({ time: t(i), value: line0Pos - atr * up[j] });
      fillCols[j].push(String(color.new(c100[j], tr100)));
      fillCols[3 + j].push(String(color.new(c0[j], tr0)));
    }
    plots.plot13.push({ time: t(i), value: line100Pos, color: String(color.new(c100[0], tr100)) });
    plots.plot17.push({ time: t(i), value: line0Pos, color: String(color.new(c0[0], tr0)) });

    // EMAs: close > EMA ? up colour : down colour
    plots.plot18.push({ time: t(i), value: ema2050[i], color: gt(close, ema2050[i]) ? cfg.ema2050UpColor : cfg.ema2050DownColor });
    plots.plot19.push({ time: t(i), value: ema100[i], color: gt(close, ema100[i]) ? cfg.ema100UpColor : cfg.ema100DownColor });
    plots.plot20.push({ time: t(i), value: ema200[i], color: gt(close, ema200[i]) ? cfg.ema200UpColor : cfg.ema200DownColor });
  }

  const fills = [
    { plot1: 'plot13', plot2: 'plot10', colors: fillCols[0] },
    { plot1: 'plot10', plot2: 'plot11', colors: fillCols[1] },
    { plot1: 'plot11', plot2: 'plot12', colors: fillCols[2] },
    { plot1: 'plot17', plot2: 'plot14', colors: fillCols[3] },
    { plot1: 'plot14', plot2: 'plot15', colors: fillCols[4] },
    { plot1: 'plot15', plot2: 'plot16', colors: fillCols[5] },
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    barColors,
    // bullishMACDCross / bearishMACDCross = ta.crossover / ta.crossunder(macdLine, signalLine);
    // rsiCrossAbove80 = ta.crossover(rsiValue, 80), rsiCrossBelow20 = ta.crossunder(rsiValue, 20)
    alerts: (() => {
      const rsi = A(ta.rsi(closeS, cfg.rsiLength));
      return alertStates(alertConditions, bars, [
        crossedOver(macdLine, signalLine), crossedUnder(macdLine, signalLine),
        crossedOver(rsi, 80), crossedUnder(rsi, 20),
      ]);
    })(),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish MACD Cross', message: 'MACD line crossed ABOVE the signal line. Possible Bullish momentum.' },
  { id: 'alert1', title: 'Bearish MACD Cross', message: 'MACD line crossed BELOW the signal line. Possible Bearish momentum.' },
  { id: 'alert2', title: 'RSI Cross Above 80', message: 'RSI just crossed ABOVE 80. Potentially overbought zone.' },
  { id: 'alert3', title: 'RSI Cross Below 20', message: 'RSI just crossed BELOW 20. Potentially oversold zone.' },
];

export const AiInfinity = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
