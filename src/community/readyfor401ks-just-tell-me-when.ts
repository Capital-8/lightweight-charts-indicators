/**
 * ReadyFor401ks Just Tell Me When!
 *
 * A baseline moving average (JMA by default, or EMA / DEMA / TEMA / HMA / SMA / VAMA / WMA) of the close with a
 * Keltner channel (baseline +- EMA of the true range * multiplier): the baseline, the channel edges, their fill and
 * the bars are aqua above the channel, red below it and gray inside. Three SSL channels (moving averages of the high
 * and of the low) give a trend side each: the continuation SSL is drawn as circles, green / purple when the close is
 * beyond the baseline and the continuation line with the ATR criterion, white otherwise; crosses of the close and of
 * the exit SSL give yellow exit arrows (`arrows` of the result, the original's plotarrow). A cross marks candles whose body is larger than the ATR while the ATR bands
 * contain the baseline. Optional ATR bands (close +- ATR * multiplier).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Long or Sell Short' (the close crosses over the exit SSL) and
 * 'Sell Long or Buy Short' (the exit SSL crosses over the close).
 *
 * Reference: "ReadyFor401ks Just Tell Me When!" by ReadyFor401k
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { ArrowData } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'EMA' | 'DEMA' | 'TEMA' | 'HMA' | 'JMA' | 'SMA' | 'VAMA' | 'WMA';
const MA_TYPES: MaType[] = ['EMA', 'DEMA', 'TEMA', 'HMA', 'JMA', 'SMA', 'VAMA', 'WMA'];

export interface Readyfor401ksJustTellMeWhenInputs {
  showBaseline: boolean;
  showAtr: boolean;
  showColorBar: boolean;
  atrLength: number;
  atrMult: number;
  /** ATR smoothing: 'RMA' | 'SMA' | 'EMA' | 'WMA' */
  smoothing: 'RMA' | 'SMA' | 'EMA' | 'WMA';
  /** Baseline (trend power) moving average type and length */
  maType: MaType;
  length: number;
  /** Continuation SSL moving average type and length */
  ssl2Type: MaType;
  length2: number;
  /** Exit SSL moving average type and length */
  ssl3Type: MaType;
  length3: number;
  /** Source of the Keltner baseline ("Source of Exit Calculation") */
  src: SourceType;
  jurikPhase: number;
  jurikPower: number;
  /** VAMA volatility lookback */
  volatilityLookback: number;
  useTrueRange: boolean;
  /** Keltner channel multiplier */
  multy: number;
  /** ATR continuation criteria */
  atrCrit: number;
}

export const defaultInputs: Readyfor401ksJustTellMeWhenInputs = {
  showBaseline: true,
  showAtr: false,
  showColorBar: true,
  atrLength: 14,
  atrMult: 1,
  smoothing: 'WMA',
  maType: 'JMA',
  length: 30,
  ssl2Type: 'JMA',
  length2: 5,
  ssl3Type: 'JMA',
  length3: 8,
  src: 'close',
  jurikPhase: 20,
  jurikPower: 2,
  volatilityLookback: 6,
  useTrueRange: true,
  multy: 0.2,
  atrCrit: 0.9,
};

export const inputConfig: InputConfig[] = [
  { id: 'showBaseline', type: 'bool', title: 'Show Trend Power?', defval: true },
  { id: 'showAtr', type: 'bool', title: 'Show ATR?', defval: false },
  { id: 'showColorBar', type: 'bool', title: 'Color Bars based off Trend?', defval: true },
  { id: 'atrLength', type: 'int', title: 'ATR Period:', defval: 14 },
  { id: 'atrMult', type: 'float', title: 'ATR Multi:', defval: 1, step: 0.1 },
  { id: 'smoothing', type: 'string', title: 'ATR Smoothing:', defval: 'WMA', options: ['RMA', 'SMA', 'EMA', 'WMA'] },
  { id: 'maType', type: 'string', title: 'Trend Power based off of:', defval: 'JMA', options: MA_TYPES },
  { id: 'length', type: 'int', title: 'Trend Power Period:', defval: 30 },
  { id: 'ssl2Type', type: 'string', title: 'Continuation Type:', defval: 'JMA', options: MA_TYPES },
  { id: 'length2', type: 'int', title: 'Continuation Length:', defval: 5 },
  { id: 'ssl3Type', type: 'string', title: 'Calculate Exit of what MA?:', defval: 'JMA', options: MA_TYPES },
  { id: 'length3', type: 'int', title: 'Calculate Exit off what Period?', defval: 8 },
  { id: 'src', type: 'source', title: 'Source of Exit Calculation:', defval: 'close' },
  { id: 'jurikPhase', type: 'int', title: 'JMA Phase *APPLIES TO JMA ONLY', defval: 20 },
  { id: 'jurikPower', type: 'int', title: 'JMA Power *APPLIES TO JMA ONLY', defval: 2 },
  { id: 'volatilityLookback', type: 'int', title: 'Volatility Lookback Period *APPLIES TO VAMA ONLY', defval: 6 },
  { id: 'useTrueRange', type: 'bool', title: 'Use True Range for Channel?', defval: true },
  { id: 'multy', type: 'float', title: 'Base Channel Multiplier', defval: 0.2, step: 0.05 },
  { id: 'atrCrit', type: 'float', title: 'ATR Continuation Criteria', defval: 0.9, step: 0.1 },
];

const AQUA = String(color.new('#00ffbd', 0));
const RED = String(color.new('#ff0000', 0));
const YELLOW = String(color.new('#ffeb3b', 0));
const ATR_COL = String(color.rgb(0, 255, 0, 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MA Baseline', color: color.gray, lineWidth: 4 },
  { id: 'plot1', title: 'Upper Channel Edge', color: color.gray, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Channel Edge', color: color.gray, lineWidth: 1 },
  { id: 'plot3', title: 'Trend Continuation', color: color.white, lineWidth: 2, style: 'circles' },
  { id: 'plot4', title: 'ATR High Color', color: ATR_COL, lineWidth: 1 },
  { id: 'plot5', title: 'ATR Low Color', color: ATR_COL, lineWidth: 1 },
];

export const metadata = {
  title: 'ReadyFor401ks Just Tell Me When!',
  shortTitle: 'ReadyFor401k JTMW!',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<Readyfor401ksJustTellMeWhenInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; arrows: ArrowData[]; barColors: BarColorData[] }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeArr = bars.map((b) => b.close);
  const highArr = bars.map((b) => b.high);
  const lowArr = bars.map((b) => b.low);

  // atr_slen = ma_function(ta.tr(true), atrlen)
  const trTrue = S(A(ta.tr(bars, true)));
  const atrSlen = A(cfg.smoothing === 'RMA' ? ta.rma(trTrue, cfg.atrLength)
    : cfg.smoothing === 'SMA' ? ta.sma(trTrue, cfg.atrLength)
      : cfg.smoothing === 'EMA' ? ta.ema(trTrue, cfg.atrLength)
        : ta.wma(trTrue, cfg.atrLength));

  // ma(type, src, length): one call site per use (each keeps its own history); the branch is constant
  const ma = (type: MaType, srcArr: number[], length: number): number[] => {
    const src = S(srcArr);
    switch (type) {
      case 'SMA':
        return A(ta.sma(src, length));
      case 'EMA':
        return A(ta.ema(src, length));
      case 'DEMA': {
        const e = A(ta.ema(src, length));
        const ee = A(ta.ema(S(e), length));
        return e.map((v, i) => 2 * v - ee[i]);
      }
      case 'TEMA': {
        // 3 * (e - ta.ema(e, length)) + ta.ema(ta.ema(e, length), length)
        const e = A(ta.ema(src, length));
        const e2 = A(ta.ema(S(e), length));
        const e2b = A(ta.ema(S(e), length));
        const e3 = A(ta.ema(S(e2b), length));
        return e.map((v, i) => 3 * (v - e2[i]) + e3[i]);
      }
      case 'WMA':
        return A(ta.wma(src, length));
      case 'VAMA': {
        const mid = A(ta.ema(src, length));
        const dev = srcArr.map((v, i) => v - mid[i]);
        const volUp = A(ta.highest(S(dev), cfg.volatilityLookback));
        const volDown = A(ta.lowest(S(dev), cfg.volatilityLookback));
        return mid.map((m, i) => m + (volUp[i] + volDown[i]) / 2);
      }
      case 'HMA': {
        // ta.wma(2 * ta.wma(src, length / 2) - ta.wma(src, length), math.round(math.sqrt(length)))
        // length / 2 is fractional for an odd length; the wma length argument keeps its integer part
        const half = A(ta.wma(src, Math.trunc(length / 2)));
        const full = A(ta.wma(src, length));
        return A(ta.wma(S(half.map((h, i) => 2 * h - full[i])), Math.round(Math.sqrt(length))));
      }
      case 'JMA':
      default: {
        const jp = cfg.jurikPhase;
        const phaseRatio = jp < -100 ? 0.5 : jp > 100 ? 2.5 : jp / 100 + 1.5;
        const beta = (0.45 * (length - 1)) / (0.45 * (length - 1) + 2);
        const alpha = Math.pow(beta, cfg.jurikPower);
        const out = new Array<number>(n);
        let e0Prev = NaN;
        let e1Prev = NaN;
        let e2Prev = NaN;
        let jmaPrev = NaN;
        const nz = (v: number) => (isNaN(v) ? 0 : v);
        for (let i = 0; i < n; i++) {
          const s = srcArr[i];
          const e0 = (1 - alpha) * s + alpha * nz(e0Prev);
          const e1 = (s - e0) * (1 - beta) + beta * nz(e1Prev);
          const e2 = (e0 + phaseRatio * e1 - nz(jmaPrev)) * Math.pow(1 - alpha, 2) + Math.pow(alpha, 2) * nz(e2Prev);
          const jma = e2 + nz(jmaPrev);
          e0Prev = e0;
          e1Prev = e1;
          e2Prev = e2;
          jmaPrev = jma;
          out[i] = jma;
        }
        return out;
      }
    }
  };

  // ATR bands
  const upperBand = closeArr.map((c, i) => c + atrSlen[i] * cfg.atrMult);
  const lowerBand = closeArr.map((c, i) => c - atrSlen[i] * cfg.atrMult);

  // Keltner baseline channel
  const BBMC = ma(cfg.maType, closeArr, cfg.length);
  const keltma = ma(cfg.maType, A(getSourceSeries(bars, cfg.src)), cfg.length);
  const rangeVal = cfg.useTrueRange ? A(ta.tr(bars, false)) : bars.map((b) => b.high - b.low);
  const rangema = A(ta.ema(S(rangeVal), cfg.length));
  const upperk = keltma.map((k, i) => k + rangema[i] * cfg.multy);
  const lowerk = keltma.map((k, i) => k - rangema[i] * cfg.multy);

  // SSL channels
  const maHigh = ma(cfg.ssl2Type, highArr, cfg.length2);
  const maLow = ma(cfg.ssl2Type, lowArr, cfg.length2);
  const exitHigh = ma(cfg.ssl3Type, highArr, cfg.length3);
  const exitLow = ma(cfg.ssl3Type, lowArr, cfg.length3);
  const ssl = (hi: number[], lo: number[]): number[] => {
    // var int Hlv = na; Hlv := close > hi ? 1 : close < lo ? -1 : nz(Hlv[1]); Hlv < 0 ? hi : lo
    let hlv = NaN;
    return closeArr.map((c, i) => {
      hlv = gt(c, hi[i]) ? 1 : lt(c, lo[i]) ? -1 : isNaN(hlv) ? 0 : hlv;
      return hlv < 0 ? hi[i] : lo[i];
    });
  };
  // sslDown (SSL1) is computed in the Pine source but not drawn (color_ssl1 is unused)
  const sslDown2 = ssl(maHigh, maLow);
  const sslExit = ssl(exitHigh, exitLow);

  const markers: MarkerData[] = [];
  const arrows: ArrowData[] = [];
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  const barColors: BarColorData[] = [];
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const plot4: typeof plot0 = [];
  const plot5: typeof plot0 = [];
  const fillColors: string[] = new Array(n);
  const num = (v: number) => (Number.isFinite(v) ? v : NaN);
  // ta.crossover / ta.crossover(sslExit, close): exact comparisons with the last bar where both values were not na
  let prevC = NaN;
  let prevX = NaN;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const c = closeArr[i];
    const b = bars[i];

    // plotshape(candlesize_violation, style = shape.cross, location = location.top, white, size.small)
    const atrViolation = gt(Math.abs(c - b.open), atrSlen[i]);
    const inRange = gt(upperBand[i], BBMC[i]) && lt(lowerBand[i], BBMC[i]);
    if (atrViolation && inRange) {
      markers.push({ time: t, position: 'top', shape: 'cross', color: String(color.new(color.white, 0)), size: 'small', id: 'shape0' });
    }

    // plotarrow(codiff, "Exit Arrows"): up arrow for 1, down arrow for -1 (both yellow)
    const x = sslExit[i];
    let crossLong = false;
    let crossShort = false;
    if (!isNaN(c) && !isNaN(x)) {
      if (!isNaN(prevC) && !isNaN(prevX)) {
        crossLong = c > x && prevC <= prevX;
        crossShort = x > c && prevX <= prevC;
      }
      prevC = c;
      prevX = x;
    }
    if (crossLong) arrows.push({ time: t, id: 'arrow0', value: 1, color: YELLOW });
    else if (crossShort) arrows.push({ time: t, id: 'arrow0', value: -1, color: YELLOW });
    longFlags.push(crossLong);
    shortFlags.push(crossShort);

    const colorBar = gt(c, upperk[i]) ? AQUA : lt(c, lowerk[i]) ? RED : color.gray;
    plot0.push({ time: t, value: cfg.showBaseline ? num(BBMC[i]) : NaN, color: colorBar });
    if (cfg.showColorBar) barColors.push({ time: t, color: colorBar });
    plot1.push({ time: t, value: cfg.showBaseline ? num(upperk[i]) : NaN, color: colorBar });
    plot2.push({ time: t, value: cfg.showBaseline ? num(lowerk[i]) : NaN, color: colorBar });
    fillColors[i] = colorBar;

    // ATR continuation
    const s2 = sslDown2[i];
    const buyInatr = lt(c - atrSlen[i] * cfg.atrCrit, s2);
    const sellInatr = gt(c + atrSlen[i] * cfg.atrCrit, s2);
    const sellCont = lt(c, BBMC[i]) && lt(c, s2);
    const buyCont = gt(c, BBMC[i]) && gt(c, s2);
    const atrFill = buyInatr && buyCont ? String(color.rgb(0, 255, 0))
      : sellInatr && sellCont ? String(color.rgb(144, 0, 255)) : color.white;
    plot3.push({ time: t, value: num(s2), color: atrFill });
    plot4.push({ time: t, value: cfg.showAtr ? num(upperBand[i]) : NaN, color: ATR_COL });
    plot5.push({ time: t, value: cfg.showAtr ? num(lowerBand[i]) : NaN, color: ATR_COL });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5 },
    // fill(up_channel, low_channel, color = color_bar)
    fills: [{ plot1: 'plot1', plot2: 'plot2', colors: fillColors }],
    markers,
    arrows,
    barColors,
    // alertcondition(ta.crossover(close, sslExit), ...) / alertcondition(ta.crossover(sslExit, close), ...)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Long or Sell Short', message: 'In Long or Out Short.' },
  { id: 'alert1', title: 'Sell Long or Buy Short', message: 'Out Long or In Short.' },
];

export const Readyfor401ksJustTellMeWhen = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
