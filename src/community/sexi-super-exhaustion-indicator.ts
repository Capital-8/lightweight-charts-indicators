/**
 * SExI - Super Exhaustion Indicator
 *
 * RSI of the source with Aroon-based exhaustion counts. The upper Aroon is 100 * (offset of the highest high of the
 * last `Aroon Reference` + 1 bars + Aroon Reference) / Aroon Reference. Each new 100 reading (after a reading below
 * 100) adds one to the top count, a 0 reading resets it; each new 0 reading adds one to the bottom count, a 100
 * reading resets it. When the RSI is beyond a trigger line and the matching count has reached the exhaustion value,
 * the background is highlighted. Two thick lines above and below the trigger lines show the counts in colour.
 * Alerts (alertcondition, `alerts` of the result): any exhaustion top or bottom, any top, any bottom, exhaustion top /
 * bottom and extreme exhaustion top / bottom, true on the bars of each trigger.
 *
 * Reference: "SExI - Super Exhaustion Indicator [Da_Prof]" by Da_Prof
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SExISuperExhaustionIndicatorInputs {
  /** RSI source */
  src: SourceType;
  /** RSI length */
  len: number;
  /** Aroon reference length */
  lenAroon: number;
  /** Count of Aroon drives that marks an exhaustion */
  exhaustion: number;
  /** Top trigger line value */
  topTrigger: number;
  /** Extreme top line value */
  topExtremeTrigger: number;
  /** Bottom trigger line value */
  bottomTrigger: number;
  /** Extreme bottom line value */
  bottomExtremeTrigger: number;
}

export const defaultInputs: SExISuperExhaustionIndicatorInputs = {
  src: 'close',
  len: 14,
  lenAroon: 14,
  exhaustion: 5,
  topTrigger: 72,
  topExtremeTrigger: 80,
  bottomTrigger: 32,
  bottomExtremeTrigger: 25,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'len', type: 'int', title: 'RSI Length', defval: 14 },
  { id: 'lenAroon', type: 'int', title: 'Aroon Reference', defval: 14, min: 1 },
  { id: 'exhaustion', type: 'int', title: 'Exhaustion Value', defval: 5, min: 1 },
  { id: 'topTrigger', type: 'int', title: 'Top Trigger Line Value', defval: 72 },
  { id: 'topExtremeTrigger', type: 'int', title: 'Extreme Top Line Value', defval: 80 },
  { id: 'bottomTrigger', type: 'int', title: 'Bottom Trigger Line Value', defval: 32 },
  { id: 'bottomExtremeTrigger', type: 'int', title: 'Extreme Bottom Line Value', defval: 25 },
];

const TOP_TRIGGER_COLOR = 'rgb(110, 77, 255)';
const BOTTOM_TRIGGER_COLOR = 'rgb(76, 109, 255)';
const BOTTOM_EXTREME_COLOR = '#2dff34';
const TOP_EXTREME_COLOR = '#d9c515';
const TRANSPARENT = 'rgba(0, 0, 0, 0)'; // color.rgb(0, 0, 0, 100)

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Top Trigger Line Background', color: color.black, lineWidth: 4 },
  { id: 'plot1', title: 'Top Trigger Line', color: TOP_TRIGGER_COLOR, lineWidth: 2 },
  { id: 'plot2', title: 'Bottom Trigger Line Background', color: color.black, lineWidth: 4 },
  { id: 'plot3', title: 'Bottom Trigger Line', color: BOTTOM_TRIGGER_COLOR, lineWidth: 2 },
  { id: 'plot4', title: 'Extreme Top Line Background', color: color.black, lineWidth: 4 },
  { id: 'plot5', title: 'Extreme Top Line', color: TOP_EXTREME_COLOR, lineWidth: 2 },
  { id: 'plot6', title: 'Extreme Bottom Line Background', color: color.black, lineWidth: 4 },
  { id: 'plot7', title: 'Extreme Bottom Line', color: BOTTOM_EXTREME_COLOR, lineWidth: 2 },
  { id: 'plot8', title: 'Upper Spacer', color: TRANSPARENT, lineWidth: 4 },
  { id: 'plot9', title: 'Lower Spacer', color: TRANSPARENT, lineWidth: 4 },
  { id: 'plot10', title: 'Exhaustion Top Background', color: color.black, lineWidth: 6, style: 'linebr' },
  { id: 'plot11', title: 'Exhaustion Top', color: 'rgb(254, 135, 135)', lineWidth: 4, style: 'linebr' },
  { id: 'plot12', title: 'Exhaustion Bottom Background', color: color.black, lineWidth: 6, style: 'linebr' },
  { id: 'plot13', title: 'Exhaustion Bottom', color: String(color.rgb(177, 255, 149, 10)), lineWidth: 4, style: 'linebr' },
  { id: 'plot14', title: 'RSI Background', color: color.black, lineWidth: 4, style: 'linebr' },
  { id: 'plot15', title: 'RSI', color: '#29dfff', lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'SExI - Super Exhaustion Indicator [Da_Prof]',
  shortTitle: 'SExI [Da_Prof]',
  overlay: false,
};

/** Pine float comparisons: a == b within 1e-10, a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<SExISuperExhaustionIndicatorInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // RSI = ta.rsi(src, len)
  const rsi = A(ta.rsi(getSourceSeries(bars, cfg.src), cfg.len));

  // upperAroon = 100 * (ta.highestbars(high, lenAroon + 1) + lenAroon) / lenAroon
  const hb = A(ta.highestbars(Series.fromArray(bars, bars.map((b) => b.high)), cfg.lenAroon + 1));
  const aroon = hb.map((x) => (100 * (x + cfg.lenAroon)) / cfg.lenAroon);

  // topA / bottomA: re-declared as 0 on every bar, then set from their own history (topA[1] is na on bar 0, so the
  // counts stay na until the first reset to 0)
  const topA: number[] = new Array(n);
  const bottomA: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prevTop = i > 0 ? topA[i - 1] : NaN;
    const prevBottom = i > 0 ? bottomA[i - 1] : NaN;
    const prevAroon = i > 0 ? aroon[i - 1] : NaN;
    topA[i] = eq(aroon[i], 100) && lt(prevAroon, 100) ? prevTop + 1 : eq(aroon[i], 0) ? 0 : prevTop;
    bottomA[i] = eq(aroon[i], 0) && gt(prevAroon, 0) ? prevBottom + 1 : eq(aroon[i], 100) ? 0 : prevBottom;
  }

  const ex = cfg.exhaustion;
  const topColor = (t: number) => (t === ex ? 'rgb(254, 135, 135)' : t === ex + 1 ? 'rgb(255, 92, 92)'
    : t === ex + 2 ? 'rgb(255, 36, 36)' : t >= ex + 3 ? 'rgb(200, 0, 0)'
      : t >= 1 && t < ex ? String(color.rgb(149, 191, 255, 60)) : TRANSPARENT);
  const bottomColor = (t: number) => (t === ex ? String(color.rgb(177, 255, 149, 10))
    : t === ex + 1 ? String(color.rgb(156, 255, 121, 7)) : t === ex + 2 ? 'rgb(85, 235, 69)'
      : t >= ex + 3 ? '#25cb0f' : t >= 1 && t < ex ? String(color.rgb(149, 191, 255, 60)) : TRANSPARENT);

  const plots: Record<string, Point[]> = {};
  const P = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  const t = (i: number) => bars[i].time;
  // plot(not na(RSI) ? level : na, ...)
  const level = (v: number, c: string) => P((i) => ({ time: t(i), value: isNaN(rsi[i]) ? NaN : v, color: c }));
  plots.plot0 = level(cfg.topTrigger, color.black);
  plots.plot1 = level(cfg.topTrigger, TOP_TRIGGER_COLOR);
  plots.plot2 = level(cfg.bottomTrigger, color.black);
  plots.plot3 = level(cfg.bottomTrigger, BOTTOM_TRIGGER_COLOR);
  plots.plot4 = level(cfg.topExtremeTrigger, color.black);
  plots.plot5 = level(cfg.topExtremeTrigger, TOP_EXTREME_COLOR);
  plots.plot6 = level(cfg.bottomExtremeTrigger, color.black);
  plots.plot7 = level(cfg.bottomExtremeTrigger, BOTTOM_EXTREME_COLOR);
  plots.plot8 = level(cfg.topExtremeTrigger + 20, TRANSPARENT);
  plots.plot9 = level(cfg.bottomExtremeTrigger - 20, TRANSPARENT);
  const topLine = cfg.topExtremeTrigger + 10;
  const bottomLine = cfg.bottomExtremeTrigger - 10;
  plots.plot10 = P((i) => ({ time: t(i), value: topLine, color: topA[i] >= 1 ? color.black : TRANSPARENT }));
  plots.plot11 = P((i) => ({ time: t(i), value: topLine, color: topA[i] >= 1 ? topColor(topA[i]) : TRANSPARENT }));
  plots.plot12 = P((i) => ({ time: t(i), value: bottomLine, color: bottomA[i] >= 1 ? color.black : TRANSPARENT }));
  plots.plot13 = P((i) => ({
    time: t(i), value: bottomLine, color: bottomA[i] >= 1 ? bottomColor(bottomA[i]) : TRANSPARENT,
  }));
  plots.plot14 = P((i) => ({ time: t(i), value: rsi[i], color: color.black }));
  plots.plot15 = P((i) => ({ time: t(i), value: rsi[i], color: '#29dfff' }));

  // bgcolor layers, in the Pine order (a later layer is drawn on top)
  const bgColors: BgColorData[] = [];
  const bgAbove = color.maroon;
  const bgBelow = String(color.rgb(45, 255, 52, 60));
  const bgExtremeAbove = '#ffee00d9';
  const bgExtremeBelow = 'rgb(2, 255, 166)';
  const flags: boolean[][] = alertConditions.map(() => []);
  for (let i = 0; i < n; i++) {
    const topOk = topA[i] >= ex;
    const bottomOk = bottomA[i] >= ex;
    const prxTop = ge(rsi[i], cfg.topTrigger) && topOk;
    const prxBottom = le(rsi[i], cfg.bottomTrigger) && bottomOk;
    const prxTopExtreme = ge(rsi[i], cfg.topExtremeTrigger) && topOk;
    const prxBottomExtreme = le(rsi[i], cfg.bottomExtremeTrigger) && bottomOk;
    if (prxTop) bgColors.push({ time: t(i), color: bgAbove });
    if (prxBottom) bgColors.push({ time: t(i), color: bgBelow });
    if (prxTopExtreme) bgColors.push({ time: t(i), color: bgExtremeAbove });
    if (prxBottomExtreme) bgColors.push({ time: t(i), color: bgExtremeBelow });
    // any_top_trigger / any_bottom_trigger: the trigger or the extreme trigger
    const anyTop = prxTop || prxTopExtreme;
    const anyBottom = prxBottom || prxBottomExtreme;
    [anyBottom || anyTop, anyTop, anyBottom, prxTop, prxBottom, prxTopExtreme, prxBottomExtreme]
      .forEach((f, k) => flags[k].push(f));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'SExI - Any Exhaustion Top or Bottom Triggered',
    message: '{{ticker}} {{interval}}: SExI - Any Exhaustion Top or Bottom Triggered',
  },
  { id: 'alert1', title: 'SExI - Any Exhaustion Top Triggered', message: '{{ticker}} {{interval}}: SExI - Any Exhaustion Top Triggered' },
  {
    id: 'alert2', title: 'SExI - Any Exhaustion Bottom Triggered',
    message: '{{ticker}} {{interval}}: SExI - Any Exhaustion Bottom Triggered',
  },
  { id: 'alert3', title: 'SExI - Exhaustion Top', message: 'SExI - Exhaustion Top' },
  { id: 'alert4', title: 'SExI - Exhaustion Bottom', message: 'SExI - Exhaustion Bottom' },
  { id: 'alert5', title: 'SExI - Extreme Exhaustion Top', message: 'SExI - Extreme Exhaustion Top' },
  { id: 'alert6', title: 'SExI - Extreme Exhaustion Bottom', message: 'SExI - Extreme Exhaustion Bottom' },
];

export const SExISuperExhaustionIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
