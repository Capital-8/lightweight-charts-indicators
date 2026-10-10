/**
 * VWAP Stdev Bands v2 Mod
 *
 * Volume weighted average price of hl2 that restarts on each new day, with up to five pairs of bands at a multiple
 * of the volume weighted standard deviation of hl2 since the start of the day:
 * VWAP = sum(hl2 * volume) / sum(volume), deviation = sqrt(max(sum(volume * hl2^2) / sum(volume) - VWAP^2, 0)).
 * An optional plot shows the last VWAP value of the previous day.
 *
 * The day comes from the daily timeframe of the same symbol: the days are read from the UTC calendar and the bars
 * (see src/anchor-period.ts). On daily and higher bars every bar starts a new day. The first bar of the data never
 * starts a day (as in the original), so the outputs begin with the second day of the data.
 *
 * Reference: "VWAP Stdev Bands v2 Mod" by TheYangGuizi
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar } from 'oakscriptjs';
import { periodStarts } from '../anchor-period';

export interface VwapStdevBandsV2ModInputs {
  devUp1: number;
  devDn1: number;
  devUp2: number;
  devDn2: number;
  devUp3: number;
  devDn3: number;
  devUp4: number;
  devDn4: number;
  devUp5: number;
  devDn5: number;
  showDv2: boolean;
  showDv3: boolean;
  showDv4: boolean;
  showDv5: boolean;
  showPrevVWAP: boolean;
}

export const defaultInputs: VwapStdevBandsV2ModInputs = {
  devUp1: 1.28,
  devDn1: 1.28,
  devUp2: 2.01,
  devDn2: 2.01,
  devUp3: 2.51,
  devDn3: 2.51,
  devUp4: 3.09,
  devDn4: 3.09,
  devUp5: 4.01,
  devDn5: 4.01,
  showDv2: true,
  showDv3: true,
  showDv4: false,
  showDv5: false,
  showPrevVWAP: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'devUp1', type: 'float', title: 'Stdev above (1)', defval: 1.28 },
  { id: 'devDn1', type: 'float', title: 'Stdev below (1)', defval: 1.28 },
  { id: 'devUp2', type: 'float', title: 'Stdev above (2)', defval: 2.01 },
  { id: 'devDn2', type: 'float', title: 'Stdev below (2)', defval: 2.01 },
  { id: 'devUp3', type: 'float', title: 'Stdev above (3)', defval: 2.51 },
  { id: 'devDn3', type: 'float', title: 'Stdev below (3)', defval: 2.51 },
  { id: 'devUp4', type: 'float', title: 'Stdev above (4)', defval: 3.09 },
  { id: 'devDn4', type: 'float', title: 'Stdev below (4)', defval: 3.09 },
  { id: 'devUp5', type: 'float', title: 'Stdev above (5)', defval: 4.01 },
  { id: 'devDn5', type: 'float', title: 'Stdev below (5)', defval: 4.01 },
  { id: 'showDv2', type: 'bool', title: 'Show second group of bands?', defval: true },
  { id: 'showDv3', type: 'bool', title: 'Show third group of bands?', defval: true },
  { id: 'showDv4', type: 'bool', title: 'Show fourth group of bands?', defval: false },
  { id: 'showDv5', type: 'bool', title: 'Show fifth group of bands?', defval: false },
  { id: 'showPrevVWAP', type: 'bool', title: 'Show previous VWAP close', defval: false },
];

// Colour constants of Pine version 1, with the default plot transparency of that version (35); fills: transp = 90
const V1 = (hex: string) => String(color.new(hex, 35));
const BLACK = V1('#000000');
const GRAY = V1('#808080');
const RED = V1('#FF0000');
const GREEN = V1('#008000');
const fillOf = (c: string) => String(color.new(c, 90));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWAP', color: BLACK, lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'VWAP Upper', color: GRAY, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'VWAP Lower', color: GRAY, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'VWAP Upper (2)', color: RED, lineWidth: 1 },
  { id: 'plot4', title: 'VWAP Lower (2)', color: GREEN, lineWidth: 1 },
  { id: 'plot5', title: 'VWAP Upper (3)', color: RED, lineWidth: 1 },
  { id: 'plot6', title: 'VWAP Lower (3)', color: GREEN, lineWidth: 1 },
  { id: 'plot7', title: 'VWAP Upper (4)', color: RED, lineWidth: 1 },
  { id: 'plot8', title: 'VWAP Lower (4)', color: GREEN, lineWidth: 1 },
  { id: 'plot9', title: 'VWAP Upper (5)', color: RED, lineWidth: 1 },
  { id: 'plot10', title: 'VWAP Lower (5)', color: GREEN, lineWidth: 1 },
  { id: 'plot11', title: 'Previous VWAP Close', color: GREEN, lineWidth: 1, style: 'circles' },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot1', plot2: 'plot3', color: fillOf(RED), title: 'Over Bought Fill 1' },
  { id: 'fill1', plot1: 'plot2', plot2: 'plot4', color: fillOf(GREEN), title: 'Over Sold Fill 1' },
  { id: 'fill2', plot1: 'plot3', plot2: 'plot5', color: fillOf(RED), title: 'Over Bought Fill 2' },
  { id: 'fill3', plot1: 'plot4', plot2: 'plot6', color: fillOf(GREEN), title: 'Over Sold Fill 2' },
  { id: 'fill4', plot1: 'plot5', plot2: 'plot7', color: fillOf(RED), title: 'Over Bought Fill 3' },
  { id: 'fill5', plot1: 'plot6', plot2: 'plot8', color: fillOf(GREEN), title: 'Over Sold Fill 3' },
  { id: 'fill6', plot1: 'plot7', plot2: 'plot9', color: fillOf(RED), title: 'Over Bought Fill 4' },
  { id: 'fill7', plot1: 'plot8', plot2: 'plot10', color: fillOf(GREEN), title: 'Over Sold Fill 4' },
  { id: 'fill8', plot1: 'plot0', plot2: 'plot1', color: fillOf(GRAY), title: 'Middle Fill Up' },
  { id: 'fill9', plot1: 'plot0', plot2: 'plot2', color: fillOf(GRAY), title: 'Middle Fill Down' },
];

export const metadata = {
  title: 'VWAP Stdev Bands v2 Mod',
  shortTitle: 'VWAP Stdev Bands v2 Mod',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<VwapStdevBandsV2ModInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // start = security(tickerid, "D", time); newSession = iff(change(start), 1, 0): never on the first bar
  const start = periodStarts(bars, 'D');

  const myvwap: number[] = new Array(n).fill(NaN);
  const dev: number[] = new Array(n).fill(NaN);
  const prevwap: number[] = new Array(n).fill(NaN);
  let vwapsum = NaN;
  let volumesum = NaN;
  let v2sum = NaN;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const hl2 = (b.high + b.low) / 2;
    const volume = b.volume ?? NaN;
    const newSession = i > 0 && start[i] !== start[i - 1];
    vwapsum = newSession ? hl2 * volume : vwapsum + hl2 * volume;
    volumesum = newSession ? volume : volumesum + volume;
    v2sum = newSession ? volume * hl2 * hl2 : v2sum + volume * hl2 * hl2;
    myvwap[i] = vwapsum / volumesum;
    dev[i] = Math.sqrt(Math.max(v2sum / volumesum - myvwap[i] * myvwap[i], 0));
    prevwap[i] = i === 0 ? NaN : newSession ? myvwap[i - 1] : prevwap[i - 1];
  }

  const shown = (v: number) => (Number.isFinite(v) ? v : NaN);
  const series = (value: (i: number) => number) => bars.map((b, i) => ({ time: b.time, value: shown(value(i)) }));
  const band = (show: boolean, mult: number) => series((i) => (show ? myvwap[i] + mult * dev[i] : NaN));

  // plot(showPrevVWAP ? prevwap : na, color = close > prevwap ? green : red)
  const plot11 = bars.map((b, i) => ({
    time: b.time,
    value: cfg.showPrevVWAP ? shown(prevwap[i]) : NaN,
    color: b.close - prevwap[i] > 1e-10 ? GREEN : RED,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: series((i) => myvwap[i]),
      plot1: band(true, cfg.devUp1),
      plot2: band(true, -cfg.devDn1),
      plot3: band(cfg.showDv2, cfg.devUp2),
      plot4: band(cfg.showDv2, -cfg.devDn2),
      plot5: band(cfg.showDv3, cfg.devUp3),
      plot6: band(cfg.showDv3, -cfg.devDn3),
      plot7: band(cfg.showDv4, cfg.devUp4),
      plot8: band(cfg.showDv4, -cfg.devDn4),
      plot9: band(cfg.showDv5, cfg.devUp5),
      plot10: band(cfg.showDv5, -cfg.devDn5),
      plot11,
    },
    fills: fillConfig.map((f) => ({ plot1: f.plot1, plot2: f.plot2, options: { color: f.color, title: f.title } })),
  };
}

export const VwapStdevBandsV2Mod = { calculate, metadata, defaultInputs, inputConfig, plotConfig, fillConfig };
