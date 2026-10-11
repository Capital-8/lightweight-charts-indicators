/**
 * Traders Reality Main
 *
 * A set of intraday tools around the PVSRA method (price, volume, support, resistance analysis).
 * - EMAs 5, 13, 50, 200 and 800 of the close, and a cloud around the EMA 50 (a quarter of the standard deviation of
 *   the close over 100 bars on each side).
 * - PVSRA bar colours: a bar is a "vector" candle when its volume is at least twice the average volume of the 10
 *   bars before, or when volume x range is at least the highest of the 10 bars before (green up, red down); a
 *   weaker vector when its volume is at least 1.5 times that average (blue up, violet down); else grey.
 * - Vector candle zones: the body (or the range) of each vector candle is kept as a box extended to the right, once
 *   in the list of zones above price and once in the list below. A zone is removed when price goes through it, and
 *   shrinks when price enters it.
 * - Levels of the previous day and week: high and low (step lines), daily pivot point with the R / S levels and the
 *   M levels (the middles between them), drawn from yesterday to one day after the last bar.
 * - Average ranges: ADR, AWR, AMR and the range levels RD / RW (the simple average of the true range of the last
 *   periods, placed from the high and the low of the current period or from its open), as lines with labels, and a
 *   table with the values in pips.
 * - Market sessions (London, New York, Tokyo, Hong Kong, Sydney, EU Brinks, US Brinks, Frankfurt), with daylight
 *   saving time: a box on the range of the first bar over the whole session (opening range), two lines on the high
 *   and the low of the session so far, and the name of the session.
 * - Weekly psy levels: the high and the low of the first 8 hours of the week (from Saturday 22:00 for crypto, from
 *   Monday 00:00 for forex), and the open of the day.
 *
 * Limits of the port:
 * - The day, week and month values are built from the chart bars. The original reads its own daily, weekly and
 *   monthly bars, which also cover the time before the first chart bar: values that need earlier periods (previous
 *   day and week levels at the start, the average ranges until enough periods are loaded) are na here.
 * - "Override chart symbol?" reads the bars of another symbol, which the chart bars do not have: the port throws an
 *   Error when it is switched on.
 * - At most 500 boxes are kept (the oldest are removed), as in the original.
 *
 * Chart values (third argument): the port reads the exchange time zone (calendar date of a bar, used by the daylight
 * saving rules and the session lengths; UTC without it), the chart timeframe (from the bar spacing without it), the
 * symbol tick, type and currency (pips, psy level type and texts; 0.01, not forex and "USD" without them), and
 * whether the last bar receives live updates (`realtime`: the labels on the right of the last bar for the EMAs, the
 * previous day and week levels and the range texts are only made on a live bar).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * The functions of the imported library "Traders_Reality_Lib" (version 2) by TradersReality are written in this
 * file.
 *
 * Reference: "Traders Reality Main" by TradersReality
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Original pattern formation by plasmapug, rise retrace continuation to the upside by infernix,
 * peshocore and xtech5192; dst auto f-n and psy refactor for dst by xtech5192; Range daily/weekly Hi/Lo added with
 * research contributions from xtech5192.
 */

import { ta, Series, color, math, str, timeframe, time as pineTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BoxData, LabelData, LineDrawingData, TableCellData, TableData } from '../types';
import { chartTimeframe, periodStarts, securityBars } from '../anchor-period';
import { barInterval, barTime } from '../bar-time';
import { currencyOf, mintickOf, symbolTypeOf, timezoneOf, type ChartContext } from '../chart-context';

export interface TradersRealityMainInputs {
  labelOffset: number;
  pivotOffset: number;
  adrOffset: number;
  adrOffset50: number;
  rdOffset: number;
  rdOffset50: number;
  redVectorColor: string;
  greenVectorColor: string;
  violetVectorColor: string;
  blueVectorColor: string;
  regularCandleUpColor: string;
  regularCandleDownColor: string;
  showEmas: boolean;
  labelEmas: boolean;
  oneEmaColor: string;
  twoEmaColor: string;
  threeEmaColor: string;
  fourEmaColor: string;
  fiveEmaColor: string;
  emaCloudColor: string;
  emaCloudBorderColor: string;
  showLevelOnePivotPoints: boolean;
  showLevelTwoPivotPoints: boolean;
  showLevelThreePivotPoints: boolean;
  showPivotLabels: boolean;
  rsStyle: 'Dotted' | 'Dashed' | 'Solid';
  activeM: boolean;
  showMLabels: boolean;
  extendPivots: boolean;
  pivotColor: string;
  pivotLabelColor: string;
  mColor: string;
  mLabelColor: string;
  mStyle: 'Dotted' | 'Dashed' | 'Solid';
  showDayHighLow: boolean;
  showWeekHighLow: boolean;
  showDayHighLowLabels: boolean;
  showADR: boolean;
  showADRDO: boolean;
  showADRLabels: boolean;
  showADRRange: boolean;
  showADR50: boolean;
  adrRange: number;
  adrColor: string;
  adrStyle: 'Dotted' | 'Dashed' | 'Solid';
  showAWR: boolean;
  showAWRWO: boolean;
  showAWRLabels: boolean;
  showAWRRange: boolean;
  showAWR50: boolean;
  awrRange: number;
  awrColor: string;
  awrStyle: 'Dotted' | 'Dashed' | 'Solid';
  showAMR: boolean;
  showAMRMO: boolean;
  showAMRLabels: boolean;
  showAMRRange: boolean;
  showAMR50: boolean;
  amrRange: number;
  amrColor: string;
  amrStyle: 'Dotted' | 'Dashed' | 'Solid';
  showRD: boolean;
  showRDDO: boolean;
  showRDLabels: boolean;
  showRDRange: boolean;
  showRD50: boolean;
  rdRange: number;
  rdColor: string;
  rdStyle: 'Dotted' | 'Dashed' | 'Solid';
  showRW: boolean;
  showRWWO: boolean;
  showRWLabels: boolean;
  showRWRange: boolean;
  showRW50: boolean;
  rwRange: number;
  rwColor: string;
  rwStyle: 'Dotted' | 'Dashed' | 'Solid';
  showAdrTable: boolean;
  showAdrPips: boolean;
  showAdrCurrency: boolean;
  showRDPips: boolean;
  showRDCurrency: boolean;
  choiceAdrTable: 'top_right' | 'top_left' | 'top_center' | 'bottom_right' | 'bottom_left' | 'bottom_center';
  adrTableBgColor: string;
  adrTableTxtColor: string;
  showDailyOpen: boolean;
  showDailyOpenLabel: boolean;
  showAllDailyOpens: boolean;
  dailyOpenColor: string;
  overrideSym: boolean;
  pvsraSym: string;
  showVCZ: boolean;
  zonesMax: number;
  zoneType: 'Body only' | 'Body with wicks';
  zoneUpdateType: 'Body only' | 'Body with wicks';
  borderWidth: number;
  colorOverride: boolean;
  zoneColor: string;
  zoneTransparency: number;
  rectStyle: 'Dashed' | 'Solid';
  showMarkets: boolean;
  showMarketsWeekends: boolean;
  showSession1: boolean;
  showLabel1: boolean;
  showOr1: boolean;
  sess1Label: string;
  sess1Color: string;
  sess1LabelColor: string;
  showSession2: boolean;
  showLabel2: boolean;
  showOr2: boolean;
  sess2Label: string;
  sess2Color: string;
  sess2LabelColor: string;
  showSession3: boolean;
  showLabel3: boolean;
  showOr3: boolean;
  sess3Label: string;
  sess3Color: string;
  sess3LabelColor: string;
  showSession4: boolean;
  showLabel4: boolean;
  showOr4: boolean;
  sess4Label: string;
  sess4Color: string;
  sess4LabelColor: string;
  showSession5: boolean;
  showLabel5: boolean;
  showOr5: boolean;
  sess5Label: string;
  sess5Color: string;
  sess5LabelColor: string;
  showSession6: boolean;
  showLabel6: boolean;
  showOr6: boolean;
  sess6Label: string;
  sess6Color: string;
  sess6LabelColor: string;
  showSession7: boolean;
  showLabel7: boolean;
  showOr7: boolean;
  sess7Label: string;
  sess7Color: string;
  sess7LabelColor: string;
  showSession8: boolean;
  showLabel8: boolean;
  showOr8: boolean;
  sess8Label: string;
  sess8Color: string;
  sess8LabelColor: string;
  showPsyLevels: boolean;
  showPsyLabels: boolean;
  showAllPsy: boolean;
  psyColH: string;
  psyColL: string;
  overridePsyType: boolean;
  psyTypeX: 'crypto' | 'forex';
  showDstTable: boolean;
  choiceDstTable: 'top_right' | 'top_left' | 'top_center' | 'bottom_right' | 'bottom_left' | 'bottom_center';
  dstTableBgColor: string;
  dstTableTxtColor: string;
}

export const defaultInputs: TradersRealityMainInputs = {
  labelOffset: 12,
  pivotOffset: 6,
  adrOffset: 12,
  adrOffset50: 12,
  rdOffset: 24,
  rdOffset50: 24,
  redVectorColor: '#FF5252',
  greenVectorColor: '#00E676',
  violetVectorColor: '#E040FB',
  blueVectorColor: '#2962ff',
  regularCandleUpColor: '#999999',
  regularCandleDownColor: '#4d4d4d',
  showEmas: true,
  labelEmas: false,
  oneEmaColor: '#FEEA4A',
  twoEmaColor: '#FD5457',
  threeEmaColor: '#1FBCD3',
  fourEmaColor: '#FFFFFF',
  fiveEmaColor: '#322290',
  emaCloudColor: 'rgba(155, 47, 174, 0.4)',
  emaCloudBorderColor: 'rgba(18, 137, 123, 0)',
  showLevelOnePivotPoints: false,
  showLevelTwoPivotPoints: false,
  showLevelThreePivotPoints: false,
  showPivotLabels: true,
  rsStyle: 'Dashed',
  activeM: true,
  showMLabels: true,
  extendPivots: false,
  pivotColor: 'rgba(254, 234, 78, 0.5)',
  pivotLabelColor: 'rgba(254, 234, 78, 0.5)',
  mColor: 'rgba(255, 255, 255, 0.5)',
  mLabelColor: 'rgba(255, 255, 255, 0.5)',
  mStyle: 'Dashed',
  showDayHighLow: true,
  showWeekHighLow: true,
  showDayHighLowLabels: true,
  showADR: true,
  showADRDO: false,
  showADRLabels: true,
  showADRRange: false,
  showADR50: false,
  adrRange: 14,
  adrColor: 'rgba(178, 181, 190, 0.5)',
  adrStyle: 'Dotted',
  showAWR: false,
  showAWRWO: false,
  showAWRLabels: true,
  showAWRRange: false,
  showAWR50: false,
  awrRange: 4,
  awrColor: 'rgba(255, 152, 0, 0.5)',
  awrStyle: 'Dotted',
  showAMR: false,
  showAMRMO: false,
  showAMRLabels: true,
  showAMRRange: false,
  showAMR50: false,
  amrRange: 6,
  amrColor: 'rgba(255, 82, 82, 0.5)',
  amrStyle: 'Dotted',
  showRD: false,
  showRDDO: false,
  showRDLabels: true,
  showRDRange: false,
  showRD50: false,
  rdRange: 15,
  rdColor: 'rgba(255, 82, 82, 0.7)',
  rdStyle: 'Solid',
  showRW: false,
  showRWWO: false,
  showRWLabels: true,
  showRWRange: false,
  showRW50: false,
  rwRange: 13,
  rwColor: 'rgba(41, 98, 255, 0.7)',
  rwStyle: 'Solid',
  showAdrTable: true,
  showAdrPips: true,
  showAdrCurrency: false,
  showRDPips: false,
  showRDCurrency: false,
  choiceAdrTable: 'top_right',
  adrTableBgColor: 'rgba(93, 96, 107, 0.3)',
  adrTableTxtColor: '#1FBCD3',
  showDailyOpen: true,
  showDailyOpenLabel: true,
  showAllDailyOpens: false,
  dailyOpenColor: '#FEEA4E',
  overrideSym: false,
  pvsraSym: 'INDEX:BTCUSD',
  showVCZ: true,
  zonesMax: 500,
  zoneType: 'Body only',
  zoneUpdateType: 'Body with wicks',
  borderWidth: 0,
  colorOverride: true,
  zoneColor: 'rgba(255, 230, 75, 0.1)',
  zoneTransparency: 90,
  rectStyle: 'Dashed',
  showMarkets: true,
  showMarketsWeekends: false,
  showSession1: true,
  showLabel1: true,
  showOr1: true,
  sess1Label: 'London',
  sess1Color: 'rgba(120, 123, 134, 0.25)',
  sess1LabelColor: '#787B86',
  showSession2: true,
  showLabel2: true,
  showOr2: true,
  sess2Label: 'NewYork',
  sess2Color: 'rgba(251, 86, 91, 0.25)',
  sess2LabelColor: 'rgba(253, 84, 87, 0.75)',
  showSession3: true,
  showLabel3: true,
  showOr3: true,
  sess3Label: 'Tokyo',
  sess3Color: 'rgba(80, 174, 85, 0.25)',
  sess3LabelColor: 'rgba(80, 174, 85, 0.75)',
  showSession4: true,
  showLabel4: true,
  showOr4: true,
  sess4Label: 'HongKong',
  sess4Color: 'rgba(128, 127, 23, 0.25)',
  sess4LabelColor: 'rgba(128, 127, 23, 0.75)',
  showSession5: true,
  showLabel5: true,
  showOr5: true,
  sess5Label: 'Sydney',
  sess5Color: 'rgba(37, 228, 123, 0.25)',
  sess5LabelColor: 'rgba(37, 228, 123, 0.75)',
  showSession6: true,
  showLabel6: true,
  showOr6: true,
  sess6Label: 'EU Brinks',
  sess6Color: 'rgba(255, 255, 255, 0.35)',
  sess6LabelColor: 'rgba(255, 255, 255, 0.75)',
  showSession7: true,
  showLabel7: true,
  showOr7: true,
  sess7Label: 'US Brinks',
  sess7Color: 'rgba(255, 255, 255, 0.35)',
  sess7LabelColor: 'rgba(255, 255, 255, 0.75)',
  showSession8: false,
  showLabel8: true,
  showOr8: true,
  sess8Label: 'Frankfurt',
  sess8Color: 'rgba(253, 152, 39, 0.25)',
  sess8LabelColor: 'rgba(253, 152, 39, 0.75)',
  showPsyLevels: true,
  showPsyLabels: true,
  showAllPsy: false,
  psyColH: 'rgba(255, 152, 0, 0.7)',
  psyColL: 'rgba(255, 152, 0, 0.7)',
  overridePsyType: false,
  psyTypeX: 'crypto',
  showDstTable: false,
  choiceDstTable: 'bottom_center',
  dstTableBgColor: 'rgba(93, 96, 107, 0.3)',
  dstTableTxtColor: '#1FBCD3',
};

const G0 = 'Label offsets';
const G1 = 'PVSRA Colors';
const G2 = 'EMAs';
const G3 = 'Pivot Points';
const G4 = 'Yesterday\'s and Last Week\'s High/low';
const G5 = 'Average Daily Range - ADR';
const G6 = 'Average Weekly Range - AWR';
const G7 = 'Average Monthly Range - AMR';
const G8 = 'Range Daily Hi/Lo - RD Hi/Lo';
const G9 = 'Range Weekly Hi/Lo - RW Hi/Lo';
const G10 = 'ADR/ADRx3/AWR/AMR Table';
const G11 = 'Daily Open';
const G12 = 'PVSRA Override';
const G13 = 'Vector Candle Zones';
const G14 = 'Market sessions';
const G15 = 'Market session: London (0800-1630 UTC+0) - DST Aware';
const G16 = 'Market session: New York (1430-2100 UTC+0) - DST Aware';
const G17 = 'Market session: Tokyo (0000-0600 UTC+0) - DST Aware';
const G18 = 'Market session: Hong Kong (0130-0800 UTC+0) - DST Aware';
const G19 = 'Market session: Sydney (NZX+ASX 2200-0600 UTC+0) - DST Aware';
const G20 = 'Market session: EU Brinks (0800-0900 UTC+0) - DST Aware';
const G21 = 'Market session: US Brinks (1400-1500 UTC+0) - DST Aware';
const G22 = 'Market session: Frankfurt (0700-1630 UTC+0) - DST Aware';
const G23 = 'Weekly Psy Levels (valid tf 1h/30min/15min/5min/3min/1min)';
const G24 = 'Daylight Saving Time Info (DST)';

export const inputConfig: InputConfig[] = [
  { id: 'labelOffset', type: 'int', title: 'General', defval: 12, inline: 'labeloffset1', group: G0 },
  { id: 'pivotOffset', type: 'int', title: 'Pivots', defval: 6, inline: 'labeloffset1', group: G0 },
  { id: 'adrOffset', type: 'int', title: 'ADR', defval: 12, inline: 'labeloffset1', group: G0 },
  { id: 'adrOffset50', type: 'int', title: '50% ADR', defval: 12, inline: 'labeloffset1', group: G0 },
  { id: 'rdOffset', type: 'int', title: 'RD/W', defval: 24, inline: 'labeloffset1', group: G0 },
  { id: 'rdOffset50', type: 'int', title: '50% RD/W', defval: 24, inline: 'labeloffset1', group: G0 },
  { id: 'redVectorColor', type: 'color', title: 'Vector: Red', defval: '#FF5252', inline: 'vectors', group: G1 },
  { id: 'greenVectorColor', type: 'color', title: 'Green', defval: '#00E676', inline: 'vectors', group: G1 },
  { id: 'violetVectorColor', type: 'color', title: 'Violet', defval: '#E040FB', inline: 'vectors', group: G1 },
  {
    id: 'blueVectorColor', type: 'color', title: 'Blue', defval: '#2962ff', inline: 'vectors', group: G1,
    tooltip: 'Bull bars are green and bear bars are red when the bar is with volume >= 200% of the average volume of the 10 previous bars, or bars where the product of candle spread x candle volume is >= the highest for the 10 previous bars.\n Bull bars are blue and bear are violet when the bar is with with volume >= 150% of the average volume of the 10 previous bars.',
  },
  { id: 'regularCandleUpColor', type: 'color', title: 'Regular: Up Candle', defval: '#999999', inline: 'nonVectors', group: G1 },
  {
    id: 'regularCandleDownColor', type: 'color', title: 'Down Candle', defval: '#4d4d4d', inline: 'nonVectors', group: G1,
    tooltip: 'Bull bars are light gray and bear are dark gray when none of the red/green/blue/violet vector conditions are met.',
  },
  { id: 'showEmas', type: 'bool', title: 'Show EMAs?', defval: true, inline: 'showemas', group: G2 },
  { id: 'labelEmas', type: 'bool', title: 'EMA Labels?', defval: false, inline: 'showemas', group: G2 },
  { id: 'oneEmaColor', type: 'color', title: 'EMA Color: 5', defval: '#FEEA4A', inline: 'emacolors', group: G2 },
  { id: 'twoEmaColor', type: 'color', title: '13', defval: '#FD5457', inline: 'emacolors', group: G2 },
  { id: 'threeEmaColor', type: 'color', title: '50', defval: '#1FBCD3', inline: 'emacolors', group: G2 },
  { id: 'fourEmaColor', type: 'color', title: '200', defval: '#FFFFFF', inline: 'emacolors', group: G2 },
  { id: 'fiveEmaColor', type: 'color', title: '800', defval: '#322290', inline: 'emacolors', group: G2 },
  { id: 'emaCloudColor', type: 'color', title: 'EMA Cloud', defval: 'rgba(155, 47, 174, 0.4)', inline: 'emacloud', group: G2 },
  { id: 'emaCloudBorderColor', type: 'color', title: 'Border', defval: 'rgba(18, 137, 123, 0)', inline: 'emacloud', group: G2 },
  { id: 'showLevelOnePivotPoints', type: 'bool', title: 'Show Level: 1 R/S?', defval: false, inline: 'pivotlevels', group: G3 },
  { id: 'showLevelTwoPivotPoints', type: 'bool', title: '2 R/S?', defval: false, inline: 'pivotlevels', group: G3 },
  { id: 'showLevelThreePivotPoints', type: 'bool', title: ' 3 R/S?', defval: false, inline: 'pivotlevels', group: G3 },
  { id: 'showPivotLabels', type: 'bool', title: 'Show labels?', defval: true, inline: 'pivotlevels', group: G3 },
  { id: 'rsStyle', type: 'string', title: 'R/S Levels Line Style', defval: 'Dashed', options: ['Dotted', 'Dashed', 'Solid'], inline: 'pivotcolorsRS', group: G3 },
  { id: 'activeM', type: 'bool', title: 'Show M levels?', defval: true, inline: 'mlevels', group: G3 },
  { id: 'showMLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'mlevels', group: G3 },
  { id: 'extendPivots', type: 'bool', title: 'Extend lines in both directions?', defval: false, group: G3 },
  { id: 'pivotColor', type: 'color', title: 'Colors: Pivot Point', defval: 'rgba(254, 234, 78, 0.5)', inline: 'pivotcolors', group: G3 },
  { id: 'pivotLabelColor', type: 'color', title: 'Pivot Point Label', defval: 'rgba(254, 234, 78, 0.5)', inline: 'pivotcolors', group: G3 },
  { id: 'mColor', type: 'color', title: 'Colors: M Levels', defval: 'rgba(255, 255, 255, 0.5)', inline: 'pivotcolors1', group: G3 },
  { id: 'mLabelColor', type: 'color', title: 'M Levels Label', defval: 'rgba(255, 255, 255, 0.5)', inline: 'pivotcolors1', group: G3 },
  { id: 'mStyle', type: 'string', title: 'M Levels Line Style', defval: 'Dashed', options: ['Dotted', 'Dashed', 'Solid'], inline: 'pivotcolors2', group: G3 },
  { id: 'showDayHighLow', type: 'bool', title: 'Show Hi/Lo: Daily?', defval: true, inline: 'highlow', group: G4 },
  { id: 'showWeekHighLow', type: 'bool', title: 'Weekly?', defval: true, inline: 'highlow', group: G4 },
  { id: 'showDayHighLowLabels', type: 'bool', title: 'Show labels?', defval: true, inline: 'highlow', group: G4 },
  { id: 'showADR', type: 'bool', title: 'Show ADR?', defval: true, inline: 'adr', group: G5 },
  {
    id: 'showADRDO', type: 'bool', title: 'Use Daily Open (DO) calc?', defval: false, inline: 'adr', group: G5,
    tooltip: 'Measure the ADR from the daily open. This will make the ADR static throughout the day. ADR is usually measured taking today high and low. Since todays high and low will change throughout the day, some might prefer to have a static range instead.',
  },
  { id: 'showADRLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'adr1', group: G5 },
  { id: 'showADRRange', type: 'bool', title: 'Range label?', defval: false, inline: 'adr1', group: G5 },
  { id: 'showADR50', type: 'bool', title: 'Show 50% ADR?', defval: false, inline: 'adr1', group: G5 },
  {
    id: 'adrRange', type: 'int', title: 'ADR length (days)?', defval: 14, min: 1, max: 31, step: 1, inline: 'adr2', group: G5,
    tooltip: 'Defaults taken from mt4. This defines how many days back to take into consideration when calculating the ADR',
  },
  { id: 'adrColor', type: 'color', title: 'ADR Color', defval: 'rgba(178, 181, 190, 0.5)', inline: 'adr3', group: G5 },
  { id: 'adrStyle', type: 'string', title: 'ADR Line Style', defval: 'Dotted', options: ['Dotted', 'Dashed', 'Solid'], inline: 'adr3', group: G5 },
  { id: 'showAWR', type: 'bool', title: 'Show AWR?', defval: false, inline: 'awr', group: G6 },
  {
    id: 'showAWRWO', type: 'bool', title: 'Use Weekly Open (WO) calc?', defval: false, inline: 'awr', group: G6,
    tooltip: 'Measure the AWR from the weekly open. This will make the AWR static throughout the week. AWR is usually measured taking this weeks high and low. Since this weeks high and low will change throughout the week, some might prefer to have a static range instead.',
  },
  { id: 'showAWRLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'awr1', group: G6 },
  { id: 'showAWRRange', type: 'bool', title: 'Range label?', defval: false, inline: 'awr1', group: G6 },
  { id: 'showAWR50', type: 'bool', title: 'Show 50% AWR?', defval: false, inline: 'awr1', group: G6 },
  {
    id: 'awrRange', type: 'int', title: 'AWR length (weeks)?', defval: 4, min: 1, max: 52, step: 1, inline: 'awr2', group: G6,
    tooltip: 'Defaults taken from mt4. This defines how many weeks back to take into consideration when calculating the AWR',
  },
  { id: 'awrColor', type: 'color', title: 'AWR Color', defval: 'rgba(255, 152, 0, 0.5)', inline: 'awr3', group: G6 },
  { id: 'awrStyle', type: 'string', title: 'AWR Line Style', defval: 'Dotted', options: ['Dotted', 'Dashed', 'Solid'], inline: 'awr3', group: G6 },
  { id: 'showAMR', type: 'bool', title: 'Show AMR?', defval: false, inline: 'amr', group: G7 },
  {
    id: 'showAMRMO', type: 'bool', title: 'Use Monthly Open (MO) calc?', defval: false, inline: 'amr', group: G7,
    tooltip: 'Measure the AMR from the monthly open. This will make the AMR static throughout the month. AMR is usually measured taking this months high and low. Since this months high and low will change throughout the month, some might prefer to have a static range instead.',
  },
  { id: 'showAMRLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'amr1', group: G7 },
  { id: 'showAMRRange', type: 'bool', title: 'Range label?', defval: false, inline: 'amr1', group: G7 },
  { id: 'showAMR50', type: 'bool', title: 'Show 50% AMR?', defval: false, inline: 'amr1', group: G7 },
  {
    id: 'amrRange', type: 'int', title: 'AMR length (months)?', defval: 6, min: 1, max: 12, step: 1, inline: 'amr2', group: G7,
    tooltip: 'Defaults taken from mt4. This defines how many months back to take into consideration when calculating the AMR',
  },
  { id: 'amrColor', type: 'color', title: 'AMR Color', defval: 'rgba(255, 82, 82, 0.5)', inline: 'amr3', group: G7 },
  { id: 'amrStyle', type: 'string', title: 'AMR Line Style', defval: 'Dotted', options: ['Dotted', 'Dashed', 'Solid'], inline: 'amr3', group: G7 },
  { id: 'showRD', type: 'bool', title: 'Show RD?', defval: false, inline: 'rd', group: G8 },
  {
    id: 'showRDDO', type: 'bool', title: 'Use Daily Open (DO) calc?', defval: false, inline: 'rd', group: G8,
    tooltip: 'Measure the RD from the daily open. This will make the RD static throughout the day. RD is usually measured taking todays high and low. Since today high and low will change throughout the day, some might prefer to have a static range instead.',
  },
  { id: 'showRDLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'rd1', group: G8 },
  { id: 'showRDRange', type: 'bool', title: 'Range label?', defval: false, inline: 'rd1', group: G8 },
  { id: 'showRD50', type: 'bool', title: 'Show 50% RD?', defval: false, inline: 'rd1', group: G8 },
  {
    id: 'rdRange', type: 'int', title: 'RD length (days)?', defval: 15, min: 1, max: 31, step: 1, inline: 'rd2', group: G8,
    tooltip: 'Defaults taken from Trader At Home PVSRA documentation. This defines how many days back to take into consideration when calculating the RD',
  },
  { id: 'rdColor', type: 'color', title: 'RD Color', defval: 'rgba(255, 82, 82, 0.7)', inline: 'rd3', group: G8 },
  { id: 'rdStyle', type: 'string', title: 'RD Line Style', defval: 'Solid', options: ['Dotted', 'Dashed', 'Solid'], inline: 'rd3', group: G8 },
  { id: 'showRW', type: 'bool', title: 'Show RW?', defval: false, inline: 'rw', group: G9 },
  {
    id: 'showRWWO', type: 'bool', title: 'Use Weekly Open (WO) calc?', defval: false, inline: 'rw', group: G9,
    tooltip: 'Measure the RW from the weekly open. This will make the RW static throughout the week. RW is usually measured taking this weeks high and low. Since this weeks high and low will change throughout the week, some might prefer to have a static range instead.',
  },
  { id: 'showRWLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'rw1', group: G9 },
  { id: 'showRWRange', type: 'bool', title: 'Range label?', defval: false, inline: 'rw1', group: G9 },
  { id: 'showRW50', type: 'bool', title: 'Show 50% RW?', defval: false, inline: 'rw1', group: G9 },
  {
    id: 'rwRange', type: 'int', title: 'RW length (weeks)?', defval: 13, min: 1, max: 52, step: 1, inline: 'rw2', group: G9,
    tooltip: 'Defaults taken from Trader At Home PVSRA documentation. This defines how many weeks back to take into consideration when calculating the RW',
  },
  { id: 'rwColor', type: 'color', title: 'RW Color', defval: 'rgba(41, 98, 255, 0.7)', inline: 'rw3', group: G9 },
  { id: 'rwStyle', type: 'string', title: 'RW Line Style', defval: 'Solid', options: ['Dotted', 'Dashed', 'Solid'], inline: 'rw3', group: G9 },
  { id: 'showAdrTable', type: 'bool', title: 'Show ADR Table', defval: true, inline: 'adrt', group: G10 },
  { id: 'showAdrPips', type: 'bool', title: 'Show ADR PIPS', defval: true, inline: 'adrt', group: G10 },
  { id: 'showAdrCurrency', type: 'bool', title: 'Show ADR Currency', defval: false, inline: 'adrt', group: G10 },
  { id: 'showRDPips', type: 'bool', title: 'Show RD PIPS', defval: false, inline: 'adrt', group: G10 },
  { id: 'showRDCurrency', type: 'bool', title: 'Show RD Currency', defval: false, inline: 'adrt', group: G10 },
  { id: 'choiceAdrTable', type: 'string', title: 'ADR Table postion', defval: 'top_right', options: ['top_right', 'top_left', 'top_center', 'bottom_right', 'bottom_left', 'bottom_center'], inline: 'adrt', group: G10 },
  { id: 'adrTableBgColor', type: 'color', title: 'ADR Table: Background Color', defval: 'rgba(93, 96, 107, 0.3)', inline: 'adrtc', group: G10 },
  { id: 'adrTableTxtColor', type: 'color', title: 'Text Color', defval: '#1FBCD3', inline: 'adrtc', group: G10 },
  { id: 'showDailyOpen', type: 'bool', title: 'Show: line ?', defval: true, inline: 'dopenconf', group: G11 },
  { id: 'showDailyOpenLabel', type: 'bool', title: 'Label?', defval: true, inline: 'dopenconf', group: G11 },
  { id: 'showAllDailyOpens', type: 'bool', title: 'Show historical daily opens?', defval: false, inline: 'dopenconf', group: G11 },
  { id: 'dailyOpenColor', type: 'color', title: 'Daily Open Color', defval: '#FEEA4E', inline: 'dopenconf1', group: G11 },
  { id: 'overrideSym', type: 'bool', title: 'Override chart symbol?', defval: false, inline: 'pvsra', group: G12 },
  {
    id: 'pvsraSym', type: 'string', title: '', defval: 'INDEX:BTCUSD', inline: 'pvsra', group: G12,
    tooltip: 'You can use INDEX:BTCUSD or you can combine multiple feeds, for example BINANCE:BTCUSDT+COINBASE:BTCUSD. Note that adding too many will slow things down.',
  },
  { id: 'showVCZ', type: 'bool', title: 'Show VCZ?', defval: true, inline: 'vczOn', group: G13 },
  { id: 'zonesMax', type: 'int', title: 'Maximum zones to draw', defval: 500, inline: 'vczOn', group: G13 },
  { id: 'zoneType', type: 'string', title: 'Zone top/bottom is defined with: ', defval: 'Body only', options: ['Body only', 'Body with wicks'], group: G13 },
  { id: 'zoneUpdateType', type: 'string', title: 'Zones are cleared using candle: ', defval: 'Body with wicks', options: ['Body only', 'Body with wicks'], group: G13 },
  { id: 'borderWidth', type: 'int', title: 'Zone border width', defval: 0, group: G13 },
  { id: 'colorOverride', type: 'bool', title: 'Override color?', defval: true, inline: 'vcz1', group: G13 },
  {
    id: 'zoneColor', type: 'color', title: 'Color', defval: 'rgba(255, 230, 75, 0.1)', inline: 'vcz1', group: G13,
    tooltip: 'the vector candle zones color to use if you dont not want to use the PVSRA Candle Colors.',
  },
  {
    id: 'zoneTransparency', type: 'int', title: 'Zone Transperancy', defval: 90, min: 0, max: 100, group: G13,
    tooltip: 'If the vector candle zones color is not overriden, then we want to set the transparancy of the vector candle colors as defined by the PBSRA candle colors. This setting only affects the candle zone colors not the candle colors themselves.',
  },
  { id: 'rectStyle', type: 'string', title: 'Line style of Market Session hi/lo line', defval: 'Dashed', options: ['Dashed', 'Solid'], group: G14 },
  { id: 'showMarkets', type: 'bool', title: 'Show Market Sessions?', defval: true, group: G14, tooltip: 'Turn on or off all market sessions' },
  {
    id: 'showMarketsWeekends', type: 'bool', title: 'Show Market Session on Weekends?', defval: false, group: G14,
    tooltip: 'Turn on or off market sessions in the weekends. Note do not turn this on for exchanges that dont have weekend data like OANDA',
  },
  {
    id: 'showSession1', type: 'bool', title: 'Show: session?', defval: true, inline: 'session1conf', group: G15,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel1', type: 'bool', title: 'Label?', defval: true, inline: 'session1conf', group: G15 },
  {
    id: 'showOr1', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session1conf', group: G15,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess1Label', type: 'string', title: 'Name:', defval: 'London', inline: 'session1style', group: G15 },
  { id: 'sess1Color', type: 'color', title: 'Color: Box', defval: 'rgba(120, 123, 134, 0.25)', inline: 'session1style', group: G15 },
  { id: 'sess1LabelColor', type: 'color', title: 'Label', defval: '#787B86', inline: 'session1style', group: G15 },
  {
    id: 'showSession2', type: 'bool', title: 'Show: session?', defval: true, inline: 'session2conf', group: G16,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel2', type: 'bool', title: 'Label?', defval: true, inline: 'session2conf', group: G16 },
  {
    id: 'showOr2', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session2conf', group: G16,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess2Label', type: 'string', title: 'Name:', defval: 'NewYork', inline: 'session2style', group: G16 },
  { id: 'sess2Color', type: 'color', title: 'Color: Box', defval: 'rgba(251, 86, 91, 0.25)', inline: 'session2style', group: G16 },
  { id: 'sess2LabelColor', type: 'color', title: 'Label', defval: 'rgba(253, 84, 87, 0.75)', inline: 'session2style', group: G16 },
  {
    id: 'showSession3', type: 'bool', title: 'Show: session?', defval: true, inline: 'session3conf', group: G17,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel3', type: 'bool', title: 'Label?', defval: true, inline: 'session3conf', group: G17 },
  {
    id: 'showOr3', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session3conf', group: G17,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess3Label', type: 'string', title: 'Name:', defval: 'Tokyo', inline: 'session3style', group: G17 },
  { id: 'sess3Color', type: 'color', title: 'Color: Box', defval: 'rgba(80, 174, 85, 0.25)', inline: 'session3style', group: G17 },
  { id: 'sess3LabelColor', type: 'color', title: 'Label', defval: 'rgba(80, 174, 85, 0.75)', inline: 'session3style', group: G17 },
  {
    id: 'showSession4', type: 'bool', title: 'Show: session?', defval: true, inline: 'session4conf', group: G18,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel4', type: 'bool', title: 'Label?', defval: true, inline: 'session4conf', group: G18 },
  {
    id: 'showOr4', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session4conf', group: G18,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess4Label', type: 'string', title: 'Name:', defval: 'HongKong', inline: 'session4style', group: G18 },
  { id: 'sess4Color', type: 'color', title: 'Color: Box', defval: 'rgba(128, 127, 23, 0.25)', inline: 'session4style', group: G18 },
  { id: 'sess4LabelColor', type: 'color', title: 'Label', defval: 'rgba(128, 127, 23, 0.75)', inline: 'session4style', group: G18 },
  {
    id: 'showSession5', type: 'bool', title: 'Show: session?', defval: true, inline: 'session5conf', group: G19,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel5', type: 'bool', title: 'Label?', defval: true, inline: 'session5conf', group: G19 },
  {
    id: 'showOr5', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session5conf', group: G19,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess5Label', type: 'string', title: 'Name:', defval: 'Sydney', inline: 'session5style', group: G19 },
  { id: 'sess5Color', type: 'color', title: 'Color: Box', defval: 'rgba(37, 228, 123, 0.25)', inline: 'session5style', group: G19 },
  { id: 'sess5LabelColor', type: 'color', title: 'Label', defval: 'rgba(37, 228, 123, 0.75)', inline: 'session5style', group: G19 },
  {
    id: 'showSession6', type: 'bool', title: 'Show: session?', defval: true, inline: 'session6conf', group: G20,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel6', type: 'bool', title: 'Label?', defval: true, inline: 'session6conf', group: G20 },
  {
    id: 'showOr6', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session6conf', group: G20,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess6Label', type: 'string', title: 'Name:', defval: 'EU Brinks', inline: 'session6style', group: G20 },
  { id: 'sess6Color', type: 'color', title: 'Color: Box', defval: 'rgba(255, 255, 255, 0.35)', inline: 'session6style', group: G20 },
  { id: 'sess6LabelColor', type: 'color', title: 'Label', defval: 'rgba(255, 255, 255, 0.75)', inline: 'session6style', group: G20 },
  {
    id: 'showSession7', type: 'bool', title: 'Show: session?', defval: true, inline: 'session7conf', group: G21,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel7', type: 'bool', title: 'Label?', defval: true, inline: 'session7conf', group: G21 },
  {
    id: 'showOr7', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session7conf', group: G21,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess7Label', type: 'string', title: 'Name:', defval: 'US Brinks', inline: 'session7style', group: G21 },
  { id: 'sess7Color', type: 'color', title: 'Color: Box', defval: 'rgba(255, 255, 255, 0.35)', inline: 'session7style', group: G21 },
  { id: 'sess7LabelColor', type: 'color', title: 'Label', defval: 'rgba(255, 255, 255, 0.75)', inline: 'session7style', group: G21 },
  {
    id: 'showSession8', type: 'bool', title: 'Show: session?', defval: false, inline: 'session8conf', group: G22,
    tooltip: 'If this checkbox is off, Label and Open Range have no effect',
  },
  { id: 'showLabel8', type: 'bool', title: 'Label?', defval: true, inline: 'session8conf', group: G22 },
  {
    id: 'showOr8', type: 'bool', title: 'Opening Range?', defval: true, inline: 'session8conf', group: G22,
    tooltip: 'This controls the shaded area for the session',
  },
  { id: 'sess8Label', type: 'string', title: 'Name:', defval: 'Frankfurt', inline: 'session8style', group: G22 },
  { id: 'sess8Color', type: 'color', title: 'Color: Box', defval: 'rgba(253, 152, 39, 0.25)', inline: 'session8style', group: G22 },
  { id: 'sess8LabelColor', type: 'color', title: 'Label', defval: 'rgba(253, 152, 39, 0.75)', inline: 'session8style', group: G22 },
  { id: 'showPsyLevels', type: 'bool', title: 'Show: Levels?', defval: true, inline: 'psyconf', group: G23 },
  {
    id: 'showPsyLabels', type: 'bool', title: 'Labels?', defval: true, inline: 'psyconf', group: G23,
    tooltip: 'The Psy High/Low will only show on these timeframes: 1h/30min/15min/5min/3min/1min. It is disabled on all others. This is because the calculation requires a candle to start at the correct time for Sydney/Tokyo but in other timeframes the data does not have values at the designated time for the Sydney/Tokyo sessions.',
  },
  { id: 'showAllPsy', type: 'bool', title: 'Show historical psy levels?', defval: false, inline: 'psyconf', group: G23 },
  { id: 'psyColH', type: 'color', title: 'Psy Hi Color', defval: 'rgba(255, 152, 0, 0.7)', inline: 'psyconf1', group: G23 },
  { id: 'psyColL', type: 'color', title: 'Psy Low Color', defval: 'rgba(255, 152, 0, 0.7)', inline: 'psyconf1', group: G23 },
  { id: 'overridePsyType', type: 'bool', title: 'Override PsyType', defval: false, inline: 'psyconf12', group: G23 },
  {
    id: 'psyTypeX', type: 'string', title: 'Psy calc type', defval: 'crypto', options: ['crypto', 'forex'], inline: 'psyconf12', group: G23,
    tooltip: 'Selecting the override psy type lets you manually adjust the psy type otherwise it will be automatic. If the override psy type checkbox is of then this setting has no effect. usAre you looking at Crypto or Forex? Crypto calculations start with the Sydney session on Saturday night. Forex calculations start with the Tokyo session on Monday morning. Note some exchanges like Oanda do not have sessions on the weekends so you might be forced to select Forex for exchanges like Oanda even when looking at symbols like BITCOIN on Oanda.',
  },
  { id: 'showDstTable', type: 'bool', title: 'Show DST Table : ', defval: false, inline: 'dstt', group: G24 },
  { id: 'choiceDstTable', type: 'string', title: 'DST Table postion', defval: 'bottom_center', options: ['top_right', 'top_left', 'top_center', 'bottom_right', 'bottom_left', 'bottom_center'], inline: 'dstt', group: G24 },
  { id: 'dstTableBgColor', type: 'color', title: 'DST Table: Background Color', defval: 'rgba(93, 96, 107, 0.3)', inline: 'dsttc', group: G24 },
  { id: 'dstTableTxtColor', type: 'color', title: 'Text Color', defval: '#1FBCD3', inline: 'dsttc', group: G24 },
];

/** color.new(color.blue, 50) and color.new(color.green, 60) */
const DAILY_HILO = 'rgba(41, 98, 255, 0.5)';
const WEEKLY_HILO = 'rgba(76, 175, 80, 0.4)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '5 Ema', color: defaultInputs.oneEmaColor, lineWidth: 1 },
  { id: 'plot1', title: '13 Ema', color: defaultInputs.twoEmaColor, lineWidth: 1 },
  { id: 'plot2', title: '50 Ema', color: defaultInputs.threeEmaColor, lineWidth: 1 },
  { id: 'plot3', title: '200 Ema', color: defaultInputs.fourEmaColor, lineWidth: 1 },
  { id: 'plot4', title: '800 Ema', color: defaultInputs.fiveEmaColor, lineWidth: 2 },
  { id: 'plot5', title: 'Upper 50 Ema Cloud', color: defaultInputs.emaCloudBorderColor, lineWidth: 1 },
  { id: 'plot6', title: 'Lower 50 Ema Cloud', color: defaultInputs.emaCloudBorderColor, lineWidth: 1 },
  { id: 'plot7', title: 'YDay Hi', color: DAILY_HILO, lineWidth: 2, style: 'stepline' },
  { id: 'plot8', title: 'YDay Lo', color: DAILY_HILO, lineWidth: 2, style: 'stepline' },
  { id: 'plot9', title: 'LWeek Hi', color: WEEKLY_HILO, lineWidth: 2, style: 'stepline' },
  { id: 'plot10', title: 'LWeek Lo', color: WEEKLY_HILO, lineWidth: 2, style: 'stepline' },
  { id: 'plot11', title: 'Psy-Hi', color: defaultInputs.psyColH, lineWidth: 2, style: 'stepline' },
  { id: 'plot12', title: 'Psy-Lo', color: defaultInputs.psyColL, lineWidth: 2, style: 'stepline' },
  { id: 'plot13', title: 'Daily Open', color: defaultInputs.dailyOpenColor, lineWidth: 2, style: 'stepline' },
];

export const metadata = {
  title: 'Traders Reality Main',
  shortTitle: 'TR_MAIN',
  overlay: true,
};

/** indicator(max_boxes_count = 500) */
const MAX_BOXES = 500;
const DAY = 86400000;
const WEEK = 7 * DAY;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

type LineStyle = 'solid' | 'dashed' | 'dotted';
const lineStyle = (name: string, other: LineStyle): LineStyle =>
  name === 'Dotted' ? 'dotted' : name === 'Dashed' ? 'dashed' : name === 'Solid' ? 'solid' : other;

/** A line or a label x: a bar index, or a time in ms (xloc.bar_time) */
interface Ln {
  x1: number; y1: number; x2: number; y2: number;
  color: string; style: LineStyle; width: number; extend: 'none' | 'right' | 'both'; byTime: boolean;
}
interface Lb { x: number; y: number; text: string; textColor: string; align: 'right' | 'center'; byTime: boolean }
interface Bx {
  left: number; top: number; right: number; bottom: number;
  bg: string; border: string; borderWidth: number; extend: 'none' | 'right'; deleted: boolean;
}

/** The 8 market sessions: hours (UTC without daylight saving time) and the region whose daylight saving time they follow */
const SESSIONS: Array<{ hours: string; dst: 'uk' | 'ny' | 'syd' | null }> = [
  { hours: '0800-1630', dst: 'uk' },
  { hours: '1430-2100', dst: 'ny' },
  { hours: '0000-0600', dst: null },
  { hours: '0130-0800', dst: null },
  { hours: '2200-0600', dst: 'syd' },
  { hours: '0800-0900', dst: 'uk' },
  { hours: '1400-1500', dst: 'ny' },
  { hours: '0700-1630', dst: 'uk' },
];

/** The bars of a higher timeframe built from the chart bars */
interface Htf {
  bars: Bar[];
  /** Index of the higher-timeframe bar of each chart bar */
  group: number[];
  /** Index of the bar that a request without lookahead, read one chart bar back, gives at each chart bar (-1: na) */
  prev: number[];
}

type Result = IndicatorResult & {
  barColors: BarColorData[]; lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; tables: TableData[];
};

export function calculate(bars: Bar[], inputs: Partial<TradersRealityMainInputs> = {}, chart?: ChartContext): Result {
  const cfg = { ...defaultInputs, ...inputs };
  if (cfg.overrideSym) {
    throw new Error('Traders Reality Main: "Override chart symbol?" reads the bars of another symbol, which the chart bars do not have');
  }
  const n = bars.length;
  const last = n - 1;
  const unit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000; // bar time unit in ms
  const tMs = (i: number) => bars[i].time * unit;
  const tz = timezoneOf(chart);
  const mintick = mintickOf(chart);
  const currency = currencyOf(chart);
  const symbolType = symbolTypeOf(chart);
  // barstate.isrealtime: the last bar receives live updates
  const realtime = chart?.realtime === true;

  // Chart timeframe
  const tf = chartTimeframe(bars, chart) || '1D';
  const info = timeframe.info(tf);
  const mult = info.multiplier;
  const tfSeconds = timeframe.in_seconds(tf);
  const tfMs = mult * 60 * 1000; // timeframe.multiplier * 60 * 1000, as the original
  const show = info.isminutes && mult <= 240 && mult >= 1;
  const showDly = info.isminutes;
  const validTimeFrame = info.isintraday;
  const validWHLTimeFrame = info.isintraday || info.isdaily;
  const showPsy = info.isminutes && [60, 30, 15, 5, 3, 1].includes(mult);
  const showMarkets = cfg.showMarkets && show;
  const showMarketsWeekends = cfg.showMarketsWeekends && show;
  const showRectangle9 = cfg.showDailyOpen && showDly;
  const showLabel9 = cfg.showDailyOpenLabel && showRectangle9 && showDly;
  const showPsylevels = cfg.showPsyLevels && showPsy;
  const showPsylabel = cfg.showPsyLabels && showPsylevels;
  const showAllPsy = cfg.showAllPsy && showPsylevels;
  const psyType = cfg.overridePsyType ? cfg.psyTypeX : symbolType === 'forex' ? 'forex' : 'crypto';
  const showAdrPips = cfg.showAdrPips && cfg.showAdrTable;
  const showAdrCurrency = cfg.showAdrCurrency && cfg.showAdrTable;
  const showRDPips = cfg.showRDPips && cfg.showAdrTable;
  const showRDCurrency = cfg.showRDCurrency && cfg.showAdrTable;

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeS = new Series(bars, (b) => b.close);

  // EMAs and the cloud of the EMA 50
  const ema5 = A(ta.ema(closeS, 5));
  const ema13 = A(ta.ema(closeS, 13));
  const ema50 = A(ta.ema(closeS, 50));
  const ema200 = A(ta.ema(closeS, 200));
  const ema800 = A(ta.ema(closeS, 800));
  const cloud = A(ta.stdev(closeS, 100)).map((v) => v / 4);

  // time('D'), time('W'), time('M') and newBar(res): ta.change(time(res)) != 0
  const startsOf = (res: string) => periodStarts(bars, res, chart);
  const dStarts = startsOf('D');
  const newBarOf = (starts: number[]) => starts.map((s, i) => i > 0 && s !== starts[i - 1]);
  const newBarD = newBarOf(dStarts);
  /** Index of the last bar that opens a period (-1: none) */
  const lastNewBar = (flags: boolean[]) => flags.lastIndexOf(true);

  // time_close: the bar time plus the chart timeframe, at most the end of the session of the day when the context
  // gives day session hours (e.g. "0930-1600")
  const sessionHours = typeof chart?.session === 'string' ? chart.session : chart?.session?.session;
  const dayHours = sessionHours !== undefined && info.isintraday ? /^(\d\d)(\d\d)-(\d\d)(\d\d)$/.exec(sessionHours.trim()) : null;
  const closeMs = (i: number) => {
    const t = tMs(i);
    const c = t + tfSeconds * 1000;
    if (dayHours === null) return c;
    const end = pineTime.timestamp(tz, pineTime.year(t, tz), pineTime.month(t, tz), pineTime.dayofmonth(t, tz), Number(dayHours[3]), Number(dayHours[4]), 0);
    return end > t && end < c ? end : c;
  };

  // Higher timeframe bars of the chart symbol (the first one is made of the bars loaded, as on a symbol whose
  // history starts inside a period)
  const htfOf = (res: string): Htf => {
    const sec = securityBars(bars, res, chart);
    if (sec) {
      const prev = sec.group.map((_, i) => (i === 0 ? -1 : sec.latest[i - 1]));
      if (realtime && n > 0) prev[last] = sec.group[last] - 1;
      return { bars: sec.htf, group: sec.group, prev };
    }
    // Without the exchange calendar: the periods of the UTC calendar; a period is complete on its last chart bar
    const starts = startsOf(res);
    const out: Bar[] = [];
    const group: number[] = [];
    bars.forEach((b, i) => {
      if (i === 0 || starts[i] !== starts[i - 1]) {
        out.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
      } else {
        const h = out[out.length - 1];
        h.high = Math.max(h.high, b.high);
        h.low = Math.min(h.low, b.low);
        h.close = b.close;
        h.volume = (h.volume ?? NaN) + (b.volume ?? NaN);
      }
      group.push(out.length - 1);
    });
    return { bars: out, group, prev: group.map((g, i) => (i === 0 ? -1 : g - 1)) };
  };
  const NO_HTF: Htf = { bars: [], group: new Array(n).fill(-1), prev: new Array(n).fill(-1) };
  const day = info.isintraday ? htfOf('D') : NO_HTF;
  const week = validWHLTimeFrame ? htfOf('W') : NO_HTF;
  const month = info.isintraday ? htfOf('M') : NO_HTF;

  // f_security(syminfo.tickerid, res, src, false): the value of the previous period
  const prevOf = (h: Htf, i: number, field: 'high' | 'low' | 'close') => (h.prev[i] >= 0 ? h.bars[h.prev[i]][field] : NaN);

  // adrHiLo(length, 1, fromDO) on the bars of a higher timeframe, read with lookahead on
  const adrHiLo = (h: Htf, length: number, fromDO: boolean) => {
    const hb = h.bars;
    const tr = hb.map((b, j) => (j === 0 ? b.high - b.low
      : Math.max(Math.max(b.high - b.low, Math.abs(b.high - hb[j - 1].close)), Math.abs(b.low - hb[j - 1].close))));
    const shifted = tr.map((_, j) => (j === 0 ? NaN : tr[j - 1]));
    const adr = hb.length > 0 ? A(ta.sma(Series.fromArray(hb, shifted), length)) : [];
    const high = hb.map((b, j) => {
      if (fromDO) return b.open + adr[j];
      return lt(b.high - b.low, adr[j]) ? b.low + adr[j] : ge(b.close, b.open) ? b.low + adr[j] : b.high;
    });
    const low = hb.map((b, j) => {
      if (fromDO) return b.open - adr[j];
      return lt(b.high - b.low, adr[j]) ? b.high - adr[j] : ge(b.close, b.open) ? b.low : b.high - adr[j];
    });
    const at = (values: number[], i: number) => (h.group[i] >= 0 ? values[h.group[i]] : NaN);
    return { adr: (i: number) => at(adr, i), high: (i: number) => at(high, i), low: (i: number) => at(low, i) };
  };
  const dayAdr = adrHiLo(day, cfg.adrRange, cfg.showADRDO);
  const weekAdr = adrHiLo(week, cfg.awrRange, cfg.showAWRWO);
  const monthAdr = adrHiLo(month, cfg.amrRange, cfg.showAMRMO);
  const dayRd = adrHiLo(day, cfg.rdRange, cfg.showRDDO);
  const weekRd = adrHiLo(week, cfg.rwRange, cfg.showRWWO);

  // calcPvsra(): bar colours and the vector flag of each bar (getPvsraFlagByColor)
  const vol = bars.map((b) => b.volume ?? NaN);
  const averageVolume = A(math.sum(Series.fromArray(bars, vol.map((_, i) => (i === 0 ? NaN : vol[i - 1]))), 10)).map((v) => v / 10);
  const volumeSpread = bars.map((b, i) => vol[i] * (b.high - b.low));
  const highestVolumeSpread = A(ta.highest(Series.fromArray(bars, volumeSpread.map((_, i) => (i === 0 ? NaN : volumeSpread[i - 1]))), 10));
  const rgba = (c: string) => `${color.r(c)},${color.g(c)},${color.b(c)},${color.t(c)}`;
  const flagOf = (c: string) => {
    const key = rgba(c);
    return key === rgba(cfg.greenVectorColor) ? 3 : key === rgba(cfg.redVectorColor) ? -3 : key === rgba(cfg.blueVectorColor) ? 2
      : key === rgba(cfg.violetVectorColor) ? -2 : key === rgba(cfg.regularCandleUpColor) ? 1 : -1;
  };
  const flags = new Map<string, number>();
  const pvsraColor: string[] = [];
  const pvsra: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const up = gt(b.close, b.open);
    let c: string;
    if (ge(vol[i], 2 * averageVolume[i]) || ge(volumeSpread[i], highestVolumeSpread[i])) c = up ? cfg.greenVectorColor : cfg.redVectorColor;
    else if (ge(vol[i], 1.5 * averageVolume[i])) c = up ? cfg.blueVectorColor : cfg.violetVectorColor;
    else c = up ? cfg.regularCandleUpColor : cfg.regularCandleDownColor;
    pvsraColor.push(c);
    if (!flags.has(c)) flags.set(c, flagOf(c));
    pvsra.push(flags.get(c)!);
  }

  // Boxes alive, in creation order. When a creation brings the count above max + 5 the oldest are deleted until max
  // remain; a box held by a `var` variable (the opening range box of each session call) is not deleted by this
  // limit, but it counts.
  const liveBoxes: Bx[] = [];
  const heldBoxes = new Set<Bx>();
  const newBox = (b: Omit<Bx, 'deleted'>, held = false): Bx => {
    const o: Bx = { ...b, deleted: false };
    if (held) heldBoxes.add(o);
    liveBoxes.push(o);
    if (liveBoxes.length > MAX_BOXES + 5) {
      for (let k = 0; k < liveBoxes.length && liveBoxes.length > MAX_BOXES; ) {
        if (heldBoxes.has(liveBoxes[k])) k++;
        else liveBoxes.splice(k, 1)[0].deleted = true;
      }
    }
    return o;
  };
  const deleteBox = (b: Bx) => {
    if (b.deleted) return;
    b.deleted = true;
    liveBoxes.splice(liveBoxes.indexOf(b), 1);
  };

  // calcSessionStartEnd(): the end of the session that starts on bar i, then its length in bars
  const sessionDuration = (i: number, hours: string, gmt: string) => {
    const t = tMs(i);
    const y = pineTime.year(t, tz);
    const mo = pineTime.month(t, tz);
    const d = pineTime.dayofmonth(t, tz);
    const startHour = Number(hours.slice(0, 2));
    const endHour = Number(hours.slice(5, 7));
    const start = pineTime.timestamp(gmt, y, mo, d, startHour, Number(hours.slice(2, 4)), 0);
    let end = pineTime.timestamp(gmt, y, mo, d, endHour, Number(hours.slice(7, 9)), 0);
    const timeNow = pineTime.timestamp(tz, y, mo, d, pineTime.hour(t, tz), pineTime.minute(t, tz), 0);
    const midnightExchange = pineTime.timestamp(tz, y, mo, d, 0, 0, 0);
    // A session that starts late on one day ends on the next day
    let adjusted = false;
    if (gmt === 'GMT+0' && startHour > endHour && timeNow - start >= 0) {
      end += DAY;
      adjusted = true;
    }
    if (gmt === 'GMT+1' && (startHour === 0 ? 24 : startHour) - 1 > (endHour === 0 ? 24 : endHour) - 1 && timeNow - start >= 0) {
      end += DAY;
      adjusted = true;
    }
    if (start < midnightExchange && midnightExchange < end && !adjusted) end += DAY;
    return math.round(Math.abs(t - end) / tfMs);
  };

  // One call of drawOpenRange() and drawSessionHiLo() in the script: the two functions keep their own values from
  // one call to the next (a call in the branch of the other daylight saving state does not run them).
  const sessionLines: Ln[] = [];
  const sessionLabels: Lb[] = [];
  const sessionSite = (k: number, gmt: string) => {
    const key = k + 1;
    const c = cfg as unknown as Record<string, string | boolean>;
    const showRectangle = (c[`showSession${key}`] as boolean) && showMarkets;
    const showLabel = (c[`showLabel${key}`] as boolean) && showRectangle;
    const showOr = (c[`showOr${key}`] as boolean) && showRectangle;
    const name = c[`sess${key}Label`] as string;
    const boxColor = c[`sess${key}Color`] as string;
    const labelColor = c[`sess${key}LabelColor`] as string;
    const hours = SESSIONS[k].hours;
    const sessionString = hours + (showMarketsWeekends ? ':1234567' : ':23456');
    const style: LineStyle = cfg.rectStyle === 'Solid' ? 'solid' : 'dashed';
    let orPrev = NaN; // session[1] of drawOpenRange
    let orBox: Bx | null = null;
    let prev = NaN; // session[1] of drawSessionHiLo
    let hi = 0;
    let lo = 10000000000.0;
    let lineT: Ln | null = null;
    let lineB: Ln | null = null;
    let label: Lb | null = null;
    const drop = <T>(list: T[], o: T | null) => {
      const at = o === null ? -1 : list.indexOf(o);
      if (at >= 0) list.splice(at, 1);
    };
    return (i: number) => {
      if (!showRectangle) return;
      const b = bars[i];
      // time(timeframe.period, session, gmt): the bar time inside the session, else na
      const session = pineTime.inSession(tMs(i), sessionString, gmt) ? tMs(i) : NaN;

      // drawOpenRange()
      if (showOr) {
        if (!isNaN(session) && isNaN(orPrev)) {
          const right = mult === 1 ? i : i + sessionDuration(i, hours, gmt);
          if (orBox !== null) heldBoxes.delete(orBox);
          orBox = newBox({ left: i, top: b.high, right, bottom: b.low, bg: boxColor, border: 'transparent', borderWidth: 1, extend: 'none' }, true);
        } else if (mult === 1 && ((isNaN(orPrev) && !isNaN(session)) || orPrev < session)) {
          if (orBox !== null && !orBox.deleted) orBox.right = i + 1;
        }
        orPrev = session;
      }

      // drawSessionHiLo()
      const newTF = !isNaN(session) && isNaN(prev);
      hi = newTF ? b.high : !isNaN(session) ? Math.max(b.high, hi) : hi;
      lo = newTF ? b.low : !isNaN(session) ? Math.min(b.low, lo) : lo;
      if (newTF) {
        const x2 = mult === 1 ? i : i + sessionDuration(i, hours, gmt);
        drop(sessionLines, lineT);
        drop(sessionLines, lineB);
        lineT = { x1: i, y1: hi, x2, y2: hi, color: labelColor, style, width: 1, extend: 'none', byTime: false };
        lineB = { x1: i, y1: lo, x2, y2: lo, color: labelColor, style, width: 1, extend: 'none', byTime: false };
        sessionLines.push(lineT, lineB);
        if (showLabel) {
          drop(sessionLabels, label);
          label = { x: i, y: hi, text: name, textColor: labelColor, align: 'right', byTime: false };
          sessionLabels.push(label);
        }
      } else if ((isNaN(prev) && !isNaN(session)) || prev < session) {
        if (lineT !== null && lineB !== null) {
          if (mult === 1) {
            lineT.x2 = i + 1;
            lineB.x2 = i + 1;
          }
          lineT.y1 = hi;
          lineT.y2 = hi;
          lineB.y1 = lo;
          lineB.y2 = lo;
        }
        if (showLabel && label !== null) label.y = hi;
      }
      prev = session;
    };
  };
  const sites = SESSIONS.map((s, k) => ({
    dst: s.dst,
    on: sessionSite(k, 'GMT+1'), // the branch of daylight saving time
    off: sessionSite(k, 'GMT+0'),
  }));

  // updateZones(): the zones of one side (direction 1: above price, 0: below)
  const zoneBoxesAbove: Array<Bx | null> = [];
  const zoneBoxesBelow: Array<Bx | null> = [];
  const zoneWicks = cfg.zoneType === 'Body with wicks';
  const updateWicks = cfg.zoneUpdateType === 'Body with wicks';
  const zoneBg = (flag: number) => {
    if (cfg.colorOverride) return cfg.zoneColor;
    const base = flag === 2 ? cfg.blueVectorColor : flag === -2 ? cfg.violetVectorColor : flag === 3 ? cfg.greenVectorColor
      : flag === -3 ? cfg.redVectorColor : null;
    return base === null ? 'transparent' : String(color.new(base, cfg.zoneTransparency));
  };
  const updateZones = (i: number, direction: 0 | 1, boxArr: Array<Bx | null>) => {
    const b = bars[i];
    let length = boxArr.length;
    // The candle before was a vector candle: a new zone on its body (or its range)
    if (i > 0 && (pvsra[i - 1] < -1 || pvsra[i - 1] > 1)) {
      const p = bars[i - 1];
      const up = gt(p.close, p.open);
      const top = zoneWicks ? p.high : up ? p.close : p.open;
      const bottom = zoneWicks ? p.low : up ? p.open : p.close;
      boxArr.unshift(newBox({
        left: i - 1, top, right: i, bottom, extend: 'right', bg: zoneBg(pvsra[i - 1]), borderWidth: cfg.borderWidth,
        border: 'rgba(255, 255, 255, 0.2)',
      }));
      length += 1;
    }
    for (let k = 0; k < length; k++) {
      const valbox = boxArr[k];
      if (valbox === null) continue;
      // box.get_bottom / box.get_top of a box deleted by the count limit: na
      const valbottom = valbox.deleted ? NaN : valbox.bottom;
      const valtop = valbox.deleted ? NaN : valbox.top;
      if (direction === 1) {
        if (ge(b.close, valtop) || ge(b.high, valtop)) {
          deleteBox(valbox);
          boxArr[k] = null;
        } else if (gt(b.high, valbottom) && lt(b.high, valtop) && updateWicks) {
          valbox.bottom = b.high;
        } else if (gt(b.close, valbottom) && lt(b.close, valtop) && updateWicks) {
          valbox.bottom = b.close;
        }
      } else if (le(b.close, valbottom) || le(b.low, valbottom)) {
        deleteBox(valbox);
        boxArr[k] = null;
      } else if (gt(b.low, valbottom) && lt(b.low, valtop) && updateWicks) {
        valbox.top = b.low;
      } else if (gt(b.close, valbottom) && lt(b.close, valtop) && updateWicks) {
        valbox.top = b.close;
      }
    }
    if (length > cfg.zonesMax) {
      const val = boxArr[length - 1];
      if (val) deleteBox(val);
      boxArr.pop();
    }
  };
  // cleanarr(): only the first element is looked at
  const cleanarr = (arr: Array<Bx | null>) => {
    if (arr.length > 0 && arr[0] === null) arr.shift();
  };

  // Per bar: daylight saving time, sessions, psy levels, daily open, zones
  const psyHiArr: number[] = new Array(n).fill(NaN);
  const psyLoArr: number[] = new Array(n).fill(NaN);
  const dailyOpen: number[] = new Array(n).fill(NaN);
  let psyHi = NaN;
  let psyLo = NaN;
  let inPsyPrev = false;
  let psyCalculating = false;
  let sydDstLast = false;
  let dlyOpen = NaN;
  const needDst = showMarkets || showPsylevels;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = tMs(i);

    // calcDst(): daylight saving time of New York, London and Sydney from the calendar date of the bar
    let nyDST = false;
    let ukDST = false;
    let sydDST = false;
    if (needDst) {
      const mo = pineTime.month(t, tz);
      const previousSunday = pineTime.dayofmonth(t, tz) - pineTime.dayofweek(t, tz) + 1;
      if (mo < 3 || mo > 11) sydDST = true;
      else if (mo > 4 && mo < 10) {
        nyDST = true;
        ukDST = true;
      } else if (mo === 3) {
        nyDST = previousSunday >= 8;
        ukDST = previousSunday >= 24;
        sydDST = true;
      } else if (mo === 4) {
        nyDST = true;
        ukDST = true;
        sydDST = previousSunday <= 0;
      } else if (mo === 10) {
        nyDST = true;
        ukDST = previousSunday <= 24;
        sydDST = previousSunday >= 0;
      } else {
        nyDST = previousSunday <= 0;
        sydDST = true;
      }
    }
    sydDstLast = sydDST;

    if (showMarkets) {
      for (const site of sites) {
        const dst = site.dst === 'uk' ? ukDST : site.dst === 'ny' ? nyDST : site.dst === 'syd' ? sydDST : false;
        if (dst) site.on(i);
        else site.off(i);
      }
    }

    // calcPsyLevels()
    if (showPsylevels) {
      const inPsy = psyType === 'crypto' ? pineTime.inSession(t, '2200-0600:1', sydDST ? 'GMT+1' : 'GMT')
        : pineTime.inSession(t, '0000-0800:2', 'GMT');
      if (inPsy) {
        psyHi = inPsyPrev ? Math.max(b.high, psyHi) : b.high;
        psyLo = inPsyPrev ? Math.min(b.low, psyLo) : b.low;
      }
      psyCalculating = inPsy;
      inPsyPrev = inPsy;
      psyHiArr[i] = psyHi;
      psyLoArr[i] = psyLo;
    }

    // getdayOpen()
    if (newBarD[i]) dlyOpen = b.open;
    dailyOpen[i] = dlyOpen;

    // Vector candle zones
    if (cfg.showVCZ) {
      updateZones(i, 0, zoneBoxesBelow);
      updateZones(i, 1, zoneBoxesAbove);
      cleanarr(zoneBoxesAbove);
      cleanarr(zoneBoxesBelow);
    }
  }

  // Plots
  const P = (f: (i: number) => { value: number; color?: string }) => bars.map((b, i) => ({ time: b.time, ...f(i) }));
  const shown = (on: boolean, v: number) => (on ? v : NaN);
  const yday = validTimeFrame && cfg.showDayHighLow;
  const lweek = validWHLTimeFrame && cfg.showWeekHighLow;
  const psyPlot = showPsy && showPsylevels && showAllPsy;
  const openPlot = showRectangle9 && validTimeFrame && cfg.showAllDailyOpens;
  const plots = {
    plot0: P((i) => ({ value: shown(cfg.showEmas, ema5[i]), color: cfg.oneEmaColor })),
    plot1: P((i) => ({ value: shown(cfg.showEmas, ema13[i]), color: cfg.twoEmaColor })),
    plot2: P((i) => ({ value: shown(cfg.showEmas, ema50[i]), color: cfg.threeEmaColor })),
    plot3: P((i) => ({ value: shown(cfg.showEmas, ema200[i]), color: cfg.fourEmaColor })),
    plot4: P((i) => ({ value: shown(cfg.showEmas, ema800[i]), color: cfg.fiveEmaColor })),
    plot5: P((i) => ({ value: shown(cfg.showEmas, ema50[i] + cloud[i]), color: cfg.emaCloudBorderColor })),
    plot6: P((i) => ({ value: shown(cfg.showEmas, ema50[i] - cloud[i]), color: cfg.emaCloudBorderColor })),
    plot7: P((i) => ({ value: shown(yday, prevOf(day, i, 'high')) })),
    plot8: P((i) => ({ value: shown(yday, prevOf(day, i, 'low')) })),
    plot9: P((i) => ({ value: shown(lweek, prevOf(week, i, 'high')) })),
    plot10: P((i) => ({ value: shown(lweek, prevOf(week, i, 'low')) })),
    plot11: P((i) => ({ value: shown(psyPlot, psyHiArr[i]), color: cfg.psyColH })),
    plot12: P((i) => ({ value: shown(psyPlot, psyLoArr[i]), color: cfg.psyColL })),
    plot13: P((i) => ({ value: shown(openPlot, dailyOpen[i]), color: cfg.dailyOpenColor })),
  };
  const result: Result = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills: [{ plot1: 'plot5', plot2: 'plot6', colors: bars.map(() => cfg.emaCloudColor) }],
    barColors: bars.map((b, i) => ({ time: b.time, color: pvsraColor[i] })),
    lines: [],
    labels: [],
    boxes: [],
    tables: [],
  };
  if (n === 0) return result;

  // Drawings of the last bar. A line of drawPivot / drawLine / drawLineDO is made on the first bar of a period and
  // replaces the line of the period before: only the line of the last period is left, with the value of the last bar.
  const lines: Ln[] = [...sessionLines];
  const labels: Lb[] = [...sessionLabels];
  const lastClose = closeMs(last);
  const offsetX = (bars_: number) => lastClose + bars_ * tfMs;
  const labelXOffset = offsetX(cfg.labelOffset);
  const pivotLabelXOffset = offsetX(cfg.pivotOffset);
  const adrLabelXOffset = offsetX(cfg.adrOffset);
  const adrLabelXOffset50 = offsetX(cfg.adrOffset50);
  const rdLabelXOffset = offsetX(cfg.rdOffset);
  const rdLabelXOffset50 = offsetX(cfg.rdOffset50);
  // levelStart: yesterday from the 5-minute chart, today below
  const dayStartMs = dStarts[last] * unit;
  const levelStart = info.isseconds || (info.isminutes && mult < 5) ? dayStartMs : dayStartMs - DAY;
  const firstOfDay = lastNewBar(newBarD);
  const newBarW = validTimeFrame ? newBarOf(startsOf('W')) : [];
  const newBarM = validTimeFrame ? newBarOf(startsOf('M')) : [];
  const addLabel = (x: number, y: number, text: string, textColor: string, align: 'right' | 'center') => {
    labels.push({ x, y, text, textColor, align, byTime: true });
  };

  // Daily price data of the previous day, pivot point and levels
  const dayHigh = prevOf(day, last, 'high');
  const dayLow = prevOf(day, last, 'low');
  const dayClose = prevOf(day, last, 'close');
  const pivotPoint = (dayHigh + dayLow + dayClose) / 3;
  const pivR1 = 2 * pivotPoint - dayLow;
  const pivS1 = 2 * pivotPoint - dayHigh;
  const pivR2 = pivotPoint - pivS1 + pivR1;
  const pivS2 = pivotPoint - pivR1 + pivS1;
  const pivR3 = 2 * pivotPoint + dayHigh - 2 * dayLow;
  const pivS3 = 2 * pivotPoint - (2 * dayHigh - dayLow);

  // drawPivot(): from levelStart to one day after the close of the last bar
  const rsStyle = lineStyle(cfg.rsStyle, 'dashed');
  const mStyle = lineStyle(cfg.mStyle, 'dashed');
  const pivotExtend = cfg.extendPivots ? 'both' : 'right';
  const drawPivot = (level: number, tag: string, lineColor: string, labelColor: string, style: LineStyle, labelValid: boolean) => {
    if (validTimeFrame && firstOfDay >= 0) {
      lines.push({
        x1: levelStart, y1: level, x2: lastClose + DAY, y2: level, color: lineColor, style, width: 1, extend: pivotExtend, byTime: true,
      });
    }
    if (labelValid) addLabel(pivotLabelXOffset, level, tag, labelColor, 'right');
  };
  const GREEN50 = 'rgba(76, 175, 80, 0.5)';
  const RED50 = 'rgba(255, 82, 82, 0.5)';
  const anyLevel = cfg.showLevelOnePivotPoints || cfg.showLevelTwoPivotPoints || cfg.showLevelThreePivotPoints || cfg.activeM;
  drawPivot(validTimeFrame && anyLevel ? pivotPoint : NaN, 'PP', cfg.pivotColor, cfg.pivotLabelColor, mStyle, cfg.showPivotLabels && validTimeFrame);
  const levels: Array<[boolean, number, number, string, string]> = [
    [cfg.showLevelOnePivotPoints, pivR1, pivS1, 'R1', 'S1'],
    [cfg.showLevelTwoPivotPoints, pivR2, pivS2, 'R2', 'S2'],
    [cfg.showLevelThreePivotPoints, pivR3, pivS3, 'R3', 'S3'],
  ];
  for (const [on, r, s, rTag, sTag] of levels) {
    const labelValid = on && cfg.showPivotLabels && validTimeFrame;
    drawPivot(validTimeFrame && on ? r : NaN, rTag, GREEN50, GREEN50, rsStyle, labelValid);
    drawPivot(validTimeFrame && on ? s : NaN, sTag, RED50, RED50, rsStyle, labelValid);
  }

  // Labels on the right of a live last bar (rLabel, rLabelOffset): barstate.isrealtime
  if (realtime) {
    if (cfg.labelEmas) {
      addLabel(labelXOffset, ema5[last], '5 Ema', cfg.oneEmaColor, 'right');
      addLabel(labelXOffset, ema13[last], '13 Ema', cfg.twoEmaColor, 'right');
      addLabel(labelXOffset, ema50[last], '50 Ema', cfg.threeEmaColor, 'right');
      addLabel(labelXOffset, ema200[last], '200 Ema', cfg.fourEmaColor, 'right');
      addLabel(labelXOffset, ema800[last], '800 Ema', cfg.fiveEmaColor, 'right');
    }
    if (yday && cfg.showDayHighLowLabels) {
      addLabel(labelXOffset, dayHigh, 'YDay Hi', String(color.new(DAILY_HILO, 0)), 'right');
      addLabel(labelXOffset, dayLow, 'YDay Lo', String(color.new(DAILY_HILO, 0)), 'right');
    }
    if (lweek && cfg.showDayHighLowLabels) {
      addLabel(labelXOffset, prevOf(week, last, 'high'), 'LWeek Hi', String(color.new(WEEKLY_HILO, 0)), 'right');
      addLabel(labelXOffset, prevOf(week, last, 'low'), 'LWeek Lo', String(color.new(WEEKLY_HILO, 0)), 'right');
    }
  }

  // drawLine(): from the first bar of the last period to the last bar, and its label
  const drawLine = (
    level: number, newBar: boolean[], tag: string, css: string, style: LineStyle, width: number, labelValid: boolean, labelX: number,
  ) => {
    const first = validTimeFrame ? lastNewBar(newBar) : -1;
    if (first >= 0) {
      lines.push({ x1: first, y1: level, x2: first === last ? last + 1 : last, y2: level, color: css, style, width, extend: 'right', byTime: false });
    }
    if (labelValid) addLabel(labelX, level, tag, css, 'center');
  };
  const toPips = (val: number) => val / (mintick * (symbolType === 'forex' ? 10 : 1));
  const pips = (val: number) => str.format('{0,number,#.##}', toPips(val));
  const money = (val: number) => str.tostring(val, 'mintick', mintick) + currency;
  /** A range: its two lines, the two 50 % lines, and on a live bar the range texts */
  const drawRange = (o: {
    show: boolean; show50: boolean; short: string; tag: string; fromOpen: boolean; adr: number; high: number; low: number;
    newBar: boolean[]; css: string; style: LineStyle; width: number; labels: boolean; rangeLabel: boolean; x: number; x50: number;
    /** Label names of the range lines ("Hi-ADR", "RD-Hi") */
    hi: string; lo: string;
    /** The amount of the range text; sameY50: the 50 % range text is on the upper 50 % line */
    amount: number; sameY50: boolean;
  }) => {
    const high50 = o.high - o.adr / 2;
    const low50 = o.low + o.adr / 2;
    const tag = o.fromOpen ? o.tag : '';
    const labelValid = o.labels && validTimeFrame;
    if (o.show) {
      drawLine(o.high, o.newBar, o.hi + tag, o.css, o.style, o.width, labelValid, o.x);
      drawLine(o.low, o.newBar, o.lo + tag, o.css, o.style, o.width, labelValid, o.x);
      if (realtime && labelValid && o.rangeLabel) {
        addLabel(o.x, (o.high + o.low) / 2, `${o.short} ${pips(o.adr)}PIPS|${money(o.amount)}`, o.css, 'right');
      }
    }
    if (o.show && o.show50) {
      drawLine(high50, o.newBar, '50% ' + o.hi + tag, o.css, o.style, o.width, labelValid, o.x50);
      drawLine(low50, o.newBar, '50% ' + o.lo + tag, o.css, o.style, o.width, labelValid, o.x50);
      if (realtime && labelValid && o.rangeLabel) {
        const y = o.sameY50 ? (high50 + high50) / 2 : (high50 + low50) / 2;
        addLabel(o.x50, y, `50% ${o.short} ${pips(o.adr / 2)}PIPS|${money(o.adr / 2)}`, o.css, 'right');
      }
    }
  };
  const dAdr = dayAdr.adr(last);
  const wAdr = weekAdr.adr(last);
  const mAdr = monthAdr.adr(last);
  const dRd = dayRd.adr(last);
  const wRd = weekRd.adr(last);
  drawRange({
    show: cfg.showADR, show50: cfg.showADR50, short: 'ADR', tag: '(DO)', fromOpen: cfg.showADRDO, adr: dAdr,
    high: dayAdr.high(last), low: dayAdr.low(last), newBar: newBarD, css: cfg.adrColor, style: lineStyle(cfg.adrStyle, 'dotted'), width: 2,
    labels: cfg.showADRLabels, rangeLabel: cfg.showADRRange, x: adrLabelXOffset, x50: adrLabelXOffset50, hi: 'Hi-ADR', lo: 'Lo-ADR',
    amount: dAdr, sameY50: false,
  });
  drawRange({
    show: cfg.showAWR, show50: cfg.showAWR50, short: 'AWR', tag: '(WO)', fromOpen: cfg.showAWRWO, adr: wAdr,
    high: weekAdr.high(last), low: weekAdr.low(last), newBar: newBarW, css: cfg.awrColor, style: lineStyle(cfg.awrStyle, 'dotted'), width: 1,
    labels: cfg.showAWRLabels, rangeLabel: cfg.showAWRRange, x: adrLabelXOffset, x50: adrLabelXOffset50, hi: 'Hi-AWR', lo: 'Lo-AWR',
    amount: wAdr, sameY50: false,
  });
  const amrFrame = info.isminutes && mult >= 3;
  drawRange({
    show: cfg.showAMR && amrFrame, show50: cfg.showAMR50, short: 'AMR', tag: '(MO)', fromOpen: cfg.showAMRMO, adr: mAdr,
    high: monthAdr.high(last), low: monthAdr.low(last), newBar: newBarM, css: cfg.amrColor, style: lineStyle(cfg.amrStyle, 'dotted'), width: 1,
    labels: cfg.showAMRLabels, rangeLabel: cfg.showAMRRange, x: adrLabelXOffset, x50: adrLabelXOffset50, hi: 'Hi-AMR', lo: 'Lo-AMR',
    amount: mAdr, sameY50: false,
  });
  // The range texts of RD and RW show half the range as the amount; the lines of RW start with the day
  drawRange({
    show: cfg.showRD, show50: cfg.showRD50, short: 'RD', tag: '(DO)', fromOpen: cfg.showRDDO, adr: dRd,
    high: dayRd.high(last), low: dayRd.low(last), newBar: newBarD, css: cfg.rdColor, style: lineStyle(cfg.rdStyle, 'dotted'), width: 2,
    labels: cfg.showRDLabels, rangeLabel: cfg.showRDRange, x: rdLabelXOffset, x50: rdLabelXOffset50, hi: 'RD-Hi', lo: 'RD-Lo',
    amount: dRd / 2, sameY50: true,
  });
  drawRange({
    show: cfg.showRW, show50: cfg.showRW50, short: 'RW', tag: '(WO)', fromOpen: cfg.showRWWO, adr: wRd,
    high: weekRd.high(last), low: weekRd.low(last), newBar: newBarD, css: cfg.rwColor, style: lineStyle(cfg.rwStyle, 'dotted'), width: 2,
    labels: cfg.showRWLabels, rangeLabel: cfg.showRWRange, x: rdLabelXOffset, x50: rdLabelXOffset50, hi: 'RW-Hi', lo: 'RW-Lo',
    amount: wRd / 2, sameY50: false,
  });

  // ADR table
  const tables: TableData[] = [];
  if (cfg.showAdrTable && validTimeFrame && (showAdrPips || showAdrCurrency)) {
    const cells: TableCellData[] = [
      { column: 0, row: 0, text: '', textColor: '#363A45', textSize: 'auto' },
      { column: 1, row: 0, text: '', textColor: '#363A45', textSize: 'auto' },
    ];
    const rowOf = (row: number, name: string, value: string) => {
      cells.push({ column: 0, row, text: name, textColor: cfg.adrTableTxtColor, textHAlign: 'left', textSize: 'auto' });
      cells.push({ column: 1, row, text: value, textColor: cfg.adrTableTxtColor, textHAlign: 'left', textSize: 'auto' });
    };
    const pips3 = (val: number) => str.format('{0,number,#.##}', toPips(val) * 3);
    if (showAdrPips) {
      rowOf(2, 'ADR', pips(dAdr) + 'PIPS');
      rowOf(3, 'ADRx3', pips3(dAdr) + 'PIPS');
      rowOf(4, 'AWR', pips(wAdr) + 'PIPS');
      rowOf(5, 'AMR', pips(mAdr) + 'PIPS');
    }
    if (showAdrCurrency) {
      rowOf(6, 'ADR', money(dAdr));
      rowOf(7, 'ADRx3', money(dAdr * 3));
      rowOf(8, 'AWR', money(wAdr));
      rowOf(9, 'AMR', money(mAdr));
    }
    if (showRDPips) {
      rowOf(10, 'RD', pips(dRd) + 'PIPS');
      rowOf(11, 'RDx3', pips3(dRd) + 'PIPS');
      rowOf(12, 'RW', pips(wRd) + 'PIPS');
    }
    if (showRDCurrency) {
      rowOf(13, 'RD', money(dRd));
      rowOf(14, 'RDx3', money(dRd * 3));
      rowOf(15, 'RW', money(wRd));
    }
    tables.push({ position: cfg.choiceAdrTable, columns: 2, rows: 16, bgColor: cfg.adrTableBgColor, cells });
  }

  // M levels: the middles between the pivot levels
  const mLevels = [(pivS2 + pivS3) / 2, (pivS1 + pivS2) / 2, (pivotPoint + pivS1) / 2, (pivotPoint + pivR1) / 2, (pivR1 + pivR2) / 2, (pivR2 + pivR3) / 2];
  mLevels.forEach((m, k) => {
    // `validTimeFrame and activeM and m ? m : na`: a level that is na or 0 is not drawn
    const level = validTimeFrame && cfg.activeM && !isNaN(m) && m !== 0 ? m : NaN;
    drawPivot(level, `M${k}`, cfg.mColor, cfg.mLabelColor, mStyle, cfg.showMLabels && validTimeFrame);
  });

  // Psy levels of the week
  if (showPsylevels && !showAllPsy) {
    // timestampPreviousDayOfWeek(): the start of the psy session of this week
    const t = tMs(last);
    const y = pineTime.year(t, tz);
    const mo = pineTime.month(t, tz);
    const start = (weekDay: 'Monday' | 'Saturday', hourOfDay: number, gmt: string) => {
      const dayOffset = (pineTime.dayofweek(t, gmt) - 1 + (weekDay === 'Monday' ? 6 : 1)) % 7;
      const previousDay = pineTime.dayofmonth(t, gmt) - dayOffset;
      const at = pineTime.timestamp(gmt, y, mo, previousDay, hourOfDay, 0, 0);
      // On the day of the change, before the hour of the change: the session of the week before
      if (dayOffset === 0 && gmt === 'GMT' && hourOfDay >= pineTime.hour(t, gmt) && hourOfDay !== 0) return at - WEEK;
      if (dayOffset === 0 && gmt === 'GMT+1' && hourOfDay - 1 >= pineTime.hour(t, gmt)) return at - WEEK;
      return at;
    };
    const psyStart = psyType === 'crypto' ? start('Saturday', 22, sydDstLast ? 'GMT+1' : 'GMT') : start('Monday', 0, 'GMT');
    lines.push({ x1: t, y1: psyHi, x2: psyStart, y2: psyHi, color: cfg.psyColH, style: 'solid', width: 1, extend: 'none', byTime: true });
    lines.push({ x1: t, y1: psyLo, x2: psyStart, y2: psyLo, color: cfg.psyColL, style: 'solid', width: 1, extend: 'none', byTime: true });
  }
  if (showPsylabel) {
    addLabel(labelXOffset, psyHi, psyCalculating ? 'Psy-Hi calculating...' : 'Psy-Hi', cfg.psyColH, 'right');
    addLabel(labelXOffset, psyLo, psyCalculating ? 'Psy-Lo calculating...' : 'Psy-Lo', cfg.psyColL, 'right');
  }

  // Daily open
  if (cfg.showAllDailyOpens) {
    if (realtime && validTimeFrame && showLabel9) addLabel(labelXOffset, dailyOpen[last], 'Daily Open', cfg.dailyOpenColor, 'right');
  } else if (showRectangle9) {
    // drawLineDO(): the line keeps the open of the first bar of the day
    if (validTimeFrame && firstOfDay >= 0) {
      lines.push({
        x1: firstOfDay, y1: dailyOpen[firstOfDay], x2: last, y2: dailyOpen[firstOfDay], color: cfg.dailyOpenColor, style: 'solid', width: 1,
        extend: 'none', byTime: false,
      });
    }
    if (validTimeFrame && showLabel9) addLabel(labelXOffset, dailyOpen[last], 'Daily Open', cfg.dailyOpenColor, 'center');
  }

  // Daylight saving time table
  if (cfg.showDstTable) {
    const texts = [
      'London DST Starts Last Sunday of March | DST Ends Last Sunday of October',
      'New York DST Starts 2nd Sunday of March | DST Ends 1st Sunday of November',
      'Tokyo does not observe DST',
      'Hong Kong does not observe DST',
      'Sydney DST Start on 1st Sunday of October | DST Ends 1st Sunday of Arpil',
      'EU Brinks DST Starts Last Sunday of March | DST Ends Last Sunday of October',
      'US Brinks DST Starts 2nd Sunday of March | DST Ends 1st Sunday of November',
      'Frankfurt DST Starts Last Sunday of March | DST Ends Last Sunday of October',
    ];
    tables.push({
      position: cfg.choiceDstTable, columns: 2, rows: 8, bgColor: cfg.dstTableBgColor,
      cells: texts.map((text, row) => ({ column: 0, row, text, textColor: cfg.adrTableTxtColor, textHAlign: 'left' as const, textSize: 'auto' as const })),
    });
  }

  // Output: an object with an na coordinate is not drawn
  const interval = barInterval(bars);
  const X = (x: number, byTime: boolean) => (byTime ? x / unit : barTime(bars, x, interval));
  result.lines = lines.filter((l) => !isNaN(l.y1) && !isNaN(l.y2)).map((l) => ({
    time1: X(l.x1, l.byTime), price1: l.y1, time2: X(l.x2, l.byTime), price2: l.y2, color: l.color,
    ...(l.style !== 'solid' ? { style: l.style } : {}),
    ...(l.width !== 1 ? { width: l.width } : {}),
    ...(l.extend !== 'none' ? { extend: l.extend } : {}),
  }));
  result.labels = labels.filter((l) => !isNaN(l.y)).map((l) => ({
    time: X(l.x, l.byTime), price: l.y, text: l.text, textColor: l.textColor, style: 'none' as const,
    ...(l.align === 'right' ? { textAlign: 'right' as const } : {}),
  }));
  result.boxes = liveBoxes.map((b) => ({
    time1: barTime(bars, b.left, interval), price1: b.top, time2: barTime(bars, b.right, interval), price2: b.bottom,
    bgColor: b.bg, borderColor: b.border,
    ...(b.borderWidth !== 1 ? { borderWidth: b.borderWidth } : {}),
    ...(b.extend !== 'none' ? { extend: b.extend } : {}),
  }));
  result.tables = tables;
  return result;
}

export const TradersRealityMain = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
