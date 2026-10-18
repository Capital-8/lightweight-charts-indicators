/**
 * EDGE Panel (momentum panel)
 *
 * Chande Momentum Oscillator: 100 * (sum of up moves - sum of down moves) / (sum of all moves) over cmoLen bars
 * (0 when the sum is 0 or na), with a 5-bar EMA signal line, coloured by the overbought / oversold levels and a
 * background in these zones. Divergences at confirmed price pivots (10 bars left and right): a higher pivot high
 * with a lower CMO (or RSI 14) is a bearish divergence, a lower pivot low with a higher CMO (or RSI) a bullish one;
 * dots are drawn at +-97 (CMO) and +-88 (RSI) on the pivot bar. A trend strength line (ADX from Wilder averages of
 * the true range and directional moves) is mapped to 85..100 and coloured amber above the strong-trend level. A
 * volatility line (the share of the last N bars with an ATR below the current ATR) is mapped to -105..-85.
 * Invisible plots at 105 and -105 fix the pane scale.
 * Alerts (alertcondition, `alerts` of the result): the original's 8 conditions (CMO crossing the oversold /
 * overbought levels and its signal, CMO divergences, ADX crossing the strong-trend level).
 *
 * Last bar: the volatility percentile is computed on a closed bar only (0 on an open bar). The port reads the state
 * of the last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as
 * closed.
 *
 * Reference: "EDGE Panel" by blacklab84
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, math, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'CMO Cross OS Up', message: 'EDGE Panel: CMO crossed above oversold — bullish momentum!' },
  { id: 'alert1', title: 'CMO Cross OB Down', message: 'EDGE Panel: CMO crossed below overbought — bearish momentum!' },
  { id: 'alert2', title: 'CMO Bull Cross', message: 'EDGE Panel: CMO bullish signal cross!' },
  { id: 'alert3', title: 'CMO Bear Cross', message: 'EDGE Panel: CMO bearish signal cross!' },
  { id: 'alert4', title: 'CMO Bull Divergence', message: 'EDGE Panel: Bullish divergence on CMO!' },
  { id: 'alert5', title: 'CMO Bear Divergence', message: 'EDGE Panel: Bearish divergence on CMO!' },
  { id: 'alert6', title: 'Trend Starting', message: 'EDGE Panel: Trend strength breaking out — ADX rising!' },
  { id: 'alert7', title: 'Trend Weakening', message: 'EDGE Panel: Trend weakening — ADX falling below threshold!' },
];

export interface Blacklab84PanelInputs {
  /** CMO length */
  cmoLen: number;
  /** Overbought level */
  cmoOB: number;
  /** Oversold level */
  cmoOS: number;
  /** Show the divergence dots */
  showDiv: boolean;
  /** ADX length */
  adxLen: number;
  /** Strong trend level of the ADX */
  adxStrong: number;
  /** Show the trend strength line */
  showADX: boolean;
  /** ATR length */
  p_atrLen: number;
  /** Percentile window of the ATR */
  p_atrPctLen: number;
  /** Show the volatility line */
  showVolLine: boolean;
}

export const defaultInputs: Blacklab84PanelInputs = {
  cmoLen: 14,
  cmoOB: 50,
  cmoOS: -50,
  showDiv: true,
  adxLen: 14,
  adxStrong: 25,
  showADX: true,
  p_atrLen: 14,
  p_atrPctLen: 100,
  showVolLine: true,
};

const G1 = 'Chande Momentum';
const G2 = 'Trend Strength';
const G3 = 'Volatility Line';

export const inputConfig: InputConfig[] = [
  { id: 'cmoLen', type: 'int', title: 'CMO Length', defval: 14, min: 3, group: G1 },
  { id: 'cmoOB', type: 'int', title: 'Overbought', defval: 50, group: G1 },
  { id: 'cmoOS', type: 'int', title: 'Oversold', defval: -50, group: G1 },
  { id: 'showDiv', type: 'bool', title: 'Show Divergence', defval: true, group: G1 },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 14, min: 3, group: G2 },
  { id: 'adxStrong', type: 'int', title: 'Strong Trend >', defval: 25, group: G2 },
  { id: 'showADX', type: 'bool', title: 'Show Trend Strength Bar', defval: true, group: G2 },
  { id: 'p_atrLen', type: 'int', title: 'ATR Length', defval: 14, min: 1, group: G3 },
  { id: 'p_atrPctLen', type: 'int', title: 'Percentile Window', defval: 100, min: 20, group: G3 },
  { id: 'showVolLine', type: 'bool', title: 'Show Volatility Line', defval: true, group: G3 },
];

// Palette
const C_BULL_BRIGHT = String(color.new('#00e5a0', 0));
const C_BULL_FADE = String(color.new('#00e5a0', 80));
const C_BEAR_BRIGHT = String(color.new('#ff4455', 0));
const C_BEAR_FADE = String(color.new('#ff4455', 80));
const C_AMBER = String(color.new('#f0c040', 0));
const C_SLATE_FADE = String(color.new('#7c8db5', 70));
const C_BG_OB = String(color.new('#ff4455', 93));
const C_BG_OS = String(color.new('#00e5a0', 93));
const ANCHOR = String(color.new(color.white, 100));
const GOLD = String(color.new('#ffd600', 0));
const WHITE_DOT = String(color.new('#ffffff', 10));
const VOL_HIGH = String(color.new('#f0c040', 55));
const VOL_LOW = String(color.new('#7c8db5', 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '_top', color: ANCHOR, lineWidth: 1 },
  { id: 'plot1', title: '_bottom', color: ANCHOR, lineWidth: 1 },
  { id: 'plot2', title: 'CMO', color: C_BEAR_FADE, lineWidth: 3 },
  { id: 'plot3', title: 'CMO Sig', color: C_AMBER, lineWidth: 1 },
  { id: 'plot4', title: 'Bear Div (CMO)', color: GOLD, lineWidth: 4, style: 'circles' },
  { id: 'plot5', title: 'Bull Div (CMO)', color: GOLD, lineWidth: 4, style: 'circles' },
  { id: 'plot6', title: 'Bear Div (RSI)', color: WHITE_DOT, lineWidth: 3, style: 'circles' },
  { id: 'plot7', title: 'Bull Div (RSI)', color: WHITE_DOT, lineWidth: 3, style: 'circles' },
  { id: 'plot8', title: 'Trend Strength', color: C_SLATE_FADE, lineWidth: 4 },
  { id: 'plot9', title: 'Volatility State', color: VOL_LOW, lineWidth: 2 },
];

export const metadata = {
  title: 'EDGE Panel',
  shortTitle: 'EDGE Panel',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine x != 0: false when x is na */
const ne0 = (x: number) => !isNaN(x) && Math.abs(x) > EPS;
/** Pine math.max(a, b): na when an argument is na */
const pmax = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<Blacklab84PanelInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const prev = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);

  // ① Chande Momentum Oscillator
  const momUp = close.map((c, i) => pmax(c - prev(close, i), 0));
  const momDn = close.map((c, i) => pmax(prev(close, i) - c, 0));
  const sumUp = math.sum(momUp, cfg.cmoLen) as number[];
  const sumDn = math.sum(momDn, cfg.cmoLen) as number[];
  const cmo = bars.map((_b, i) => (ne0(sumUp[i] + sumDn[i])
    ? (100 * (sumUp[i] - sumDn[i])) / (sumUp[i] + sumDn[i]) : 0));
  const cmoSig = A(ta.ema(S(cmo), 5));
  const cmoColor = (v: number) => (ge(v, cfg.cmoOB) ? C_BEAR_BRIGHT : le(v, cfg.cmoOS) ? C_BULL_BRIGHT
    : gt(v, 0) ? C_BULL_FADE : C_BEAR_FADE);

  // Divergences at confirmed price pivots (CMO and RSI values 10 bars back)
  const pivLen = 10;
  const priceH = A(ta.pivothigh(S(high), pivLen, pivLen));
  const priceL = A(ta.pivotlow(S(low), pivLen, pivLen));
  const rsi14 = A(ta.rsi(S(close), 14));
  const bearDiv: boolean[] = new Array(n).fill(false);
  const bullDiv: boolean[] = new Array(n).fill(false);
  const rsiBearDiv: boolean[] = new Array(n).fill(false);
  const rsiBullDiv: boolean[] = new Array(n).fill(false);
  let pH1 = NaN; let cH1 = NaN; let pH2 = NaN; let cH2 = NaN;
  let pL1 = NaN; let cL1 = NaN; let pL2 = NaN; let cL2 = NaN;
  let rH1 = NaN; let rH2 = NaN; let rL1 = NaN; let rL2 = NaN;
  let rPH1 = NaN; let rPH2 = NaN; let rPL1 = NaN; let rPL2 = NaN;
  for (let i = 0; i < n; i++) {
    const cmoAt = prev(cmo, i, pivLen);
    const rsiAt = prev(rsi14, i, pivLen);
    if (!isNaN(priceH[i])) {
      pH2 = pH1; cH2 = cH1; pH1 = priceH[i]; cH1 = cmoAt;
      if (!isNaN(pH2) && !isNaN(cH2) && gt(pH1, pH2) && lt(cH1, cH2)) bearDiv[i] = true;
    }
    if (!isNaN(priceL[i])) {
      pL2 = pL1; cL2 = cL1; pL1 = priceL[i]; cL1 = cmoAt;
      if (!isNaN(pL2) && !isNaN(cL2) && lt(pL1, pL2) && gt(cL1, cL2)) bullDiv[i] = true;
    }
    if (!isNaN(priceH[i])) {
      rPH2 = rPH1; rH2 = rH1; rPH1 = priceH[i]; rH1 = rsiAt;
      if (!isNaN(rPH2) && !isNaN(rH2) && gt(rPH1, rPH2) && lt(rH1, rH2)) rsiBearDiv[i] = true;
    }
    if (!isNaN(priceL[i])) {
      rPL2 = rPL1; rL2 = rL1; rPL1 = priceL[i]; rL1 = rsiAt;
      if (!isNaN(rPL2) && !isNaN(rL2) && lt(rPL1, rPL2) && gt(rL1, rL2)) rsiBullDiv[i] = true;
    }
  }

  // ② Trend strength (manual ADX)
  const trueRange = bars.map((b, i) => pmax(b.high - b.low,
    pmax(Math.abs(b.high - prev(close, i)), Math.abs(b.low - prev(close, i)))));
  const dmPlus = bars.map((b, i) => {
    const up = b.high - prev(high, i);
    const dn = prev(low, i) - b.low;
    return gt(up, dn) ? pmax(up, 0) : 0;
  });
  const dmMinus = bars.map((b, i) => {
    const up = b.high - prev(high, i);
    const dn = prev(low, i) - b.low;
    return gt(dn, up) ? pmax(dn, 0) : 0;
  });
  const smTR = A(ta.rma(S(trueRange), cfg.adxLen));
  const smDMPlus = A(ta.rma(S(dmPlus), cfg.adxLen));
  const smDMMinus = A(ta.rma(S(dmMinus), cfg.adxLen));
  const dx = bars.map((_b, i) => {
    const diPlus = ne0(smTR[i]) ? (smDMPlus[i] / smTR[i]) * 100 : 0;
    const diMinus = ne0(smTR[i]) ? (smDMMinus[i] / smTR[i]) * 100 : 0;
    return ne0(diPlus + diMinus) ? (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100 : 0;
  });
  const adx = A(ta.rma(S(dx), cfg.adxLen));

  // ③ Volatility state: share of the last p_atrPctLen bars with an ATR below the current ATR
  // (if barstate.isconfirmed; else p_atrPct stays 0.0)
  const atr = A(ta.atr(bars, cfg.p_atrLen));
  const atrPct = bars.map((_b, i) => {
    if (!barIsConfirmed(i)) return 0.0;
    let count = 0;
    for (let k = 1; k <= cfg.p_atrPctLen; k++) {
      if (lt(prev(atr, i, k), atr[i])) count += 1;
    }
    return (count / cfg.p_atrPctLen) * 100;
  });

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const P = (f: (i: number) => Point | null): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const p = f(i);
      if (p) out.push(p);
    }
    return out;
  };
  // plot(..., offset = -c_pivLen): the value of bar i is drawn on bar i - 10
  const divPlot = (flags: boolean[], level: number) => P((i) => (i - pivLen < 0 ? null
    : { time: barTime(bars, i - pivLen, interval), value: cfg.showDiv && flags[i] ? level : NaN }));

  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: 105 })),
    plot1: P((i) => ({ time: t(i), value: -105 })),
    plot2: P((i) => ({ time: t(i), value: cmo[i], color: cmoColor(cmo[i]) })),
    plot3: P((i) => ({ time: t(i), value: cmoSig[i] })),
    plot4: divPlot(bearDiv, 97),
    plot5: divPlot(bullDiv, -97),
    plot6: divPlot(rsiBearDiv, 88),
    plot7: divPlot(rsiBullDiv, -88),
    plot8: P((i) => ({
      time: t(i), value: cfg.showADX ? 85 + (adx[i] / 100) * 15 : NaN,
      color: gt(adx[i], cfg.adxStrong) ? C_AMBER : C_SLATE_FADE,
    })),
    plot9: P((i) => ({
      time: t(i), value: cfg.showVolLine ? -105 + (atrPct[i] / 100) * 20 : NaN,
      color: ge(atrPct[i], 70) ? VOL_HIGH : VOL_LOW,
    })),
  };

  // bgcolor(cmo >= cmoOB ? C_BG_OB : na), then bgcolor(cmo <= cmoOS ? C_BG_OS : na) (the later call on top)
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    if (le(cmo[i], cfg.cmoOS)) bgColors.push({ time: t(i), color: C_BG_OS });
    else if (ge(cmo[i], cfg.cmoOB)) bgColors.push({ time: t(i), color: C_BG_OB });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: cfg.cmoOB, options: { title: 'OB', color: String(color.new('#ff4466', 50)), linestyle: 'dashed' } },
      { value: 0, options: { title: 'Zero', color: String(color.new('#7c8db5', 50)), linestyle: 'dotted' } },
      { value: cfg.cmoOS, options: { title: 'OS', color: String(color.new('#00e5a0', 50)), linestyle: 'dashed' } },
      {
        value: 85 + (cfg.adxStrong / 100) * 15,
        options: { title: 'Trend Threshold', color: String(color.new('#f0c040', 70)), linestyle: 'dotted' },
      },
    ],
    bgColors,
    alerts: alertStates(alertConditions, bars, [
      crossedOver(cmo, cfg.cmoOS),
      crossedUnder(cmo, cfg.cmoOB),
      crossedOver(cmo, cmoSig).map((x, i) => x && lt(cmo[i], 0)),
      crossedUnder(cmo, cmoSig).map((x, i) => x && gt(cmo[i], 0)),
      bullDiv,
      bearDiv,
      crossedOver(adx, cfg.adxStrong),
      crossedUnder(adx, cfg.adxStrong),
    ]),
  };
}

export const Blacklab84Panel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
