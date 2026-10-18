/**
 * AI Source Switching Moving Average (Zeiierman)
 *
 * For each price source (open, high, low, close) six features are computed: trend (EMA 10 - EMA 34 over ATR),
 * mean deviation (z-score over 30 bars), momentum (14-bar ROC), volatility (scaled 20-bar stdev), position in the
 * bar range and 3-bar slope. On confirmed bars, rows of the features `horizon` bars back with the forward outcome
 * class (-3..3 by ATR bands) are stored in one memory bank per source (and in a shared bank). A weighted k-nearest
 * neighbour search (feature weights optimised by a Fisher criterion on the shared bank) scores each source by the
 * analog outcome, agreement and tightness, plus an online neural score (linear model trained with Adam and Huber
 * gradient on the close features). The best ranked source, EMA smoothed, feeds the moving average and an
 * adaptive-ATR supertrend trail whose band width follows the model drive. Glow fills, flip triangles and optional
 * source-switch labels and trend candles.
 *
 * Alerts (alertcondition, `alerts` of the result): the supertrend flipping up / down and the selected source changing.
 *
 * Reference: "AI Source Switching Moving Average (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

const MA_TYPES = ['SMA', 'EMA', 'WMA', 'VWMA', 'RMA', 'HMA', 'TEMA', 'ZLEMA', 'KAMA', 'ALMA'];

export interface AISourceSwitchingMovingAverageInputs {
  maType: string;
  maLen: number;
  /** AI source smoothing (EMA length of the selected source) */
  srcSmoothLen: number;
  /** Memory depth (rows per source bank) */
  memoryDepth: number;
  /** Analog count (k nearest neighbours) */
  kNeighbors: number;
  /** Learning horizon (bars) */
  horizonBars: number;
  /** Analog spacing (rows) */
  spacingBars: number;
  /** Learning sensitivity x ATR */
  learnAtrFactor: number;
  useNeural: boolean;
  neuralInfluence: number;
  learnRate: number;
  huberD: number;
  /** Auto optimise feature weights (Fisher) */
  useFisher: boolean;
  fisherSpeed: number;
  fisherFloor: number;
  minRows: number;
  showST: boolean;
  stLen: number;
  stMult: number;
  stAdapt: number;
  bullCol: string;
  bearCol: string;
  neutralCol: string;
  showCandles: boolean;
  showSourceMarks: boolean;
  showFlipMarks: boolean;
  showMAGlow: boolean;
  showTrailGlow: boolean;
}

export const defaultInputs: AISourceSwitchingMovingAverageInputs = {
  maType: 'EMA',
  maLen: 50,
  srcSmoothLen: 3,
  memoryDepth: 40,
  kNeighbors: 9,
  horizonBars: 4,
  spacingBars: 4,
  learnAtrFactor: 0.45,
  useNeural: true,
  neuralInfluence: 0.35,
  learnRate: 0.01,
  huberD: 0.02,
  useFisher: true,
  fisherSpeed: 0.20,
  fisherFloor: 0.40,
  minRows: 80,
  showST: true,
  stLen: 10,
  stMult: 1.7,
  stAdapt: 0.80,
  bullCol: '#00e676',
  bearCol: '#ff5252',
  neutralCol: color.gray,
  showCandles: false,
  showSourceMarks: false,
  showFlipMarks: true,
  showMAGlow: true,
  showTrailGlow: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA', options: MA_TYPES },
  { id: 'maLen', type: 'int', title: 'MA Length', defval: 50, min: 2 },
  { id: 'srcSmoothLen', type: 'int', title: 'AI Source Smoothing', defval: 3, min: 1 },
  { id: 'memoryDepth', type: 'int', title: 'Memory Depth', defval: 40, min: 5, max: 2000 },
  { id: 'kNeighbors', type: 'int', title: 'Analog Count', defval: 9, min: 1, max: 50 },
  { id: 'horizonBars', type: 'int', title: 'Learning Horizon', defval: 4, min: 1, max: 20 },
  { id: 'spacingBars', type: 'int', title: 'Analog Spacing', defval: 4, min: 1, max: 20 },
  { id: 'learnAtrFactor', type: 'float', title: 'Learning Sensitivity x ATR', defval: 0.45, min: 0.05, step: 0.05 },
  { id: 'useNeural', type: 'bool', title: 'Use Neural Online Training', defval: true },
  { id: 'neuralInfluence', type: 'float', title: 'Neural Influence', defval: 0.35, min: 0, max: 1, step: 0.05 },
  { id: 'learnRate', type: 'float', title: 'Learning Rate', defval: 0.01, min: 0.001, max: 0.1, step: 0.001 },
  { id: 'huberD', type: 'float', title: 'Huber Delta', defval: 0.02, min: 0.001, max: 0.2, step: 0.001 },
  { id: 'useFisher', type: 'bool', title: 'Auto Optimize Feature Weights', defval: true },
  { id: 'fisherSpeed', type: 'float', title: 'Adaptation Speed', defval: 0.20, min: 0.005, max: 1, step: 0.005 },
  { id: 'fisherFloor', type: 'float', title: 'Weight Floor', defval: 0.40, min: 0.05, max: 2, step: 0.05 },
  { id: 'minRows', type: 'int', title: 'Minimum Rows', defval: 80, min: 20, max: 500 },
  { id: 'showST', type: 'bool', title: 'Show AI Supertrend', defval: true },
  { id: 'stLen', type: 'int', title: 'ATR Length', defval: 10, min: 1 },
  { id: 'stMult', type: 'float', title: 'ATR Multiplier', defval: 1.7, min: 0.5, step: 0.1 },
  { id: 'stAdapt', type: 'float', title: 'AI Band Adaptivity', defval: 0.80, min: 0, max: 1, step: 0.05 },
  { id: 'bullCol', type: 'color', title: 'Bullish', defval: '#00e676' },
  { id: 'bearCol', type: 'color', title: 'Bearish', defval: '#ff5252' },
  { id: 'neutralCol', type: 'color', title: 'Neutral', defval: color.gray },
  { id: 'showCandles', type: 'bool', title: 'Show AI Trend Candles', defval: false },
  { id: 'showSourceMarks', type: 'bool', title: 'Show AI Source Switch Marks', defval: false },
  { id: 'showFlipMarks', type: 'bool', title: 'Show Supertrend Flip Marks', defval: true },
  { id: 'showMAGlow', type: 'bool', title: 'Show MA Glow', defval: true },
  { id: 'showTrailGlow', type: 'bool', title: 'Show Trail Glow', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'AI Source Adaptive MA', color: '#00e676', lineWidth: 2 },
  { id: 'plot1', title: 'AI Supertrend Up', color: '#00e676', lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'AI Supertrend Down', color: '#ff5252', lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'Glow Anchor', color: 'transparent', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'AI Source Switching Moving Average (Zeiierman)',
  shortTitle: 'AI Source Switching MA',
  overlay: true,
};

type Arr = number[];
/** Six features of one source */
type Feat = [Arr, Arr, Arr, Arr, Arr, Arr];

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(x, hi));
const compress = (d: number) => Math.log(1.0 + Math.abs(d));
const normScore = (x: number) => 1.0 / (1.0 + Math.exp(-clamp(x, -8, 8)));

export function calculate(
  bars: Bar[],
  inputs: Partial<AISourceSwitchingMovingAverageInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const h = cfg.horizonBars;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: Arr) => Series.fromArray(bars, a);
  const back = (a: Arr, i: number, k: number) => (i - k >= 0 ? a[i - k] : NaN);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const atrNow = A(ta.atr(bars, 14));

  // featTrend, featMean, featMomentum, featVol, featRange, featSlope of one source
  const features = (src: Arr): Feat => {
    const fast = A(ta.ema(S(src), 10));
    const slow = A(ta.ema(S(src), 34));
    const trend = src.map((_v, i) => (atrNow[i] === 0 ? 0 : clamp((fast[i] - slow[i]) / atrNow[i], -3, 3) / 3));
    const basis = A(ta.sma(S(src), 30));
    const dev = A(ta.stdev(S(src), 30));
    const mean = src.map((v, i) => {
      const z = dev[i] === 0 ? 0 : (v - basis[i]) / dev[i];
      return clamp(-z, -3, 3) / 3;
    });
    const mom = src.map((v, i) => clamp((v / back(src, i, 14) - 1.0) / 0.05, -3, 3) / 3);
    // scale01(ta.stdev(src, 20), 100) * 2 - 1
    const sd = A(ta.stdev(S(src), 20));
    const lo = A(ta.lowest(S(sd), 100));
    const hi = A(ta.highest(S(sd), 100));
    const vol = sd.map((x, i) => (hi[i] === lo[i] ? 0.5 : clamp((x - lo[i]) / (hi[i] - lo[i]), 0.0, 1.0)) * 2.0 - 1.0);
    const range = src.map((v, i) => {
      const rng = high[i] - low[i];
      return rng === 0 ? 0 : clamp(((v - low[i]) / rng) * 2.0 - 1.0, -1, 1);
    });
    const slope = src.map((v, i) => (atrNow[i] === 0 ? 0 : clamp((v - back(src, i, 3)) / atrNow[i], -3, 3) / 3));
    return [trend, mean, mom, vol, range, slope];
  };
  const srcs = [bars.map((b) => b.open), high, low, close];
  const feats = srcs.map(features); // 0 open, 1 high, 2 low, 3 close
  const at = (f: Feat, i: number) => f.map((a) => (i >= 0 ? a[i] : NaN));
  const valid = (v: number[]) => v.every((x) => !isNaN(x));

  const banks: number[][][] = [[], [], [], []]; // newest row first (matrix.add_row(0, row))
  const bankAll: number[][] = [];
  const addBank = (m: number[][], row: number[], limit: number) => {
    m.unshift(row);
    if (m.length > limit) m.pop();
  };
  let wAuto = [1, 1, 1, 1, 1, 1];

  // autoFeatureWeights(m, minN, floor): Fisher score of each feature between bullish and bearish rows
  const autoFeatureWeights = (m: number[][]): number[] => {
    const imp = [1, 1, 1, 1, 1, 1];
    if (m.length < cfg.minRows) return imp;
    const sumB = [0, 0, 0, 0, 0, 0];
    const sumS = [0, 0, 0, 0, 0, 0];
    const sqB = [0, 0, 0, 0, 0, 0];
    const sqS = [0, 0, 0, 0, 0, 0];
    let cntB = 0;
    let cntS = 0;
    for (const row of m) {
      const cls = row[6];
      if (cls !== 0) {
        const isBull = cls > 0;
        for (let j = 0; j < 6; j++) {
          const val = row[j];
          if (isBull) {
            sumB[j] += val;
            sqB[j] += val * val;
          } else {
            sumS[j] += val;
            sqS[j] += val * val;
          }
        }
        cntB += isBull ? 1 : 0;
        cntS += isBull ? 0 : 1;
      }
    }
    if (cntB > 3 && cntS > 3) {
      let maxF = 0.0;
      const fish = [0, 0, 0, 0, 0, 0];
      for (let j = 0; j < 6; j++) {
        const meanB = sumB[j] / cntB;
        const meanS = sumS[j] / cntS;
        const varB = Math.max(0.0, sqB[j] / cntB - meanB * meanB);
        const varS = Math.max(0.0, sqS[j] / cntS - meanS * meanS);
        const f = Math.pow(meanB - meanS, 2) / (varB + varS + 0.000001);
        fish[j] = f;
        maxF = Math.max(maxF, f);
      }
      for (let j = 0; j < 6; j++) imp[j] = Math.max(cfg.fisherFloor, (maxF > 0 ? fish[j] / maxF : 1.0) * 8.0);
    }
    return imp;
  };

  // knnScore(features, bank) -> [analog, agree, tight, k]
  const knnScore = (x: number[], bank: number[][], w: number[]): [number, number, number, number] => {
    const gaps: number[] = [];
    const classes: number[] = [];
    const rows = bank.length;
    const scanEnd = Math.min(rows - 1, cfg.memoryDepth - 1);
    if (rows > 1 && valid(x)) {
      for (let r = 0; r <= scanEnd; r++) {
        if (r % cfg.spacingBars !== 0) continue;
        const row = bank[r];
        let g = 0;
        for (let j = 0; j < 6; j++) g += w[j] * compress(x[j] - row[j]);
        const cls = row[6];
        if (!isNaN(g) && cls !== 0) {
          if (gaps.length < cfg.kNeighbors) {
            gaps.push(g);
            classes.push(cls);
          } else {
            let worst = 0;
            let worstGap = gaps[0];
            for (let j = 1; j < gaps.length; j++) {
              if (gaps[j] > worstGap) {
                worstGap = gaps[j];
                worst = j;
              }
            }
            if (g < worstGap) {
              gaps[worst] = g;
              classes[worst] = cls;
            }
          }
        }
      }
    }
    let total = 0;
    let bull = 0;
    let bear = 0;
    let score = 0;
    let gapSum = 0;
    const k = gaps.length;
    for (let j = 0; j < k; j++) {
      const wg = 1.0 / (1.0 + gaps[j]);
      total += wg;
      score += classes[j] * wg;
      bull += classes[j] > 0 ? wg : 0.0;
      bear += classes[j] < 0 ? wg : 0.0;
      gapSum += gaps[j];
    }
    const analog = total > 0 ? score / total : 0.0;
    const dir = analog > 0.15 ? 1 : analog < -0.15 ? -1 : 0;
    const agree = total > 0 ? (dir === 1 ? bull : dir === -1 ? bear : 0.0) / total : 0.0;
    const avgGap = k > 0 ? gapSum / k : 0.0;
    const gapScale = (w[0] + w[1] + w[2] + w[3] + w[4] + w[5]) * 0.45 + 0.000001;
    const tight = clamp(1.0 - avgGap / gapScale, 0.0, 1.0);
    return [analog, agree, tight, k];
  };

  // Adam state of the neural weights (t, m, mo, v, r, s, bias)
  const nw = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.0];
  const mo = [0, 0, 0, 0, 0, 0, 0];
  const ve = [0, 0, 0, 0, 0, 0, 0];
  let step = 0;
  const beta1 = 0.9;
  const beta2 = 0.999;
  const eps = 0.00000001;

  const bestId: number[] = new Array(n);
  const aiDrive: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // outcome of the bar `horizon` bars back: forward move against ATR bands
    const moveFwd = close[i] - back(close, i, h);
    const bandFwd = cfg.learnAtrFactor * back(atrNow, i, h);
    const outcome = moveFwd > 2 * bandFwd ? 3 : moveFwd > bandFwd ? 2 : moveFwd > 0 ? 1
      : moveFwd < -2 * bandFwd ? -3 : moveFwd < -bandFwd ? -2 : moveFwd < 0 ? -1 : 0;
    const past = feats.map((f) => at(f, i - h));
    // every historical bar is confirmed
    if (i > h + 120) {
      for (let s = 0; s < 4; s++) {
        if (valid(past[s])) {
          const row = [...past[s], outcome];
          addBank(banks[s], row, cfg.memoryDepth);
          addBank(bankAll, row, cfg.memoryDepth * 4);
        }
      }
    }
    if (cfg.useFisher) {
      const wRaw = autoFeatureWeights(bankAll);
      wAuto = wAuto.map((prev, j) => prev + cfg.fisherSpeed * (wRaw[j] - prev));
    }
    const w = cfg.useFisher ? wAuto : [1, 1, 1, 1, 1, 1];
    const cur = feats.map((f) => at(f, i));
    const knn = cur.map((x, s) => knnScore(x, banks[s], w));

    // neural training on the close features `horizon` bars back (Huber gradient, Adam)
    const targetDir = outcome > 0 ? 1.0 : outcome < 0 ? -1.0 : 0.0;
    const pc = past[3];
    const trainPred = pc.reduce((acc, v, j) => acc + nw[j] * v, 0) + nw[6];
    const trainErr = trainPred - targetDir;
    const trainGrad = Math.abs(trainErr) <= cfg.huberD ? trainErr : cfg.huberD * Math.sign(trainErr);
    if (cfg.useNeural && i > h + 120 && valid(pc) && targetDir !== 0) {
      step += 1;
      for (let j = 0; j < 7; j++) {
        const grad = j < 6 ? trainGrad * pc[j] : trainGrad;
        const newMom = beta1 * mo[j] + (1.0 - beta1) * grad;
        const newVel = beta2 * ve[j] + (1.0 - beta2) * grad * grad;
        const mHat = newMom / (1.0 - Math.pow(beta1, step));
        const vHat = newVel / (1.0 - Math.pow(beta2, step));
        nw[j] = nw[j] - (cfg.learnRate * mHat) / (Math.sqrt(vHat) + eps);
        mo[j] = newMom;
        ve[j] = newVel;
      }
    }

    // rankSource: analog, agreement, tightness, neural score and a full-k bonus, clamped to 0..1
    const rank = cur.map((x, s) => {
      const neural = cfg.useNeural ? x.reduce((acc, v, j) => acc + nw[j] * v, 0) + nw[6] : 0.0;
      const [analog, agree, tight, k] = knn[s];
      const raw = (Math.abs(analog) / 3.0) * 0.35 + agree * 0.25 + tight * 0.20 + normScore(neural) * cfg.neuralInfluence
        + (k >= cfg.kNeighbors ? 0.10 : 0.0) - 0.0;
      return clamp(raw, 0.0, 1.0);
    });
    const ready = banks.every((b) => b.length > 20);
    const [rO, rH, rL, rC] = ready ? rank : [0.25, 0.25, 0.25, 0.25];
    bestId[i] = rO >= rH && rO >= rL && rO >= rC ? 0 : rH >= rL && rH >= rC ? 1 : rL >= rC ? 2 : 3;
    const avg = (k: number) => knn.reduce((acc, r) => acc + r[k], 0) / 4.0;
    aiDrive[i] = clamp(Math.abs(avg(0)) * 0.20 + avg(1) * 0.40 + avg(2) * 0.40, 0.0, 1.0);
  }

  const hardSrc = bestId.map((id, i) => srcs[id][i]);
  const aiSource = A(ta.ema(S(hardSrc), cfg.srcSmoothLen));
  const aiMA = movingAverage(bars, aiSource, cfg.maLen, cfg.maType);

  // adaptive supertrend on the AI source
  const stAtr = A(ta.atr(bars, cfg.stLen));
  const stLong: Arr = new Array(n);
  const stShort: Arr = new Array(n);
  const stDir: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const adaptMult = cfg.stMult * (1.0 + cfg.stAdapt * (1.0 - aiDrive[i]));
    const upBand = aiSource[i] - adaptMult * stAtr[i];
    const dnBand = aiSource[i] + adaptMult * stAtr[i];
    const pL = i > 0 ? stLong[i - 1] : NaN;
    const pS = i > 0 ? stShort[i - 1] : NaN;
    const pc = i > 0 ? close[i - 1] : NaN;
    stLong[i] = isNaN(pL) ? upBand : pc > pL ? Math.max(upBand, pL) : upBand;
    stShort[i] = isNaN(pS) ? dnBand : pc < pS ? Math.min(dnBand, pS) : dnBand;
    // stDir := na(stDir[1]) ? 1 : stDir[1] == -1 and close > stShort[1] ? 1 : stDir[1] == 1 and close < stLong[1] ? -1 : nz(stDir[1], 1)
    if (i === 0) stDir[i] = 1;
    else {
      const pd = stDir[i - 1];
      stDir[i] = pd === -1 && close[i] > pS ? 1 : pd === 1 && close[i] < pL ? -1 : pd;
    }
  }

  const c = (col: string, transp: number) => String(color.new(col, transp));
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const trailUp: Arr = new Array(n);
  const trailDn: Arr = new Array(n);
  const maGlow: (string | null)[] = [];
  const upGlow: (string | null)[] = [];
  const dnGlow: (string | null)[] = [];
  const markers: MarkerData[] = [];
  const candles: PlotCandleData[] = [];
  const flipUpFlags: boolean[] = new Array(n).fill(false);
  const flipDnFlags: boolean[] = new Array(n).fill(false);
  const changedFlags: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const up = stDir[i] === 1;
    const stLine = up ? stLong[i] : stShort[i];
    const maCol = up ? cfg.bullCol : cfg.bearCol;
    trailUp[i] = cfg.showST && up ? stLine : NaN;
    trailDn[i] = cfg.showST && stDir[i] === -1 ? stLine : NaN;
    plot0.push({ time: t, value: aiMA[i], color: maCol });
    plot1.push({ time: t, value: trailUp[i], color: c(cfg.bullCol, 0) });
    plot2.push({ time: t, value: trailDn[i], color: c(cfg.bearCol, 0) });
    maGlow.push(cfg.showMAGlow ? c(maCol, 85) : null);
    upGlow.push(cfg.showTrailGlow ? c(cfg.bullCol, 85) : null);
    dnGlow.push(cfg.showTrailGlow ? c(cfg.bearCol, 85) : null);
    const candleCol = up ? c(cfg.bullCol, 0) : c(cfg.bearCol, 0);
    if (cfg.showCandles) {
      candles.push({ time: t, open: bars[i].open, high: bars[i].high, low: bars[i].low, close: bars[i].close,
        color: candleCol, wickColor: candleCol, borderColor: candleCol });
    }
    // source switch labels (bestId != bestId[1])
    changedFlags[i] = i > 0 && bestId[i] !== bestId[i - 1];
    if (cfg.showSourceMarks && changedFlags[i]) {
      const marks: MarkerData[] = [
        { id: 'shape0', time: t, position: 'belowBar', shape: 'labelUp', color: c(cfg.neutralCol, 0), text: 'O', textColor: color.white, size: 'tiny' },
        { id: 'shape1', time: t, position: 'belowBar', shape: 'labelUp', color: c(cfg.bullCol, 0), text: 'H', textColor: color.black, size: 'tiny' },
        { id: 'shape2', time: t, position: 'aboveBar', shape: 'labelDown', color: c(cfg.bearCol, 0), text: 'L', textColor: color.white, size: 'tiny' },
        { id: 'shape3', time: t, position: 'belowBar', shape: 'labelUp', color: c(color.white, 0), text: 'C', textColor: color.black, size: 'tiny' },
      ];
      markers.push(marks[bestId[i]]);
    }
    // flip triangles at the trail (tiny, and small at transparency 50)
    // stFlipUp = stDir == 1 and stDir[1] == -1, stFlipDn = stDir == -1 and stDir[1] == 1
    const prevDir = i > 0 ? stDir[i - 1] : NaN;
    flipUpFlags[i] = up && prevDir === -1;
    flipDnFlags[i] = stDir[i] === -1 && prevDir === 1;
    if (cfg.showFlipMarks && flipUpFlags[i] && !isNaN(trailUp[i])) {
      markers.push({ id: 'shape4', time: t, position: 'atPriceMiddle', price: trailUp[i], shape: 'triangleUp', color: cfg.bullCol, size: 'tiny' });
      markers.push({ id: 'shape6', time: t, position: 'atPriceMiddle', price: trailUp[i], shape: 'triangleUp', color: c(cfg.bullCol, 50), size: 'small' });
    }
    if (cfg.showFlipMarks && flipDnFlags[i] && !isNaN(trailDn[i])) {
      markers.push({ id: 'shape5', time: t, position: 'atPriceMiddle', price: trailDn[i], shape: 'triangleDown', color: cfg.bearCol, size: 'tiny' });
      markers.push({ id: 'shape7', time: t, position: 'atPriceMiddle', price: trailDn[i], shape: 'triangleDown', color: c(cfg.bearCol, 50), size: 'small' });
    }
  }

  const none = new Array<string | null>(n).fill(null);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3: bars.map((b) => ({ time: b.time, value: b.close })) },
    // fill(pMA / pTrailUp / pTrailDn, pClose, <line>, close, glow colour, color(na))
    fills: [
      { plot1: 'plot0', plot2: 'plot3', gradient: { topValue: aiMA, bottomValue: close, topColor: maGlow, bottomColor: none } },
      { plot1: 'plot1', plot2: 'plot3', gradient: { topValue: trailUp, bottomValue: close, topColor: upGlow, bottomColor: none } },
      { plot1: 'plot2', plot2: 'plot3', gradient: { topValue: trailDn, bottomValue: close, topColor: dnGlow, bottomColor: none } },
    ],
    markers,
    // plotcandle(showCandles ? open : na, ...): the output is there, with no candle when off
    plotCandles: { aiTrendCandles: candles },
    // alertcondition(stFlipUp) / (stFlipDn) / (sourceChanged)
    alerts: alertStates(alertConditions, bars, [flipUpFlags, flipDnFlags, changedFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'AI Trend Flip Up', message: 'AI Source Adaptive MA flipped bullish' },
  { id: 'alert1', title: 'AI Trend Flip Down', message: 'AI Source Adaptive MA flipped bearish' },
  { id: 'alert2', title: 'AI Source Changed', message: 'AI Source Selector switched OHLC source' },
];

/** ma(src, len, typ) of the script */
function movingAverage(bars: Bar[], src: number[], len: number, typ: string): number[] {
  const S = (a: number[]) => Series.fromArray(bars, a);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const n = src.length;
  switch (typ) {
    case 'SMA': return A(ta.sma(S(src), len));
    case 'WMA': return A(ta.wma(S(src), len));
    case 'VWMA': return A(ta.vwma(S(src), len, new Series(bars, (b) => b.volume ?? NaN)));
    case 'RMA': return A(ta.rma(S(src), len));
    case 'HMA': return A(ta.hma(S(src), len));
    case 'TEMA': {
      const e1 = ta.ema(S(src), len);
      const e2 = ta.ema(e1, len);
      const a1 = A(e1);
      const a2 = A(e2);
      const a3 = A(ta.ema(e2, len));
      return a1.map((v, i) => 3.0 * (v - a2[i]) + a3[i]);
    }
    case 'ZLEMA': {
      const lag = Math.max(1, Math.floor((len - 1) / 2));
      return A(ta.ema(S(src.map((v, i) => v + (v - (i - lag >= 0 ? src[i - lag] : NaN)))), len));
    }
    case 'KAMA': {
      const diffAbs = src.map((v, i) => Math.abs(v - (i > 0 ? src[i - 1] : NaN)));
      const vol = A(math.sum(S(diffAbs), len) as Series);
      const kama: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const changeAbs = Math.abs(src[i] - (i - len >= 0 ? src[i - len] : NaN));
        const er = vol[i] === 0 ? 0.0 : changeAbs / vol[i];
        const sc = Math.pow(er * (2.0 / 3.0 - 2.0 / 31.0) + 2.0 / 31.0, 2);
        const prev = i > 0 ? kama[i - 1] : NaN;
        kama[i] = isNaN(prev) ? src[i] : prev + sc * (src[i] - prev);
      }
      return kama;
    }
    case 'ALMA': return A(ta.alma(S(src), len, 0.85, 6.0));
    default: return A(ta.ema(S(src), len));
  }
}

export const AISourceSwitchingMovingAverage = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
