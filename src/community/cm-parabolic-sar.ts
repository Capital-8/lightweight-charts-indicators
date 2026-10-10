/**
 * CM_Parabolic SAR
 *
 * Parabolic SAR with two colours: the dots are lime while the close is at or above the SAR (up trend) and red while
 * the close is at or below it (down trend). Each side can be switched off. The start and step inputs are multiplied
 * by 0.01 and the maximum step by 0.10.
 *
 * Reference: "CM_Parabolic SAR" by ChrisMoody
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Created By ChrisMoody on 7/25/2014
 */

import { ta, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export interface CmParabolicSarInputs {
  /** Start, multiplied by 0.01 */
  start: number;
  /** Step, multiplied by 0.01 */
  increment: number;
  /** Maximum step, multiplied by 0.10 */
  maximum: number;
  /** Show the SAR of up trends */
  sus: boolean;
  /** Show the SAR of down trends */
  sds: boolean;
  /** Note of the original about the multipliers (no effect) */
  disc: boolean;
}

export const defaultInputs: CmParabolicSarInputs = {
  start: 2,
  increment: 2,
  maximum: 2,
  sus: true,
  sds: true,
  disc: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'start', type: 'int', title: 'Start - Default = 2 - Multiplied by .01', defval: 2, min: 0, max: 10 },
  { id: 'increment', type: 'int', title: 'Step Setting (Sensitivity) - Default = 2 - Multiplied by .01', defval: 2, min: 0, max: 10 },
  { id: 'maximum', type: 'int', title: 'Maximum Step (Sensitivity) - Default = 2 - Multiplied by .10', defval: 2, min: 1, max: 10 },
  { id: 'sus', type: 'bool', title: 'Show Up Trending Parabolic Sar', defval: true },
  { id: 'sds', type: 'bool', title: 'Show Down Trending Parabolic Sar', defval: true },
  { id: 'disc', type: 'bool', title: 'Start and Step settings are *.01 so 2 = .02 etc, Maximum Step is *.10 so 2 = .2', defval: false },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35)
const V1 = (hex: string) => String(color.new(hex, 35));
const LIME = V1('#00FF00');
const RED = V1('#FF0000');

// Both plots have the title "Up Trending SAR" in the original
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Up Trending SAR', color: LIME, lineWidth: 4, style: 'circles' },
  { id: 'plot1', title: 'Up Trending SAR', color: RED, lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'CM_Parabolic SAR',
  shortTitle: 'CM_P-SAR',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

export function calculate(bars: Bar[], inputs: Partial<CmParabolicSarInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  // sarUp and sarDown are the same series: sar(start * .01, increment * .01, maximum * .10)
  const sar = ta.sar(bars, cfg.start * 0.01, cfg.increment * 0.01, cfg.maximum * 0.1).toArray().map((v) => v ?? NaN);

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];
  bars.forEach((b, i) => {
    // colUp = close >= sarDown ? lime : na; colDown = close <= sarUp ? red : na
    const colUp = ge(b.close, sar[i]) ? LIME : 'transparent';
    const colDown = le(b.close, sar[i]) ? RED : 'transparent';
    // plot(sus and sarUp ? sarUp : na): a value of 0 or na is not drawn
    plot0.push({ time: b.time, value: cfg.sus && truthy(sar[i]) ? sar[i] : NaN, color: colUp });
    plot1.push({ time: b.time, value: cfg.sds && truthy(sar[i]) ? sar[i] : NaN, color: colDown });
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
  };
}

export const CmParabolicSar = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
