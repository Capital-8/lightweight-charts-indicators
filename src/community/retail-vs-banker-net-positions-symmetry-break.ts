/**
 * Retail vs Banker Net Positions - Symmetry Break (Institution Focus)
 *
 * Volume proxies of institutional and retail positions. The z-score of the true range over `rngLen` bars splits the
 * bars into big (z >= big level) and small (z <= small level) bars. Institutional volume: big bars that move with
 * the trend (close above the EMA and an up bar, or below it and a down bar). Retail volume: small bars or bars
 * against the trend. Each line is 100 * (up volume - down volume) / total volume over `lenNet` bars, smoothed by
 * an EMA. A symmetry break is a bar where the institutional line change is an outlier (z-score of the change over
 * `lenSpike` bars), larger than the retail z-score by a gap, larger than a minimum, while the retail line is quiet
 * or moves the other way; a cooldown separates two breaks. Markers: retail zero crosses, institutional extremes
 * (confirmed pivots of the line, or a new high / low of a window) and the breaks; optional background shading.
 * Alerts (alertcondition, `alerts` of the result): the six conditions of the original, retail flips up / down / either
 * direction, institutional extreme high / low, symmetry break.
 *
 * Reference: "Retail vs Banker Net Positions – Symmetry Break" by JasonHyde
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RetailVsBankerNetPositionsSymmetryBreakInputs {
  /** Trend EMA length */
  lenTrend: number;
  /** Net position lookback (bars) */
  lenNet: number;
  /** Range z-score lookback */
  rngLen: number;
  /** Big-bar z-score level (institutional) */
  zBigBar: number;
  /** Small-bar z-score level (retail) */
  zSmallBar: number;
  /** Use the input z-score levels (else 0.5 / -0.5) */
  useZAdapt: boolean;
  /** EMA smoothing length of the two lines */
  smooth: number;
  /** Level of the +- threshold lines */
  thrShow: number;
  /** Lookback of the z-score of the line changes */
  lenSpike: number;
  /** Minimum |z| of the institutional change */
  zInstCut: number;
  /** Minimum gap |zInst| - |zRet| */
  zGapCut: number;
  /** Retail quiet: |retail change| <= k * stdev of the retail change */
  retQuietK: number;
  /** Minimum |institutional change| */
  minInstROC: number;
  /** Cooldown bars between two symmetry breaks */
  coolOff: number;
  /** Shade the background on a symmetry break */
  shadeBG: boolean;
  /** Show the symmetry break markers */
  showMarks: boolean;
  /** Show the retail zero-cross markers */
  showRetFlips: boolean;
  /** Pivot left / right bars (window size without pivots) */
  extLen: number;
  /** Extremes from confirmed pivots (else a new high / low of the window) */
  usePivots: boolean;
  /** Minimum bars between two extremes of the same side */
  dedupeBars: number;
  /** Shade the background on an extreme */
  showExtBG: boolean;
  /** An extreme must be on a symmetry break bar */
  requireSym: boolean;
}

export const defaultInputs: RetailVsBankerNetPositionsSymmetryBreakInputs = {
  lenTrend: 50,
  lenNet: 200,
  rngLen: 50,
  zBigBar: 0.5,
  zSmallBar: -0.5,
  useZAdapt: true,
  smooth: 5,
  thrShow: 50,
  lenSpike: 80,
  zInstCut: 3.0,
  zGapCut: 1.0,
  retQuietK: 0.8,
  minInstROC: 3.0,
  coolOff: 40,
  shadeBG: true,
  showMarks: true,
  showRetFlips: true,
  extLen: 8,
  usePivots: true,
  dedupeBars: 6,
  showExtBG: false,
  requireSym: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'lenTrend', type: 'int', title: 'Trend EMA', defval: 50, min: 5 },
  { id: 'lenNet', type: 'int', title: 'Net Position Lookback (bars)', defval: 200, min: 20 },
  { id: 'rngLen', type: 'int', title: 'Range Z-Score Lookback', defval: 50, min: 20 },
  { id: 'zBigBar', type: 'float', title: 'Big-Bar z >= (Institutional)', defval: 0.5, step: 0.1 },
  { id: 'zSmallBar', type: 'float', title: 'Small-Bar z <= (Retail)', defval: -0.5, step: 0.1 },
  { id: 'useZAdapt', type: 'bool', title: 'Use adaptive (z-score) bar-size split', defval: true },
  { id: 'smooth', type: 'int', title: 'Smoothing (EMA)', defval: 5, min: 1 },
  { id: 'thrShow', type: 'float', title: 'Show ±Threshold Lines', defval: 50, min: 0, max: 100 },
  { id: 'lenSpike', type: 'int', title: 'Inst ROC z-score lookback', defval: 80, min: 30 },
  { id: 'zInstCut', type: 'float', title: 'Min |z(Inst ROC)| to trigger', defval: 3.0, step: 0.1 },
  { id: 'zGapCut', type: 'float', title: 'Min z-gap: |zInst|-|zRet|', defval: 1.0, step: 0.1 },
  { id: 'retQuietK', type: 'float', title: 'Retail quiet ≤ k·stdev(ROC_ret)', defval: 0.8, step: 0.1 },
  { id: 'minInstROC', type: 'float', title: 'Min |Inst ROC| (absolute)', defval: 3.0, step: 0.5 },
  { id: 'coolOff', type: 'int', title: 'Cooldown bars between signals', defval: 40, min: 0 },
  { id: 'shadeBG', type: 'bool', title: 'Shade background on symmetry break', defval: true },
  { id: 'showMarks', type: 'bool', title: 'Show pink circle markers', defval: true },
  { id: 'showRetFlips', type: 'bool', title: 'Show Retail color-flip symbols on line', defval: true },
  { id: 'extLen', type: 'int', title: 'Extreme: pivot left/right bars (also window size if not using pivots)', defval: 8, min: 2 },
  { id: 'usePivots', type: 'bool', title: 'Extreme mode: confirmed swing pivots (non-repaint)', defval: true },
  { id: 'dedupeBars', type: 'int', title: 'Extreme: min bars between same-side marks', defval: 6, min: 0 },
  { id: 'showExtBG', type: 'bool', title: 'Extreme: shade background when marked', defval: false },
  { id: 'requireSym', type: 'bool', title: 'Extreme must coincide with a Symmetry Break', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Institutional (proxy)', color: color.aqua, lineWidth: 2 },
  { id: 'plot1', title: 'Retail (proxy)', color: color.lime, lineWidth: 2 },
];

const ZERO_COLOR = String(color.new(color.gray, 70));
const THR_COLOR = String(color.new(color.gray, 80));
const THR_FILL = String(color.new(color.gray, 92));

/** hline(0 / +thrShow / -thrShow) with the default level (the result `hlines` carry the input level) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero', color: ZERO_COLOR, linestyle: 'dashed' },
  { id: 'hline_plus', price: 50, title: ' +Thr', color: THR_COLOR, linestyle: 'dashed' },
  { id: 'hline_minus', price: -50, title: ' -Thr', color: THR_COLOR, linestyle: 'dashed' },
];

/** fill(hp, hm, color = color.new(color.gray, 92)) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_thr', plot1: 'hline_plus', plot2: 'hline_minus', color: THR_FILL },
];

export const metadata = {
  title: 'Retail vs Banker Net Positions – Symmetry Break (Institution Focus)',
  shortTitle: 'Retail vs Banker Net Positions – Symmetry Break (Institution Focus)',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RetailVsBankerNetPositionsSymmetryBreakInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // rng = ta.tr(true): high - low when close[1] is na
  const rng = bars.map((b, i) => (i === 0
    ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const rngMu = A(ta.sma(S(rng), cfg.rngLen));
  const rngSd = A(ta.stdev(S(rng), cfg.rngLen));
  const ema = A(ta.ema(S(bars.map((b) => b.close)), cfg.lenTrend));

  const instUp: number[] = new Array(n);
  const instDn: number[] = new Array(n);
  const retUp: number[] = new Array(n);
  const retDn: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const { open, close } = bars[i];
    const volume = bars[i].volume ?? NaN;
    const zRng = eq(rngSd[i], 0) ? 0 : (rng[i] - rngMu[i]) / rngSd[i];
    const upBar = gt(close, open);
    const dnBar = lt(close, open);
    const withTrend = (ge(close, ema[i]) && upBar) || (lt(close, ema[i]) && dnBar);
    const against = (ge(close, ema[i]) && dnBar) || (lt(close, ema[i]) && upBar);
    const isBig = cfg.useZAdapt ? ge(zRng, cfg.zBigBar) : ge(zRng, 0.5);
    const isSmall = cfg.useZAdapt ? le(zRng, cfg.zSmallBar) : le(zRng, -0.5);
    instUp[i] = withTrend && isBig && upBar ? volume : 0;
    instDn[i] = withTrend && isBig && dnBar ? volume : 0;
    retUp[i] = (against || isSmall) && upBar ? volume : 0;
    retDn[i] = (against || isSmall) && dnBar ? volume : 0;
  }
  // rollSum(x, n) = ta.sma(x, n) * n
  const rollSum = (x: number[]) => A(ta.sma(S(x), cfg.lenNet)).map((v) => v * cfg.lenNet);
  const sumInstUp = rollSum(instUp);
  const sumInstDn = rollSum(instDn);
  const sumRetUp = rollSum(retUp);
  const sumRetDn = rollSum(retDn);
  const net = (up: number[], dn: number[]) => up.map((u, i) => {
    const tot = u + dn[i];
    return eq(tot, 0) ? 0 : (100 * (u - dn[i])) / tot;
  });
  const instNet = A(ta.ema(S(net(sumInstUp, sumInstDn)), cfg.smooth));
  const retNet = A(ta.ema(S(net(sumRetUp, sumRetDn)), cfg.smooth));

  // Symmetry-break detection
  const nz = (v: number) => (isNaN(v) ? 0 : v);
  const instROC = instNet.map((v, i) => v - nz(i > 0 ? instNet[i - 1] : NaN));
  const retROC = retNet.map((v, i) => v - nz(i > 0 ? retNet[i - 1] : NaN));
  const sdInstROC = A(ta.stdev(S(instROC), cfg.lenSpike));
  const sdRetROC = A(ta.stdev(S(retROC), cfg.lenSpike));

  // Extremes: ta.highest / ta.lowest of instNet[1] (window mode) or ta.pivothigh / pivotlow (pivot mode); each
  // only runs in its mode (lazy `and`, ternary)
  const L = cfg.extLen;
  const prevInst = instNet.map((_v, i) => (i > 0 ? instNet[i - 1] : NaN));
  const hi = cfg.usePivots ? [] : A(ta.highest(S(prevInst), cfg.extLen - 1));
  const lo = cfg.usePivots ? [] : A(ta.lowest(S(prevInst), cfg.extLen - 1));
  const ph = cfg.usePivots ? A(ta.pivothigh(S(instNet), L, L)) : [];
  const pl = cfg.usePivots ? A(ta.pivotlow(S(instNet), L, L)) : [];

  const instColor = (v: number) => (ge(v, 0) ? color.aqua : color.orange);
  const retColor = (v: number) => (ge(v, 0) ? color.lime : color.red);
  const extTopBg = String(color.new(color.aqua, 90));
  const extBotBg = String(color.new(color.orange, 90));
  const symBg = String(color.new(color.fuchsia, 88));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  // alertcondition flags in the original's order
  const flags: boolean[][] = [0, 1, 2, 3, 4, 5].map(() => new Array<boolean>(n).fill(false));
  let lastIdx = NaN;
  let lastTopIdx = NaN;
  let lastBotIdx = NaN;
  // ta.crossover / ta.crossunder(retNet, 0): exact compare with the last bar where retNet was not na
  let prevRet = NaN;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const zInst = eq(sdInstROC[i], 0) ? 0 : instROC[i] / sdInstROC[i];
    const zRet = eq(sdRetROC[i], 0) ? 0 : retROC[i] / sdRetROC[i];
    const retQuiet = le(Math.abs(retROC[i]), cfg.retQuietK * sdRetROC[i]);
    // math.sign(instROC) != math.sign(retROC): false when one side is na
    const sI = Math.sign(instROC[i]);
    const sR = Math.sign(retROC[i]);
    const opposite = !isNaN(sI) && !isNaN(sR) && sI !== sR;
    const zGapOK = ge(Math.abs(zInst) - Math.abs(zRet), cfg.zGapCut);
    const instBig = ge(Math.abs(instROC[i]), cfg.minInstROC);
    const symBreakRaw = ge(Math.abs(zInst), cfg.zInstCut) && zGapOK && instBig && (retQuiet || opposite);
    const canFire = isNaN(lastIdx) || i - lastIdx > cfg.coolOff;
    const symBreak = symBreakRaw && canFire;
    if (symBreak) lastIdx = i;

    const r = retNet[i];
    const retFlipUp = !isNaN(r) && !isNaN(prevRet) && r > 0 && prevRet <= 0;
    const retFlipDown = !isNaN(r) && !isNaN(prevRet) && r < 0 && prevRet >= 0;
    if (!isNaN(r)) prevRet = r;
    // plotchar(showRetFlips and retFlipUp ? retNet : na, char = "▲", location.absolute, color.lime, size.tiny)
    if (cfg.showRetFlips && retFlipUp) {
      markers.push({ id: 'char0', time: t, position: 'atPriceMiddle', price: r, shape: 'circle', color: 'transparent', text: '▲',
        textColor: color.lime, size: 'tiny' });
    }
    if (cfg.showRetFlips && retFlipDown) {
      markers.push({ id: 'char1', time: t, position: 'atPriceMiddle', price: r, shape: 'circle', color: 'transparent', text: '▼',
        textColor: color.red, size: 'tiny' });
    }

    const v = instNet[i];
    const newHighNow = !cfg.usePivots && gt(v, hi[i]);
    const newLowNow = !cfg.usePivots && lt(v, lo[i]);
    const pivotTopNow = cfg.usePivots && !isNaN(ph[i]);
    const pivotBotNow = cfg.usePivots && !isNaN(pl[i]);
    const topNowRaw = newHighNow || pivotTopNow;
    const botNowRaw = newLowNow || pivotBotNow;
    const topNow = cfg.requireSym ? topNowRaw && symBreak : topNowRaw;
    const botNow = cfg.requireSym ? botNowRaw && symBreak : botNowRaw;
    const canTop = isNaN(lastTopIdx) || i - lastTopIdx > cfg.dedupeBars;
    const canBot = isNaN(lastBotIdx) || i - lastBotIdx > cfg.dedupeBars;
    const topFire = topNow && canTop;
    const botFire = botNow && canBot;
    if (topFire) lastTopIdx = i;
    if (botFire) lastBotIdx = i;
    flags[0][i] = retFlipUp;
    flags[1][i] = retFlipDown;
    flags[2][i] = retFlipUp || retFlipDown;
    flags[3][i] = topFire;
    flags[4][i] = botFire;
    flags[5][i] = symBreak;
    // plotchar(topFire ? instNet : na, "Institutional Extreme High", "●", location.absolute, size.tiny, aqua)
    if (topFire && !isNaN(v)) {
      markers.push({ id: 'char2', time: t, position: 'atPriceMiddle', price: v, shape: 'circle', color: 'transparent', text: '●',
        textColor: color.aqua, size: 'tiny' });
    }
    if (botFire && !isNaN(v)) {
      markers.push({ id: 'char3', time: t, position: 'atPriceMiddle', price: v, shape: 'circle', color: 'transparent', text: '●',
        textColor: color.orange, size: 'tiny' });
    }
    // bgcolor layers in Pine order (the later call is drawn on top)
    if (cfg.showExtBG && topFire) bgColors.push({ time: t, color: extTopBg });
    if (cfg.showExtBG && botFire) bgColors.push({ time: t, color: extBotBg });
    if (cfg.shadeBG && symBreak) bgColors.push({ time: t, color: symBg });
    // plotshape(showMarks and symBreak, style = shape.circle, location = location.top, size = size.tiny,
    //           color = color.fuchsia, text = "Break"): Pine default text colour (blue)
    if (cfg.showMarks && symBreak) {
      markers.push({ id: 'shape4', time: t, position: 'top', shape: 'circle', color: color.fuchsia, text: 'Break', textColor: color.blue,
        size: 'tiny' });
    }
  }

  const plot0 = bars.map((b, i) => ({ time: b.time, value: instNet[i], color: instColor(instNet[i]) }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: retNet[i], color: retColor(retNet[i]) }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [
      { value: 0, options: { title: 'Zero', color: ZERO_COLOR, linestyle: 'dashed' } },
      { value: cfg.thrShow, options: { title: ' +Thr', color: THR_COLOR, linestyle: 'dashed' } },
      { value: -cfg.thrShow, options: { title: ' -Thr', color: THR_COLOR, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_plus', plot2: 'hline_minus', colors: new Array<string>(n).fill(THR_FILL) },
    ],
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Retail Flip: Red → Green', message: 'Retail (proxy) crossed above zero — color changed from red to green.' },
  { id: 'alert1', title: 'Retail Flip: Green → Red', message: 'Retail (proxy) crossed below zero — color changed from green to red.' },
  { id: 'alert2', title: 'Retail Flip: Either Direction', message: 'Retail (proxy) changed color (crossed the zero line).' },
  { id: 'alert3', title: 'Institutional Extreme HIGH', message: 'Institutional proxy reached an extreme HIGH (pivot/window).' },
  { id: 'alert4', title: 'Institutional Extreme LOW', message: 'Institutional proxy reached an extreme LOW (pivot/window).' },
  {
    id: 'alert5',
    title: 'Symmetry Break (Institution)',
    message: 'Institution line made a sudden, outsized move while Retail was quiet or opposite (symmetry broken).',
  },
];

export const RetailVsBankerNetPositionsSymmetryBreak = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
