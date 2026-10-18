/**
 * SMC Statistical Liquidity Walls
 *
 * Standard deviation zones around the SMA of the source: basis +- 1, 2 and 3 deviations (the true range replaces
 * a deviation of 0). Each zone is filled with a vertical gradient. The transparency of the zone edges follows an
 * inverted sigmoid of the distance in deviations (0, 1, 2, 3): clear near the basis, more solid at the outer
 * edges. Red zones above the basis (premium), green zones below (discount).
 * Alerts (alertcondition, `alerts` of the result): 'Hit Premium Wall' (high at or above basis + 2 deviations) and
 * 'Hit Discount Wall' (low at or below basis - 2 deviations).
 *
 * Reference: "SMC Statistical Liquidity Walls [PhenLabs]" by PhenLabs
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: This work is licensed under a Attribution-NonCommercial-ShareAlike 4.0 International
 * (CC BY-NC-SA 4.0) https://creativecommons.org/licenses/by-nc-sa/4.0/ © PhenLabs
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SmcStatisticalLiquidityWallsInputs {
  /** Range period (SMA / stdev length) */
  len: number;
  src: SourceType;
  /** Premium (resistance) colour */
  colPrem: string;
  /** Discount (support) colour */
  colDisc: string;
  /** Equilibrium line colour */
  colEq: string;
  /** Transparency at the basis (0 deviation) */
  centerAlpha: number;
  /** Transparency at the outer edge */
  edgeAlpha: number;
  /** Steepness of the sigmoid */
  steepness: number;
  /** Midpoint of the sigmoid (in deviations) */
  midpoint: number;
}

export const defaultInputs: SmcStatisticalLiquidityWallsInputs = {
  len: 20,
  src: 'close',
  colPrem: '#f23645',
  colDisc: '#089981',
  colEq: color.gray,
  centerAlpha: 100.0,
  edgeAlpha: 45.0,
  steepness: 2.5,
  midpoint: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Range Period', defval: 20, group: 'Calculation' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: 'Calculation' },
  { id: 'colPrem', type: 'color', title: 'Premium (Resistance)', defval: '#f23645', group: 'Wall Colors' },
  { id: 'colDisc', type: 'color', title: 'Discount (Support)', defval: '#089981', group: 'Wall Colors' },
  { id: 'colEq', type: 'color', title: 'Equilibrium Line', defval: color.gray, group: 'Wall Colors' },
  { id: 'centerAlpha', type: 'float', title: 'Center Transparency (Clear)', defval: 100.0, min: 0, max: 100, group: 'Wall Density (Opacity)' },
  { id: 'edgeAlpha', type: 'float', title: 'Edge Transparency (Solid)', defval: 45.0, min: 0, max: 100, group: 'Wall Density (Opacity)' },
  { id: 'steepness', type: 'float', title: 'Wall Steepness', defval: 2.5, min: 0.1, max: 10.0, group: 'Density Curve' },
  { id: 'midpoint', type: 'float', title: 'Wall Start Point (SD)', defval: 1.5, min: 0.0, max: 3.0, group: 'Density Curve' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EQ', color: color.gray, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Upper 1 SD', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Upper 2 SD', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Upper 3 SD', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot4', title: 'Lower 1 SD', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Lower 2 SD', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'Lower 3 SD', color: color.blue, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'SMC Statistical Liquidity Walls [PhenLabs]',
  shortTitle: 'Liq Walls - PhenLabs',
  overlay: true,
};

/** Pine float comparisons: a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** get_inverted_sigmoid(x, k, x0, start_a, end_a): transparency for a distance of x deviations */
function invertedSigmoid(x: number, k: number, x0: number, startA: number, endA: number): number {
  const sigmoidRaw = 1.0 / (1.0 + Math.exp(-k * (x - x0)));
  const alpha = startA - (startA - endA) * sigmoidRaw;
  return Math.min(Math.max(alpha, 0), 100);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmcStatisticalLiquidityWallsInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const src = getSourceSeries(bars, cfg.src);
  const basis = A(ta.sma(src, cfg.len));
  const dev = A(ta.stdev(src, cfg.len));
  const tr = A(ta.tr(bars, false));

  const zones: number[][] = [[], [], [], [], [], []];
  for (let i = 0; i < n; i++) {
    // safe_dev = dev == 0 ? ta.tr : dev
    const safeDev = eq(dev[i], 0) ? tr[i] : dev[i];
    zones[0][i] = basis[i] + safeDev;
    zones[1][i] = basis[i] + safeDev * 2;
    zones[2][i] = basis[i] + safeDev * 3;
    zones[3][i] = basis[i] - safeDev;
    zones[4][i] = basis[i] - safeDev * 2;
    zones[5][i] = basis[i] - safeDev * 3;
  }
  const [u1, u2, u3, l1, l2, l3] = zones;

  // Transparency at 0, 1, 2, 3 deviations
  const a = [0, 1, 2, 3].map((x) => invertedSigmoid(x, cfg.steepness, cfg.midpoint, cfg.centerAlpha, cfg.edgeAlpha));
  const cp = a.map((t) => String(color.new(cfg.colPrem, t)));
  const cd = a.map((t) => String(color.new(cfg.colDisc, t)));

  const t = (i: number) => bars[i].time;
  const line = (v: number[], c?: string) => bars.map((_b, i) => ({ time: t(i), value: v[i], ...(c ? { color: c } : {}) }));
  const plots = {
    plot0: line(basis, cfg.colEq),
    plot1: line(u1),
    plot2: line(u2),
    plot3: line(u3),
    plot4: line(l1),
    plot5: line(l2),
    plot6: line(l3),
  };

  // fill(p1, p2, top_color, bottom_color) without top_value / bottom_value: the gradient goes from the upper plot
  // (top_color) to the lower plot (bottom_color); the upper zones are above the basis, the lower zones below it
  const same = (c: string) => new Array<string>(n).fill(c);
  const gradient = (top: number[], bottom: number[], topColor: string, bottomColor: string) => ({
    topValue: top.slice(), bottomValue: bottom.slice(), topColor: same(topColor), bottomColor: same(bottomColor),
  });
  const fills = [
    { plot1: 'plot0', plot2: 'plot1', options: { title: 'Prem Wall 1' }, gradient: gradient(u1, basis, cp[1], cp[0]) },
    { plot1: 'plot1', plot2: 'plot2', options: { title: 'Prem Wall 2' }, gradient: gradient(u2, u1, cp[2], cp[1]) },
    { plot1: 'plot2', plot2: 'plot3', options: { title: 'Prem Wall 3' }, gradient: gradient(u3, u2, cp[3], cp[2]) },
    { plot1: 'plot0', plot2: 'plot4', options: { title: 'Disc Wall 1' }, gradient: gradient(basis, l1, cd[0], cd[1]) },
    { plot1: 'plot4', plot2: 'plot5', options: { title: 'Disc Wall 2' }, gradient: gradient(l1, l2, cd[1], cd[2]) },
    { plot1: 'plot5', plot2: 'plot6', options: { title: 'Disc Wall 3' }, gradient: gradient(l2, l3, cd[2], cd[3]) },
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    // alertcondition(high >= u2, 'Hit Premium Wall') / alertcondition(low <= l2, 'Hit Discount Wall')
    alerts: alertStates(alertConditions, bars, [
      bars.map((b, i) => ge(b.high, u2[i])),
      bars.map((b, i) => le(b.low, l2[i])),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Hit Premium Wall', message: 'Price touched the solid Premium Liquidity Wall' },
  { id: 'alert1', title: 'Hit Discount Wall', message: 'Price touched the solid Discount Liquidity Wall' },
];

export const SmcStatisticalLiquidityWalls = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
