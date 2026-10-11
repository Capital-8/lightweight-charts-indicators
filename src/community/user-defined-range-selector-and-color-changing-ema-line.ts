/**
 * User Defined Range Selector and Color Changing EMA Line
 *
 * An EMA of the source coloured by its slope over `slopeLength` bars (blue up, red down, gray flat within a dead
 * band). A source further than the overextension threshold from the EMA arms a bullish (below) or bearish (above)
 * setup. The setup is "reclaimed" when the close crosses the EMA acceptance level (EMA * (1 +- buffer), the buffer
 * adds a part of the ATR), and gives a reversal signal when the close stays on that side for `acceptBars` bars
 * within `maxSetupBars` bars of the setup. A reflection EMA (of the low) with a mirrored line at a percentage away,
 * a latent range inversion signal (the core / reflection EMA spread compresses while the setup is reclaimed),
 * legacy cross / overextension signals, a state background and data window values complete the display.
 *
 * Last bar: with 'Use confirmed bar close only' the reversal state machine and its signals run on a closed bar only.
 * The port reads the state of the last bar from the optional third argument (see src/chart-context.ts); without it
 * every bar is taken as closed.
 *
 * Reference: "User Defined Range Selector and Color Changing EMA Line" by Crypto_Moses
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Crypto_Moses
 */

import {
  ta, callsite, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface UserDefinedRangeSelectorInputs {
  len: number;
  slopeLength: number;
  /** EMA / overextension source */
  src: SourceType;
  /** Use confirmed bar close only */
  confirmedOnly: boolean;
  overextensionThresholdPct: number;
  flatSlopeDeadbandPct: number;
  acceptBars: number;
  maxSetupBars: number;
  acceptBufferPct: number;
  useAtrAcceptanceBuffer: boolean;
  atrLen: number;
  atrBufferMult: number;
  requireSlopeForReversal: boolean;
  /** Main signal mode: only feeds the final buy / sell alert conditions */
  signalMode: 'Reversal Only' | 'Legacy Only' | 'Both';
  /** Long-only guard: only feeds the final sell alert condition */
  longOnlyProfitGuard: boolean;
  showReflectionEMA: boolean;
  showMirroredEMA: boolean;
  showReflectionFill: boolean;
  reflectionSrc: SourceType;
  useCoreReflectionLen: boolean;
  reflectionLenInput: number;
  reflectionSlopeInput: number;
  percentAway: number;
  mirrorSide: 'Above' | 'Below' | 'Both';
  reflectionFilterMode: 'Off' | 'Close Beyond Reflection EMA' | 'Close Beyond Mirrored Band';
  showLatentInversion: boolean;
  includeLRIInFinalSignals: boolean;
  compressionLookback: number;
  compressionThreshPct: number;
  compressionMinReductionPct: number;
  considerSlope: boolean;
  considerStructure: boolean;
  showLegacySignals: boolean;
  signalOffset: number;
  showSetupMarkers: boolean;
  showReclaimMarkers: boolean;
  showStateBackground: boolean;
  showOverextensionData: boolean;
  showBufferData: boolean;
  showLRISpreadData: boolean;
  bgTransp: number;
  colorUp: string;
  colorDown: string;
  colorSideways: string;
  bullColor: string;
  bearColor: string;
  setupColor: string;
  legacyBuyCol: string;
  legacySellCol: string;
  reflectionColorUp: string;
  reflectionColorDown: string;
  reflectionColorSideways: string;
  mirroredLineColor: string;
  lriBullColor: string;
  lriBearColor: string;
}

export const defaultInputs: UserDefinedRangeSelectorInputs = {
  len: 69,
  slopeLength: 3,
  src: 'hlc3',
  confirmedOnly: true,
  overextensionThresholdPct: 10.1,
  flatSlopeDeadbandPct: 0.0,
  acceptBars: 2,
  maxSetupBars: 50,
  acceptBufferPct: 0.0,
  useAtrAcceptanceBuffer: true,
  atrLen: 14,
  atrBufferMult: 0.1,
  requireSlopeForReversal: false,
  signalMode: 'Reversal Only',
  longOnlyProfitGuard: false,
  showReflectionEMA: true,
  showMirroredEMA: true,
  showReflectionFill: false,
  reflectionSrc: 'low',
  useCoreReflectionLen: true,
  reflectionLenInput: 69,
  reflectionSlopeInput: 3,
  percentAway: 1.5,
  mirrorSide: 'Above',
  reflectionFilterMode: 'Off',
  showLatentInversion: true,
  includeLRIInFinalSignals: false,
  compressionLookback: 8,
  compressionThreshPct: 0.35,
  compressionMinReductionPct: 15.0,
  considerSlope: true,
  considerStructure: true,
  showLegacySignals: false,
  signalOffset: 0,
  showSetupMarkers: true,
  showReclaimMarkers: true,
  showStateBackground: true,
  showOverextensionData: true,
  showBufferData: true,
  showLRISpreadData: false,
  bgTransp: 88,
  colorUp: color.blue,
  colorDown: color.red,
  colorSideways: color.gray,
  bullColor: color.lime,
  bearColor: color.red,
  setupColor: color.yellow,
  legacyBuyCol: color.green,
  legacySellCol: color.maroon,
  reflectionColorUp: color.blue,
  reflectionColorDown: color.red,
  reflectionColorSideways: color.gray,
  mirroredLineColor: color.gray,
  lriBullColor: color.aqua,
  lriBearColor: color.fuchsia,
};

const gCore = 'Core EMA';
const gRev = 'Acceptance Reversal Engine';
const gRefl = 'Reflection EMA / Mirrored Line';
const gLri = 'Latent Range Inversion';
const gLegacy = 'Legacy Range Signals';
const gVis = 'Visuals';
const gCol = 'Colors';

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'EMA Length', defval: 69, min: 1, group: gCore },
  { id: 'slopeLength', type: 'int', title: 'Slope Length', defval: 3, min: 1, group: gCore },
  { id: 'src', type: 'source', title: 'EMA / Overextension Source', defval: 'hlc3', group: gCore },
  { id: 'confirmedOnly', type: 'bool', title: 'Use confirmed bar close only', defval: true, group: gCore },
  { id: 'overextensionThresholdPct', type: 'float', title: 'Overextension Threshold (%)', defval: 10.1, min: 0.1, step: 0.1, group: gCore },
  { id: 'flatSlopeDeadbandPct', type: 'float', title: 'Flat EMA Slope Deadband (%)', defval: 0.0, min: 0.0, step: 0.01, group: gCore },
  { id: 'acceptBars', type: 'int', title: 'Acceptance Bars After EMA Reclaim', defval: 2, min: 1, group: gRev },
  { id: 'maxSetupBars', type: 'int', title: 'Maximum Bars After Overextension Setup', defval: 50, min: 1, group: gRev },
  { id: 'acceptBufferPct', type: 'float', title: 'Base EMA Acceptance Buffer (%)', defval: 0.0, min: 0.0, step: 0.05, group: gRev },
  { id: 'useAtrAcceptanceBuffer', type: 'bool', title: 'Use ATR-Normalized Acceptance Buffer?', defval: true, group: gRev },
  { id: 'atrLen', type: 'int', title: 'ATR Buffer Length', defval: 14, min: 1, group: gRev },
  { id: 'atrBufferMult', type: 'float', title: 'ATR Buffer Multiplier', defval: 0.1, min: 0.0, step: 0.01, group: gRev },
  { id: 'requireSlopeForReversal', type: 'bool', title: 'Require EMA Slope In Reversal Direction?', defval: false, group: gRev },
  { id: 'signalMode', type: 'string', title: 'Main Signal Mode', defval: 'Reversal Only', options: ['Reversal Only', 'Legacy Only', 'Both'], group: gRev },
  { id: 'longOnlyProfitGuard', type: 'bool', title: 'Long-Only Guard: Suppress Sell Below Last Buy?', defval: false, group: gRev },
  { id: 'showReflectionEMA', type: 'bool', title: 'Show Reflection EMA', defval: true, group: gRefl },
  { id: 'showMirroredEMA', type: 'bool', title: 'Show Mirrored Reflection Line', defval: true, group: gRefl },
  { id: 'showReflectionFill', type: 'bool', title: 'Fill Reflection Channel', defval: false, group: gRefl },
  { id: 'reflectionSrc', type: 'source', title: 'Reflection Source', defval: 'low', group: gRefl },
  { id: 'useCoreReflectionLen', type: 'bool', title: 'Use Core EMA Length/Slope For Reflection?', defval: true, group: gRefl },
  { id: 'reflectionLenInput', type: 'int', title: 'Reflection EMA Length', defval: 69, min: 1, group: gRefl },
  { id: 'reflectionSlopeInput', type: 'int', title: 'Reflection Slope Length', defval: 3, min: 1, group: gRefl },
  { id: 'percentAway', type: 'float', title: 'Percentage Away For Mirrored Line', defval: 1.5, min: 0.1, step: 0.1, group: gRefl },
  { id: 'mirrorSide', type: 'string', title: 'Mirrored Line Side', defval: 'Above', options: ['Above', 'Below', 'Both'], group: gRefl },
  { id: 'reflectionFilterMode', type: 'string', title: 'Optional Reflection Reversal Filter', defval: 'Off', options: ['Off', 'Close Beyond Reflection EMA', 'Close Beyond Mirrored Band'], group: gRefl },
  { id: 'showLatentInversion', type: 'bool', title: 'Show Latent Range Inversion?', defval: true, group: gLri },
  { id: 'includeLRIInFinalSignals', type: 'bool', title: 'Include LRI In Final Buy/Sell Signals?', defval: false, group: gLri },
  { id: 'compressionLookback', type: 'int', title: 'Reflection Compression Lookback', defval: 8, min: 2, group: gLri },
  { id: 'compressionThreshPct', type: 'float', title: 'Compressed Spread Threshold (%)', defval: 0.35, min: 0.01, step: 0.01, group: gLri },
  { id: 'compressionMinReductionPct', type: 'float', title: 'Minimum Spread Reduction (%)', defval: 15.0, min: 0.0, max: 100.0, step: 1.0, group: gLri },
  { id: 'considerSlope', type: 'bool', title: 'Legacy: Consider EMA Slope?', defval: true, group: gLegacy },
  { id: 'considerStructure', type: 'bool', title: 'Legacy: Require HH/HL or LH/LL?', defval: true, group: gLegacy },
  { id: 'showLegacySignals', type: 'bool', title: 'Show Legacy Bounce/Cross Signals?', defval: false, group: gLegacy },
  { id: 'signalOffset', type: 'int', title: 'Signal Offset, 0 Recommended', defval: 0, min: 0, group: gVis },
  { id: 'showSetupMarkers', type: 'bool', title: 'Show Overextension Setup Markers?', defval: true, group: gVis },
  { id: 'showReclaimMarkers', type: 'bool', title: 'Show EMA Reclaim Markers?', defval: true, group: gVis },
  { id: 'showStateBackground', type: 'bool', title: 'Show Armed/Reclaimed Background?', defval: true, group: gVis },
  { id: 'showOverextensionData', type: 'bool', title: 'Show Overextension In Data Window?', defval: true, group: gVis },
  { id: 'showBufferData', type: 'bool', title: 'Show Effective Acceptance Buffer In Data Window?', defval: true, group: gVis },
  { id: 'showLRISpreadData', type: 'bool', title: 'Show LRI Spread Data In Data Window?', defval: false, group: gVis },
  { id: 'bgTransp', type: 'int', title: 'Background Transparency', defval: 88, min: 0, max: 100, group: gVis },
  { id: 'colorUp', type: 'color', title: 'EMA Color: Upward Slope', defval: color.blue, group: gCol },
  { id: 'colorDown', type: 'color', title: 'EMA Color: Downward Slope', defval: color.red, group: gCol },
  { id: 'colorSideways', type: 'color', title: 'EMA Color: Sideways', defval: color.gray, group: gCol },
  { id: 'bullColor', type: 'color', title: 'Bullish Reversal Color', defval: color.lime, group: gCol },
  { id: 'bearColor', type: 'color', title: 'Bearish Reversal Color', defval: color.red, group: gCol },
  { id: 'setupColor', type: 'color', title: 'Setup/Reclaim Color', defval: color.yellow, group: gCol },
  { id: 'legacyBuyCol', type: 'color', title: 'Legacy Buy Color', defval: color.green, group: gCol },
  { id: 'legacySellCol', type: 'color', title: 'Legacy Sell Color', defval: color.maroon, group: gCol },
  { id: 'reflectionColorUp', type: 'color', title: 'Reflection EMA: Upward Slope', defval: color.blue, group: gCol },
  { id: 'reflectionColorDown', type: 'color', title: 'Reflection EMA: Downward Slope', defval: color.red, group: gCol },
  { id: 'reflectionColorSideways', type: 'color', title: 'Reflection EMA: Sideways', defval: color.gray, group: gCol },
  { id: 'mirroredLineColor', type: 'color', title: 'Mirrored Line Color', defval: color.gray, group: gCol },
  { id: 'lriBullColor', type: 'color', title: 'Bullish LRI Color', defval: color.aqua, group: gCol },
  { id: 'lriBearColor', type: 'color', title: 'Bearish LRI Color', defval: color.fuchsia, group: gCol },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Color Changing EMA', color: color.blue, lineWidth: 2 },
  { id: 'plot1', title: 'Reflection EMA', color: color.blue, lineWidth: 1 },
  { id: 'plot2', title: 'Mirrored EMA Upper', color: color.gray, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Mirrored EMA Lower', color: color.gray, lineWidth: 1, style: 'circles' },
  { id: 'plot4', title: 'Overextension %', color: color.purple, lineWidth: 1, style: 'histogram', display: 'data_window' },
  { id: 'plot5', title: 'Effective Acceptance Buffer %', color: color.orange, lineWidth: 1, display: 'data_window' },
  { id: 'plot6', title: 'Core/Reflection Spread %', color: color.aqua, lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'User Defined Range Selector and Color Changing EMA Line',
  shortTitle: 'UserRange',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<UserDefinedRangeSelectorInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);

  const overextensionThreshold = cfg.overextensionThresholdPct / 100.0;
  const flatSlopeDeadband = cfg.flatSlopeDeadbandPct / 100.0;
  const acceptBufferPct = cfg.acceptBufferPct / 100.0;
  const compressionThreshPct = cfg.compressionThreshPct / 100.0;
  const compressionMinReductionPct = cfg.compressionMinReductionPct / 100.0;

  // Core EMA
  const src = A(getSourceSeries(bars, cfg.src));
  const emaLine = A(ta.ema(S(src), cfg.len));
  const atrValue = A(ta.atr(bars, cfg.atrLen));

  // Reflection EMA
  const reflectionLen = cfg.useCoreReflectionLen ? cfg.len : cfg.reflectionLenInput;
  const reflectionSlopeLength = cfg.useCoreReflectionLen ? cfg.slopeLength : cfg.reflectionSlopeInput;
  const reflSrc = A(getSourceSeries(bars, cfg.reflectionSrc));
  const reflectionEMA = A(ta.ema(S(reflSrc), reflectionLen));
  const mirrorPct = cfg.percentAway / 100.0;
  const showUpperMirror = cfg.showMirroredEMA && (cfg.mirrorSide === 'Above' || cfg.mirrorSide === 'Both');
  const showLowerMirror = cfg.showMirroredEMA && (cfg.mirrorSide === 'Below' || cfg.mirrorSide === 'Both');

  // Legacy crosses: ta.crossover / ta.crossunder (exact comparisons, oakscriptjs), run on every bar
  const crossUp = A(ta.crossover(S(src), S(emaLine)));
  const crossDown = A(ta.crossunder(S(src), S(emaLine)));

  // Per-bar series used by the state machine
  const emaColor: string[] = new Array(n);
  const reflColor: string[] = new Array(n);
  const mirroredUpper: number[] = new Array(n);
  const mirroredLower: number[] = new Array(n);
  const overextensionPct: number[] = new Array(n);
  const effBufferDisplay: number[] = new Array(n);
  const spread: number[] = new Array(n);
  const bullAcceptLevel: number[] = new Array(n);
  const bearAcceptLevel: number[] = new Array(n);

  // ta.barssince(close <= bullAcceptLevel) / ta.barssince(close >= bearAcceptLevel): one site each, every bar
  const bsBull = callsite.barssince();
  const bsBear = callsite.barssince();

  // var state
  let bullArmed = false;
  let bearArmed = false;
  let bullReclaimed = false;
  let bearReclaimed = false;
  let bullSetupBar = NaN;
  let bearSetupBar = NaN;

  const interval = barInterval(bars);
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const t = (i: number) => bars[i].time;
  // plotshape(..., offset = -signalOffset): the value of bar i is drawn on bar i - signalOffset
  const pushShape = (i: number, offset: number, m: Omit<MarkerData, 'time'>) => {
    const j = i - offset;
    if (j < 0) return;
    markers.push({ time: barTime(bars, j, interval), ...m });
  };

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const e = emaLine[i];
    const emaNonZero = ne(e, 0);

    // slope = emaLine - emaLine[slopeLength]; slopePct = emaLine != 0.0 ? slope / emaLine : 0.0
    const slope = e - at(emaLine, i - cfg.slopeLength);
    const slopePct = emaNonZero ? slope / e : 0.0;
    const emaSlopeUp = gt(slopePct, flatSlopeDeadband);
    const emaSlopeDown = lt(slopePct, -flatSlopeDeadband);
    emaColor[i] = emaSlopeUp ? cfg.colorUp : emaSlopeDown ? cfg.colorDown : cfg.colorSideways;

    const overextension = emaNonZero ? Math.abs(src[i] - e) / e : 0.0;
    overextensionPct[i] = overextension * 100.0;
    const bullOverextended = lt(src[i], e) && ge(overextension, overextensionThreshold);
    const bearOverextended = gt(src[i], e) && ge(overextension, overextensionThreshold);

    const prev = i > 0 ? bars[i - 1] : undefined;
    const higherHigh = prev !== undefined && gt(b.high, prev.high);
    const higherLow = prev !== undefined && gt(b.low, prev.low);
    const lowerHigh = prev !== undefined && lt(b.high, prev.high);
    const lowerLow = prev !== undefined && lt(b.low, prev.low);
    const bullStructureOk = !cfg.considerStructure || higherHigh || higherLow;
    const bearStructureOk = !cfg.considerStructure || lowerHigh || lowerLow;

    // ATR acceptance buffer
    const atrBufferPct = emaNonZero ? (atrValue[i] * cfg.atrBufferMult) / e : 0.0;
    const effectiveAcceptBufferPct = acceptBufferPct + (cfg.useAtrAcceptanceBuffer ? atrBufferPct : 0.0);
    effBufferDisplay[i] = effectiveAcceptBufferPct * 100.0;

    // Reflection EMA / mirrored line
    const r = reflectionEMA[i];
    const reflectionSlope = r - at(reflectionEMA, i - reflectionSlopeLength);
    const reflectionSlopePct = ne(r, 0) ? reflectionSlope / r : 0.0;
    const reflectionSlopeUp = gt(reflectionSlopePct, flatSlopeDeadband);
    const reflectionSlopeDown = lt(reflectionSlopePct, -flatSlopeDeadband);
    reflColor[i] = reflectionSlopeUp ? cfg.reflectionColorUp : reflectionSlopeDown ? cfg.reflectionColorDown : cfg.reflectionColorSideways;
    mirroredUpper[i] = r * (1.0 + mirrorPct);
    mirroredLower[i] = r * (1.0 - mirrorPct);
    const bullReflectionOk = cfg.reflectionFilterMode === 'Off' ? true
      : cfg.reflectionFilterMode === 'Close Beyond Reflection EMA' ? gt(b.close, r) : gt(b.close, mirroredUpper[i]);
    const bearReflectionOk = cfg.reflectionFilterMode === 'Off' ? true
      : cfg.reflectionFilterMode === 'Close Beyond Reflection EMA' ? lt(b.close, r) : lt(b.close, mirroredLower[i]);

    // Legacy range signals
    const legacyCrossBuy = crossUp[i] === 1 && (!cfg.considerSlope || emaSlopeUp) && bullStructureOk;
    const legacyCrossSell = crossDown[i] === 1 && (!cfg.considerSlope || emaSlopeDown) && bearStructureOk;
    const legacyBuyRaw = legacyCrossBuy || bullOverextended;
    const legacySellRaw = legacyCrossSell || bearOverextended;

    // Acceptance levels
    bullAcceptLevel[i] = e * (1.0 + effectiveAcceptBufferPct);
    bearAcceptLevel[i] = e * (1.0 - effectiveAcceptBufferPct);
    const bsUp = bsBull(le(b.close, bullAcceptLevel[i]));
    const bsDn = bsBear(ge(b.close, bearAcceptLevel[i]));
    const acceptedAboveEMA = (isNaN(bsUp) ? cfg.acceptBars : bsUp) >= cfg.acceptBars;
    const acceptedBelowEMA = (isNaN(bsDn) ? cfg.acceptBars : bsDn) >= cfg.acceptBars;
    const bullReclaimNow = gt(b.close, bullAcceptLevel[i]) && prev !== undefined && le(prev.close, bullAcceptLevel[i - 1]);
    const bearReclaimNow = lt(b.close, bearAcceptLevel[i]) && prev !== undefined && ge(prev.close, bearAcceptLevel[i - 1]);

    // State machine (canProcess = not confirmedOnly or barstate.isconfirmed)
    const canProcess = !cfg.confirmedOnly || barIsConfirmed(i);
    if (canProcess) {
      if (bullOverextended) {
        bullArmed = true;
        bullReclaimed = false;
        bullSetupBar = i;
        bearArmed = false;
        bearReclaimed = false;
        bearSetupBar = NaN;
      }
      if (bearOverextended) {
        bearArmed = true;
        bearReclaimed = false;
        bearSetupBar = i;
        bullArmed = false;
        bullReclaimed = false;
        bullSetupBar = NaN;
      }
      if (bullArmed && !isNaN(bullSetupBar) && i - bullSetupBar > cfg.maxSetupBars) {
        bullArmed = false;
        bullReclaimed = false;
        bullSetupBar = NaN;
      }
      if (bearArmed && !isNaN(bearSetupBar) && i - bearSetupBar > cfg.maxSetupBars) {
        bearArmed = false;
        bearReclaimed = false;
        bearSetupBar = NaN;
      }
      if (bullArmed && bullReclaimNow) bullReclaimed = true;
      if (bearArmed && bearReclaimNow) bearReclaimed = true;
    }

    const bullSetupFresh = bullArmed && !isNaN(bullSetupBar) && i - bullSetupBar <= cfg.maxSetupBars;
    const bearSetupFresh = bearArmed && !isNaN(bearSetupBar) && i - bearSetupBar <= cfg.maxSetupBars;
    const bullSlopeOk = !cfg.requireSlopeForReversal || emaSlopeUp;
    const bearSlopeOk = !cfg.requireSlopeForReversal || emaSlopeDown;
    const bullReversalRaw = canProcess && bullSetupFresh && bullReclaimed && acceptedAboveEMA && bullSlopeOk && bullReflectionOk;
    const bearReversalRaw = canProcess && bearSetupFresh && bearReclaimed && acceptedBelowEMA && bearSlopeOk && bearReflectionOk;

    // Latent range inversion
    const sp = emaNonZero ? Math.abs(e - r) / e : 0.0;
    spread[i] = sp;
    const spreadLookbackValue = at(spread, i - cfg.compressionLookback);
    const spreadWasWider = !isNaN(spreadLookbackValue) && gt(spreadLookbackValue, sp);
    const spreadReduction = !isNaN(spreadLookbackValue) && ne(spreadLookbackValue, 0)
      ? (spreadLookbackValue - sp) / spreadLookbackValue : 0.0;
    const spreadCompressedEnough = le(sp, compressionThreshPct);
    const spreadReducedEnough = ge(spreadReduction, compressionMinReductionPct);
    const reflectionCompression = spreadWasWider && spreadCompressedEnough && spreadReducedEnough;
    const bullLatentInversion = cfg.showLatentInversion && canProcess && bullSetupFresh && bullReclaimed && acceptedAboveEMA
      && !emaSlopeUp && reflectionCompression && gt(b.close, r);
    const bearLatentInversion = cfg.showLatentInversion && canProcess && bearSetupFresh && bearReclaimed && acceptedBelowEMA
      && !emaSlopeDown && reflectionCompression && lt(b.close, r);

    // Final signals (buySignal / sellSignal, signalMode, longOnlyProfitGuard) only feed alert conditions.
    // The reset after a reversal changes the state drawn below.
    if (bullReversalRaw || (cfg.includeLRIInFinalSignals && bullLatentInversion)) {
      bullArmed = false;
      bullReclaimed = false;
      bullSetupBar = NaN;
    }
    if (bearReversalRaw || (cfg.includeLRIInFinalSignals && bearLatentInversion)) {
      bearArmed = false;
      bearReclaimed = false;
      bearSetupBar = NaN;
    }

    // Shapes
    const off = cfg.signalOffset;
    if (bullReversalRaw) {
      pushShape(i, off, { position: 'belowBar', shape: 'triangleUp', color: cfg.bullColor, text: 'REV\nBUY', textColor: color.white, size: 'small' });
    }
    if (bearReversalRaw) {
      pushShape(i, off, { position: 'aboveBar', shape: 'triangleDown', color: cfg.bearColor, text: 'REV\nSELL', textColor: color.white, size: 'small' });
    }
    if (bullLatentInversion) {
      pushShape(i, off, { position: 'belowBar', shape: 'diamond', color: cfg.lriBullColor, text: 'LRI', textColor: color.black, size: 'small' });
    }
    if (bearLatentInversion) {
      pushShape(i, off, { position: 'aboveBar', shape: 'diamond', color: cfg.lriBearColor, text: 'LRI', textColor: color.white, size: 'small' });
    }
    if (cfg.showLegacySignals && legacyBuyRaw && !bullReversalRaw) {
      pushShape(i, off, { position: 'belowBar', shape: 'circle', color: cfg.legacyBuyCol, text: 'RANGE', textColor: color.white, size: 'tiny' });
    }
    if (cfg.showLegacySignals && legacySellRaw && !bearReversalRaw) {
      pushShape(i, off, { position: 'aboveBar', shape: 'circle', color: cfg.legacySellCol, text: 'RANGE', textColor: color.white, size: 'tiny' });
    }
    if (cfg.showSetupMarkers && bullOverextended) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'diamond', color: cfg.setupColor, text: 'EXT', textColor: color.black, size: 'tiny' });
    }
    if (cfg.showSetupMarkers && bearOverextended) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'diamond', color: cfg.setupColor, text: 'EXT', textColor: color.black, size: 'tiny' });
    }
    if (cfg.showReclaimMarkers && bullArmed && bullReclaimNow) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'labelUp', color: String(color.new(cfg.bullColor, 0)), text: 'RECLAIM', textColor: color.white, size: 'tiny' });
    }
    if (cfg.showReclaimMarkers && bearArmed && bearReclaimNow) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'labelDown', color: String(color.new(cfg.bearColor, 0)), text: 'LOSS', textColor: color.white, size: 'tiny' });
    }

    // Range state background
    const bg = !cfg.showStateBackground ? null
      : bullReclaimed ? cfg.bullColor
        : bearReclaimed ? cfg.bearColor
          : bullArmed ? color.blue
            : bearArmed ? color.orange : null;
    if (bg !== null) bgColors.push({ time: t(i), color: String(color.new(bg, cfg.bgTransp)) });
  }

  const P = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: emaLine[i], color: emaColor[i] })),
    plot1: P((i) => ({ time: t(i), value: cfg.showReflectionEMA ? reflectionEMA[i] : NaN, color: reflColor[i] })),
    plot2: P((i) => ({ time: t(i), value: showUpperMirror ? mirroredUpper[i] : NaN, color: cfg.mirroredLineColor })),
    plot3: P((i) => ({ time: t(i), value: showLowerMirror ? mirroredLower[i] : NaN, color: cfg.mirroredLineColor })),
    plot4: P((i) => ({ time: t(i), value: cfg.showOverextensionData ? overextensionPct[i] : NaN, color: color.purple })),
    plot5: P((i) => ({ time: t(i), value: cfg.showBufferData ? effBufferDisplay[i] : NaN, color: color.orange })),
    plot6: P((i) => ({ time: t(i), value: cfg.showLRISpreadData ? spread[i] * 100.0 : NaN, color: color.aqua })),
  };

  // fill(reflectionPlot, mirroredUpperPlot / mirroredLowerPlot, showReflectionFill and show... ? color.new(mirroredLineColor, 90) : na)
  const fillColour = String(color.new(cfg.mirroredLineColor, 90));
  const fills = [
    { plot1: 'plot1', plot2: 'plot2', options: { title: 'Upper Reflection Channel Fill' },
      colors: bars.map(() => (cfg.showReflectionFill && showUpperMirror ? fillColour : 'transparent')) },
    { plot1: 'plot1', plot2: 'plot3', options: { title: 'Lower Reflection Channel Fill' },
      colors: bars.map(() => (cfg.showReflectionFill && showLowerMirror ? fillColour : 'transparent')) },
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    bgColors,
  };
}

export const UserDefinedRangeSelector = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
