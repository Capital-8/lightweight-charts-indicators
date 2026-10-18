/**
 * L1 Moving Average Fingerprint for Long Entry
 *
 * Fingerprints 1-6 are the `maLookback`-bar SMAs of the highest high and the lowest low over three lengths (MAGene).
 * Three weighted means of them (coefficients 1-6) are smoothed again, and their weighted mean (3:2:1) times
 * coefficient 7 is smoothed into fingerprint 10. Fingerprint 11 is xsa(|low - low[1]|, 3, 1) / xsa(max(low - low[1],
 * 0), 3, 1) * 100 (xsa: a 3-bar SMA start, then (src + 2 * prev) / 3). It is multiplied by 10 when close * coefficient
 * 8 <= fingerprint 10, else divided by 10, and smoothed over 3 bars (fingerprint 12). On a bar whose low is the
 * lowest low of 13 bars, part = (highest fingerprint 12 over `fpLookback` bars + 2 * fingerprint 11) / 2, else 0.
 * ReadytoLong = SMA(part, 3) / 200. The background is green while ReadytoLong > 0; triangles below the bar mark the
 * crossovers of ReadytoLong above 1.2, 4.5 and 7.0.
 *
 * Reference: "L1 Moving Average Fingerprint for Long Entry" by blackcat1402
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { taCore, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';

export interface L1MovingAverageFingerprintInputs {
  maGene1: number;
  maGene2: number;
  maGene3: number;
  maLookback: number;
  fpLookback: number;
  fpCoeff1: number;
  fpCoeff2: number;
  fpCoeff3: number;
  fpCoeff4: number;
  fpCoeff5: number;
  fpCoeff6: number;
  fpCoeff7: number;
  fpCoeff8: number;
}

export const defaultInputs: L1MovingAverageFingerprintInputs = {
  maGene1: 485,
  maGene2: 222,
  maGene3: 96,
  maLookback: 17,
  fpLookback: 30,
  fpCoeff1: 0.56,
  fpCoeff2: 0.96,
  fpCoeff3: 0.55,
  fpCoeff4: 1.23,
  fpCoeff5: 0.68,
  fpCoeff6: 1.30,
  fpCoeff7: 1.74,
  fpCoeff8: 1.35,
};

export const inputConfig: InputConfig[] = [
  { id: 'maGene1', type: 'int', title: 'MAGene1', defval: 485, min: 1 },
  { id: 'maGene2', type: 'int', title: 'MAGene2', defval: 222, min: 1 },
  { id: 'maGene3', type: 'int', title: 'MAGene3', defval: 96, min: 1 },
  { id: 'maLookback', type: 'int', title: 'MALookback', defval: 17, min: 1 },
  { id: 'fpLookback', type: 'int', title: 'FPLookback', defval: 30, min: 1 },
  { id: 'fpCoeff1', type: 'float', title: 'FPCoeff1', defval: 0.56, min: 0.01 },
  { id: 'fpCoeff2', type: 'float', title: 'FPCoeff2', defval: 0.96, min: 0.01 },
  { id: 'fpCoeff3', type: 'float', title: 'FPCoeff3', defval: 0.55, min: 0.01 },
  { id: 'fpCoeff4', type: 'float', title: 'FPCoeff4', defval: 1.23, min: 0.01 },
  { id: 'fpCoeff5', type: 'float', title: 'FPCoeff5', defval: 0.68, min: 0.01 },
  { id: 'fpCoeff6', type: 'float', title: 'FPCoeff6', defval: 1.30, min: 0.01 },
  { id: 'fpCoeff7', type: 'float', title: 'FPCoeff7', defval: 1.74, min: 0.01 },
  { id: 'fpCoeff8', type: 'float', title: 'FPCoeff8', defval: 1.35, min: 0.01 },
];

// No plot(): the outputs are a bgcolor and three plotchar markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'L1 Moving Average Fingerprint for Long Entry',
  shortTitle: 'L1 SMAFP V6',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const nz = (x: number) => (isNaN(x) ? 0 : x);

/**
 * Pine xsa(src, len, wei): running sum sum = nz(sum[1]) - nz(src[len]) + src, ma = sum / len (na while src[len] is
 * na), out = ma on the first bar where out[1] is na, then (src * wei + out[1] * (len - wei)) / len.
 */
function xsa(src: number[], len: number, wei: number): number[] {
  const out: number[] = new Array(src.length).fill(NaN);
  let sumPrev = NaN;
  let outPrev = NaN;
  for (let i = 0; i < src.length; i++) {
    const srcLen = i - len >= 0 ? src[i - len] : NaN;
    const sum = nz(sumPrev) - nz(srcLen) + src[i];
    const ma = isNaN(srcLen) ? NaN : sum / len;
    const o = isNaN(outPrev) ? ma : (src[i] * wei + outPrev * (len - wei)) / len;
    out[i] = o;
    sumPrev = sum;
    outPrev = o;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<L1MovingAverageFingerprintInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { maGene1, maGene2, maGene3, maLookback: L, fpLookback } = cfg;
  const { fpCoeff1: c1, fpCoeff2: c2, fpCoeff3: c3, fpCoeff4: c4, fpCoeff5: c5, fpCoeff6: c6, fpCoeff7: c7,
    fpCoeff8: c8 } = cfg;
  const n = bars.length;
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);

  // Basic fingerprints (highest highs and lowest lows smoothed)
  const fp1 = taCore.sma(taCore.highest(high, maGene1), L);
  const fp2 = taCore.sma(taCore.highest(high, maGene2), L);
  const fp3 = taCore.sma(taCore.highest(high, maGene3), L);
  const fp4 = taCore.sma(taCore.lowest(low, maGene1), L);
  const fp5 = taCore.sma(taCore.lowest(low, maGene2), L);
  const fp6 = taCore.sma(taCore.lowest(low, maGene3), L);

  // Composite fingerprints with coefficients
  const mix = (a: number, b: number) => fp1.map((_, i) =>
    (fp1[i] * a + fp2[i] * a + fp3[i] * a + fp4[i] * b + fp5[i] * b + fp6[i] * b) / 6);
  const fp7 = taCore.sma(mix(c1, c2), L);
  const fp8 = taCore.sma(mix(c3, c4), L);
  const fp9 = taCore.sma(mix(c5, c6), L);
  const fp10 = taCore.sma(fp7.map((_, i) => (fp7[i] * 3 + fp8[i] * 2 + fp9[i]) / 6 * c7), L);

  // Specialized fingerprint using xsa (low[1] is na on bar 0)
  const src1 = low.map((v, i) => (i > 0 ? Math.abs(v - low[i - 1]) : NaN));
  const src2 = low.map((v, i) => (i > 0 ? Math.max(v - low[i - 1], 0) : NaN));
  const xsa1 = xsa(src1, 3, 1);
  const xsa2 = xsa(src2, 3, 1);
  // A plain division: x / 0 is +-infinity (0 / 0 NaN), the infinite value is used as in Pine
  const fp11 = xsa1.map((v, i) => v / xsa2[i] * 100);

  const value = fp11.map((v, i) => (le(bars[i].close * c8, fp10[i]) ? v * 10 : v / 10));
  const fp12 = taCore.sma(value, 3);

  // Final fingerprint calculations
  const fpH = taCore.highest(fp12, fpLookback);
  const lowest13 = taCore.lowest(low, 13);
  const part = low.map((v, i) => (le(v, lowest13[i]) ? (fpH[i] + fp11[i] * 2) / 2 : 0));
  const readyToLong = taCore.sma(part, 3).map((v) => v / 200);

  const bg = String(color.new(color.green, 70));
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    if (gt(readyToLong[i], 0)) bgColors.push({ time: bars[i].time, color: bg });
  }

  // plotchar(ta.crossover(ReadytoLong, level), ...): Pine keeps only the first character of a plotchar char, so
  // '▲▲' and '▲▲▲' are drawn as '▲'
  const levels: [number, string][] = [
    [1.2, String(color.new(color.yellow, 0))],
    [4.5, String(color.new(color.lime, 0))],
    [7.0, String(color.new(color.green, 0))],
  ];
  const markers: MarkerData[] = [];
  const crosses = levels.map(([level]) => taCore.crossover(readyToLong, new Array(n).fill(level)));
  for (let i = 0; i < n; i++) {
    levels.forEach(([, c], k) => {
      if (crosses[k][i]) {
        // ids char0 / char1 / char2: the three plotchar outputs in declaration order
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '▲',
          textColor: c, size: 'small', id: `char${k}` });
      }
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
  };
}

export const L1MovingAverageFingerprint = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
