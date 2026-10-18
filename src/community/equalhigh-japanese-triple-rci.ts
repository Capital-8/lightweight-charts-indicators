/**
 * Equalhigh JAPANESE TRIPLE RCI
 *
 * Three Rank Correlation Index lines (short, medium, long length): the Spearman rank correlation, in percent, between
 * the time rank (1 = oldest bar of the window) and the price rank (1 = lowest source value; ties get their mean rank)
 * of the last `length` source values. A perfect rise gives +100, a perfect fall -100. Early reversals: the short RCI
 * crosses over -trigger (under +trigger) while the medium RCI rises (falls). Alignment: the three RCIs above (below)
 * zero; a marker on the first bar of a new alignment. Zones beyond the extreme levels are shaded; the background can
 * show the alignment.
 * Alerts (alertcondition, `alerts` of the result): the early bullish / bearish reversals and the new bullish / bearish
 * alignments, true on the bars of these signals (also when their markers are hidden).
 *
 * Last bar: with 'Confirmer uniquement à la clôture' the reversal and alignment signals need a closed bar. The port
 * reads the state of the last bar from the optional third argument (see src/chart-context.ts); without it every bar
 * is taken as closed.
 *
 * Reference: "Equalhigh — RCI japonais triple 9/26/52" by Stevesyl
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Stevesyl
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EqualhighJapaneseTripleRciInputs {
  /** Short RCI length */
  shortLength: number;
  /** Medium RCI length */
  mediumLength: number;
  /** Long RCI length */
  longLength: number;
  source: SourceType;
  /** Extreme level (hlines at +level / -level) */
  extremeLevel: number;
  /** Reversal trigger level */
  reversalLevel: number;
  /** Show the early reversal markers */
  showReversals: boolean;
  /** Show the new alignment markers */
  showAlignments: boolean;
  /** Signals only on closed bars */
  confirmAtClose: boolean;
  /** Shade the zones beyond the extreme levels */
  shadeExtremeZones: boolean;
  /** Background colour by the alignment */
  shadeAlignedRegime: boolean;
}

export const defaultInputs: EqualhighJapaneseTripleRciInputs = {
  shortLength: 9,
  mediumLength: 26,
  longLength: 52,
  source: 'close',
  extremeLevel: 80.0,
  reversalLevel: 80.0,
  showReversals: true,
  showAlignments: true,
  confirmAtClose: true,
  shadeExtremeZones: true,
  shadeAlignedRegime: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'shortLength', type: 'int', title: 'RCI court', defval: 9, min: 2, max: 100 },
  { id: 'mediumLength', type: 'int', title: 'RCI intermédiaire', defval: 26, min: 2, max: 150 },
  { id: 'longLength', type: 'int', title: 'RCI long', defval: 52, min: 2, max: 250 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'extremeLevel', type: 'float', title: 'Niveau extrême', defval: 80.0, min: 50.0, max: 99.0, step: 1.0 },
  { id: 'reversalLevel', type: 'float', title: 'Déclencheur de retournement', defval: 80.0, min: 50.0, max: 99.0, step: 1.0 },
  { id: 'showReversals', type: 'bool', title: 'Afficher les retournements précoces', defval: true },
  { id: 'showAlignments', type: 'bool', title: 'Afficher les alignements 9/26/52', defval: true },
  { id: 'confirmAtClose', type: 'bool', title: 'Confirmer uniquement à la clôture', defval: true },
  { id: 'shadeExtremeZones', type: 'bool', title: 'Colorer les zones extrêmes', defval: true },
  { id: 'shadeAlignedRegime', type: 'bool', title: "Colorer le fond selon l'alignement", defval: false },
];

const SHORT_COL = String(color.rgb(0, 188, 212));
const MEDIUM_COL = String(color.rgb(255, 152, 0));
const LONG_COL = String(color.rgb(156, 39, 176));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RCI 9 — impulsion', color: SHORT_COL, lineWidth: 2 },
  { id: 'plot1', title: 'RCI 26 — swing', color: MEDIUM_COL, lineWidth: 2 },
  { id: 'plot2', title: 'RCI 52 — tendance', color: LONG_COL, lineWidth: 3 },
];

const UPPER_COL = String(color.new(color.red, 25));
const MID_COL = String(color.new(color.gray, 75));
const ZERO_COL = String(color.new(color.gray, 35));
const LOWER_COL = String(color.new(color.lime, 25));
const HIDDEN_COL = String(color.new(color.white, 100));
const ZONE_HIGH_COL = String(color.new(color.red, 91));
const ZONE_LOW_COL = String(color.new(color.lime, 91));

/** hline(...) with the default levels */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 80, title: '+80 — excès haussier', color: UPPER_COL, linestyle: 'dashed' },
  { id: 'hline_upper_mid', price: 50, title: '+50', color: MID_COL, linestyle: 'dotted' },
  { id: 'hline_zero', price: 0, title: 'Équilibre', color: ZERO_COL, linestyle: 'dashed' },
  { id: 'hline_lower_mid', price: -50, title: '-50', color: MID_COL, linestyle: 'dotted' },
  { id: 'hline_lower', price: -80, title: '-80 — excès baissier', color: LOWER_COL, linestyle: 'dashed' },
  { id: 'hline_top', price: 100, title: 'Maximum', color: HIDDEN_COL, linestyle: 'dashed', display: 'none' },
  { id: 'hline_bottom', price: -100, title: 'Minimum', color: HIDDEN_COL, linestyle: 'dashed', display: 'none' },
];

/** fill(invisibleTop, upperExtreme) / fill(lowerExtreme, invisibleBottom) with shadeExtremeZones on */
export const fillConfig: FillConfig[] = [
  { id: 'fill_high', plot1: 'hline_top', plot2: 'hline_upper', color: ZONE_HIGH_COL, title: 'Zone haute' },
  { id: 'fill_low', plot1: 'hline_lower', plot2: 'hline_bottom', color: ZONE_LOW_COL, title: 'Zone basse' },
];

export const metadata = {
  title: 'Equalhigh — RCI japonais triple 9/26/52',
  shortTitle: 'RCI Japonais 9/26/52',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(Math.abs(a - b) > EPS);

/** Pine default plotshape text colour */
const PINE_TEXT = '#2962FF';

/** f_rci(src, length): na until src[length - 1] exists and is not na */
function rci(src: number[], length: number): number[] {
  const n = src.length;
  const out: number[] = new Array(n).fill(NaN);
  const meanRank = (length + 1.0) / 2.0;
  for (let b = 0; b < n; b++) {
    if (b - (length - 1) < 0 || isNaN(src[b - (length - 1)])) continue;
    const at = (k: number) => src[b - k];
    let covariance = 0.0;
    let timeVariance = 0.0;
    let priceVariance = 0.0;
    for (let i = 0; i <= length - 1; i++) {
      let priceRank = 1.0;
      let tiedPrices = 0.0;
      for (let j = 0; j <= length - 1; j++) {
        if (lt(at(j), at(i))) priceRank += 1.0;
        else if (eq(at(j), at(i)) && j !== i) tiedPrices += 1.0;
      }
      priceRank += tiedPrices / 2.0;
      const timeRank = length - i;
      const timeDeviation = timeRank - meanRank;
      const priceDeviation = priceRank - meanRank;
      covariance += timeDeviation * priceDeviation;
      timeVariance += timeDeviation * timeDeviation;
      priceVariance += priceDeviation * priceDeviation;
    }
    const denominator = Math.sqrt(timeVariance * priceVariance);
    out[b] = gt(denominator, 0.0) ? (100.0 * covariance) / denominator : 0.0;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<EqualhighJapaneseTripleRciInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = A(getSourceSeries(bars, cfg.source));

  const rciShort = rci(src, cfg.shortLength);
  const rciMedium = rci(src, cfg.mediumLength);
  const rciLong = rci(src, cfg.longLength);

  // barConfirmed = not confirmAtClose or barstate.isconfirmed. ta.crossover / ta.crossunder are right of the lazy
  // `and`: they do not run on an open last bar, which is the last bar, so the other bars do not change
  const crossUp = A(ta.crossover(Series.fromArray(bars, rciShort), -cfg.reversalLevel));
  const crossDn = A(ta.crossunder(Series.fromArray(bars, rciShort), cfg.reversalLevel));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  let prevBull = false;
  let prevBear = false;
  const flags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const medPrev = i > 0 ? rciMedium[i - 1] : NaN;
    const barConfirmed = !cfg.confirmAtClose || barIsConfirmed(i);
    const earlyBull = barConfirmed && crossUp[i] === 1 && gt(rciMedium[i], medPrev);
    const earlyBear = barConfirmed && crossDn[i] === 1 && lt(rciMedium[i], medPrev);
    const bull = gt(rciShort[i], 0.0) && gt(rciMedium[i], 0.0) && gt(rciLong[i], 0.0);
    const bear = lt(rciShort[i], 0.0) && lt(rciMedium[i], 0.0) && lt(rciLong[i], 0.0);
    const newBull = barConfirmed && bull && !prevBull;
    const newBear = barConfirmed && bear && !prevBear;
    prevBull = bull;
    prevBear = bear;
    flags[0].push(earlyBull);
    flags[1].push(earlyBear);
    flags[2].push(newBull);
    flags[3].push(newBear);

    if (cfg.showReversals && earlyBull) {
      markers.push({ time: t, position: 'bottom', shape: 'triangleUp', color: color.lime, text: 'R+', textColor: PINE_TEXT, size: 'tiny' });
    }
    if (cfg.showReversals && earlyBear) {
      markers.push({ time: t, position: 'top', shape: 'triangleDown', color: color.red, text: 'R−', textColor: PINE_TEXT, size: 'tiny' });
    }
    if (cfg.showAlignments && newBull) {
      markers.push({ time: t, position: 'bottom', shape: 'circle', color: color.green, text: 'A+', textColor: PINE_TEXT, size: 'tiny' });
    }
    if (cfg.showAlignments && newBear) {
      markers.push({ time: t, position: 'top', shape: 'circle', color: color.maroon, text: 'A−', textColor: PINE_TEXT, size: 'tiny' });
    }
    // bgcolor(shadeAlignedRegime ? regimeColor : na, title = "Régime RCI")
    if (cfg.shadeAlignedRegime && (bull || bear)) {
      bgColors.push({ time: t, color: String(color.new(bull ? color.green : color.red, 91)) });
    }
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const zone = (c: string) => new Array<string>(n).fill(cfg.shadeExtremeZones ? c : 'transparent');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 1 },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(rciShort[i]), color: SHORT_COL })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(rciMedium[i]), color: MEDIUM_COL })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(rciLong[i]), color: LONG_COL })),
    },
    hlines: [
      { value: cfg.extremeLevel, options: { title: '+80 — excès haussier', color: UPPER_COL, linestyle: 'dashed' } },
      { value: 50.0, options: { title: '+50', color: MID_COL, linestyle: 'dotted' } },
      { value: 0.0, options: { title: 'Équilibre', color: ZERO_COL, linestyle: 'dashed' } },
      { value: -50.0, options: { title: '-50', color: MID_COL, linestyle: 'dotted' } },
      { value: -cfg.extremeLevel, options: { title: '-80 — excès baissier', color: LOWER_COL, linestyle: 'dashed' } },
      { value: 100.0, options: { title: 'Maximum', color: HIDDEN_COL, linestyle: 'dashed' } },
      { value: -100.0, options: { title: 'Minimum', color: HIDDEN_COL, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_top', plot2: 'hline_upper', options: { title: 'Zone haute' }, colors: zone(ZONE_HIGH_COL) },
      { plot1: 'hline_lower', plot2: 'hline_bottom', options: { title: 'Zone basse' }, colors: zone(ZONE_LOW_COL) },
    ],
    markers,
    bgColors,
    // alertcondition(earlyBullishReversal / earlyBearishReversal / newBullishAlignment / newBearishAlignment)
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RCI — retournement haussier précoce', message: 'RCI 9 quitte la zone basse et RCI 26 remonte sur {{ticker}} ({{interval}}).' },
  { id: 'alert1', title: 'RCI — retournement baissier précoce', message: 'RCI 9 quitte la zone haute et RCI 26 baisse sur {{ticker}} ({{interval}}).' },
  { id: 'alert2', title: 'RCI — nouvel alignement haussier', message: 'Les RCI 9/26/52 passent en alignement haussier sur {{ticker}} ({{interval}}).' },
  { id: 'alert3', title: 'RCI — nouvel alignement baissier', message: 'Les RCI 9/26/52 passent en alignement baissier sur {{ticker}} ({{interval}}).' },
];

export const EqualhighJapaneseTripleRci = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
