/**
 * FVG & IFVG ICT [TradingFinder] Inversion Fair Value Gap Signal
 *
 * Fair value gaps (FVG) and the inversion gaps (IFVG) that they become once the price goes through them.
 * - Bullish gap: the low is above the high of two bars back. Bearish gap: the high is below the low of two bars
 *   back. The "FVG Filter" keeps only the gaps whose middle bar is large against the ATR (55) and, for the defensive
 *   types, whose bars have large bodies in the direction of the gap.
 * - Each gap is drawn as two dashed lines (distal and proximal price), a dotted line in the middle and a fill. The
 *   zone grows one bar at a time until the price reaches the mitigation level (proximal, middle or distal) or until
 *   it is older than the validity period.
 * - Inversion gap: within 9 bars after a gap stops, a close beyond its distal price turns the zone into a zone of
 *   the opposite side, drawn the same way with the inversion colour. It stops when the price reaches its own
 *   mitigation level, when it is older than the validity period or when a gap of the same side stops.
 * - "Switching Colors Theme Mode" makes light colours darker ("Light") or dark colours lighter ("Dark").
 * - With "Show All ..." off, only the latest zone of each kind is kept. At most 500 lines are kept.
 *
 * Imported libraries, written in this file: FVGDetectorLibrary (version 3), OrderBlockDrawing_TradingFinder
 * (version 3) and Dark_Light_Theme_TradingFinder_Switching_Colors_Library (version 1), all by TFlab.
 *
 * Limit of the port: the alerts (AlertSenderLibrary_TradingFinder and the six alert inputs) give no output.
 *
 * Reference: "FVG & IFVG ICT [TradingFinder] Inversion Fair Value Gap Signal" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import { ta, color, barInterval, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, LinefillData } from '../types';

type MitigationLevel = 'Proximal' | '50 % OB' | 'Distal';
type ThemeMode = 'Off' | 'Light' | 'Dark';
type FilterType = 'Very Aggressive' | 'Aggressive' | 'Defensive' | 'Very Defensive';

export interface FvgIfvgIctInversionFairValueGapSignalInputs {
  /** Show All FVG */
  showAllFvg: boolean;
  /** Show All Inversion FVG */
  showAllIfvg: boolean;
  /** FVG & IFVG Validity Period (Bar) */
  validityPeriod: number;
  /** Switching Colors Theme Mode */
  themeMode: ThemeMode;
  /** Show Bullish FVG */
  showBullFvg: boolean;
  /** Show Bearish FVG */
  showBearFvg: boolean;
  /** Colour of the bullish FVG */
  bullFvgColor: string;
  /** Colour of the bearish FVG */
  bearFvgColor: string;
  /** Mitigation Level FVG */
  mitigationFvg: MitigationLevel;
  /** Show Bearish Inversion FVG */
  showBearIfvg: boolean;
  /** Show Bullish Inversion FVG */
  showBullIfvg: boolean;
  /** Colour of the bearish inversion FVG */
  bearIfvgColor: string;
  /** Colour of the bullish inversion FVG */
  bullIfvgColor: string;
  /** Mitigation Level IFVG */
  mitigationIfvg: MitigationLevel;
  /** FVG Filter */
  fvgFilter: boolean;
  /** Type of the FVG filter */
  fvgFilterType: FilterType;
  /** Alerts Name (alerts give no output) */
  alertName: string;
  /** Alert FVG Mitigation (alerts give no output) */
  alertFvg: 'On' | 'Off';
  /** Alert Inversion FVG Mitigation (alerts give no output) */
  alertIfvg: 'On' | 'Off';
  /** Message Frequency (alerts give no output) */
  frequency: 'All' | 'Once Per Bar' | 'Per Bar Close';
  /** Show Alert time by Time Zone (alerts give no output) */
  alertTimezone: string;
  /** Display More Info (alerts give no output) */
  moreInfo: 'On' | 'Off';
}

export const defaultInputs: FvgIfvgIctInversionFairValueGapSignalInputs = {
  showAllFvg: true,
  showAllIfvg: true,
  validityPeriod: 500,
  themeMode: 'Light',
  showBullFvg: true,
  showBearFvg: true,
  bullFvgColor: 'rgba(76, 175, 79, 0.4)',
  bearFvgColor: 'rgba(255, 82, 82, 0.57)',
  mitigationFvg: '50 % OB',
  showBearIfvg: true,
  showBullIfvg: true,
  bearIfvgColor: 'rgba(255, 82, 82, 0.18)',
  bullIfvgColor: 'rgba(76, 175, 79, 0.15)',
  mitigationIfvg: '50 % OB',
  fvgFilter: true,
  fvgFilterType: 'Very Defensive',
  alertName: 'FVG & IFVG Inversion [TradingFinder]',
  alertFvg: 'On',
  alertIfvg: 'On',
  frequency: 'Once Per Bar',
  alertTimezone: 'UTC',
  moreInfo: 'On',
};

const LEVELS = ['Proximal', '50 % OB', 'Distal'];

export const inputConfig: InputConfig[] = [
  { id: 'showAllFvg', type: 'bool', title: 'Show All FVG', defval: true, group: 'Global Setting' },
  { id: 'showAllIfvg', type: 'bool', title: 'Show All Inversion FVG', defval: true, group: 'Global Setting' },
  { id: 'validityPeriod', type: 'int', title: 'FVG & IFVG Validity Period (Bar)', defval: 500, min: 10, max: 4998, group: 'Global Setting',
    tooltip: 'You can set the validity period of each FVG & IFVG based on the number of candles that have passed since the origin of the Order Block.' },
  { id: 'themeMode', type: 'string', title: 'Switching Colors Theme Mode', defval: 'Light', options: ['Off', 'Light', 'Dark'] },
  { id: 'showBullFvg', type: 'bool', title: ' Show Bullish FVG', defval: true, group: 'FVG', inline: 'DFVG' },
  { id: 'showBearFvg', type: 'bool', title: ' Show Bearish FVG', defval: true, group: 'FVG', inline: 'SFVG' },
  { id: 'bullFvgColor', type: 'color', title: '', defval: 'rgba(76, 175, 79, 0.4)', group: 'FVG', inline: 'DFVG' },
  { id: 'bearFvgColor', type: 'color', title: '', defval: 'rgba(255, 82, 82, 0.57)', group: 'FVG', inline: 'SFVG' },
  { id: 'mitigationFvg', type: 'string', title: 'Mitigation Level FVG', defval: '50 % OB', options: LEVELS, group: 'FVG',
    tooltip: 'Using this entry, you can determine which level the price reacts to in a FVG.' },
  { id: 'showBearIfvg', type: 'bool', title: ' Show Bearish Inversion FVG', defval: true, group: 'Inversion FVG', inline: 'IDFVG' },
  { id: 'showBullIfvg', type: 'bool', title: ' Show Bullish Inversion FVG', defval: true, group: 'Inversion FVG', inline: 'ISFVG' },
  { id: 'bearIfvgColor', type: 'color', title: '', defval: 'rgba(255, 82, 82, 0.18)', group: 'Inversion FVG', inline: 'IDFVG' },
  { id: 'bullIfvgColor', type: 'color', title: '', defval: 'rgba(76, 175, 79, 0.15)', group: 'Inversion FVG', inline: 'ISFVG' },
  { id: 'mitigationIfvg', type: 'string', title: 'Mitigation Level IFVG', defval: '50 % OB', options: LEVELS, group: 'Inversion FVG',
    tooltip: 'Using this entry, you can determine which level the price reacts to in a Inversion FVG.' },
  { id: 'fvgFilter', type: 'bool', title: 'FVG Filter ............', defval: true, group: 'FVG', inline: 'FVG Filter' },
  { id: 'fvgFilterType', type: 'string', title: '', defval: 'Very Defensive',
    options: ['Very Aggressive', 'Aggressive', 'Defensive', 'Very Defensive'], group: 'FVG', inline: 'FVG Filter',
    tooltip: 'If it is "On", this filter will filter "FVGs" based on the width of the Zone.'
      + 'From "Very Aggressive" to "Very Defensive" the width of the "FVG" decreases.' },
  { id: 'alertName', type: 'string', title: 'Alerts Name', defval: 'FVG & IFVG Inversion [TradingFinder]', group: 'Alert' },
  { id: 'alertFvg', type: 'string', title: 'Alert FVG Mitigation', defval: 'On', options: ['On', 'Off'], group: 'Alert',
    tooltip: 'If you turn on the Alert FVG Mitigation,you can receive alerts and notifications after setting the "Alert".' },
  { id: 'alertIfvg', type: 'string', title: 'Alert Inversion FVG Mitigation', defval: 'On', options: ['On', 'Off'], group: 'Alert',
    tooltip: 'If you turn on the Alert Inversion FVG Mitigation,you can receive alerts and notifications after setting the "Alert".' },
  { id: 'frequency', type: 'string', title: 'Message Frequency', defval: 'Once Per Bar', options: ['All', 'Once Per Bar', 'Per Bar Close'],
    group: 'Alert',
    tooltip: 'The triggering frequency. Possible values are: All (all function calls trigger the alert), Once Per Bar (the first function call during the bar triggers the alert), '
      + ' Per Bar Close (the function call triggers the alert only when it occurs during the last script iteration of the real-time bar,'
      + ' when it closes). The default is alert.freq_once_per_bar.)' },
  { id: 'alertTimezone', type: 'string', title: 'Show Alert time by Time Zone', defval: 'UTC', group: 'Alert' },
  { id: 'moreInfo', type: 'string', title: 'Display More Info', defval: 'On', options: ['On', 'Off'], group: 'Alert' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'FVG & IFVG ICT [TradingFinder] Inversion Fair Value Gap Signal',
  shortTitle: 'Inversion FVG TFlab',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (a >= b when a - b >= -1e-10); na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

// ── Dark_Light_Theme_TradingFinder_Switching_Colors_Library: SwitchingColorMode() ──

/** Class of a colour ("rS" + "gS" + "bS") -> type and the factors of the red, green and blue channels */
const COLOUR_CLASSES: Record<string, [type: 'Dark' | 'Light' | 'N', r: number, g: number, b: number]> = {
  r0g0b0: ['Dark', 7, 7, 7], r0g0b1: ['Dark', 2.5, 2.3, 2.1], r0g0b2: ['Dark', 2.2, 2.2, 2.2], r0g0b3: ['Dark', 3, 2.1, 2.2],
  r0g0b4: ['Dark', 2.5, 2, 1.75], r0g0b5: ['Dark', 3.1, 2.1, 1.7], r0g0b6: ['Dark', 3.5, 2.2, 1.25], r0g0b7: ['Dark', 4, 2.5, 1.5],
  r0g1b0: ['Dark', 5, 5, 8], r0g1b1: ['Dark', 3, 1.75, 2.5], r0g1b2: ['Dark', 3.5, 1.75, 2.2], r0g1b3: ['Dark', 3, 1.8, 1.8],
  r0g1b4: ['Dark', 2.5, 1.5, 1.3], r0g1b5: ['Dark', 3, 1.3, 1.3], r0g1b6: ['Dark', 3, 1.3, 1.15], r0g1b7: ['Dark', 4, 1.3, 1],
  r0g2b0: ['N', 1, 1, 1], r0g2b1: ['N', 1, 1, 1], r0g2b2: ['N', 1, 1, 1], r0g2b3: ['N', 1, 1, 1],
  r0g2b4: ['N', 1, 1, 1], r0g2b5: ['N', 1, 1, 1], r0g2b6: ['N', 1, 1, 1], r0g2b7: ['Dark', 1, 1, 1],
  r1g0b0: ['Dark', 2.5, 3, 4], r1g0b1: ['Dark', 3, 3, 3], r1g0b2: ['Dark', 2.75, 2.75, 2.75], r1g0b3: ['Dark', 2.2, 2.2, 2],
  r1g0b4: ['Dark', 2, 2, 1.5], r1g0b5: ['Dark', 2, 2, 1.5], r1g0b6: ['Dark', 1.5, 2, 1.2], r1g0b7: ['N', 1, 1, 1],
  r1g1b0: ['N', 1, 1, 1], r1g1b1: ['N', 1, 1, 1], r1g1b2: ['N', 1, 1, 1], r1g1b3: ['Dark', 1.5, 1.75, 1.5],
  r1g1b4: ['Dark', 1, 1.35, 1.35], r1g1b5: ['N', 1, 1, 1], r1g1b6: ['N', 1, 1, 1], r1g1b7: ['N', 1, 1, 1],
  r1g2b0: ['N', 1, 1, 1], r1g2b1: ['N', 1, 1, 1], r1g2b2: ['N', 1, 1, 1], r1g2b3: ['N', 1, 1, 1],
  r1g2b4: ['N', 1, 1, 1], r1g2b5: ['Light', 0.9, 0.85, 0.85], r1g2b6: ['Light', 0.9, 0.85, 0.9], r1g2b7: ['Light', 0.9, 0.85, 0.8],
  r2g0b0: ['Dark', 1.45, 1.75, 3], r2g0b1: ['Dark', 2, 1.25, 1.25], r2g0b2: ['Dark', 1.75, 2, 2], r2g0b3: ['Dark', 2, 1.5, 1.75],
  r2g0b4: ['Dark', 1.5, 2, 1.5], r2g0b5: ['Dark', 1.25, 1.5, 1.3], r2g0b6: ['Dark', 1.3, 2, 1.2], r2g0b7: ['Dark', 1.5, 3, 1.2],
  r2g1b0: ['Dark', 1.25, 1.25, 1], r2g1b1: ['Dark', 1.75, 1.75, 1.5], r2g1b2: ['Dark', 1.5, 1.5, 1], r2g1b3: ['Light', 0.33, 0.33, 0.33],
  r2g1b4: ['Light', 0.5, 0.5, 0.65], r2g1b5: ['Light', 0.75, 0.75, 0.65], r2g1b6: ['Light', 0.5, 0.75, 0.85], r2g1b7: ['Light', 0.75, 0.75, 1.15],
  r2g2b0: ['Light', 0.9, 0.8, 0.85], r2g2b1: ['Light', 0.8, 0.7, 0.6], r2g2b2: ['Light', 0.7, 0.7, 0.6], r2g2b3: ['Light', 0.75, 0.75, 0.8],
  r2g2b4: ['Light', 0.8, 0.8, 0.8], r2g2b5: ['Light', 0.6, 0.8, 0.7], r2g2b6: ['Light', 0.8, 0.8, 0.8], r2g2b7: ['Light', 0.6, 0.8, 0.8],
  r3g0b0: ['Dark', 1.3, 1.2, 1.7], r3g0b1: ['Dark', 1.3, 1.1, 1.1], r3g0b2: ['Dark', 1.3, 1.8, 1.3], r3g0b3: ['Dark', 1.4, 1.9, 1.4],
  r3g0b4: ['Dark', 1.3, 1.5, 1.2], r3g0b5: ['Dark', 1.25, 1.75, 1.25], r3g0b6: ['Dark', 1.3, 1.75, 1.1], r3g0b7: ['Dark', 1.75, 2.5, 1.1],
  r3g1b0: ['Dark', 1.75, 1.75, 2.5], r3g1b1: ['Dark', 1.55, 1.55, 1.1], r3g1b2: ['Dark', 1.75, 1.75, 1.4], r3g1b3: ['Dark', 1.75, 1.75, 1.75],
  r3g1b4: ['Dark', 1.3, 1.3, 1.5], r3g1b5: ['Dark', 1.3, 1.3, 1.4], r3g1b6: ['Dark', 1.5, 1.5, 1.2], r3g1b7: ['Dark', 1.2, 1.2, 1],
  r3g2b0: ['Light', 0.95, 0.95, 0.95], r3g2b1: ['Light', 0.85, 0.85, 0.85], r3g2b2: ['Light', 0.8, 0.8, 0.9], r3g2b3: ['Light', 0.7, 0.7, 0.8],
  r3g2b4: ['Light', 0.8, 0.8, 0.65], r3g2b5: ['Light', 0.75, 0.8, 0.8], r3g2b6: ['Light', 0.65, 0.75, 0.75], r3g2b7: ['Light', 0.65, 0.75, 0.75],
  r4g0b0: ['N', 1, 1, 1], r4g0b1: ['N', 1, 1, 1], r4g0b2: ['N', 1, 1, 1], r4g0b3: ['N', 1, 1, 1],
  r4g0b4: ['N', 1, 1, 1], r4g0b5: ['N', 1, 1, 1], r4g0b6: ['Light', 0.7, 0.6, 0.7], r4g0b7: ['Light', 0.7, 0.6, 0.7],
  r4g1b0: ['N', 1, 1, 1], r4g1b1: ['N', 1, 1, 1], r4g1b2: ['N', 1, 1, 1], r4g1b3: ['Light', 0.9, 0.9, 0.9],
  r4g1b4: ['Light', 0.85, 0.85, 0.85], r4g1b5: ['Light', 0.65, 0.65, 0.8], r4g1b6: ['Light', 0.6, 0.5, 0.7], r4g1b7: ['Light', 0.7, 0.4, 0.7],
  r4g2b0: ['N', 1, 1, 1], r4g2b1: ['Light', 0.95, 0.95, 0.25], r4g2b2: ['Light', 0.8, 0.7, 0.25], r4g2b3: ['Light', 0.7, 0.7, 0.5],
  r4g2b4: ['Light', 0.9, 0.8, 0.5], r4g2b5: ['Light', 0.9, 0.8, 0.45], r4g2b6: ['Light', 0.5, 0.4, 0.4], r4g2b7: ['Light', 0.4, 0.35, 0.45],
};

/**
 * The colour of a zone for the theme mode: in mode "Light" a light colour is made darker, in mode "Dark" a dark
 * colour is made lighter; the transparency is kept. The class of the red channel is taken from the blue channel, as
 * in the library.
 */
function switchingColorMode(css: string, mode: ThemeMode): string {
  const r = color.r(css) as number;
  const g = color.g(css) as number;
  const b = color.b(css) as number;
  const t = color.t(css) as number;
  const rS = b <= 51 ? 'r0' : b <= 102 ? 'r1' : b <= 153 ? 'r2' : b <= 204 ? 'r3' : 'r4';
  const gS = g <= 85 ? 'g0' : g <= 170 ? 'g1' : 'g2';
  const bS = b <= 32 ? 'b0' : b <= 64 ? 'b1' : b <= 96 ? 'b2' : b <= 128 ? 'b3' : b <= 160 ? 'b4' : b <= 196 ? 'b5' : b <= 224 ? 'b6' : 'b7';
  let type: string;
  let rC = 0;
  let gC = 0;
  let bC = 0;
  if (r < 30 && g < 30 && b < 30) type = 'HardDark';
  else if (r > 220 && g > 220 && b > 220) type = 'HardLight';
  else [type, rC, gC, bC] = COLOUR_CLASSES[rS + gS + bS];

  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  let rNew = r;
  let gNew = g;
  let bNew = b;
  if (type === 'HardDark' && mode === 'Dark') {
    rNew = gNew = bNew = 220;
  } else if (type === 'HardLight' && mode === 'Light') {
    rNew = gNew = bNew = 30;
  } else if (type === 'Dark' && mode === 'Dark') {
    const up = (v: number) => (clamp(v) >= 250 ? clamp(v) - 10 : clamp(v));
    rNew = up(r * rC);
    gNew = up(g * gC);
    bNew = up(b * bC);
  } else if (type === 'Light' && mode === 'Light') {
    const down = (v: number) => (clamp(v) < 15 ? clamp(v) + 10 : clamp(v));
    rNew = down(r * rC);
    gNew = down(g * gC);
    bNew = down(b * bC);
  }
  return String(color.rgb(rNew, gNew, bNew, t));
}

// ── Drawings ──

interface Ln {
  x1: number;
  y: number;
  x2: number;
  color: string;
  style: 'dashed' | 'dotted';
  deleted: boolean;
}
interface Fill {
  line1: Ln;
  line2: Ln;
  color: string;
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FvgIfvgIctInversionFairValueGapSignalInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const O = (i: number) => (i >= 0 ? bars[i].open : NaN);
  const C = (i: number) => (i >= 0 ? bars[i].close : NaN);
  const atr = ta.atr(bars, 55).toArray().map((v) => v ?? NaN);

  const edgeCss = String(color.rgb(0, 0, 0, 45));
  const midCss = String(color.rgb(0, 0, 0));

  // Lines in creation order. When a creation brings the count above max + 5, the oldest are deleted until max
  // remain. A line held by a `var` variable of the script is never deleted by this limit, but it counts.
  const lines: Ln[] = [];
  const fills: Fill[] = [];
  const held = new Map<Ln, number>();
  const hold = (before: Ln | null, now: Ln): Ln => {
    if (before) {
      const k = (held.get(before) ?? 1) - 1;
      if (k > 0) held.set(before, k);
      else held.delete(before);
    }
    held.set(now, (held.get(now) ?? 0) + 1);
    return now;
  };
  const newLine = (x1: number, y: number, x2: number, css: string, style: 'dashed' | 'dotted'): Ln => {
    const o: Ln = { x1, y, x2, color: css, style, deleted: false };
    lines.push(o);
    if (lines.length > MAX_LINES + 5) {
      for (let k = 0; k < lines.length && lines.length > MAX_LINES; ) {
        if (held.has(lines[k])) k++;
        else lines.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const deleteLine = (l: Ln | null) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    lines.splice(lines.indexOf(l), 1);
  };
  const setX2 = (l: Ln | null, x: number) => {
    if (l && !l.deleted) l.x2 = x;
  };

  /** A zone: two edge lines, the middle line and the fill between the edges */
  interface Zone { distal: Ln | null; proximal: Ln | null; mid: Ln | null; fill: Fill | null }
  const noZone = (): Zone => ({ distal: null, proximal: null, mid: null, fill: null });
  const newZone = (before: Zone, index: number, distalPrice: number, proximalPrice: number, x2: number, css: string): Zone => {
    const distal = hold(before.distal, newLine(index, distalPrice, x2, edgeCss, 'dashed'));
    const proximal = hold(before.proximal, newLine(index, proximalPrice, x2, edgeCss, 'dashed'));
    const mid = hold(before.mid, newLine(index, (proximalPrice + distalPrice) / 2, x2, midCss, 'dotted'));
    const fill: Fill = { line1: distal, line2: proximal, color: css, deleted: false };
    fills.push(fill);
    return { distal, proximal, mid, fill };
  };
  const deleteZone = (z: Zone) => {
    deleteLine(z.distal);
    deleteLine(z.proximal);
    deleteLine(z.mid);
    if (z.fill) z.fill.deleted = true;
  };
  const level = (kind: MitigationLevel, proximal: number, distal: number) =>
    (kind === 'Proximal' ? proximal : kind === 'Distal' ? distal : (proximal + distal) / 2);

  /** OrderBlockDrawing_TradingFinder: OBDrawing(), one state per call */
  const obDrawing = (demand: boolean, show: boolean, showBB: boolean, colorZone: string, colorZoneBB: string) => {
    let distalPrice = 0.0;
    let proximalPrice = 0.0;
    let check = true;
    let zone = noZone();
    let distalPriceBB = 0.0;
    let proximalPriceBB = 0.0;
    let indexBB = 0;
    let checkBB = true;
    let zoneBB = noZone();
    // history: Check[1], Check_BB[1], CBB[1..8] (na on the first bars compares false)
    let prevCheck: boolean | null = null;
    let prevCheckBB: boolean | null = null;
    const cbbHistory: boolean[] = [];

    return (i: number, trigger: boolean, distal: number, proximal: number, index: number) => {
      const { high, low, close } = bars[i];
      const zoneBefore = zone;
      const zoneBBBefore = zoneBB;
      if (trigger) {
        distalPrice = distal;
        proximalPrice = proximal;
      }
      const ml = level(cfg.mitigationFvg, proximalPrice, distalPrice);
      // the level of the inversion zone as it was before this bar
      const mlBB = level(cfg.mitigationIfvg, proximalPriceBB, distalPriceBB);

      if (trigger && show) zone = newZone(zone, index, distalPrice, proximalPrice, i, colorZone);
      if (check) {
        setX2(zone.distal, i + 1);
        setX2(zone.proximal, i + 1);
        setX2(zone.mid, i + 1);
      }
      if ((demand ? lt(low, ml) : gt(high, ml)) || i - index >= cfg.validityPeriod) check = false;
      if (trigger) check = true;

      // The zone stopped on this bar or on one of the 8 bars before: a close beyond its distal price inverts it
      const cbb = prevCheck === true && !check;
      if ((cbb || cbbHistory.some((v) => v)) && !checkBB) {
        if (demand ? lt(close, distalPrice) : gt(close, distalPrice)) {
          indexBB = i;
          checkBB = true;
          distalPriceBB = proximalPrice;
          proximalPriceBB = distalPrice;
        }
      }
      let triggerBB = false;
      if (prevCheckBB === false && checkBB && showBB) {
        zoneBB = newZone(zoneBB, indexBB, distalPriceBB, proximalPriceBB, i, colorZoneBB);
        triggerBB = true;
      }
      if (prevCheckBB === true && checkBB) {
        setX2(zoneBB.distal, i + 1);
        setX2(zoneBB.proximal, i + 1);
        setX2(zoneBB.mid, i + 1);
      }
      if ((demand ? gt(high, mlBB) : lt(low, mlBB)) || i - indexBB >= cfg.validityPeriod || (prevCheck === true && !check)) {
        checkBB = false;
      }

      // Only the latest zone is kept: the zone of the bar before is deleted
      if (!cfg.showAllFvg && trigger) deleteZone(zoneBefore);
      if (!cfg.showAllIfvg && triggerBB) deleteZone(zoneBBBefore);

      cbbHistory.unshift(cbb);
      if (cbbHistory.length > 8) cbbHistory.pop();
      prevCheck = check;
      prevCheckBB = checkBB;
    };
  };

  const demandZones = obDrawing(true, cfg.showBullFvg, cfg.showBearIfvg,
    switchingColorMode(cfg.bullFvgColor, cfg.themeMode), switchingColorMode(cfg.bearIfvgColor, cfg.themeMode));
  const supplyZones = obDrawing(false, cfg.showBearFvg, cfg.showBullIfvg,
    switchingColorMode(cfg.bearFvgColor, cfg.themeMode), switchingColorMode(cfg.bullIfvgColor, cfg.themeMode));

  // FVGDetectorLibrary: FVGDetector()
  let ddFvg = 0.0;
  let dpFvg = 0.0;
  let barDFvg = 0;
  let sdFvg = 0.0;
  let spFvg = 0.0;
  let barSFvg = 0;
  const type = cfg.fvgFilterType;
  for (let i = 0; i < n; i++) {
    const { open, high, low, close } = bars[i];
    const range1 = H(i - 1) - L(i - 1);
    const body1 = C(i - 1) - O(i - 1);
    const body2 = C(i - 2) - O(i - 2);
    // body / range ratios (x / 0 is infinite, 0 / 0 is na)
    const ratio0 = Math.abs((close - open) / (high - low));
    const ratio1 = Math.abs(body1 / range1);
    const ratio2 = Math.abs(body2 / (H(i - 2) - L(i - 2)));

    const condition = (bull: boolean): boolean => {
      const gap = bull ? gt(low, H(i - 2)) : lt(high, L(i - 2));
      if (!cfg.fvgFilter) return gap;
      const push = bull ? gt(high, H(i - 1)) : gt(L(i - 1), low);
      const both = bull ? gt(body2, 0) && gt(body1, 0) : lt(body2, 0) && lt(body1, 0);
      if (type === 'Very Aggressive') return gap && push;
      if (type === 'Aggressive') return gap && ge(range1, 1.0 * atr[i]) && push;
      if (type === 'Defensive') return gap && ge(range1, 1.5 * atr[i]) && push && (both || gt(ratio1, 0.7));
      return gap && ge(range1, 1.5 * atr[i]) && push && both && gt(ratio1, 0.7) && gt(ratio2, 0.35) && gt(ratio0, 0.35);
    };
    const dCondition = condition(true);
    const sCondition = condition(false);
    if (dCondition) {
      ddFvg = H(i - 2);
      dpFvg = low;
      barDFvg = i;
    }
    if (sCondition) {
      sdFvg = L(i - 2);
      spFvg = high;
      barSFvg = i;
    }

    demandZones(i, dCondition, ddFvg, dpFvg, barDFvg);
    supplyZones(i, sCondition, sdFvg, spFvg, barSFvg);
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const out = (l: Ln): LineDrawingData => ({
    time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, width: 1, style: l.style,
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.map(out),
    // a fill whose line was deleted is not drawn
    linefills: fills.filter((f) => !f.deleted && !f.line1.deleted && !f.line2.deleted)
      .map((f) => ({ line1: out(f.line1), line2: out(f.line2), color: f.color })),
  };
}

export const FvgIfvgIctInversionFairValueGapSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
