/**
 * Ichimoku Theories [LuxAlgo]
 *
 * The Ichimoku lines (Tenkan Sen, Kijun Sen, Chikou Span, Senkou Span A and B with the Kumo between them; each line
 * is the middle of the highest high and lowest low of its length, rounded to the symbol tick) and the three Ichimoku
 * theories, all built on swing highs and lows (a swing is known "Swing Length" bars after its bar):
 * - Wave theory: the last swings are read as waves I (2 swings), V (3), N (4), P (4), Y (4) or W (5). A wave spans at
 *   least 9 bars. Without "Overlapping Waves" a new swing gives at most one wave (N, then W, P, Y, V, I). Waves are
 *   drawn as polylines (P and Y as two lines) with a label at their last swing; the last "Show last X waves" are kept.
 * - Price theory: when the last three swings form the start of an N wave, the targets V, E, N and NT (and 2E, 3E)
 *   are drawn as dotted lines from the last swing to "Chikou & Senkou Offset" bars after the last bar.
 * - Time theory: a time cycle runs from one event to the next (swings, swing highs or lows only, a close crossing the
 *   Tenkan or Kijun Sen, a Kumo colour change, or the waves of one type). The last cycles are drawn as arrows below
 *   the price with their length in bars. Vertical lines forecast the next cycle ends from the end of an earlier
 *   cycle: at the Kihon Suchi numbers (9, 17, 26, ...) or at multiples of the length of that cycle (Taito Suchi).
 *
 * The script works on closed bars: nothing is detected on a last bar that is still open (chart context). The chart
 * foreground colour (lines and texts) and the symbol tick come from the chart context.
 *
 * Reference: "Ichimoku Theories [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, str, math, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData, PolylineData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { type ChartContext, foregroundColorOf, lastBarConfirmedOf, mintickOf } from '../chart-context';

const KIHON = 'KIHON SUCHI';
const TAITO = 'TAITO SUCHI';
const HIGHS = 'HIGHS';
const LOWS = 'LOWS';
const SWINGS = 'SWINGS';
const TENKAN = 'TENKAN CROSS';
const KIJUN = 'KIJUN CROSS';
const KUMO = 'KUMO CHANGE';
const WAVE = 'WAVES';
const WAVE_I = 'WAVE I';
const WAVE_V = 'WAVE V';
const WAVE_N = 'WAVE N';
const WAVE_P = 'WAVE P';
const WAVE_Y = 'WAVE Y';
const WAVE_W = 'WAVE W';
type WaveTag = typeof WAVE_I | typeof WAVE_V | typeof WAVE_N | typeof WAVE_P | typeof WAVE_Y | typeof WAVE_W;

const EN_SPACE = ' ';
const EM_SPACE = ' ';
const FOUR_PER_EM_SPACE = ' ';
const SIX_PER_EM_SPACE = ' ';
const HAIR_SPACE = ' ';

const GREEN = '#089981';
const RED = '#F23645';
const KUMO_GREEN = 'rgba(8, 153, 129, 0.2)';
const KUMO_RED = 'rgba(242, 54, 69, 0.2)';

const ICHIMOKU_GROUP = 'ICHIMOKU KINKŌ HYŌ';
const TIME_GROUP = 'TIME THEORY';
const WAVE_GROUP = 'WAVE THEORY';
const PRICE_GROUP = 'PRICE THEORY';

export interface IchimokuTheoriesInputs {
  showPivotMarks: boolean;
  /** Bars that confirm a swing high or low */
  pivotLength: number;
  showIchimokuLines: boolean;
  showIchimokuKumo: boolean;
  tenkanSenLength: number;
  kinjuSenLength: number;
  senkouSpanBLength: number;
  /** Bars of the Chikou Span (back) and Senkou Span (forward) offsets */
  ichimokuOffset: number;
  showTimeForecast: boolean;
  timePattern: typeof KIHON | typeof TAITO;
  /** The forecast starts at the end of the Xth last time cycle */
  timeForecastAnchor: number;
  timeCycleMode: typeof TENKAN | typeof KIJUN | typeof KUMO | typeof HIGHS | typeof LOWS | typeof SWINGS | typeof WAVE;
  waveCyle: WaveTag;
  showTimeCycles: boolean;
  maximumTimeCycles: number;
  showBasicWaves: boolean;
  showWaveI: boolean;
  waveIColor: string;
  showWaveV: boolean;
  waveVColor: string;
  showWaveN: boolean;
  waveNColor: string;
  showComplexWaves: boolean;
  showWaveP: boolean;
  wavePColor: string;
  showWaveY: boolean;
  waveYColor: string;
  showWaveW: boolean;
  waveWColor: string;
  overlappingWaves: boolean;
  maximumWaves: number;
  showBasicTargets: boolean;
  showTargetV: boolean;
  showTargetE: boolean;
  showTargetN: boolean;
  showTargetNT: boolean;
  showExtendedTargets: boolean;
  showTarget2E: boolean;
  showTarget3E: boolean;
}

export const defaultInputs: IchimokuTheoriesInputs = {
  showPivotMarks: true,
  pivotLength: 10,
  showIchimokuLines: true,
  showIchimokuKumo: true,
  tenkanSenLength: 9,
  kinjuSenLength: 26,
  senkouSpanBLength: 52,
  ichimokuOffset: 26,
  showTimeForecast: true,
  timePattern: KIHON,
  timeForecastAnchor: 1,
  timeCycleMode: SWINGS,
  waveCyle: WAVE_I,
  showTimeCycles: true,
  maximumTimeCycles: 10,
  showBasicWaves: true,
  showWaveI: false,
  waveIColor: '#e91e63',
  showWaveV: false,
  waveVColor: '#FFEB3B',
  showWaveN: true,
  waveNColor: '#5b9cf6',
  showComplexWaves: false,
  showWaveP: true,
  wavePColor: '#00BCD4',
  showWaveY: true,
  waveYColor: '#ff5d00',
  showWaveW: true,
  waveWColor: '#00E676',
  overlappingWaves: false,
  maximumWaves: 10,
  showBasicTargets: true,
  showTargetV: true,
  showTargetE: true,
  showTargetN: true,
  showTargetNT: true,
  showExtendedTargets: false,
  showTarget2E: true,
  showTarget3E: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'showPivotMarks', type: 'bool', title: 'Show Swing Highs & Lows', defval: true, tooltip: 'Enable/Disable points on swing highs and swing lows.' },
  { id: 'pivotLength', type: 'int', title: 'Swing Length', defval: 10, min: 1, tooltip: 'Number of candles to confirm a swing high or swing low. A higher number detects larger swings.' },

  { id: 'showIchimokuLines', type: 'bool', title: 'Show Lines', defval: true, group: ICHIMOKU_GROUP, tooltip: 'Enable/Disable the 5 Ichimoku lines: kijun sen, tenkan sen, senkou span A & B and chikou span.' },
  { id: 'showIchimokuKumo', type: 'bool', title: 'Show Kumo', defval: true, group: ICHIMOKU_GROUP, tooltip: 'Enable/Disable the Kumo (cloud). The Kumo is formed by 2 lines: Senkou Span A and Senkou Span B.' },
  { id: 'tenkanSenLength', type: 'int', title: 'Tenkan Sen Length', defval: 9, group: ICHIMOKU_GROUP, tooltip: 'Number of candles for Tenkan Sen calculation.' },
  { id: 'kinjuSenLength', type: 'int', title: 'Kinjun Sen Length', defval: 26, group: ICHIMOKU_GROUP, tooltip: 'Number of candles for the Kijun Sen calculation.' },
  { id: 'senkouSpanBLength', type: 'int', title: 'Senkou Span B Length', defval: 52, group: ICHIMOKU_GROUP, tooltip: 'Number of candles for Senkou Span B calculation.' },
  { id: 'ichimokuOffset', type: 'int', title: 'Chikou & Senkou Offset', defval: 26, group: ICHIMOKU_GROUP, tooltip: 'Number of candles for Chikou and Senkou Span calculation. Chikou Span is plotted in the past, Senkou Span A & B in the future.' },

  { id: 'showTimeForecast', type: 'bool', title: 'Show Time Cycle Forecast', defval: true, group: TIME_GROUP, tooltip: 'Enable/Disable time cycle forecast vertical lines. Disable for better performance.' },
  { id: 'timePattern', type: 'string', title: 'Forecast Pattern', defval: KIHON, options: [KIHON, TAITO], group: TIME_GROUP, tooltip: 'Choose between two patterns: Kihon Suchi (basic numbers) or Taito Suchi (equal numbers).' },
  { id: 'timeForecastAnchor', type: 'int', title: 'Anchor forecast on last X time cycle', defval: 1, min: 1, group: TIME_GROUP, tooltip: 'Number of time cycles in the past to anchor the time cycle forecast. The larger the number, the deeper in the past the anchor will be.' },
  { id: 'timeCycleMode', type: 'string', title: 'Time Cycle Mode', defval: SWINGS, options: [TENKAN, KIJUN, KUMO, HIGHS, LOWS, SWINGS, WAVE], group: TIME_GROUP, tooltip: 'Choose from 7 time cycle detection modes: Tenkan Sen cross, Kijun Sen cross, Kumo change between bullish & bearish, swing highs only, swing lows only, both swing highs & lows and wave detection.' },
  { id: 'waveCyle', type: 'string', title: 'Wave Cycle', defval: WAVE_I, options: [WAVE_I, WAVE_V, WAVE_N, WAVE_P, WAVE_Y, WAVE_W], group: TIME_GROUP, tooltip: 'Choose which type of wave to detect from 6 different wave types when time cycle mode is set to WAVES.' },
  { id: 'showTimeCycles', type: 'bool', title: 'Show Time Cycles', defval: true, group: TIME_GROUP, tooltip: 'Enable/Disable time cycle horizontal lines. Disable for better performance.' },
  { id: 'maximumTimeCycles', type: 'int', title: 'Show last X time cycles', defval: 10, min: 1, group: TIME_GROUP, tooltip: 'Maximum number of time cycles to display.' },

  { id: 'showBasicWaves', type: 'bool', title: 'Basic Waves:' + EN_SPACE + EM_SPACE, defval: true, group: WAVE_GROUP, inline: 'basic waves' },
  { id: 'showWaveI', type: 'bool', title: 'I', defval: false, group: WAVE_GROUP, inline: 'basic waves' },
  { id: 'waveIColor', type: 'color', title: FOUR_PER_EM_SPACE, defval: '#e91e63', group: WAVE_GROUP, inline: 'basic waves' },
  { id: 'showWaveV', type: 'bool', title: 'V', defval: false, group: WAVE_GROUP, inline: 'basic waves' },
  { id: 'waveVColor', type: 'color', title: '', defval: '#FFEB3B', group: WAVE_GROUP, inline: 'basic waves' },
  { id: 'showWaveN', type: 'bool', title: 'N', defval: true, group: WAVE_GROUP, inline: 'basic waves' },
  { id: 'waveNColor', type: 'color', title: FOUR_PER_EM_SPACE, defval: '#5b9cf6', group: WAVE_GROUP, inline: 'basic waves', tooltip: 'Enable/Disable display of basic waves, all at once or one at a time. Disable for better performance.' },

  { id: 'showComplexWaves', type: 'bool', title: 'Complex Waves:', defval: false, group: WAVE_GROUP, inline: 'complex waves' },
  { id: 'showWaveP', type: 'bool', title: 'P', defval: true, group: WAVE_GROUP, inline: 'complex waves' },
  { id: 'wavePColor', type: 'color', title: '', defval: '#00BCD4', group: WAVE_GROUP, inline: 'complex waves' },
  { id: 'showWaveY', type: 'bool', title: 'Y', defval: true, group: WAVE_GROUP, inline: 'complex waves' },
  { id: 'waveYColor', type: 'color', title: SIX_PER_EM_SPACE, defval: '#ff5d00', group: WAVE_GROUP, inline: 'complex waves' },
  { id: 'showWaveW', type: 'bool', title: 'W', defval: true, group: WAVE_GROUP, inline: 'complex waves' },
  { id: 'waveWColor', type: 'color', title: HAIR_SPACE, defval: '#00E676', group: WAVE_GROUP, inline: 'complex waves', tooltip: 'Enable/Disable complex wave display, all at once or one by one. Disable for better performance.' },

  { id: 'overlappingWaves', type: 'bool', title: 'Overlapping Waves', defval: false, group: WAVE_GROUP, tooltip: 'Enable/Disable display of waves ending on the same swing point.' },
  { id: 'maximumWaves', type: 'int', title: 'Show last X waves', defval: 10, min: 1, group: WAVE_GROUP, tooltip: 'Maximum number of waves to display.' },

  { id: 'showBasicTargets', type: 'bool', title: 'Basic Targets:' + EM_SPACE + EM_SPACE, defval: true, group: PRICE_GROUP, inline: 'basic targets' },
  { id: 'showTargetV', type: 'bool', title: 'V' + EM_SPACE + EN_SPACE, defval: true, group: PRICE_GROUP, inline: 'basic targets' },
  { id: 'showTargetE', type: 'bool', title: 'E' + EM_SPACE, defval: true, group: PRICE_GROUP, inline: 'basic targets' },
  { id: 'showTargetN', type: 'bool', title: 'N' + EM_SPACE, defval: true, group: PRICE_GROUP, inline: 'basic targets' },
  { id: 'showTargetNT', type: 'bool', title: 'NT', defval: true, group: PRICE_GROUP, inline: 'basic targets', tooltip: 'Enable/Disable horizontal price target lines. Disable for better performance.' },

  { id: 'showExtendedTargets', type: 'bool', title: 'Extended Targets:', defval: false, group: PRICE_GROUP, inline: 'extended targets' },
  { id: 'showTarget2E', type: 'bool', title: '2E' + EM_SPACE, defval: true, group: PRICE_GROUP, inline: 'extended targets' },
  { id: 'showTarget3E', type: 'bool', title: '3E', defval: true, group: PRICE_GROUP, inline: 'extended targets', tooltip: 'Enable/Disable extended price target horizontal lines. Disable for better performance.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TenkanSen', color: RED, lineWidth: 1 },
  { id: 'plot1', title: 'KinjuSen', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'ChikouSpan', color: 'rgba(120, 123, 134, 0.5)', lineWidth: 1 },
  { id: 'plot3', title: 'SenkouSpanA', color: KUMO_GREEN, lineWidth: 1 },
  { id: 'plot4', title: 'SenkouSpanB', color: KUMO_GREEN, lineWidth: 1 },
];

export const metadata = {
  title: 'Ichimoku Theories [LuxAlgo]',
  shortTitle: 'LuxAlgo - Ichimoku Theories',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_polylines_count = 100) */
const MAX_LINES = 500;
const MAX_LABELS = 500;
const MAX_POLYLINES = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

const BULLISH_LEG = 1;
const BEARISH_LEG = 0;

interface SwingPoint {
  barTime: number;
  barIndex: number;
  priceLevel: number;
  leg: number;
}
/** chart.point: time, bar index and price */
interface Pt {
  time: number;
  index: number;
  price: number;
}
/** A line; x is a bar index, or a time when `byTime` */
interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  byTime: boolean;
  color: string;
  style: 'solid' | 'dotted' | 'arrow_right';
  width: number;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  byTime: boolean;
  text: string;
  style: LabelData['style'];
  textColor: string;
  deleted: boolean;
}
interface Pl {
  points: Pt[];
  color: string;
  deleted: boolean;
}
interface Wave {
  points: Pt[];
  tag: WaveTag;
  bullish: boolean;
  waveLabel: Lb | null;
  line1: Ln | null;
  line2: Ln | null;
}
interface TimeCycle {
  firstBarTime: number;
  firstBarIndex: number;
  lastBarTime: number;
  lastBarIndex: number;
  cycleLine: Ln | null;
  cycleLabel: Lb | null;
}
interface PriceTarget {
  targetLine: Ln;
  targetLabel: Lb;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IchimokuTheoriesInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'labels' | 'lines' | 'polylines'> & {
  markers: MarkerData[];
  labels: LabelData[];
  lines: LineDrawingData[];
  polylines: PolylineData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const mintick = mintickOf(chart);
  const fgColor = foregroundColorOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const lastBarIndex = n - 1;
  const pivotLength = cfg.pivotLength;
  const offset = cfg.ichimokuOffset;
  const mode = cfg.timeCycleMode;
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const atr200 = A(ta.atr(bars, 200));

  // leg(): 0 after a new swing high `pivotLength` bars back, 1 after a new swing low
  const legHighest = A(ta.highest(highS, pivotLength));
  const legLowest = A(ta.lowest(lowS, pivotLength));
  // average(length): the middle of the range, rounded to the tick
  const average = (length: number) => {
    const hi = A(ta.highest(highS, length));
    const lo = A(ta.lowest(lowS, length));
    return hi.map((h, i) => math.round_to_mintick(0.5 * (h + lo[i]), mintick) as number);
  };
  const tenkanSen = average(cfg.tenkanSenLength);
  const kinjuSen = average(cfg.kinjuSenLength);
  const senkouSpanA = tenkanSen.map((t, i) => 0.5 * (t + kinjuSen[i]));
  const senkouSpanB = average(cfg.senkouSpanBLength);
  const kumoUp = senkouSpanA.map((a, i) => ge(a, senkouSpanB[i]));
  const closeS = new Series(bars, (b) => b.close);
  const tenkanCross = ta.cross(closeS, Series.fromArray(bars, tenkanSen)).toArray();
  const kinjuCross = ta.cross(closeS, Series.fromArray(bars, kinjuSen)).toArray();
  // extremesOnLastXBars(200)
  const high200 = A(ta.highest(highS, 200));
  const low200 = A(ta.lowest(lowS, 200));

  // Drawings alive on the chart in creation order: when a creation brings the count above max + 5, the oldest are
  // deleted until max remain. A deleted object ignores later changes.
  const register = <O extends { deleted: boolean }>(list: O[], max: number, o: O): O => {
    list.push(o);
    if (list.length > max + 5) for (const old of list.splice(0, list.length - max)) old.deleted = true;
    return o;
  };
  const remove = <O extends { deleted: boolean }>(list: O[], o: O | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const polylines: Pl[] = [];
  const newLine = (l: Omit<Ln, 'deleted'>) => register(lines, MAX_LINES, { ...l, deleted: false });
  const newLabel = (l: Omit<Lb, 'deleted'>) => register(labels, MAX_LABELS, { ...l, deleted: false });

  const swingPoints: SwingPoint[] = [];
  const timeCycles: TimeCycle[] = [];
  let timeCyclesForecast: Ln[] = [];
  const waves: Wave[] = [];
  let priceTargets: PriceTarget[] = [];

  const chartPoint = (p: SwingPoint): Pt => ({ time: p.barTime, index: p.barIndex, price: p.priceLevel });
  const newWave = (points: SwingPoint[], tag: WaveTag): Wave => ({
    points: points.map(chartPoint), tag, bullish: points[points.length - 1].leg !== BULLISH_LEG, waveLabel: null, line1: null, line2: null,
  });
  const last = (k: number) => swingPoints[swingPoints.length - k];

  const gatherWaveI = (): Wave | null => {
    if (swingPoints.length < 2) return null;
    const [a, b] = [last(2), last(1)];
    return b.barIndex - a.barIndex >= 9 ? newWave([a, b], WAVE_I) : null;
  };
  const gatherWaveV = (): Wave | null => {
    if (swingPoints.length < 3) return null;
    const [a, b, c] = [last(3), last(2), last(1)];
    const threshold = Math.abs(a.priceLevel - b.priceLevel) * 0.2;
    const isVWave = ge(c.priceLevel, a.priceLevel - threshold) && le(c.priceLevel, a.priceLevel + threshold);
    return isVWave && c.barIndex - a.barIndex >= 9 ? newWave([a, b, c], WAVE_V) : null;
  };
  const gatherWaveN = (): Wave | null => {
    if (swingPoints.length < 4) return null;
    const [a, b, c, d] = [last(4), last(3), last(2), last(1)];
    const [A0, B0, C0, D0] = [a.priceLevel, b.priceLevel, c.priceLevel, d.priceLevel];
    const threshold = Math.abs(A0 - B0) * 0.2;
    const bull = lt(A0, B0) && gt(C0, A0 + threshold) && lt(C0, B0 - threshold) && gt(D0, B0 + threshold);
    const bear = gt(A0, B0) && lt(C0, A0 - threshold) && gt(C0, B0 + threshold) && lt(D0, B0 - threshold);
    return (bull || bear) && d.barIndex - a.barIndex >= 9 ? newWave([a, b, c, d], WAVE_N) : null;
  };
  /** Shared part of the P and Y waves: the two halves have about the same width */
  const goodShape = (a: SwingPoint, b: SwingPoint, c: SwingPoint, d: SwingPoint) => {
    const threshold = 1.25 * Math.min(Math.abs(a.barIndex - c.barIndex), Math.abs(b.barIndex - d.barIndex));
    return le(Math.abs(a.barIndex - b.barIndex), threshold) && le(Math.abs(c.barIndex - d.barIndex), threshold);
  };
  const gatherWaveP = (): Wave | null => {
    if (swingPoints.length < 4) return null;
    const [a, b, c, d] = [last(4), last(3), last(2), last(1)];
    const [A0, B0, C0, D0] = [a.priceLevel, b.priceLevel, c.priceLevel, d.priceLevel];
    const max = Math.max(A0, B0, C0, D0);
    const min = Math.min(A0, B0, C0, D0);
    const bull = eq(max, A0) && eq(min, B0) && gt(C0, D0);
    const bear = eq(min, A0) && eq(max, B0) && lt(C0, D0);
    return (bull || bear) && d.barIndex - a.barIndex >= 9 && goodShape(a, b, c, d) ? newWave([a, b, c, d], WAVE_P) : null;
  };
  const gatherWaveY = (): Wave | null => {
    if (swingPoints.length < 4) return null;
    const [a, b, c, d] = [last(4), last(3), last(2), last(1)];
    const [A0, B0, C0, D0] = [a.priceLevel, b.priceLevel, c.priceLevel, d.priceLevel];
    const max = Math.max(A0, B0, C0, D0);
    const min = Math.min(A0, B0, C0, D0);
    const bull = eq(max, C0) && eq(min, D0) && gt(A0, B0);
    const bear = eq(min, C0) && eq(max, D0) && lt(A0, B0);
    return (bull || bear) && d.barIndex - a.barIndex >= 9 && goodShape(a, b, c, d) ? newWave([a, b, c, d], WAVE_Y) : null;
  };
  const gatherWaveW = (): Wave | null => {
    if (swingPoints.length < 5) return null;
    const [a, b, c, d, e] = [last(5), last(4), last(3), last(2), last(1)];
    const [A0, B0, C0, D0, E0] = [a.priceLevel, b.priceLevel, c.priceLevel, d.priceLevel, e.priceLevel];
    const th = Math.abs(A0 - B0) * 0.2;
    const bull = le(C0, A0 - th) && ge(C0, B0 + th) && ge(E0, A0 - th) && le(E0, A0 + th) && ge(D0, B0 - th) && le(D0, B0 + th);
    const bear = ge(C0, A0 + th) && le(C0, B0 - th) && ge(E0, B0 - th) && le(E0, B0 + th) && ge(D0, A0 - th) && le(D0, A0 + th);
    return (bull || bear) && e.barIndex - a.barIndex >= 9 ? newWave([a, b, c, d, e], WAVE_W) : null;
  };

  const addWave = (w: Wave) => {
    if (waves.length >= cfg.maximumWaves) {
      const old = waves.shift()!;
      remove(labels, old.waveLabel);
      remove(lines, old.line1);
      remove(lines, old.line2);
    }
    waves.push(w);
  };
  const gatherWaves = () => {
    const waveI = cfg.showBasicWaves && cfg.showWaveI ? gatherWaveI() : null;
    const waveV = cfg.showBasicWaves && cfg.showWaveV ? gatherWaveV() : null;
    const waveN = cfg.showBasicWaves && cfg.showWaveN ? gatherWaveN() : null;
    const waveP = cfg.showComplexWaves && cfg.showWaveP ? gatherWaveP() : null;
    const waveY = cfg.showComplexWaves && cfg.showWaveY ? gatherWaveY() : null;
    const waveW = cfg.showComplexWaves && cfg.showWaveW ? gatherWaveW() : null;
    if (cfg.overlappingWaves) {
      for (const w of [waveI, waveV, waveN, waveP, waveY, waveW]) if (w) addWave(w);
    } else {
      const w = waveN ?? waveW ?? waveP ?? waveY ?? waveV ?? waveI;
      if (w) addWave(w);
    }
  };
  const colorSelection = (tag: WaveTag): string => {
    switch (tag) {
      case WAVE_I: return cfg.waveIColor;
      case WAVE_V: return cfg.waveVColor;
      case WAVE_N: return cfg.waveNColor;
      case WAVE_P: return cfg.wavePColor;
      case WAVE_Y: return cfg.waveYColor;
      default: return cfg.waveWColor;
    }
  };
  const plotWaves = () => {
    for (const p of polylines) p.deleted = true;
    polylines.length = 0;
    waves.forEach((w, index) => {
      remove(labels, w.waveLabel);
      const css = colorSelection(w.tag);
      if (w.tag === WAVE_P || w.tag === WAVE_Y) {
        remove(lines, w.line1);
        remove(lines, w.line2);
        const [p0, p1, p2, p3] = w.points;
        w.line1 = newLine({ x1: p0.time, y1: p0.price, x2: p2.time, y2: p2.price, byTime: true, color: css, style: 'solid', width: 2 });
        w.line2 = newLine({ x1: p1.time, y1: p1.price, x2: p3.time, y2: p3.price, byTime: true, color: css, style: 'solid', width: 2 });
      } else {
        register(polylines, MAX_POLYLINES, { points: w.points, color: css, deleted: false });
      }
      const end = w.points[w.points.length - 1];
      const before = index > 0 ? waves[index - 1] : null;
      if (before && end.time === before.points[before.points.length - 1].time) {
        // the wave shares the label of the wave before it
        w.waveLabel = before.waveLabel;
        if (w.waveLabel && !w.waveLabel.deleted) {
          w.waveLabel.text = w.waveLabel.text + '\n' + w.tag;
          w.waveLabel.textColor = css;
        }
      } else {
        w.waveLabel = newLabel({ x: end.time, y: end.price, byTime: true, text: w.tag, style: w.bullish ? 'label_down' : 'label_up', textColor: css });
      }
    });
  };

  const drawPriceTarget = (barIndex: number, priceLevel: number, tag: string) => {
    priceTargets.push({
      targetLine: newLine({ x1: barIndex, y1: priceLevel, x2: lastBarIndex + offset, y2: priceLevel, byTime: false, color: fgColor, style: 'dotted', width: 1 }),
      targetLabel: newLabel({ x: lastBarIndex + offset, y: priceLevel, byTime: false, text: tag + ' (' + str.tostring(priceLevel) + ')', style: 'label_left', textColor: fgColor }),
    });
  };
  const priceTheoryTargets = () => {
    if (swingPoints.length < 3) return;
    const [a, b, c] = [last(3), last(2), last(1)];
    const [A0, B0, C0] = [a.priceLevel, b.priceLevel, c.priceLevel];
    const threshold = Math.abs(A0 - B0) * 0.2;
    const bull = lt(A0, B0) && gt(C0, A0 + threshold) && lt(C0, B0 - threshold);
    const bear = gt(A0, B0) && lt(C0, A0 - threshold) && gt(C0, B0 + threshold);
    if (!(bull || bear) || c.barIndex - a.barIndex < 9) return;
    for (const t of priceTargets) {
      remove(lines, t.targetLine);
      remove(labels, t.targetLabel);
    }
    priceTargets = [];
    let [v, e, nn, nt, e2, e3] = [0, 0, 0, 0, 0, 0];
    if (bull) {
      v = B0 + (B0 - C0);
      e = B0 + (B0 - A0);
      nn = C0 + (B0 - A0);
      nt = C0 + (C0 - A0);
      e2 = B0 + 2 * (B0 - A0);
      e3 = B0 + 3 * (B0 - A0);
    }
    if (bear) {
      v = B0 - (C0 - B0);
      e = B0 - (A0 - B0);
      nn = C0 - (A0 - B0);
      nt = C0 - (A0 - C0);
      e2 = B0 - 2 * (A0 - B0);
      e3 = B0 - 3 * (A0 - B0);
    }
    if (cfg.showBasicTargets && cfg.showTargetV) drawPriceTarget(c.barIndex, v, 'V');
    if (cfg.showBasicTargets && cfg.showTargetE) drawPriceTarget(c.barIndex, e, 'E');
    if (cfg.showBasicTargets && cfg.showTargetN) drawPriceTarget(c.barIndex, nn, 'N');
    if (cfg.showBasicTargets && cfg.showTargetNT) drawPriceTarget(c.barIndex, nt, 'NT');
    if (cfg.showExtendedTargets && cfg.showTarget2E) drawPriceTarget(c.barIndex, e2, '2E');
    if (cfg.showExtendedTargets && cfg.showTarget3E) drawPriceTarget(c.barIndex, e3, '3E');
  };

  const addTimeCycle = (cycle: TimeCycle) => {
    if (timeCycles.length > 0) {
      const c = timeCycles[timeCycles.length - 1];
      c.lastBarIndex = cycle.firstBarIndex;
      c.lastBarTime = cycle.firstBarTime;
    }
    if (timeCycles.length >= cfg.maximumTimeCycles + 1) {
      const c = timeCycles.shift()!;
      remove(lines, c.cycleLine);
      remove(labels, c.cycleLabel);
    }
    timeCycles.push(cycle);
  };
  const parseWavesToTimeCycles = () => {
    for (const c of timeCycles) {
      remove(labels, c.cycleLabel);
      remove(lines, c.cycleLine);
    }
    timeCycles.length = 0;
    for (let index = waves.length - 1; index >= 0; index--) {
      if (timeCycles.length >= cfg.maximumTimeCycles) break;
      const w = waves[index];
      if (w.tag === cfg.waveCyle) {
        const first = w.points[0];
        const end = w.points[w.points.length - 1];
        timeCycles.unshift({ firstBarTime: first.time, firstBarIndex: first.index, lastBarTime: end.time, lastBarIndex: end.index, cycleLine: null, cycleLabel: null });
      }
    }
  };
  const cycleAt = (time: number, index: number): TimeCycle => ({
    firstBarTime: time, firstBarIndex: index, lastBarTime: NaN, lastBarIndex: NaN, cycleLine: null, cycleLabel: null,
  });

  // lowest := ta.lowest(bar_index - first cycle bar) - atr200, inside an `if`: a length per call
  const lowestSite = callsite.lowest();
  let lowest = NaN;

  const plotTimeCycles = (i: number) => {
    if (timeCycles.length <= 1) return;
    let priceLevel = lowest;
    for (let index = 0; index < timeCycles.length; index++) {
      const c = timeCycles[index];
      remove(lines, c.cycleLine);
      remove(labels, c.cycleLabel);
      // bar times are in seconds here (ms in Pine): at least 1 ms
      const tagPosition = Math.max(0.001, 0.5 * (c.lastBarTime - c.firstBarTime));
      if (index === timeCycles.length - 1 && mode !== WAVE) break;
      if (mode === WAVE && index > 0 && c.firstBarIndex < timeCycles[index - 1].lastBarIndex) priceLevel -= atr200[i];
      c.cycleLine = newLine({ x1: c.firstBarTime, y1: priceLevel, x2: c.lastBarTime, y2: priceLevel, byTime: true, color: fgColor, style: 'arrow_right', width: 1 });
      c.cycleLabel = newLabel({
        x: c.firstBarTime + tagPosition, y: priceLevel, byTime: true, text: str.tostring(c.lastBarIndex - c.firstBarIndex), style: 'none', textColor: fgColor,
      });
    }
  };
  const plotTimeCyclesForecast = (extremeHigh: number, extremeLow: number) => {
    const lastArrayIndex = timeCycles.length - (mode === WAVE ? 0 : 1);
    if (lastArrayIndex < cfg.timeForecastAnchor) return;
    const cycle = timeCycles[lastArrayIndex - cfg.timeForecastAnchor];
    const taitoCycle = cycle.lastBarIndex - cycle.firstBarIndex;
    const forecastAnchor = cycle.lastBarIndex;
    const indexes = cfg.timePattern === KIHON
      ? [9, 17, 26, 33, 42, 51, 65, 76, 129, 172, 200, 257]
      : [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => k * taitoCycle);
    for (const l of timeCyclesForecast) remove(lines, l);
    timeCyclesForecast = [];
    const vertical = (x: number, style: Ln['style']) => newLine({ x1: x, y1: extremeHigh, x2: x, y2: extremeLow, byTime: false, color: fgColor, style, width: 1 });
    timeCyclesForecast.push(vertical(forecastAnchor, 'solid'));
    for (const index of indexes) {
      if (forecastAnchor + index > lastBarIndex + 500) break;
      timeCyclesForecast.push(vertical(forecastAnchor + index, 'dotted'));
    }
  };

  const markers: MarkerData[] = [];
  let leg = 0;
  let prevLeg = NaN;
  let prevExtremeHigh = NaN;
  let prevExtremeLow = NaN;
  for (let i = 0; i < n; i++) {
    const back = i >= pivotLength ? bars[i - pivotLength] : null;
    const legHigh = back ? back.high : NaN;
    const legLow = back ? back.low : NaN;
    const legTime = back ? back.time : NaN;
    const legIndex = i - pivotLength;
    if (gt(legHigh, legHighest[i])) leg = BEARISH_LEG;
    else if (lt(legLow, legLowest[i])) leg = BULLISH_LEG;
    const change = leg - prevLeg;
    prevLeg = leg;
    const newPivot = !isNaN(change) && change !== 0;
    const pivotLow = change === 1;
    const pivotHigh = change === -1;

    const kumoChange = i > 0 && kumoUp[i] !== kumoUp[i - 1];
    const extremeHigh = high200[i] + atr200[i];
    const extremeLow = low200[i] - atr200[i];
    const newExtremeHigh = Math.abs(extremeHigh - prevExtremeHigh) > EPS;
    const newExtremeLow = Math.abs(extremeLow - prevExtremeLow) > EPS;
    prevExtremeHigh = extremeHigh;
    prevExtremeLow = extremeLow;

    if (timeCycles.length > 0 && i > 200) lowest = lowestSite(bars[i].low, i - timeCycles[0].firstBarIndex) - atr200[i];

    let newTimeCycle: boolean;
    switch (mode) {
      case HIGHS: newTimeCycle = pivotHigh; break;
      case LOWS: newTimeCycle = pivotLow; break;
      case TENKAN: newTimeCycle = !!tenkanCross[i]; break;
      case KIJUN: newTimeCycle = !!kinjuCross[i]; break;
      case KUMO: newTimeCycle = kumoChange; break;
      default: newTimeCycle = newPivot;
    }

    // barstate.isconfirmed
    if (i < n - 1 || lastConfirmed) {
      if (newPivot) {
        swingPoints.push({ barTime: legTime, barIndex: legIndex, priceLevel: pivotLow ? legLow : legHigh, leg: pivotLow ? BULLISH_LEG : BEARISH_LEG });
        gatherWaves();
        if (cfg.showBasicWaves || cfg.showComplexWaves) plotWaves();
        if (cfg.showBasicTargets || cfg.showExtendedTargets) priceTheoryTargets();
      }
      if (newTimeCycle) {
        // gatherTimeCycles()
        if (mode === WAVE) {
          if (waves.length > 0) parseWavesToTimeCycles();
        } else if (mode === TENKAN || mode === KIJUN || mode === KUMO) {
          addTimeCycle(cycleAt(bars[i].time, i));
        } else {
          addTimeCycle(cycleAt(legTime, legIndex));
        }
        if (cfg.showTimeCycles) plotTimeCycles(i);
        if (cfg.showTimeForecast) plotTimeCyclesForecast(extremeHigh, extremeLow);
      } else if (cfg.showTimeForecast && (newExtremeHigh || newExtremeLow)) {
        // updateTimeCyclesForecast()
        for (const l of timeCyclesForecast) {
          if (l.deleted) continue;
          if (newExtremeHigh) l.y1 = extremeHigh;
          if (newExtremeLow) l.y2 = extremeLow;
        }
      }
    }

    // plotshape(..., offset = -pivotLength)
    if (cfg.showPivotMarks && legIndex >= 0) {
      if (pivotLow) markers.push({ time: T(legIndex), position: 'belowBar', shape: 'circle', color: GREEN });
      if (pivotHigh) markers.push({ time: T(legIndex), position: 'aboveBar', shape: 'circle', color: RED });
    }
  }
  markers.sort((a, b) => a.time - b.time);

  const X = (x: number, byTime: boolean) => (byTime ? x : T(x));
  const drawn = (...v: number[]) => v.every((x) => !isNaN(x));
  const plot = (values: number[], show: boolean) => values.map((v, i) => ({ time: bars[i].time, value: show ? v : NaN }));
  // plot(..., offset = k): the value of bar i is drawn on bar i + k
  const shifted = (values: number[], k: number, show: boolean, colors?: string[]) => {
    const out: Array<{ time: number; value: number; color?: string }> = [];
    for (let j = Math.max(0, k); j < n + Math.max(0, k); j++) {
      const src = j - k;
      const v = src >= 0 && src < n && show ? values[src] : NaN;
      out.push({ time: T(j), value: v, ...(colors && src >= 0 && src < n ? { color: colors[src] } : {}) });
    }
    return out;
  };
  const kumoColors = kumoUp.map((u) => (u ? KUMO_GREEN : KUMO_RED));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: plot(tenkanSen, cfg.showIchimokuLines),
      plot1: plot(kinjuSen, cfg.showIchimokuLines),
      plot2: shifted(bars.map((b) => b.close), -offset, cfg.showIchimokuLines),
      plot3: shifted(senkouSpanA, offset, cfg.showIchimokuKumo, kumoColors),
      plot4: shifted(senkouSpanB, offset, cfg.showIchimokuKumo, kumoColors),
    },
    fills: [{ plot1: 'plot3', plot2: 'plot4', options: { title: 'Kumo' }, colors: kumoColors }],
    markers,
    // an object with an na coordinate is not drawn
    lines: lines.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: X(l.x1, l.byTime), price1: l.y1, time2: X(l.x2, l.byTime), price2: l.y2, color: l.color,
      ...(l.width !== 1 ? { width: l.width } : {}),
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: labels.filter((l) => drawn(l.x, l.y)).map((l) => ({
      time: X(l.x, l.byTime), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style,
    })),
    polylines: polylines.map((p) => ({
      points: p.points.map((q) => ({ time: q.time, price: q.price })), lineColor: p.color, lineWidth: 2,
    })),
  };
}

export const IchimokuTheories = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
