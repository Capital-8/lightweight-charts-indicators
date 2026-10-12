/**
 * Breaker Blocks + Order Blocks OverLap ICT [TradingFinder] BBOB
 *
 * Zones where an order block overlaps a breaker block of the same side.
 * - Zigzag: pivot highs and lows (pivot period on both sides) are chained into a zigzag with the types H / L, HH / LH
 *   and HL / LL. A second chain marks each pivot as major ("M") or minor ("m"): a pivot becomes major when the price
 *   closes through the major high or low level, or when it is beyond that level.
 * - Structure: a close crossing the major high (low) level is a bullish (bearish) break of structure when the trend
 *   was the same or unknown, and a change of character when the trend was the opposite.
 * - Order blocks: a break gives a demand (supply) order block on the candle of the last major low (high) or of the
 *   last pivot, moved to the lowest (highest) candle since then: a "main" and a "sub" block for a change of character
 *   and one block for a break of structure. "Refine" narrows the block from the candles around it and the ATR (55)
 *   ("Defensive" keeps the far part of a wide block, "Aggressive" the whole block).
 * - Each order block is a zone (two dashed lines at the distal and proximal prices, a dotted line in the middle and a
 *   fill) that grows one bar at a time until the price reaches its mitigation level or until it is older than the
 *   validity period. Within 4 bars after a block stops, a close beyond its distal price turns it into a breaker block
 *   of the opposite side, which lives until the price reaches its own mitigation level, the validity period ends or
 *   the block of the same call stops again.
 * - Overlapping block: when a new order block overlaps the latest breaker block of the same side, the common price
 *   range is drawn as a zone with its own colour and mitigation level.
 * - "Switching Colors Theme Mode" makes light colours darker ("Light") or dark colours lighter ("Dark").
 * - With "Show All ..." off, only the latest order block and breaker block of each kind are kept. At most 500 lines
 *   and 500 fills are kept.
 * - As in the original, the mitigation level "50 % BB" of the breaker and overlapping blocks matches no level of the
 *   libraries ("50 % OB"): such a block is never stopped by the price.
 *
 * Imported libraries, written in this file: OrderBlockRefiner_TradingFinder (version 2),
 * OrderBlockDrawing_TradingFinder (version 4), OrderBlockOverlappingDrawing (version 1) and
 * Dark_Light_Theme_TradingFinder_Switching_Colors_Library (version 1), all by TFlab.
 *
 * Limit of the port: the alerts (AlertSenderLibrary_TradingFinder and the four alert inputs) give no output.
 *
 * Reference: "Breaker Blocks + Order Blocks OverLap ICT [TradingFinder] BBOB" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import {
  ta, Series, color, callsite, line, linefill, resetDrawings, setDrawingBar, holdDrawing, releaseDrawing,
  type Line, type Linefill, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';

type ThemeMode = 'Off' | 'Light' | 'Dark';
type RefineMethod = 'Defensive' | 'Aggressive';

export interface BreakerBlocksOrderBlocksConfirmBbobAlertInputs {
  /** Pivot Period of Order Blocks Detector */
  pivotPeriod: number;
  /** Order Block Validity Period (Bar) */
  validityPeriod: number;
  /** Mitigation Level OB */
  mitigationOb: 'Proximal' | '50 % OB' | 'Distal';
  /** Mitigation Level BB */
  mitigationBb: 'Proximal' | '50 % BB' | 'Distal';
  /** Mitigation Level OLB */
  mitigationOlb: 'Proximal' | '50 % BB' | 'Distal';
  /** Switching Colors Theme Mode */
  themeMode: ThemeMode;
  /** Show All OB (overlapping blocks) */
  showAllOlb: boolean;
  /** Demand OverLapping Block */
  showDemandOlb: boolean;
  /** Colour of the demand overlapping block */
  demandOlbColor: string;
  /** Supply OverLapping Block */
  showSupplyOlb: boolean;
  /** Colour of the supply overlapping block */
  supplyOlbColor: string;
  /** Show All OB (order blocks) */
  showAllOb: boolean;
  /** Demand Main Order Block */
  showDemandMainOb: boolean;
  /** Colour of the demand main order block */
  demandMainObColor: string;
  /** Demand Sub Order Block */
  showDemandSubOb: boolean;
  /** Colour of the demand sub order block */
  demandSubObColor: string;
  /** Supply Main Order Block */
  showSupplyMainOb: boolean;
  /** Colour of the supply main order block */
  supplyMainObColor: string;
  /** Supply Sub Order Block */
  showSupplySubOb: boolean;
  /** Colour of the supply sub order block */
  supplySubObColor: string;
  /** Show All BB */
  showAllBb: boolean;
  /** Demand Main Breaker Block */
  showDemandMainBb: boolean;
  /** Colour of the demand main breaker block */
  demandMainBbColor: string;
  /** Demand Sub Breaker Block */
  showDemandSubBb: boolean;
  /** Colour of the demand sub breaker block */
  demandSubBbColor: string;
  /** Supply Main Breaker Block */
  showSupplyMainBb: boolean;
  /** Colour of the supply main breaker block */
  supplyMainBbColor: string;
  /** Supply Sub Breaker Block */
  showSupplySubBb: boolean;
  /** Colour of the supply sub breaker block */
  supplySubBbColor: string;
  /** Refine Demand Main */
  refineDemandMain: boolean;
  /** Refine method of the demand main block */
  refineMethodDemandMain: RefineMethod;
  /** Refine Demand Sub. */
  refineDemandSub: boolean;
  /** Refine method of the demand sub block */
  refineMethodDemandSub: RefineMethod;
  /** Refine Supply Main.. */
  refineSupplyMain: boolean;
  /** Refine method of the supply main block */
  refineMethodSupplyMain: RefineMethod;
  /** Refine Supply Sub... */
  refineSupplySub: boolean;
  /** Refine method of the supply sub block */
  refineMethodSupplySub: RefineMethod;
  /** Alerts Name (alerts give no output) */
  alertName: string;
  /** Alert OB & BB OverLapping Mitigation (alerts give no output) */
  alertOverlapping: 'On' | 'Off';
  /** Message Frequency (alerts give no output) */
  frequency: 'All' | 'Once Per Bar' | 'Per Bar Close';
  /** Show Alert time by Time Zone (alerts give no output) */
  alertTimezone: string;
}

export const defaultInputs: BreakerBlocksOrderBlocksConfirmBbobAlertInputs = {
  pivotPeriod: 9,
  validityPeriod: 500,
  mitigationOb: 'Proximal',
  mitigationBb: 'Proximal',
  mitigationOlb: 'Proximal',
  themeMode: 'Light',
  showAllOlb: true,
  showDemandOlb: true,
  demandOlbColor: 'rgba(16, 182, 219, 0.42)',
  showSupplyOlb: true,
  supplyOlbColor: 'rgba(255, 108, 3, 0.45)',
  showAllOb: true,
  showDemandMainOb: false,
  demandMainObColor: 'rgba(60, 176, 68, 0.45)',
  showDemandSubOb: false,
  demandSubObColor: 'rgba(60, 176, 68, 0.45)',
  showSupplyMainOb: false,
  supplyMainObColor: 'rgba(191, 10, 48, 0.45)',
  showSupplySubOb: false,
  supplySubObColor: 'rgba(191, 10, 48, 0.45)',
  showAllBb: true,
  showDemandMainBb: true,
  demandMainBbColor: 'rgba(123, 180, 227, 0.5)',
  showDemandSubBb: true,
  demandSubBbColor: 'rgba(153, 237, 195, 0.4)',
  showSupplyMainBb: true,
  supplyMainBbColor: 'rgba(255, 105, 97, 0.3)',
  showSupplySubBb: true,
  supplySubBbColor: 'rgba(243, 189, 74, 0.4)',
  refineDemandMain: true,
  refineMethodDemandMain: 'Defensive',
  refineDemandSub: true,
  refineMethodDemandSub: 'Defensive',
  refineSupplyMain: true,
  refineMethodSupplyMain: 'Defensive',
  refineSupplySub: true,
  refineMethodSupplySub: 'Defensive',
  alertName: 'OB & BB OverLapping [TradingFinder]',
  alertOverlapping: 'On',
  frequency: 'Once Per Bar',
  alertTimezone: 'UTC',
};

const G_GLOBAL = 'Global Setting';
const G_OLB = 'Disply OverLapping Block';
const G_OB = 'Disply Order Blocks';
const G_BB = 'Disply Breaker Blocks';
const G_REFINE = 'Order Blocks Refinement ';
const G_ALERT = 'Alert';
const METHODS = ['Defensive', 'Aggressive'];

const refineTooltip = (name: string) =>
  `If you want this "${name}, ChoCh Origin" to be refined to display a optimal range,`
  + 'you should select "On" and if you want to see the original'
  + 'range of the block order, you should select "Off".'
  + '\nAlso, if you are a risk taker, you can choose the "Aggressive" Refine method,'
  + 'and if you are risk averse, you can choose the "Defensive" Refine method.';

export const inputConfig: InputConfig[] = [
  { id: 'pivotPeriod', type: 'int', title: 'Pivot Period of Order Blocks Detector', defval: 9, min: 1, group: G_GLOBAL },
  { id: 'validityPeriod', type: 'int', title: 'Order Block Validity Period (Bar)', defval: 500, min: 10, max: 4998, group: G_GLOBAL,
    tooltip: 'You can set the validity period of each Order Block based on the number of candles that have passed since the origin of the Order Block.' },
  { id: 'mitigationOb', type: 'string', title: 'Mitigation Level OB', defval: 'Proximal', options: ['Proximal', '50 % OB', 'Distal'], group: G_GLOBAL,
    tooltip: 'Using this entry, you can determine which level the price reacts to in a Order Block.' },
  { id: 'mitigationBb', type: 'string', title: 'Mitigation Level BB', defval: 'Proximal', options: ['Proximal', '50 % BB', 'Distal'], group: G_GLOBAL,
    tooltip: 'Using this entry, you can determine which level the price reacts to in a Breaker Block.' },
  { id: 'mitigationOlb', type: 'string', title: 'Mitigation Level OLB', defval: 'Proximal', options: ['Proximal', '50 % BB', 'Distal'], group: G_GLOBAL,
    tooltip: 'Using this entry, you can determine which level the price reacts to in a OverLapping Block.' },
  { id: 'themeMode', type: 'string', title: 'Switching Colors Theme Mode', defval: 'Light', options: ['Off', 'Light', 'Dark'], group: G_GLOBAL },

  { id: 'showAllOlb', type: 'bool', title: 'Show All OB', defval: true, group: G_OLB },
  { id: 'showDemandOlb', type: 'bool', title: 'Demand OverLapping Block', defval: true, group: G_OLB, inline: 'DMOLB' },
  { id: 'demandOlbColor', type: 'color', title: '', defval: 'rgba(16, 182, 219, 0.42)', group: G_OLB, inline: 'DMOLB' },
  { id: 'showSupplyOlb', type: 'bool', title: 'Supply OverLapping Block', defval: true, group: G_OLB, inline: 'SSOLB' },
  { id: 'supplyOlbColor', type: 'color', title: '', defval: 'rgba(255, 108, 3, 0.45)', group: G_OLB, inline: 'SSOLB' },

  { id: 'showAllOb', type: 'bool', title: 'Show All OB', defval: true, group: G_OB },
  { id: 'showDemandMainOb', type: 'bool', title: 'Demand Main Order Block', defval: false, group: G_OB, inline: 'DMOB' },
  { id: 'demandMainObColor', type: 'color', title: '', defval: 'rgba(60, 176, 68, 0.45)', group: G_OB, inline: 'DMOB' },
  { id: 'showDemandSubOb', type: 'bool', title: 'Demand  Sub Order Block', defval: false, group: G_OB, inline: 'DSOB' },
  { id: 'demandSubObColor', type: 'color', title: '', defval: 'rgba(60, 176, 68, 0.45)', group: G_OB, inline: 'DSOB' },
  { id: 'showSupplyMainOb', type: 'bool', title: 'Supply  Main  Order Block', defval: false, group: G_OB, inline: 'SMOB' },
  { id: 'supplyMainObColor', type: 'color', title: '', defval: 'rgba(191, 10, 48, 0.45)', group: G_OB, inline: 'SMOB' },
  { id: 'showSupplySubOb', type: 'bool', title: 'Supply  Sub  Order  Block', defval: false, group: G_OB, inline: 'SSOB' },
  { id: 'supplySubObColor', type: 'color', title: '', defval: 'rgba(191, 10, 48, 0.45)', group: G_OB, inline: 'SSOB' },

  { id: 'showAllBb', type: 'bool', title: 'Show All BB', defval: true, group: G_BB },
  { id: 'showDemandMainBb', type: 'bool', title: 'Demand Main Breaker Block', defval: true, group: G_BB, inline: 'DMBB' },
  { id: 'demandMainBbColor', type: 'color', title: '', defval: 'rgba(123, 180, 227, 0.5)', group: G_BB, inline: 'DMBB' },
  { id: 'showDemandSubBb', type: 'bool', title: 'Demand  Sub Breaker Block', defval: true, group: G_BB, inline: 'DSBB' },
  { id: 'demandSubBbColor', type: 'color', title: '', defval: 'rgba(153, 237, 195, 0.4)', group: G_BB, inline: 'DSBB' },
  { id: 'showSupplyMainBb', type: 'bool', title: 'Supply  Main  Breaker Block', defval: true, group: G_BB, inline: 'SMBBS' },
  { id: 'supplyMainBbColor', type: 'color', title: '', defval: 'rgba(255, 105, 97, 0.3)', group: G_BB, inline: 'SMBBS' },
  { id: 'showSupplySubBb', type: 'bool', title: 'Supply  Sub  Breaker  Block', defval: true, group: G_BB, inline: 'SSBB' },
  { id: 'supplySubBbColor', type: 'color', title: '', defval: 'rgba(243, 189, 74, 0.4)', group: G_BB, inline: 'SSBB' },

  { id: 'refineDemandMain', type: 'bool', title: 'Refine Demand Main', defval: true, group: G_REFINE, inline: 'Refine 1',
    tooltip: refineTooltip('Demand Main Order Block') },
  { id: 'refineMethodDemandMain', type: 'string', title: '', defval: 'Defensive', options: METHODS, group: G_REFINE, inline: 'Refine 1' },
  { id: 'refineDemandSub', type: 'bool', title: 'Refine Demand Sub.', defval: true, group: G_REFINE, inline: 'Refine 2',
    tooltip: refineTooltip('Demand Sub Order Block') },
  { id: 'refineMethodDemandSub', type: 'string', title: '', defval: 'Defensive', options: METHODS, group: G_REFINE, inline: 'Refine 2' },
  { id: 'refineSupplyMain', type: 'bool', title: 'Refine Supply Main..', defval: true, group: G_REFINE, inline: 'Refine 4',
    tooltip: refineTooltip('Supply Main Order Block') },
  { id: 'refineMethodSupplyMain', type: 'string', title: '', defval: 'Defensive', options: METHODS, group: G_REFINE, inline: 'Refine 4' },
  { id: 'refineSupplySub', type: 'bool', title: 'Refine Supply Sub...', defval: true, group: G_REFINE, inline: 'Refine 5',
    tooltip: refineTooltip('Supply Sub Order Block') },
  { id: 'refineMethodSupplySub', type: 'string', title: '', defval: 'Defensive', options: METHODS, group: G_REFINE, inline: 'Refine 5' },

  { id: 'alertName', type: 'string', title: 'Alerts Name', defval: 'OB & BB OverLapping [TradingFinder]', group: G_ALERT },
  { id: 'alertOverlapping', type: 'string', title: 'Alert OB & BB OverLapping Mitigation', defval: 'On', options: ['On', 'Off'], group: G_ALERT,
    tooltip: 'If you turn on the Alert OB & BB OverLapping Order Block Mitigation,you can receive alerts and notifications after setting the "Alert".' },
  { id: 'frequency', type: 'string', title: 'Message Frequency', defval: 'Once Per Bar', options: ['All', 'Once Per Bar', 'Per Bar Close'],
    group: G_ALERT,
    tooltip: 'The triggering frequency. Possible values are: All (all function calls trigger the alert), Once Per Bar (the first function call during the bar triggers the alert), '
      + ' Per Bar Close (the function call triggers the alert only when it occurs during the last script iteration of the real-time bar,'
      + ' when it closes). The default is alert.freq_once_per_bar.)' },
  { id: 'alertTimezone', type: 'string', title: 'Show Alert time by Time Zone', defval: 'UTC', group: G_ALERT },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Breaker Blocks + Order Blocks OverLap ICT [TradingFinder] BBOB',
  shortTitle: 'TFlab Overlapping Block',
  overlay: true,
};

/** indicator(max_lines_count = 500): also the limit of the fills */
const MAX_LINES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (a >= b when a - b >= -1e-10); na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** math.min / math.max: na with an na argument */
const minOf = (v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.min(...v));
const maxOf = (v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.max(...v));

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

/** A zone: two edge lines, the middle line and the fill between the edges (the `var` variables of the library) */
interface Zone { distal: Line | null; proximal: Line | null; mid: Line | null; fill: Linefill | null }

/** Outputs of one OBRefiner() call: the bar and the distal / proximal prices of the block */
interface Refined { x: number; distal: number; proximal: number }
/** Breaker block values returned by one OBDrawing() call */
interface Breaker { proximal: number; distal: number }

export function calculate(
  bars: Bar[],
  inputs: Partial<BreakerBlocksOrderBlocksConfirmBbobAlertInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const PP = cfg.pivotPeriod;
  const validity = cfg.validityPeriod;
  /** Series values by bar index; a bar outside the data is na */
  const inRange = (k: number) => k >= 0 && k < n && Number.isInteger(k);
  const H = (k: number) => (inRange(k) ? bars[k].high : NaN);
  const L = (k: number) => (inRange(k) ? bars[k].low : NaN);
  const O = (k: number) => (inRange(k) ? bars[k].open : NaN);
  const C = (k: number) => (inRange(k) ? bars[k].close : NaN);
  const atr = ta.atr(bars, 55).toArray().map((v) => v ?? NaN);
  const pivotHigh = ta.pivothigh(new Series(bars, (b) => b.high), PP, PP).toArray().map((v) => v ?? NaN);
  const pivotLow = ta.pivotlow(new Series(bars, (b) => b.low), PP, PP).toArray().map((v) => v ?? NaN);

  const edgeCss = String(color.rgb(0, 0, 0, 45));
  const midCss = String(color.rgb(0, 0, 0));
  const themed = (css: string) => switchingColorMode(css, cfg.themeMode);

  // Drawings of the library registry (maximum count 500 for the lines and the fills). The libraries keep the lines
  // and the fill of a zone in `var` variables: such a line is never deleted by the maximum count, and a fill is
  // skipped while it is held or less than 5,000 bars after it was released.
  resetDrawings({ line: MAX_LINES });
  /** `variable := object`: the variable holds the new object and releases the one before */
  const assign = <T extends object>(before: T | null, now: T): T => {
    releaseDrawing(before);
    return holdDrawing(now);
  };
  const newLine = (x1: number, y: number, x2: number, css: string, style: 'dashed' | 'dotted'): Line =>
    line.new(x1, y, x2, y, 'bar_index', 'none', css, style, 1);
  const deleteLine = (l: Line | null) => {
    if (l) line.delete(l);
  };
  const setX2 = (l: Line | null, x: number) => {
    if (l) line.set_x2(l, x);
  };
  const noZone = (): Zone => ({ distal: null, proximal: null, mid: null, fill: null });
  /** A new zone on bar `x2` (the current bar), in place of the zone `before` of the same variables */
  const newZone = (before: Zone, index: number, distalPrice: number, proximalPrice: number, x2: number, css: string): Zone => {
    const distal = assign(before.distal, newLine(index, distalPrice, x2, edgeCss, 'dashed'));
    const proximal = assign(before.proximal, newLine(index, proximalPrice, x2, edgeCss, 'dashed'));
    const mid = assign(before.mid, newLine(index, (proximalPrice + distalPrice) / 2, x2, midCss, 'dotted'));
    const fill = assign(before.fill, linefill.new(distal, proximal, css));
    return { distal, proximal, mid, fill };
  };
  const growZone = (z: Zone, x: number) => {
    setX2(z.distal, x);
    setX2(z.proximal, x);
    setX2(z.mid, x);
  };
  const deleteZone = (z: Zone) => {
    deleteLine(z.distal);
    deleteLine(z.proximal);
    deleteLine(z.mid);
    if (z.fill) linefill.delete(z.fill);
  };
  /** The mitigation level of the libraries: "50 % OB" is the only name of the middle level (another name is na) */
  const level = (kind: string, proximal: number, distal: number) =>
    (kind === 'Proximal' ? proximal : kind === 'Distal' ? distal : kind === '50 % OB' ? (proximal + distal) / 2 : NaN);

  /** OrderBlockRefiner_TradingFinder: OBRefiner(), one state per call */
  const obRefiner = (demand: boolean, refineOn: boolean, method: RefineMethod) => {
    let yp12 = 0.0;
    let yd12 = 0.0;
    let xd1 = 0;
    let dMinOpen = 0.0;
    let dMinLow = 0.0;
    let dMinClose = 0.0;
    let dMaxOpen = 0.0;
    let dMaxHigh = 0.0;
    let dMaxLow = 0.0;
    let dMaxClose = 0.0;
    let sMinOpen = 0.0;
    let sMinLow = 0.0;
    let sMinClose = 0.0;
    let sMaxHigh = 0.0;
    let sMaxClose = 0.0;
    let dda = 0.0;
    let dpa = 0.0;
    let sda = 0.0;
    let spa = 0.0;
    let proximalRefine = 0.0;
    let distalRefine = 0.0;

    return (i: number, trigger: boolean, index: number): Refined => {
      const ATR = atr[i];
      const pos = i - index < 4999 ? i - index : 2;
      // history offsets from the current bar
      const o = (k: number) => O(i - k);
      const h = (k: number) => H(i - k);
      const l = (k: number) => L(i - k);
      const c = (k: number) => C(i - k);
      const range = (k: number) => h(k) - l(k);
      const bodyAt = (k: number) => c(k) - o(k);
      const body = bars[i].close - bars[i].open;
      const rangeAfter = range(pos + 1);
      const rangeBlock = range(pos);
      // the candles around the block: 4 once the block is 2 bars old, 3 on the bar after it, 2 on its own bar
      const around = i > index + 1 ? [pos - 2, pos + 1, pos, pos - 1] : i === index + 1 ? [pos + 1, pos, pos - 1]
        : i === index ? [pos + 1, pos] : null;

      if (demand && i > 4) {
        if (around) {
          dMinOpen = minOf(around.map(o));
          dMinLow = minOf(around.map(l));
          dMinClose = minOf(around.map(c));
          dMaxOpen = maxOf(around.map(o));
          dMaxHigh = maxOf(around.map(h));
          dMaxLow = maxOf(around.map(l));
          dMaxClose = maxOf(around.map(c));
        }
        if (le(rangeBlock, ATR * 0.5)) {
          dpa = h(pos);
          dda = dMinLow;
        } else if (gt(rangeBlock, ATR * 0.5) && le(rangeBlock, ATR)) {
          if (gt(body, 0) || eq(body, 0)) {
            dpa = c(pos);
            dda = dMinLow;
          } else if (lt(body, 0)) {
            dpa = o(pos);
            dda = dMinLow;
          }
        } else if (gt(rangeBlock, ATR)) {
          if (i > index) {
            if (lt(l(pos + 1), h(pos))) {
              if (gt(l(pos + 1), l(pos))) {
                dpa = l(pos + 1);
                dda = l(pos);
              } else if (le(l(pos + 1), l(pos))) {
                const b = bodyAt(pos + 1);
                if (gt(b, 0) || eq(b, 0)) {
                  if (gt(rangeAfter, ATR)) {
                    dpa = dMaxOpen;
                    dda = dMinLow;
                  } else if (le(rangeAfter, ATR)) {
                    dpa = dMaxClose;
                    dda = dMinLow;
                  }
                } else if (lt(b, 0)) {
                  if (gt(rangeAfter, ATR) || le(rangeAfter, ATR)) {
                    dpa = dMaxOpen;
                    dda = dMinLow;
                  }
                }
              } else {
                dpa = dMaxOpen;
                dda = dMinLow;
              }
            } else {
              const viaOpen = dMinLow - dMinOpen;
              const viaClose = dMinLow - dMinClose;
              dpa = gt(viaOpen, viaClose) && le(viaOpen, ATR) && ge(viaOpen, ATR * 0.5) ? dMinOpen : dMinClose;
              dda = dMinLow;
            }
          } else if (gt(rangeAfter, ATR)) {
            dpa = dMaxOpen;
            dda = dMinLow;
          } else {
            dpa = dMaxClose;
            dda = dMinLow;
          }
        } else if (gt(body, 0)) {
          dpa = dMaxHigh;
          dda = dMinLow;
        } else if (lt(body, 0)) {
          dpa = dMaxHigh;
          dda = dMaxLow;
        }
      }

      // As in the library, this part also runs for a supply block (with demand values that stay 0)
      if (method === 'Defensive') {
        const size = dpa - dda;
        if (ge(size, ATR * 4)) {
          distalRefine = dda;
          proximalRefine = dpa - size * 0.8;
        } else if (ge(size, ATR * 3) && lt(size, ATR * 4)) {
          distalRefine = dda;
          proximalRefine = dpa - size * 0.7;
        } else if (lt(size, ATR * 3) && ge(size, ATR * 2)) {
          distalRefine = dda;
          proximalRefine = dpa - size * 0.6;
        } else if (lt(size, ATR * 2) && ge(size, ATR * 1.6)) {
          distalRefine = dda;
          proximalRefine = dpa - size * 0.5;
        } else if (lt(size, ATR * 1.6) && gt(size, ATR)) {
          distalRefine = dda;
          proximalRefine = dpa - size * 0.25;
        } else if (le(size, ATR)) {
          distalRefine = dda;
          proximalRefine = dpa;
        }
      } else if (method === 'Aggressive') {
        distalRefine = dda;
        proximalRefine = dpa;
      }
      if (trigger) {
        yp12 = refineOn ? proximalRefine : h(pos);
        yd12 = refineOn ? distalRefine : l(pos);
        xd1 = index;
      }

      if (!demand && i > 4) {
        if (around) {
          sMinOpen = minOf(around.map(o));
          sMinLow = minOf(around.map(l));
          sMinClose = minOf(around.map(c));
          sMaxHigh = maxOf(around.map(h));
          sMaxClose = maxOf(around.map(c));
        }
        if (le(rangeBlock, ATR * 0.5)) {
          spa = l(pos);
          sda = sMaxHigh;
        } else if (gt(rangeBlock, ATR * 0.5) && le(rangeBlock, ATR)) {
          if (gt(body, 0) || eq(body, 0)) {
            spa = c(pos);
            sda = sMaxHigh;
          } else if (lt(body, 0)) {
            spa = o(pos);
            sda = sMaxHigh;
          }
        } else if (gt(rangeBlock, ATR)) {
          if (i > index) {
            if (gt(h(pos - 1), l(pos))) {
              if (gt(h(pos - 1), h(pos))) {
                spa = h(pos - 1);
                sda = h(pos);
              } else if (le(h(pos - 1), h(pos))) {
                const b = bodyAt(pos - 1);
                if (gt(b, 0) || eq(b, 0)) {
                  if (gt(rangeAfter, ATR)) {
                    spa = sMinClose;
                    sda = sMaxHigh;
                  } else if (le(rangeAfter, ATR)) {
                    spa = sMinOpen;
                    sda = sMaxHigh;
                  }
                } else if (lt(b, 0)) {
                  if (gt(rangeAfter, ATR)) {
                    spa = sMinOpen;
                    sda = sMaxHigh;
                  } else if (le(rangeAfter, ATR)) {
                    spa = sMaxClose;
                    sda = sMaxHigh;
                  }
                }
              } else {
                spa = sMinOpen;
                sda = sMaxHigh;
              }
            } else if (!gt(h(pos + 1), l(pos))) {
              const viaOpen = sMaxHigh - sMinOpen;
              const viaClose = sMaxHigh - sMinClose;
              // the second test of the library reads demand values (0 in a supply call): both outcomes are the close
              spa = gt(viaOpen, viaClose) && le(viaOpen, ATR) && ge(viaOpen, ATR * 0.5) ? sMinOpen : sMinClose;
              sda = sMaxHigh;
            } else {
              spa = sMinClose;
              sda = sMaxHigh;
            }
          } else if (gt(rangeAfter, ATR)) {
            spa = sMinClose;
            sda = sMaxHigh;
          } else {
            spa = sMinOpen;
            sda = sMaxHigh;
          }
        } else if (gt(body, 0) || lt(body, 0)) {
          spa = sMinLow;
          sda = sMaxHigh;
        }

        if (method === 'Defensive') {
          const size = sda - spa;
          if (ge(size, ATR * 4)) {
            distalRefine = sda;
            proximalRefine = spa + size * 0.8;
          } else if (ge(size, ATR * 3) && lt(size, ATR * 4)) {
            distalRefine = sda;
            proximalRefine = spa + size * 0.7;
          } else if (lt(size, ATR * 3) && ge(size, ATR * 2)) {
            distalRefine = sda;
            proximalRefine = spa + size * 0.6;
          } else if (lt(size, ATR * 2) && ge(size, ATR * 1.6)) {
            distalRefine = sda;
            proximalRefine = spa + size * 0.5;
          } else if (lt(size, ATR * 1.6) && gt(size, ATR)) {
            distalRefine = sda;
            proximalRefine = spa + size * 0.25;
          } else if (le(size, ATR)) {
            distalRefine = sda;
            proximalRefine = spa;
          }
        } else if (method === 'Aggressive') {
          distalRefine = sda;
          proximalRefine = spa;
        }
        if (trigger) {
          yp12 = refineOn ? proximalRefine : l(pos);
          yd12 = refineOn ? distalRefine : h(pos);
          xd1 = index;
        }
      }
      return { x: xd1, distal: yd12, proximal: yp12 };
    };
  };

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
    // history: Check[1], Check_BB[1], CBB[1..3] (na on the first bars compares false)
    let prevCheck: boolean | null = null;
    let prevCheckBB: boolean | null = null;
    const cbbHistory: boolean[] = [];

    return (i: number, trigger: boolean, block: Refined): Breaker => {
      const { high, low, close } = bars[i];
      const index = block.x;
      const zoneBefore = zone;
      const zoneBBBefore = zoneBB;
      if (trigger) {
        distalPrice = block.distal;
        proximalPrice = block.proximal;
      }
      const ml = level(cfg.mitigationOb, proximalPrice, distalPrice);
      // the level of the breaker block as it was before this bar
      const mlBB = level(cfg.mitigationBb, proximalPriceBB, distalPriceBB);

      if (trigger && show) zone = newZone(zone, index, distalPrice, proximalPrice, i, colorZone);
      if (check) growZone(zone, i + 1);
      if ((demand ? lt(low, ml) : gt(high, ml)) || i - index >= validity) check = false;
      if (trigger) check = true;

      // The block stopped on this bar or on one of the 3 bars before: a close beyond its distal price makes it a
      // breaker block
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
      if (prevCheckBB === true && checkBB) growZone(zoneBB, i + 1);
      if ((demand ? gt(high, mlBB) : lt(low, mlBB)) || i - indexBB >= validity || (prevCheck === true && !check)) {
        checkBB = false;
      }

      // Only the latest block is kept: the block of the bar before is deleted
      if (!cfg.showAllOb && trigger) deleteZone(zoneBefore);
      if (!cfg.showAllBb && triggerBB) deleteZone(zoneBBBefore);

      cbbHistory.unshift(cbb);
      if (cbbHistory.length > 3) cbbHistory.pop();
      prevCheck = check;
      prevCheckBB = checkBB;
      return { proximal: proximalPriceBB, distal: distalPriceBB };
    };
  };

  /** OrderBlockOverlappingDrawing: OBOverlappingDrawing(), one state per call */
  const overlapDrawing = (demand: boolean, show: boolean, colorZone: string) => {
    let trigger = false;
    let distalPrice = 0.0;
    let proximalPrice = 0.0;
    let check = true;
    let zone = noZone();
    let bar = 0;

    return (i: number, origin: boolean, before: Breaker, block: Refined) => {
      const { high, low } = bars[i];
      const index = block.x;
      if (origin && ne(bar, index)) {
        bar = index;
        const { proximal: pPre, distal: dPre } = before;
        const { proximal: pCur, distal: dCur } = block;
        if (demand) {
          if (ge(pCur, pPre) && le(dCur, pPre) && ge(dCur, dPre)) {
            proximalPrice = pPre;
            distalPrice = dCur;
            trigger = true;
          } else if (le(pCur, pPre) && le(dPre, pCur) && le(dCur, dPre)) {
            proximalPrice = pCur;
            distalPrice = dPre;
            trigger = true;
          } else if (le(pCur, pPre) && le(dPre, pCur)) {
            proximalPrice = pCur;
            distalPrice = dCur;
            trigger = true;
          } else {
            trigger = false;
          }
        } else if (ge(dCur, dPre) && ge(dPre, pCur) && le(pPre, pCur)) {
          proximalPrice = pCur;
          distalPrice = dPre;
          trigger = true;
        } else if (ge(dPre, dCur) && le(pPre, dCur) && ge(pPre, pCur)) {
          proximalPrice = pPre;
          distalPrice = dCur;
          trigger = true;
        } else if (ge(dPre, dCur) && ge(pCur, pPre)) {
          proximalPrice = pCur;
          distalPrice = dCur;
          trigger = true;
        }
      }
      const ml = level(cfg.mitigationOlb, proximalPrice, distalPrice);
      if (trigger && show) zone = newZone(zone, index, distalPrice, proximalPrice, i, colorZone);
      if (check) growZone(zone, i + 1);
      if ((demand ? lt(low, ml) : gt(high, ml)) || i - index >= validity) check = false;
      // "Show All OB" of the overlapping blocks has no effect: the library clears its trigger before its test
      if (trigger) {
        check = true;
        trigger = false;
      }
    };
  };

  // Zigzag: type, price and bar of each pivot
  const zzType: string[] = [];
  const zzValue: number[] = [];
  const zzIndex: number[] = [];
  // The same chain with major ("M") and minor ("m") pivots
  const advType: string[] = [];
  const advValue: number[] = [];
  const advIndex: number[] = [];
  let highValue = NaN; // ta.valuewhen(HighPivot, High[PP], 0)
  let lowValue = NaN;
  let highIndex = NaN;
  let lowIndex = NaN;
  let majorHighLevel = NaN;
  let majorLowLevel = NaN;
  let majorHighIndex = NaN;
  let majorLowIndex = NaN;
  let minorHighLevel = NaN;
  let minorLowLevel = NaN;
  let minorHighIndex = NaN;
  let minorLowIndex = NaN;
  let lock0 = true;
  let lock1 = true;
  let lastMHH = 0;
  let lastMLH = 0;
  let lastMLL = 0;
  let lastMHL = 0;
  let lastPivotType: string | null = null;
  let lastPivotIndex = 0;
  let lastPivotIndex02 = 0;
  let bullMajorChoCh = false;
  let bullMajorBoS = false;
  let bearMajorChoCh = false;
  let bearMajorBoS = false;
  let lockBreakM = 0;
  let lockBreakm = 0;
  let externalTrend = 'No Trend';
  let buChMainTrigger = false;
  let buChMainIndex = 0;
  let buChSubTrigger = false;
  let buChSubIndex = 0;
  let buBoSTrigger = false;
  let buBoSIndex = 0;
  let beChMainTrigger = false;
  let beChMainIndex = 0;
  let beChSubTrigger = false;
  let beChSubIndex = 0;
  let beBoSTrigger = false;
  let beBoSIndex = 0;
  let chBuLowest = 0.0;
  let correctBuIndex = 0;
  let correctBuIndexSub = 0;
  let boSBuLowest = 0.0;
  let boSBuLowest02 = 0.0;
  let correctBuBoSIndex = 0;
  let correctBuBoSIndex02 = 0;
  let chBeHighest = 0.0;
  let chBeHighestSub = 0.0;
  let correctBeIndex = 0;
  let correctBeIndexSub = 0;
  // history of expressions: the price and the type of the last zigzag pivot on the bar before
  let prevLastValue: number | null = null;
  let prevLastType: string | null = null;

  const crossHigh = callsite.crossover();
  const crossLow = callsite.crossunder();
  const lowestMLL = callsite.lowest();
  const lowestSub = callsite.lowest();
  const lowestBoS = callsite.lowest();
  const lowestBoS02 = callsite.lowest();
  const highestMHH = callsite.highest();
  const highestSub = callsite.highest();

  const refineMain = obRefiner(true, cfg.refineDemandMain, cfg.refineMethodDemandMain);
  const refineSub = obRefiner(true, cfg.refineDemandSub, cfg.refineMethodDemandSub);
  const refineBoS = obRefiner(true, cfg.refineDemandSub, cfg.refineMethodDemandSub);
  const refineSupplyMain = obRefiner(false, cfg.refineSupplyMain, cfg.refineMethodSupplyMain);
  const refineSupplySub = obRefiner(false, cfg.refineSupplySub, cfg.refineMethodSupplySub);
  const refineSupplyBoS = obRefiner(false, cfg.refineSupplySub, cfg.refineMethodSupplySub);

  const demandMainOb = themed(cfg.demandMainObColor);
  const demandSubOb = themed(cfg.demandSubObColor);
  const supplyMainOb = themed(cfg.supplyMainObColor);
  const supplySubOb = themed(cfg.supplySubObColor);
  const demandMainBb = themed(cfg.demandMainBbColor);
  const demandSubBb = themed(cfg.demandSubBbColor);
  const supplyMainBb = themed(cfg.supplyMainBbColor);
  const supplySubBb = themed(cfg.supplySubBbColor);
  const demandOlb = themed(cfg.demandOlbColor);
  const supplyOlb = themed(cfg.supplyOlbColor);

  // A demand order block becomes a supply breaker block, and a supply order block a demand breaker block
  const drawMain = obDrawing(true, cfg.showDemandMainOb, cfg.showSupplyMainBb, demandMainOb, supplyMainBb);
  const drawSub = obDrawing(true, cfg.showDemandSubOb, cfg.showSupplySubBb, demandSubOb, supplySubBb);
  const drawBoS = obDrawing(true, cfg.showDemandSubOb, cfg.showSupplySubBb, demandSubOb, supplySubBb);
  const drawSupplyMain = obDrawing(false, cfg.showSupplyMainOb, cfg.showDemandMainBb, supplyMainOb, demandMainBb);
  const drawSupplySub = obDrawing(false, cfg.showSupplySubOb, cfg.showDemandSubBb, supplySubOb, demandSubBb);
  const drawSupplyBoS = obDrawing(false, cfg.showSupplySubOb, cfg.showDemandSubBb, supplySubOb, demandSubBb);
  const demandOverlaps = Array.from({ length: 9 }, () => overlapDrawing(true, cfg.showDemandOlb, demandOlb));
  const supplyOverlaps = Array.from({ length: 9 }, () => overlapDrawing(false, cfg.showSupplyOlb, supplyOlb));

  const lastType = () => zzType[zzType.length - 1];
  const lastValue = () => zzValue[zzType.length - 1];
  const pop = () => {
    zzType.pop();
    zzValue.pop();
    zzIndex.pop();
  };
  const pushHigh = () => {
    zzType.push(zzType.length > 2 ? (lt(zzValue[zzType.length - 2], highValue) ? 'HH' : 'LH') : 'H');
    zzValue.push(highValue);
    zzIndex.push(highIndex);
  };
  const pushLow = () => {
    zzType.push(zzType.length > 2 ? (lt(zzValue[zzType.length - 2], lowValue) ? 'HL' : 'LL') : 'L');
    zzValue.push(lowValue);
    zzIndex.push(lowIndex);
  };
  const isOf = (t: string, ...names: string[]) => names.includes(t);
  /** The for loops of the original: bars back from the current bar to the last bar that is not beyond the extreme */
  const countBeyond = (i: number, counter: number, length: number, beyond: (k: number) => boolean): number => {
    let count = counter;
    for (let k = 0; k <= length; k++) count = beyond(i - k) ? count + 1 : 0;
    return count;
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const { low, close } = bars[i];
    const prevLastMLL = lastMLL;
    const prevLastMHH = lastMHH;
    const prevPivotType = lastPivotType;
    const isHighPivot = !isNaN(pivotHigh[i]) && pivotHigh[i] !== 0;
    const isLowPivot = !isNaN(pivotLow[i]) && pivotLow[i] !== 0;
    const highPivot = pivotHigh[i];
    const lowPivot = pivotLow[i];
    if (isHighPivot) {
      highValue = H(i - PP);
      highIndex = i - PP;
    }
    if (isLowPivot) {
      lowValue = L(i - PP);
      lowIndex = i - PP;
    }

    // Zigzag
    if (isHighPivot && isLowPivot) {
      if (zzType.length >= 1) {
        const t = lastType();
        const v = lastValue();
        if (isOf(t, 'L', 'LL')) {
          if (lt(lowPivot, v)) {
            pop();
            pushLow();
          } else {
            pushHigh();
          }
        } else if (isOf(t, 'H', 'HH')) {
          if (gt(highPivot, v)) {
            pop();
            pushHigh();
          } else {
            pushLow();
          }
        } else if (t === 'LH') {
          if (lt(highPivot, v)) {
            pushLow();
          } else if (gt(highPivot, v)) {
            if (lt(close, v)) {
              pop();
              pushHigh();
            } else if (gt(close, v)) {
              pushLow();
            }
          }
        } else if (t === 'HL') {
          if (gt(lowPivot, v)) {
            pushHigh();
          } else if (lt(lowPivot, v)) {
            if (gt(close, v)) {
              pop();
              pushLow();
            } else if (lt(close, v)) {
              pushHigh();
            }
          }
        }
      }
    } else if (isHighPivot) {
      if (zzType.length === 0) {
        zzType.push('H');
        zzValue.push(highValue);
        zzIndex.push(highIndex);
      } else {
        const t = lastType();
        const v = lastValue();
        if (isOf(t, 'L', 'HL', 'LL')) {
          if (gt(highPivot, v)) {
            pushHigh();
          } else if (lt(highPivot, v)) {
            pop();
            pushLow();
          }
        } else if (isOf(t, 'H', 'HH', 'LH')) {
          if (lt(v, highValue)) {
            pop();
            pushHigh();
          }
        }
      }
    } else if (isLowPivot) {
      if (zzType.length === 0) {
        zzType.push('L');
        zzValue.push(lowValue);
        zzIndex.push(lowIndex);
      } else {
        const t = lastType();
        const v = lastValue();
        if (isOf(t, 'H', 'HH', 'LH')) {
          if (lt(lowPivot, v)) {
            pushLow();
          } else if (gt(lowPivot, v)) {
            pop();
            pushHigh();
          }
        } else if (isOf(t, 'L', 'HL', 'LL')) {
          if (gt(v, lowValue)) {
            pop();
            pushLow();
          }
        }
      }
    }

    // First major levels
    if (zzType.length === 2) {
      const first = zzType[0] === 'H' ? 0 : zzType[0] === 'L' ? 1 : -1;
      if (first >= 0) {
        majorHighLevel = zzValue[first];
        majorLowLevel = zzValue[1 - first];
        majorHighIndex = zzIndex[first];
        majorLowIndex = zzIndex[1 - first];
      }
    }

    // The chain with major and minor pivots
    if (zzValue.length === 1 && lock0) {
      advType.splice(0, 0, 'M' + zzType[0]);
      advValue.splice(0, 0, zzValue[0]);
      advIndex.splice(0, 0, zzIndex[0]);
      lock0 = false;
    }
    if (zzValue.length === 2 && lock1) {
      advType.splice(1, 0, 'M' + zzType[1]);
      advValue.splice(1, 0, zzValue[1]);
      advIndex.splice(1, 0, zzIndex[1]);
      lock1 = false;
    }
    if (zzValue.length > 1) {
      const value = zzValue[zzValue.length - 1];
      const type = lastType();
      if (prevLastValue !== null && prevLastType !== null && ne(prevLastValue, value)) {
        // a new last pivot: another side is a new minor pivot, the same side moves the last pivot
        const from = type.length - 1;
        if (prevLastType.substring(from) !== type.substring(from)) {
          advType.push('m' + type);
        } else {
          advValue.pop();
          advIndex.pop();
        }
        advValue.push(value);
        advIndex.push(zzIndex[zzIndex.length - 1]);
      }
      prevLastValue = value;
      prevLastType = type;
    }

    // Major pivots
    if (advValue.length > 1) {
      const last = advType.length - 1;
      const zzLast = () => 'M' + zzType[zzType.length - 1];
      const zzLast2 = () => 'M' + zzType[zzType.length - 2];
      const lowFrom = (k: number) => {
        majorLowLevel = advValue[k];
        majorLowIndex = advIndex[k];
      };
      const highFrom = (k: number) => {
        majorHighLevel = advValue[k];
        majorHighIndex = advIndex[k];
      };
      if (gt(close, majorHighLevel)) {
        const t = advType[last];
        if (t === 'mL') {
          advType[last] = 'ML';
          lowFrom(last);
        } else if (isOf(t, 'mHL', 'mLL')) {
          advType[last] = zzLast();
          lowFrom(last);
        } else if (isOf(t, 'mLH', 'mHH', 'MLH', 'MHH')) {
          if (isOf(advType[last - 1], 'mHL', 'mLL')) {
            advType[last - 1] = zzLast2();
            lowFrom(last - 1);
          }
        }
      }
      if (gt(advValue[last], majorHighLevel)) {
        const t = advType[last];
        if (t === 'mH') {
          advType[last] = 'MH';
          highFrom(last);
        } else if (isOf(t, 'mLH', 'mHH', 'MHH')) {
          advType[last] = zzLast();
          highFrom(last);
        }
      }
      if (lt(close, majorLowLevel)) {
        const t = advType[last];
        if (t === 'mH') {
          advType[last] = 'MH';
          highFrom(last);
        } else if (isOf(t, 'mLH', 'mHH')) {
          advType[last] = zzLast();
          highFrom(last);
        } else if (isOf(t, 'mHL', 'mLL', 'MHL', 'MLL')) {
          if (isOf(advType[last - 1], 'mLH', 'mHH')) {
            advType[last - 1] = zzLast2();
            highFrom(last - 1);
          }
        }
      }
      if (lt(advValue[last], majorLowLevel)) {
        const t = advType[last];
        if (t === 'mL') {
          advType[last] = 'ML';
          lowFrom(last);
        } else if (isOf(t, 'mHL', 'mLL', 'MLL')) {
          advType[last] = zzLast();
          lowFrom(last);
        }
      }
    }

    // The last two pivots, and the bar of the last major pivot of each type
    if (advType.length > 1) {
      const last = advType.length - 1;
      lastPivotType = advType[last];
      lastPivotIndex = advIndex[last];
      lastPivotIndex02 = advIndex[last - 1];
      if (lastPivotType === 'MHH') lastMHH = advIndex[last];
      if (lastPivotType === 'MLH') lastMLH = advIndex[last];
      if (lastPivotType === 'MLL') lastMLL = advIndex[last];
      if (lastPivotType === 'MHL') lastMHL = advIndex[last];
    }

    // Minor levels
    if (advType.length > 2) {
      const last = advType.length - 1;
      const t1 = advType[last];
      const t2 = advType[last - 1];
      const highFrom = (k: number) => {
        minorHighLevel = advValue[k];
        minorHighIndex = advIndex[k];
      };
      const lowFrom = (k: number) => {
        minorLowLevel = advValue[k];
        minorLowIndex = advIndex[k];
      };
      if (t1.indexOf('m') === 0 && t2.indexOf('m') === 0 && advType[last - 2].indexOf('M') === 0) {
        if (t1.indexOf('H') === 2) {
          highFrom(last);
          lowFrom(last - 1);
        } else if (t1.indexOf('L') === 2) {
          highFrom(last - 1);
          lowFrom(last);
        }
      }
      if (gt(close, minorHighLevel)) {
        if (isOf(t1, 'mHL', 'mLL')) lowFrom(last);
        else if (isOf(t1, 'mLH', 'mHH') && isOf(t2, 'mHL', 'mLL')) lowFrom(last - 1);
      }
      if (gt(advValue[last], minorHighLevel) && isOf(t1, 'mLH', 'mHH')) {
        highFrom(last);
        lowFrom(last - 1);
      }
      if (lt(close, minorLowLevel)) {
        if (isOf(t1, 'mLH', 'mHH')) highFrom(last);
        else if (isOf(t1, 'mHL', 'mLL') && isOf(t2, 'mLH', 'mHH')) highFrom(last - 1);
      }
      if (lt(advValue[last], minorLowLevel) && isOf(t1, 'mHL', 'mLL')) {
        lowFrom(last);
        highFrom(last - 1);
      }
      // a major last pivot clears the minor levels
      if (t1.indexOf('M') === 0) {
        minorHighLevel = NaN;
        minorLowLevel = NaN;
        minorHighIndex = NaN;
        minorLowIndex = NaN;
      }
    }

    // Breaks of structure and changes of character of the major levels
    const up = crossHigh(close, majorHighLevel);
    const down = crossLow(close, majorLowLevel);
    if (up && ne(lockBreakM, majorHighIndex)) {
      if (externalTrend === 'No Trend' || externalTrend === 'Up Trend') {
        bullMajorBoS = true;
        lockBreakM = majorHighIndex;
        externalTrend = 'Up Trend';
      } else if (externalTrend === 'Down Trend') {
        bullMajorChoCh = true;
        lockBreakM = majorHighIndex;
        externalTrend = 'Up Trend';
      }
    } else {
      bullMajorChoCh = false;
      bullMajorBoS = false;
    }
    if (down && ne(lockBreakM, majorLowIndex)) {
      if (externalTrend === 'No Trend' || externalTrend === 'Down Trend') {
        bearMajorBoS = true;
        lockBreakM = majorLowIndex;
        externalTrend = 'Down Trend';
      } else if (externalTrend === 'Up Trend') {
        bearMajorChoCh = true;
        lockBreakM = majorLowIndex;
        externalTrend = 'Down Trend';
      }
    } else {
      bearMajorChoCh = false;
      bearMajorBoS = false;
    }
    // The minor levels only move the internal trend and its lock
    if (lt(minorHighLevel, close) && ne(lockBreakm, minorHighIndex)) {
      lockBreakm = minorHighIndex;
    }
    if (gt(minorLowLevel, close) && ne(lockBreakm, minorLowIndex)) {
      lockBreakm = minorLowIndex;
    }

    // Demand blocks of a change of character: the lowest low since the last major lower low and since the pivot
    // before the last one (as in the original, the second value replaces the first one)
    if (advIndex.length > 4) {
      const beyond = (k: number) => gt(L(k), chBuLowest);
      chBuLowest = lowestMLL(low, i - lastMLL, i);
      correctBuIndex = countBeyond(i, correctBuIndex, i - lastMLL, beyond);
      chBuLowest = lowestSub(low, i - lastPivotIndex02, i);
      correctBuIndexSub = countBeyond(i, correctBuIndexSub, i - lastPivotIndex02, beyond);
    }
    if (bullMajorChoCh && advIndex.length > 2) {
      const last02MLL = prevLastMLL;
      const same = lastPivotType !== null && prevPivotType !== null && lastPivotType === prevPivotType;
      const changed = lastPivotType !== null && prevPivotType !== null && lastPivotType !== prevPivotType;
      const atLowest = le(L(lastMLL), chBuLowest);
      const aboveLowest = gt(L(lastMLL), chBuLowest);
      if (lastPivotType === 'MLL' && atLowest) {
        if (same) {
          buChMainTrigger = true;
          buChMainIndex = lastMLL;
        } else if (changed) {
          if (lt(L(last02MLL), L(lastMLL))) {
            buChMainTrigger = true;
            buChMainIndex = last02MLL;
            buChSubTrigger = true;
            buChSubIndex = lastMLL;
          } else if (gt(L(last02MLL), L(lastMLL))) {
            buChMainTrigger = true;
            buChMainIndex = lastMLL;
          }
        }
      } else if (lastPivotType === 'MLL' && aboveLowest) {
        if (same) {
          buChMainTrigger = true;
          buChMainIndex = lastMLL + correctBuIndex;
        } else if (changed) {
          buChMainTrigger = true;
          buChMainIndex = lastMLL + correctBuIndex;
          if (lastMHL > lastMLL + correctBuIndex) {
            buChSubTrigger = true;
            buChSubIndex = lastMLL;
          }
        }
      } else if (lastPivotType === 'MHL' && atLowest) {
        buChMainTrigger = true;
        buChMainIndex = lastMLL;
        buChSubTrigger = true;
        buChSubIndex = lastMHL;
      } else if (lastPivotType === 'MHL' && aboveLowest) {
        buChMainTrigger = true;
        buChMainIndex = lastMLL + correctBuIndex;
        if (lastMHL > lastMLL + correctBuIndex) {
          buChSubTrigger = true;
          buChSubIndex = lastMHL;
        }
      } else if (lastPivotType !== null && isOf(lastPivotType, 'mHH', 'mLH', 'MLH', 'MHH')) {
        if (atLowest) {
          if (lastPivotIndex02 === lastMLL) {
            buChMainTrigger = true;
            buChMainIndex = lastMLL;
          } else if (lastPivotIndex02 > lastMLL) {
            buChMainTrigger = true;
            buChMainIndex = lastMLL;
            // the sub lowest of the original stays 0
            if (le(L(lastPivotIndex02), 0)) {
              buChSubTrigger = true;
              buChSubIndex = lastPivotIndex02;
            } else if (gt(L(lastPivotIndex02), 0)) {
              buChSubTrigger = true;
              buChSubIndex = lastPivotIndex02 + correctBuIndexSub;
            }
          } else if (lastPivotIndex02 < lastMLL) {
            buChMainTrigger = true;
            buChMainIndex = lastMLL;
          }
        } else if (aboveLowest) {
          buChMainTrigger = true;
          buChMainIndex = lastMLL + correctBuIndex;
        }
      }
    } else {
      buChMainTrigger = false;
      buChSubTrigger = false;
    }

    // Demand block of a break of structure
    if (advIndex.length > 10) {
      boSBuLowest = lowestBoS(low, i - lastPivotIndex, i);
      correctBuBoSIndex = countBeyond(i, correctBuBoSIndex, i - lastPivotIndex, (k) => gt(L(k), boSBuLowest));
      boSBuLowest02 = lowestBoS02(low, i - lastPivotIndex02, i);
      correctBuBoSIndex02 = countBeyond(i, correctBuBoSIndex02, i - lastPivotIndex02, (k) => gt(L(k), boSBuLowest02));
    }
    if (bullMajorBoS && advIndex.length > 2) {
      if (lastPivotType !== null && isOf(lastPivotType, 'MHL', 'mHL', 'MLL', 'mLL')) {
        if (le(L(lastPivotIndex), boSBuLowest)) {
          buBoSTrigger = true;
          buBoSIndex = lastPivotIndex;
        }
        if (gt(L(lastPivotIndex), boSBuLowest)) {
          buBoSTrigger = true;
          buBoSIndex = lastPivotIndex + correctBuBoSIndex;
        }
      }
      if (lastPivotType !== null && isOf(lastPivotType, 'mHH', 'mLH', 'MHH', 'MLH')) {
        if (le(L(lastPivotIndex02), boSBuLowest02)) {
          buBoSTrigger = true;
          buBoSIndex = lastPivotIndex02;
        }
        if (gt(L(lastPivotIndex02), boSBuLowest02)) {
          buBoSTrigger = true;
          buBoSIndex = lastPivotIndex02 + correctBuBoSIndex02;
        }
      }
    } else {
      buBoSTrigger = false;
    }

    // Supply blocks of a change of character
    if (advIndex.length > 4) {
      chBeHighest = highestMHH(bars[i].high, i - lastMHH, i);
      correctBeIndex = countBeyond(i, correctBeIndex, i - lastMHH, (k) => lt(H(k), chBeHighest));
      chBeHighestSub = highestSub(bars[i].high, i - lastPivotIndex02, i);
      correctBeIndexSub = countBeyond(i, correctBeIndexSub, i - lastPivotIndex02, (k) => lt(H(k), chBeHighestSub));
    }
    if (bearMajorChoCh && advIndex.length > 2) {
      const last02MHH = prevLastMHH;
      const same = lastPivotType !== null && prevPivotType !== null && lastPivotType === prevPivotType;
      const changed = lastPivotType !== null && prevPivotType !== null && lastPivotType !== prevPivotType;
      const atHighest = ge(H(lastMHH), chBeHighest);
      const belowHighest = lt(H(lastMHH), chBeHighest);
      if (lastPivotType === 'MHH' && atHighest) {
        if (same) {
          beChMainTrigger = true;
          beChMainIndex = lastMHH;
        } else if (changed) {
          if (gt(H(last02MHH), H(lastMHH))) {
            beChMainTrigger = true;
            beChMainIndex = last02MHH;
            beChSubTrigger = true;
            beChSubIndex = lastMHH;
          } else if (lt(H(last02MHH), H(lastMHH))) {
            beChMainTrigger = true;
            beChMainIndex = lastMHH;
          }
        }
      } else if (lastPivotType === 'MHH' && belowHighest) {
        if (same) {
          beChMainTrigger = true;
          beChMainIndex = lastMHH + correctBeIndex;
        } else if (changed) {
          beChMainTrigger = true;
          beChMainIndex = lastMHH + correctBeIndex;
          // as in the original, this test reads the counter of the demand side
          if (lastMLH > lastMHH + correctBuIndex) {
            beChSubTrigger = true;
            beChSubIndex = lastMHH;
          }
        }
      } else if (lastPivotType === 'MLH' && atHighest) {
        beChMainTrigger = true;
        beChMainIndex = lastMHH;
        beChSubTrigger = true;
        beChSubIndex = lastMLH;
      } else if (lastPivotType === 'MLH' && belowHighest) {
        beChMainTrigger = true;
        beChMainIndex = lastMHH + correctBeIndex;
        if (lastMLH > lastMHH + correctBeIndex) {
          beChSubTrigger = true;
          beChSubIndex = lastMLH;
        }
      } else if (lastPivotType !== null && isOf(lastPivotType, 'mLL', 'mHL', 'MHL', 'MLL')) {
        if (atHighest) {
          if (lastPivotIndex02 === lastMHH) {
            beChMainTrigger = true;
            beChMainIndex = lastMHH;
          } else if (lastPivotIndex02 > lastMHH) {
            beChMainTrigger = true;
            beChMainIndex = lastMHH;
            if (ge(H(lastPivotIndex02), chBeHighestSub)) {
              beChSubTrigger = true;
              beChSubIndex = lastPivotIndex02;
            } else if (lt(H(lastPivotIndex02), chBeHighestSub)) {
              beChSubTrigger = true;
              beChSubIndex = lastPivotIndex02 + correctBeIndexSub;
            }
          } else if (lastPivotIndex02 < lastMHH) {
            beChMainTrigger = true;
            beChMainIndex = lastMHH;
          }
        } else if (belowHighest) {
          beChMainTrigger = true;
          beChMainIndex = lastMHH + correctBeIndex;
        }
      }
    } else {
      beChMainTrigger = false;
      beChSubTrigger = false;
    }

    // Supply block of a break of structure. In the original the highest highs of this part are local values and the
    // tests read variables that stay 0: the block is always on the last pivot (or on the pivot before it).
    if (bearMajorBoS && advIndex.length > 2) {
      if (lastPivotType !== null && isOf(lastPivotType, 'mLH', 'mHH', 'MLH', 'MHH') && ge(H(lastPivotIndex), 0)) {
        beBoSTrigger = true;
        beBoSIndex = lastPivotIndex;
      }
      if (lastPivotType !== null && isOf(lastPivotType, 'mLL', 'mHL', 'MLL', 'MHL') && ge(H(lastPivotIndex02), 0)) {
        beBoSTrigger = true;
        beBoSIndex = lastPivotIndex02;
      }
    } else {
      beBoSTrigger = false;
    }

    // Refined blocks
    const main = refineMain(i, buChMainTrigger, buChMainIndex);
    const sub = refineSub(i, buChSubTrigger, buChSubIndex);
    const boS = refineBoS(i, buBoSTrigger, buBoSIndex);
    const supplyMain = refineSupplyMain(i, beChMainTrigger, beChMainIndex);
    const supplySub = refineSupplySub(i, beChSubTrigger, beChSubIndex);
    const supplyBoS = refineSupplyBoS(i, beBoSTrigger, beBoSIndex);

    // Order blocks and breaker blocks
    const supplyBreakers = [drawMain(i, buChMainTrigger, main), drawSub(i, buChSubTrigger, sub), drawBoS(i, buBoSTrigger, boS)];
    const demandBreakers = [
      drawSupplyMain(i, beChMainTrigger, supplyMain), drawSupplySub(i, beChSubTrigger, supplySub),
      drawSupplyBoS(i, beBoSTrigger, supplyBoS),
    ];

    // Overlapping blocks: each new order block against the three breaker blocks of its side
    const demandBlocks: Array<[boolean, Refined]> = [[buChMainTrigger, main], [buChSubTrigger, sub], [buBoSTrigger, boS]];
    const supplyBlocks: Array<[boolean, Refined]> = [
      [beChMainTrigger, supplyMain], [beChSubTrigger, supplySub], [beBoSTrigger, supplyBoS],
    ];
    demandBlocks.forEach(([trigger, block], a) => {
      demandBreakers.forEach((breaker, b) => demandOverlaps[a * 3 + b](i, trigger, breaker, block));
    });
    supplyBlocks.forEach(([trigger, block], a) => {
      supplyBreakers.forEach((breaker, b) => supplyOverlaps[a * 3 + b](i, trigger, breaker, block));
    });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  setDrawingBar(null);
  // a line with an na coordinate (also a deleted line) is not drawn
  const drawn = (l: Line) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1);
  const out = (l: Line): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: 1, style: l.style as 'dashed' | 'dotted',
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().filter(drawn).map(out),
    // a fill whose line was deleted is not drawn
    linefills: linefill.all().filter((f) => drawn(f.line1) && drawn(f.line2))
      .map((f) => ({ line1: out(f.line1), line2: out(f.line2), color: String(f.color) })),
  };
}

export const BreakerBlocksOrderBlocksConfirmBbobAlert = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
