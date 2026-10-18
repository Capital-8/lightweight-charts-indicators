/**
 * ALMA Bands
 *
 * Two Arnaud Legoux moving averages of the source with their own length, offset and sigma. The fill between them is
 * cyan when ALMA 1 is above ALMA 2, else red.
 *
 * Alerts (alertcondition, `alerts` of the result): ALMA 1 crossing over / under ALMA 2 (whatever the show inputs).
 *
 * Reference: "🌊 ALMA Bands" by B3AR_Trades
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType, type Series } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AlmaBandsInputs {
  /** Window of ALMA 1 */
  almaLength: number;
  /** Offset of ALMA 1 (0 = SMA-like, 1 = EMA-like) */
  almaOffset: number;
  /** Sigma of ALMA 1 */
  almaSigma: number;
  /** Window of ALMA 2 */
  alma2Length: number;
  /** Offset of ALMA 2 */
  alma2Offset: number;
  /** Sigma of ALMA 2 */
  alma2Sigma: number;
  showAlma1: boolean;
  showAlma2: boolean;
  showFill: boolean;
  /** Transparency of the fill */
  almaFillTransparency: number;
  /** Source of both ALMAs */
  almaSource: SourceType;
}

export const defaultInputs: AlmaBandsInputs = {
  almaLength: 20,
  almaOffset: 0.85,
  almaSigma: 6.0,
  alma2Length: 20,
  alma2Offset: 0.77,
  alma2Sigma: 6.0,
  showAlma1: true,
  showAlma2: true,
  showFill: true,
  almaFillTransparency: 80,
  almaSource: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'almaLength', type: 'int', title: 'ALMA 1 Length', defval: 20, min: 1, group: 'ALMA 1 Settings' },
  { id: 'almaOffset', type: 'float', title: 'ALMA 1 Offset', defval: 0.85, min: 0.0, max: 1.0, step: 0.01, group: 'ALMA 1 Settings' },
  { id: 'almaSigma', type: 'float', title: 'ALMA 1 Sigma', defval: 6.0, min: 0.1, step: 0.1, group: 'ALMA 1 Settings' },
  { id: 'alma2Length', type: 'int', title: 'ALMA 2 Length', defval: 20, min: 1, group: 'ALMA 2 Settings' },
  { id: 'alma2Offset', type: 'float', title: 'ALMA 2 Offset', defval: 0.77, min: 0.0, max: 1.0, step: 0.01, group: 'ALMA 2 Settings' },
  { id: 'alma2Sigma', type: 'float', title: 'ALMA 2 Sigma', defval: 6.0, min: 0.1, step: 0.1, group: 'ALMA 2 Settings' },
  { id: 'showAlma1', type: 'bool', title: 'Show ALMA 1', defval: true, group: 'Display Settings' },
  { id: 'showAlma2', type: 'bool', title: 'Show ALMA 2', defval: true, group: 'Display Settings' },
  { id: 'showFill', type: 'bool', title: 'Show Fill Between ALMAs', defval: true, group: 'Display Settings' },
  { id: 'almaFillTransparency', type: 'int', title: 'Fill Transparency', defval: 80, min: 0, max: 100, group: 'Display Settings' },
  { id: 'almaSource', type: 'source', title: 'ALMA Source', defval: 'close', group: 'Source Settings' },
];

const ALMA_COLOR = '#00FFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ALMA 1', color: ALMA_COLOR, lineWidth: 2 },
  { id: 'plot1', title: 'ALMA 2', color: ALMA_COLOR, lineWidth: 2 },
];

export const metadata = {
  title: '🌊 ALMA Bands',
  shortTitle: '🌊 ALMA Bands',
  overlay: true,
};

/** Pine a > b: a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<AlmaBandsInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = getSourceSeries(bars, cfg.almaSource);

  const alma1 = A(ta.alma(src, cfg.almaLength, cfg.almaOffset, cfg.almaSigma));
  const alma2 = A(ta.alma(src, cfg.alma2Length, cfg.alma2Offset, cfg.alma2Sigma));

  // fillColor = alma1 > alma2 ? color.new(#00FFFF, t) : color.new(#FF0000, t); fill(..., showFill ? fillColor : na)
  const up = String(color.new('#00FFFF', cfg.almaFillTransparency));
  const down = String(color.new('#FF0000', cfg.almaFillTransparency));
  const fillColors = bars.map((_b, i) => (cfg.showFill ? (gt(alma1[i], alma2[i]) ? up : down) : 'transparent'));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: cfg.showAlma1 ? alma1[i] : NaN, color: ALMA_COLOR })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.showAlma2 ? alma2[i] : NaN, color: ALMA_COLOR })),
    },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'ALMA Fill' }, colors: fillColors }],
    // bullish_crossover = ta.crossover(alma1, alma2), bearish_crossover = ta.crossunder(alma1, alma2)
    alerts: alertStates(alertConditions, bars, [crossedOver(alma1, alma2), crossedUnder(alma1, alma2)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Crossover', message: 'BULLISH: ALMA 1 crossed above ALMA 2' },
  { id: 'alert1', title: 'Bearish Crossover', message: 'BEARISH: ALMA 1 crossed below ALMA 2' },
];

export const AlmaBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
