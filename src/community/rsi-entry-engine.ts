/**
 * RSI Entry Engine [trade_w_samet]
 *
 * RSI of the source, smoothed ('RSI Smoothing': None / EMA / SMA / RMA) and a signal line (a second average of the
 * smoothed RSI). The RSI line is red at or above 'Extreme High', green at or below 'Extreme Low', else blue, and the
 * background of these bars is coloured. Levels: 100, 0, 50, overbought, oversold and the two extreme levels, with a
 * fill above the overbought level and below the oversold level.
 *
 * Signals (on closed bars only): "UP" label when the RSI crosses over 'Extreme Low', "DOWN" label when it crosses
 * under 'Extreme High'. With 'Show TP / SL Boxes On Main Chart' each signal makes a trade projection on the price
 * pane: entry price (close, open or hlc3), stop (the signal candle, the ATR or a percentage, at least one tick from
 * the entry), target at 'Risk / Reward' times the risk; a green target box, a red stop box, an entry line and a
 * "BUY" / "SELL" label. The boxes grow to the right until the target or the stop is touched on a later bar (both on
 * one bar: 'Same-Bar TP / SL Priority'), where a "TP HIT" or "SL HIT" label is drawn. Only the newest 'Max Stored
 * Trade Projections' projections are kept. A status table is filled on the last bar.
 *
 * Chart values read (optional third argument of calculate): the symbol tick (the least distance of the stop from the
 * entry, and the prices in the label tooltips; without it 0.01) and the state of the last bar (no signal on a last
 * bar that is still open; without it the last bar is taken as closed).
 * Alerts (alertcondition, `alerts` of the result): the 12 conditions of the original (RSI / signal crosses, oversold
 * reclaim, overbought reject, centerline crosses, the confirmed entry signals and the TP / SL hits of the trade
 * projections), each gated by its 'Enable ... Alerts' input.
 *
 * Reference: "RSI Entry Engine [trade_w_samet]" by tradewsamet
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, getSourceSeries, color, math, str, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BgColorData, BoxData, LabelData, LabelStyle, LineDrawingData, PineSize, TableCellData, TableData, TablePosition } from '../types';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RsiEntryEngineInputs {
  rsiSource: SourceType;
  rsiLength: number;
  smoothMode: 'None' | 'EMA' | 'SMA' | 'RMA';
  smoothLen: number;
  signalLen: number;
  signalMode: 'EMA' | 'SMA' | 'RMA';
  overbought: number;
  oversold: number;
  extremeHigh: number;
  extremeLow: number;
  showTradeBoxes: boolean;
  entryMode: 'Close' | 'Open' | 'HLC3';
  slMode: 'Signal Candle' | 'ATR' | 'Percent';
  rrTarget: number;
  atrLen: number;
  atrMult: number;
  percentSL: number;
  sameBarPriority: 'SL' | 'TP';
  maxStoredTrades: number;
  showBgExtreme: boolean;
  showPanel: boolean;
  panelPosition: 'Top Right' | 'Top Left' | 'Bottom Right' | 'Bottom Left';
  panelTextSize: 'Tiny' | 'Small' | 'Normal';
  labelTextSize: 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  enableCrossAlerts: boolean;
  enableZoneAlerts: boolean;
  enableCenterAlerts: boolean;
  enableSignalAlerts: boolean;
  enableTradeAlerts: boolean;
}

export const defaultInputs: RsiEntryEngineInputs = {
  rsiSource: 'close',
  rsiLength: 14,
  smoothMode: 'EMA',
  smoothLen: 5,
  signalLen: 9,
  signalMode: 'EMA',
  overbought: 70,
  oversold: 30,
  extremeHigh: 80,
  extremeLow: 20,
  showTradeBoxes: true,
  entryMode: 'Close',
  slMode: 'ATR',
  rrTarget: 5.0,
  atrLen: 14,
  atrMult: 1.0,
  percentSL: 0.5,
  sameBarPriority: 'SL',
  maxStoredTrades: 20,
  showBgExtreme: true,
  showPanel: true,
  panelPosition: 'Top Right',
  panelTextSize: 'Small',
  labelTextSize: 'Normal',
  enableCrossAlerts: true,
  enableZoneAlerts: true,
  enableCenterAlerts: true,
  enableSignalAlerts: true,
  enableTradeAlerts: true,
};

const G_RSI = '⚙️ RSI Engine';
const G_LEVELS = '📊 RSI Levels';
const G_TRADE = '🎯 Trade Projection';
const G_VISUAL = '🎨 Visual Settings';
const G_ALERTS = '🔔 Alerts';

export const inputConfig: InputConfig[] = [
  {
    id: 'rsiSource', type: 'source', title: '📌 RSI Source', defval: 'close', group: G_RSI, display: 'none',
    tooltip: 'Selects the price source used to calculate the RSI engine. Close is the default and most common choice.',
  },
  {
    id: 'rsiLength', type: 'int', title: '📏 RSI Length', defval: 14, min: 1, group: G_RSI, display: 'none',
    tooltip: 'Controls the base RSI calculation length. Lower values react faster, while higher values create smoother RSI behavior.',
  },
  {
    id: 'smoothMode', type: 'string', title: '〰️ RSI Smoothing', defval: 'EMA', options: ['None', 'EMA', 'SMA', 'RMA'], group: G_RSI, display: 'none',
    tooltip: 'Applies optional smoothing to the raw RSI value. EMA is responsive, SMA is simpler, and RMA is smoother.',
  },
  {
    id: 'smoothLen', type: 'int', title: '🔧 Smoothing Length', defval: 5, min: 1, group: G_RSI, display: 'none',
    tooltip: 'Controls how much smoothing is applied to the RSI line. Higher values reduce noise but may delay signals.',
  },
  {
    id: 'signalLen', type: 'int', title: '📐 Signal Length', defval: 9, min: 1, group: G_RSI, display: 'none',
    tooltip: 'Length used for the RSI signal line. This helps compare RSI momentum against its own smoothed signal.',
  },
  {
    id: 'signalMode', type: 'string', title: '📡 Signal Smoothing', defval: 'EMA', options: ['EMA', 'SMA', 'RMA'], group: G_RSI, display: 'none',
    tooltip: 'Smoothing method used for the RSI signal line. EMA is the default balanced option.',
  },
  {
    id: 'overbought', type: 'int', title: '🔴 Overbought', defval: 70, min: 50, max: 100, group: G_LEVELS, display: 'none',
    tooltip: 'Defines the standard overbought zone. RSI values above this level indicate stronger bullish pressure or potential exhaustion.',
  },
  {
    id: 'oversold', type: 'int', title: '🟢 Oversold', defval: 30, min: 0, max: 50, group: G_LEVELS, display: 'none',
    tooltip: 'Defines the standard oversold zone. RSI values below this level indicate stronger bearish pressure or potential exhaustion.',
  },
  {
    id: 'extremeHigh', type: 'int', title: '🚨 Extreme High', defval: 80, min: 60, max: 100, group: G_LEVELS, display: 'none',
    tooltip: 'Defines the upper extreme zone. Short-side rejection signals are generated when RSI crosses back down from this area.',
  },
  {
    id: 'extremeLow', type: 'int', title: '✅ Extreme Low', defval: 20, min: 0, max: 40, group: G_LEVELS, display: 'none',
    tooltip: 'Defines the lower extreme zone. Long-side reclaim signals are generated when RSI crosses back up from this area.',
  },
  {
    id: 'showTradeBoxes', type: 'bool', title: '📦 Show TP / SL Boxes On Main Chart', defval: true, group: G_TRADE, display: 'none',
    tooltip: 'Shows projected entry, take-profit, and stop-loss boxes on the main price chart when a confirmed RSI signal appears.',
  },
  {
    id: 'entryMode', type: 'string', title: '🎯 Entry Price', defval: 'Close', options: ['Close', 'Open', 'HLC3'], group: G_TRADE, display: 'none',
    tooltip: 'Selects which price is used as the projected entry level after a confirmed RSI signal.',
  },
  {
    id: 'slMode', type: 'string', title: '🛡️ Stop Loss Mode', defval: 'ATR', options: ['Signal Candle', 'ATR', 'Percent'], group: G_TRADE, display: 'none',
    tooltip: 'Controls how the projected stop-loss is calculated. ATR adapts to volatility, Signal Candle uses the signal candle, and Percent uses fixed percentage distance.',
  },
  {
    id: 'rrTarget', type: 'float', title: '💎 Risk / Reward', defval: 5.0, min: 0.1, step: 0.1, group: G_TRADE, display: 'none',
    tooltip: 'Sets the projected take-profit distance based on risk. Example: 5.0 means TP is placed at 5R.',
  },
  {
    id: 'atrLen', type: 'int', title: '📏 ATR Length', defval: 14, min: 1, group: G_TRADE, display: 'none',
    tooltip: 'ATR length used when Stop Loss Mode is set to ATR. Higher values create smoother volatility measurement.',
  },
  {
    id: 'atrMult', type: 'float', title: '⚡ ATR Multiplier', defval: 1.0, min: 0.1, step: 0.1, group: G_TRADE, display: 'none',
    tooltip: 'Multiplier applied to ATR when calculating the projected stop-loss distance.',
  },
  {
    id: 'percentSL', type: 'float', title: '📉 Percent Stop Loss', defval: 0.5, min: 0.01, step: 0.01, group: G_TRADE, display: 'none',
    tooltip: 'Fixed percentage stop-loss distance used only when Stop Loss Mode is set to Percent.',
  },
  {
    id: 'sameBarPriority', type: 'string', title: '⚖️ Same-Bar TP / SL Priority', defval: 'SL', options: ['SL', 'TP'], group: G_TRADE, display: 'none',
    tooltip: 'Chooses which result is counted first if TP and SL are both touched on the same candle. SL is more conservative.',
  },
  {
    id: 'maxStoredTrades', type: 'int', title: '🗂️ Max Stored Trade Projections', defval: 20, min: 1, max: 100, group: G_TRADE, display: 'none',
    tooltip: 'Limits how many historical trade projection objects remain visible on the chart.',
  },
  {
    id: 'showBgExtreme', type: 'bool', title: '🌈 Highlight Extreme Background', defval: true, group: G_VISUAL, display: 'none',
    tooltip: 'Highlights the RSI pane background when RSI enters extreme high or extreme low zones.',
  },
  {
    id: 'showPanel', type: 'bool', title: '📋 Show Status Panel', defval: true, group: G_VISUAL, display: 'none',
    tooltip: 'Shows or hides the compact RSI status panel.',
  },
  {
    id: 'panelPosition', type: 'string', title: '📍 Panel Position', defval: 'Top Right', options: ['Top Right', 'Top Left', 'Bottom Right', 'Bottom Left'],
    group: G_VISUAL, display: 'none', tooltip: 'Controls where the RSI status panel is displayed on the chart.',
  },
  {
    id: 'panelTextSize', type: 'string', title: '🔤 Panel Text Size', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], group: G_VISUAL, display: 'none',
    tooltip: 'Controls the text size of the RSI status panel.',
  },
  {
    id: 'labelTextSize', type: 'string', title: '🏷️ Label Text Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: G_VISUAL, display: 'none',
    tooltip: 'Controls the size of all chart labels including UP, DOWN, BUY, SELL, TP HIT, and SL HIT labels.',
  },
  {
    id: 'enableCrossAlerts', type: 'bool', title: '🔁 Enable RSI / Signal Cross Alerts', defval: true, group: G_ALERTS, display: 'none',
    tooltip: 'Enables alerts when RSI crosses above or below its signal line.',
  },
  {
    id: 'enableZoneAlerts', type: 'bool', title: '📊 Enable Overbought / Oversold Reclaim Alerts', defval: true, group: G_ALERTS, display: 'none',
    tooltip: 'Enables alerts when RSI reclaims oversold or rejects from overbought areas.',
  },
  {
    id: 'enableCenterAlerts', type: 'bool', title: '⚖️ Enable Centerline Alerts', defval: true, group: G_ALERTS, display: 'none',
    tooltip: 'Enables alerts when RSI crosses the 50 centerline.',
  },
  {
    id: 'enableSignalAlerts', type: 'bool', title: '🚀 Enable Entry Signal Alerts', defval: true, group: G_ALERTS, display: 'none',
    tooltip: 'Enables alerts for confirmed long and short RSI entry signals.',
  },
  {
    id: 'enableTradeAlerts', type: 'bool', title: '🎯 Enable TP / SL Hit Alerts', defval: true, group: G_ALERTS, display: 'none',
    tooltip: 'Enables alerts when projected TP or SL levels are reached.',
  },
];

const CLR_BG = color.rgb(13, 17, 23);
const CLR_HEADER = String(color.rgb(31, 41, 55));
const CLR_BORDER = String(color.rgb(48, 54, 61));
const CLR_TEXT = String(color.rgb(255, 255, 255));
const CLR_MUTED = color.rgb(139, 148, 158);
const CLR_BLUE = String(color.rgb(88, 166, 255));
const CLR_GREEN = String(color.rgb(34, 197, 94));
const CLR_RED = String(color.rgb(239, 68, 68));
const CLR_CARD_A = String(color.rgb(22, 27, 34));
const CLR_CARD_B = String(color.rgb(18, 22, 28));
const CLR_LINE_DARK = String(color.rgb(20, 20, 20));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: CLR_BLUE, lineWidth: 3 },
  { id: 'plot1', title: 'Signal', color: String(color.new(CLR_TEXT, 35)), lineWidth: 2 },
];

const hlineList = (ob: number, os: number, eh: number, el: number): HLineConfig[] => [
  { id: 'hline_100', price: 100, title: '100', color: String(color.new(CLR_MUTED, 100)), linestyle: 'dashed' },
  { id: 'hline_0', price: 0, title: '0', color: String(color.new(CLR_MUTED, 100)), linestyle: 'dashed' },
  { id: 'hline_center', price: 50, title: 'Center', color: String(color.new(CLR_MUTED, 60)), linestyle: 'dotted' },
  { id: 'hline_ob', price: ob, title: 'Overbought', color: String(color.new(CLR_RED, 30)), linestyle: 'dashed' },
  { id: 'hline_os', price: os, title: 'Oversold', color: String(color.new(CLR_GREEN, 30)), linestyle: 'dashed' },
  { id: 'hline_eh', price: eh, title: 'Extreme High', color: String(color.new(CLR_RED, 55)), linestyle: 'dotted' },
  { id: 'hline_el', price: el, title: 'Extreme Low', color: String(color.new(CLR_GREEN, 55)), linestyle: 'dotted' },
];

/** The 7 levels with the default inputs (the result `hlines` carry the input values) */
export const hlineConfig: HLineConfig[] = hlineList(70, 30, 80, 20);

export const fillConfig: FillConfig[] = [
  { id: 'fill_ob', plot1: 'hline_ob', plot2: 'hline_100', color: String(color.new(CLR_RED, 70)), title: 'Overbought Zone' },
  { id: 'fill_os', plot1: 'hline_os', plot2: 'hline_0', color: String(color.new(CLR_GREEN, 70)), title: 'Oversold Zone' },
];

export const metadata = {
  title: 'RSI Entry Engine [trade_w_samet]',
  shortTitle: 'RSI Entry Engine [trade_w_samet]',
  overlay: false,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a - b >= -1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

const TXT_UP = '𝙐𝙋';
const TXT_DOWN = '𝘿𝙊𝙒𝙉';
const TXT_BUY = '𝘽𝙐𝙔';
const TXT_SELL = '𝙎𝙀𝙇𝙇';
const TXT_TP_HIT = '𝙏𝙋 𝙃𝙄𝙏';
const TXT_SL_HIT = '𝙎𝙇 𝙃𝙄𝙏';
/** text.format_bold + text.format_italic */
const BOLD_ITALIC = 3;

interface Trade {
  /** 1 = long, -1 = short */
  dir: number;
  tp: number;
  sl: number;
  startBar: number;
  active: boolean;
  tpBox: { left: number; right: number; top: number; bottom: number };
  slBox: { left: number; right: number; top: number; bottom: number };
  line: { x1: number; x2: number; y: number };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiEntryEngineInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
    bgColors: BgColorData[];
    lines: LineDrawingData[];
    boxes: BoxData[];
    labels: LabelData[];
    tables: TableData[];
  } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { overbought, oversold, extremeHigh, extremeLow, slMode, rrTarget } = cfg;
  const n = bars.length;
  // syminfo.mintick, barstate.isconfirmed
  const mintick = mintickOf(chart);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const ma = (src: Series, len: number, mode: string): Series =>
    mode === 'EMA' ? ta.ema(src, len) : mode === 'SMA' ? ta.sma(src, len) : mode === 'RMA' ? ta.rma(src, len) : src;

  const rsiRaw = ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLength);
  const rsiSmoothSeries = cfg.smoothMode === 'None' ? rsiRaw : ma(rsiRaw, cfg.smoothLen, cfg.smoothMode);
  const signalSeries = ma(rsiSmoothSeries, cfg.signalLen, cfg.signalMode);
  const rsiSmooth = A(rsiSmoothSeries);
  const signal = A(signalSeries);
  const atrValue = A(ta.atr(bars, cfg.atrLen));
  const crossUp = A(ta.crossover(rsiSmoothSeries, extremeLow) as unknown as Series).map((v) => Boolean(v));
  const crossDown = A(ta.crossunder(rsiSmoothSeries, extremeHigh) as unknown as Series).map((v) => Boolean(v));

  const labelSize = ({ Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' } as const)[cfg.labelTextSize] ?? 'normal';
  const formatPrice = (v: number) => str.tostring(v, 'mintick', mintick);
  const formatRsi = (v: number) => str.tostring(v, '#.##');

  const bgColors: BgColorData[] = [];
  const bgHigh = String(color.new(CLR_RED, 80));
  const bgLow = String(color.new(CLR_GREEN, 80));
  const rsiPlot: Array<{ time: number; value: number; color: string }> = [];

  // Labels in creation order. Above max + 5 labels the oldest are deleted until max remain.
  let labels: LabelData[] = [];
  const newLabel = (
    index: number, price: number, text: string, style: LabelStyle, bg: string, tooltip: string, overlay: boolean,
  ) => {
    labels.push({
      time: barTime(bars, index), price, text, style, color: bg, textColor: CLR_TEXT, size: labelSize as PineSize,
      textFormatting: BOLD_ITALIC, tooltip, ...(overlay ? { forceOverlay: true } : {}),
    });
    if (labels.length > MAX_LABELS + 5) labels = labels.slice(labels.length - MAX_LABELS);
  };

  const trades: Trade[] = [];
  const upFlags: boolean[] = new Array(n).fill(false);
  const downFlags: boolean[] = new Array(n).fill(false);
  // longTpHitBar, longSlHitBar, shortTpHitBar, shortSlHitBar
  const hitFlags: boolean[][] = [0, 1, 2, 3].map(() => new Array(n).fill(false));

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const rsi = rsiSmooth[i];
    const isExtremeHigh = ge(rsi, extremeHigh);
    const isExtremeLow = ge(extremeLow, rsi);
    rsiPlot.push({ time: bar.time, value: rsi, color: isExtremeHigh ? CLR_RED : isExtremeLow ? CLR_GREEN : CLR_BLUE });
    if (cfg.showBgExtreme && isExtremeHigh) bgColors.push({ time: bar.time, color: bgHigh });
    if (cfg.showBgExtreme && isExtremeLow) bgColors.push({ time: bar.time, color: bgLow });

    const confirmed = i < n - 1 || lastConfirmed;
    const upSignal = crossUp[i] && confirmed;
    const downSignal = crossDown[i] && confirmed;
    upFlags[i] = upSignal;
    downFlags[i] = downSignal;

    if (upSignal) {
      newLabel(i, rsi, TXT_UP, 'label_up', CLR_GREEN,
        'RSI Extreme Low Reclaim\n\nRSI crossed back above the Extreme Low level after reaching a deep oversold area.\n\nRSI: '
        + formatRsi(rsi) + '\nExtreme Low: ' + str.tostring(extremeLow) + '\nSignal Line: ' + formatRsi(signal[i])
        + '\n\nThis is a confirmed bar-close analytical long signal.', false);
    }
    if (downSignal) {
      newLabel(i, rsi, TXT_DOWN, 'label_down', CLR_RED,
        'RSI Extreme High Rejection\n\nRSI crossed back below the Extreme High level after reaching a deep overbought area.\n\nRSI: '
        + formatRsi(rsi) + '\nExtreme High: ' + str.tostring(extremeHigh) + '\nSignal Line: ' + formatRsi(signal[i])
        + '\n\nThis is a confirmed bar-close analytical short signal.', false);
    }

    // Trade creation
    const entry = cfg.entryMode === 'Open' ? bar.open : cfg.entryMode === 'HLC3' ? (bar.high + bar.low + bar.close) / 3 : bar.close;
    if (cfg.showTradeBoxes && upSignal) {
      const slRaw = slMode === 'Signal Candle' ? bar.low : slMode === 'ATR' ? entry - atrValue[i] * cfg.atrMult : entry * (1.0 - cfg.percentSL / 100.0);
      const sl = math.min(slRaw, entry - mintick) as number;
      const risk = entry - sl;
      if (gt(risk, 0)) {
        const tp = entry + risk * rrTarget;
        newLabel(i, entry, TXT_BUY, 'label_up', CLR_GREEN,
          'Projected Long Trade\n\nEntry: ' + formatPrice(entry) + '\nStop Loss: ' + formatPrice(sl) + '\nTake Profit: ' + formatPrice(tp)
          + '\nRisk / Reward: ' + str.tostring(rrTarget, '#.##') + 'R\nSL Mode: ' + slMode
          + '\n\nThis projection is created from a confirmed RSI Extreme Low reclaim signal.', true);
        trades.push({
          dir: 1, tp, sl, startBar: i, active: true,
          tpBox: { left: i, right: i + 1, top: tp, bottom: entry },
          slBox: { left: i, right: i + 1, top: entry, bottom: sl },
          line: { x1: i, x2: i + 1, y: entry },
        });
      }
    }
    if (cfg.showTradeBoxes && downSignal) {
      const slRaw = slMode === 'Signal Candle' ? bar.high : slMode === 'ATR' ? entry + atrValue[i] * cfg.atrMult : entry * (1.0 + cfg.percentSL / 100.0);
      const sl = math.max(slRaw, entry + mintick) as number;
      const risk = sl - entry;
      if (gt(risk, 0)) {
        const tp = entry - risk * rrTarget;
        newLabel(i, entry, TXT_SELL, 'label_down', CLR_RED,
          'Projected Short Trade\n\nEntry: ' + formatPrice(entry) + '\nStop Loss: ' + formatPrice(sl) + '\nTake Profit: ' + formatPrice(tp)
          + '\nRisk / Reward: ' + str.tostring(rrTarget, '#.##') + 'R\nSL Mode: ' + slMode
          + '\n\nThis projection is created from a confirmed RSI Extreme High rejection signal.', true);
        trades.push({
          dir: -1, tp, sl, startBar: i, active: true,
          tpBox: { left: i, right: i + 1, top: entry, bottom: tp },
          slBox: { left: i, right: i + 1, top: sl, bottom: entry },
          line: { x1: i, x2: i + 1, y: entry },
        });
      }
    }

    // Limit stored trade objects (the oldest boxes and lines are deleted)
    while (trades.length > cfg.maxStoredTrades) trades.shift();

    // Active trade update
    for (const trade of trades) {
      if (!trade.active) continue;
      trade.tpBox.right = i;
      trade.slBox.right = i;
      trade.line.x2 = i;

      let tpHit = false;
      let slHit = false;
      if (i > trade.startBar) {
        if (trade.dir === 1) {
          tpHit = ge(bar.high, trade.tp);
          slHit = ge(trade.sl, bar.low);
        } else {
          tpHit = ge(trade.tp, bar.low);
          slHit = ge(bar.high, trade.sl);
        }
      }
      if (tpHit && slHit) {
        if (cfg.sameBarPriority === 'SL') tpHit = false;
        else slHit = false;
      }
      if (tpHit || slHit) {
        trade.active = false;
        hitFlags[(trade.dir === 1 ? 0 : 2) + (tpHit ? 0 : 1)][i] = true;
        const direction = trade.dir === 1 ? 'Long' : 'Short';
        if (tpHit) {
          newLabel(i, trade.tp, TXT_TP_HIT, 'label_down', CLR_GREEN,
            'Take Profit Reached\n\nProjected TP level was reached on this candle.\n\nTP Price: ' + formatPrice(trade.tp) + '\nDirection: ' + direction
            + '\n\nThis is based on the projected trade model, not an automated execution result.', true);
        } else {
          newLabel(i, trade.sl, TXT_SL_HIT, 'label_up', CLR_RED,
            'Stop Loss Reached\n\nProjected SL level was reached on this candle.\n\nSL Price: ' + formatPrice(trade.sl) + '\nDirection: ' + direction
            + '\n\nThis is based on the projected trade model, not an automated execution result.', true);
        }
      }
    }
  }

  // Status panel: var table, filled on the last bar
  const panelPos = ({ 'Top Left': 'top_left', 'Bottom Right': 'bottom_right', 'Bottom Left': 'bottom_left' } as Record<string, TablePosition>)[cfg.panelPosition]
    ?? 'top_right';
  const panelSize: PineSize = cfg.panelTextSize === 'Tiny' ? 'tiny' : cfg.panelTextSize === 'Normal' ? 'normal' : 'small';
  const cells: TableCellData[] = [];
  if (n > 0) {
    const last = n - 1;
    const rsi = rsiSmooth[last];
    const sig = signal[last];
    if (cfg.showPanel) {
      const spread = rsi - sig;
      const delta = last > 0 ? rsi - rsiSmooth[last - 1] : NaN;
      const statusText = ge(rsi, extremeHigh) ? 'Extreme High'
        : ge(rsi, overbought) ? 'Overbought'
        : gt(rsi, 50) && gt(overbought, rsi) ? 'Bullish'
        : ge(rsi, 45) && ge(55, rsi) ? 'Neutral'
        : gt(50, rsi) && gt(rsi, oversold) ? 'Bearish'
        : ge(oversold, rsi) ? 'Oversold'
        : 'Extreme Low';
      const momentumText = ge(delta, 1.5) ? 'Strong Up' : gt(delta, 0) ? 'Up' : ge(-1.5, delta) ? 'Strong Down' : gt(0, delta) ? 'Down' : 'Flat';
      const crossState = gt(spread, 0) ? 'RSI > Signal' : gt(0, spread) ? 'RSI < Signal' : 'At Signal';
      const rows: Array<[string, string, string]> = [
        ['𝙍𝙎𝙄 𝙋𝘼𝙉𝙀𝙇', '𝙑𝘼𝙇𝙐𝙀', CLR_HEADER],
        ['𝙍𝙎𝙄', str.tostring(rsi, '#.##'), CLR_CARD_A],
        ['𝙎𝙞𝙜𝙣𝙖𝙡', str.tostring(sig, '#.##'), CLR_CARD_B],
        ['𝙎𝙩𝙖𝙩𝙪𝙨', statusText, CLR_CARD_A],
        ['𝙈𝙤𝙢𝙚𝙣𝙩𝙪𝙢', momentumText, CLR_CARD_B],
        ['𝙎𝙩𝙧𝙪𝙘𝙩𝙪𝙧𝙚', crossState, CLR_CARD_A],
      ];
      rows.forEach(([name, value, bg], row) => {
        for (const [column, text] of [[0, name], [1, value]] as Array<[number, string]>) {
          cells.push({ column, row, text, textColor: CLR_TEXT, textSize: panelSize, bgColor: bg, textFormatting: BOLD_ITALIC });
        }
      });
    } else {
      const hidden = String(color.new(CLR_BG, 100));
      for (let row = 0; row <= 5; row++) {
        cells.push({ column: 0, row, text: '', bgColor: hidden });
        cells.push({ column: 1, row, text: '', bgColor: hidden });
      }
    }
  }
  const tables: TableData[] = [{
    position: panelPos, columns: 2, rows: 6, borderWidth: 1, frameColor: CLR_BORDER, borderColor: CLR_BORDER, cells,
  }];

  const time = (index: number) => barTime(bars, index);
  const tpBg = String(color.new(CLR_GREEN, 65));
  const slBg = String(color.new(CLR_RED, 55));
  const boxes: BoxData[] = [];
  const lines: LineDrawingData[] = [];
  for (const t of trades) {
    boxes.push({
      time1: time(t.tpBox.left), price1: t.tpBox.top, time2: time(t.tpBox.right), price2: t.tpBox.bottom,
      borderColor: CLR_GREEN, borderWidth: 1, bgColor: tpBg, forceOverlay: true,
    });
    boxes.push({
      time1: time(t.slBox.left), price1: t.slBox.top, time2: time(t.slBox.right), price2: t.slBox.bottom,
      borderColor: CLR_RED, borderWidth: 1, bgColor: slBg, forceOverlay: true,
    });
    lines.push({
      time1: time(t.line.x1), price1: t.line.y, time2: time(t.line.x2), price2: t.line.y, color: CLR_LINE_DARK, width: 2, forceOverlay: true,
    });
  }

  const hl = hlineList(overbought, oversold, extremeHigh, extremeLow);

  // alertcondition(enable... and cond): exact crosses of the smoothed RSI
  const gate = (on: boolean, flags: boolean[]) => flags.map((f) => on && f);
  const alertFlags = [
    gate(cfg.enableCrossAlerts, crossedOver(rsiSmooth, signal)),
    gate(cfg.enableCrossAlerts, crossedUnder(rsiSmooth, signal)),
    gate(cfg.enableZoneAlerts, crossedOver(rsiSmooth, oversold)),
    gate(cfg.enableZoneAlerts, crossedUnder(rsiSmooth, overbought)),
    gate(cfg.enableCenterAlerts, crossedOver(rsiSmooth, 50)),
    gate(cfg.enableCenterAlerts, crossedUnder(rsiSmooth, 50)),
    gate(cfg.enableSignalAlerts, upFlags),
    gate(cfg.enableSignalAlerts, downFlags),
    ...hitFlags.map((f) => gate(cfg.enableTradeAlerts, f)),
  ];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: rsiPlot,
      plot1: bars.map((b, i) => ({ time: b.time, value: signal[i] })),
    },
    hlines: hl.map((h) => ({ value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    fills: [
      { plot1: 'hline_ob', plot2: 'hline_100', options: { title: 'Overbought Zone', color: String(color.new(CLR_RED, 70)) } },
      { plot1: 'hline_os', plot2: 'hline_0', options: { title: 'Oversold Zone', color: String(color.new(CLR_GREEN, 70)) } },
    ],
    bgColors,
    lines,
    boxes,
    labels,
    tables,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'RSI Bullish Cross', message: 'RSI crossed above Signal' },
  { id: 'alert1', title: 'RSI Bearish Cross', message: 'RSI crossed below Signal' },
  { id: 'alert2', title: 'RSI Oversold Reclaim', message: 'RSI reclaimed above Oversold' },
  { id: 'alert3', title: 'RSI Overbought Reject', message: 'RSI crossed below Overbought' },
  { id: 'alert4', title: 'RSI Centerline Bullish', message: 'RSI crossed above 50' },
  { id: 'alert5', title: 'RSI Centerline Bearish', message: 'RSI crossed below 50' },
  { id: 'alert6', title: 'Long Entry Signal', message: 'Long entry signal confirmed' },
  { id: 'alert7', title: 'Short Entry Signal', message: 'Short entry signal confirmed' },
  { id: 'alert8', title: 'Long TP Hit', message: 'Long projected take-profit reached' },
  { id: 'alert9', title: 'Long SL Hit', message: 'Long projected stop-loss reached' },
  { id: 'alert10', title: 'Short TP Hit', message: 'Short projected take-profit reached' },
  { id: 'alert11', title: 'Short SL Hit', message: 'Short projected stop-loss reached' },
];

export const RsiEntryEngine = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, fillConfig, alertConditions };
