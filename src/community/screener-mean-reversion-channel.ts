/**
 * Screener - Mean Reversion Channel
 *
 * Screens up to 40 symbols with the Mean Reversion Channel and lists them in one label right of the last bar. For
 * each symbol, on its own bars of the screening timeframe (the chart timeframe when empty):
 * - mean = SuperSmoother of the source (or one of the Ehlers "Swiss Army Knife" filters: Ehlers EMA, Gaussian,
 *   Butterworth, BandStop, SMA, EMA, RMA), range = SuperSmoother of the true range
 * - outer band = mean +- range * pi * outer multiplier
 * - close above the mean: overbought weak when the high is within 2 ranges below the upper band, overbought when it
 *   is within 2 ranges above it, overbought strong beyond that; close below the mean: oversold weak / oversold /
 *   oversold strong in the same way around the lower band (each level can be switched off)
 * The value of each symbol on the chart bars is that of `request.security(symbol, timeframe, ...)` without lookahead
 * (see src/other-symbol.ts). The label of the last bar gives the timeframe, then the oversold list and the overbought
 * list (strong, normal, weak), "Nothing Interesting" when no symbol is in a zone, or "No Asset Defined" when no
 * symbol is set. The label is placed at the last bar time plus 10 times the gap between the last two bars.
 *
 * Other symbols: the bars of every set symbol come from the `bars` accessor of the chart context
 * (`requiredSymbols` lists them); without them `calculate` throws a `MissingSymbolDataError`. The exchange time zone
 * and session of each symbol come from `symbolInfo` of the context. A screening timeframe below the chart timeframe
 * is not supported (an Error is thrown).
 *
 * Chart context (optional third argument of calculate): the chart timeframe (`timeframe`, else read from the bar
 * spacing) gives the text "Timeframe = ..." and the timeframe of the other symbols; with the exchange calendar
 * (`timezone` and `session`) the label time after the last bar is drawn on the future bar that contains it on the
 * trading calendar (closed days skipped), else at the time itself. `lastBarConfirmed` false (the last bar still
 * open) shows the open bar of each other symbol on the last bar.
 *
 * Reference: "Screener - Mean Reversion Channel" by fareidzulkifli
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Author: ©fareidzulkifli. REUSING THIS CODE: You are welcome to reuse this code without
 * permission, including in closed-source publications, as long as proper credits are given.
 */

import {
  getSourceSeries, barInterval,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { LabelData } from '../types';
import { chartTimeframe, hasCalendar, barsAfterLastBar } from '../anchor-period';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { securityOtherValues } from '../other-symbol';

type AssetId =
  | 'asset_01' | 'asset_02' | 'asset_03' | 'asset_04' | 'asset_05' | 'asset_06' | 'asset_07' | 'asset_08'
  | 'asset_09' | 'asset_10' | 'asset_11' | 'asset_12' | 'asset_13' | 'asset_14' | 'asset_15' | 'asset_16'
  | 'asset_17' | 'asset_18' | 'asset_19' | 'asset_20' | 'asset_21' | 'asset_22' | 'asset_23' | 'asset_24'
  | 'asset_25' | 'asset_26' | 'asset_27' | 'asset_28' | 'asset_29' | 'asset_30' | 'asset_31' | 'asset_32'
  | 'asset_33' | 'asset_34' | 'asset_35' | 'asset_36' | 'asset_37' | 'asset_38' | 'asset_39' | 'asset_40';

const ASSETS = Array.from({ length: 40 }, (_v, i) => `asset_${String(i + 1).padStart(2, '0')}` as AssetId);

/** Asset 01 to Asset 40: ticker ids of the screened symbols ("NASDAQ:AAPL"), '' for none */
export interface ScreenerMeanReversionChannelInputs extends Record<AssetId, string> {
  /** Section title of the original settings (no effect) */
  indiSet: boolean;
  /** Lookback Period */
  length: number;
  /** Filter Type */
  type: 'SuperSmoother' | 'Ehlers EMA' | 'Gaussian' | 'Butterworth' | 'BandStop' | 'SMA' | 'EMA' | 'RMA';
  /** Price Source */
  source: SourceType;
  /** Inner Channel Size Multiplier (not used by the screen) */
  innermult: number;
  /** Outer Channel Size Multiplier */
  outermult: number;
  /** Section title of the original settings (no effect) */
  screenSet: boolean;
  /** Timeframe for Screening ('' = chart timeframe) */
  custom_tf: string;
  /** Screen for Weak OB/OS */
  checkweak: boolean;
  /** Screen for OB/OS */
  checknorm: boolean;
  /** Screen for Strong OB/OS */
  checkstrong: boolean;
  /** Section title of the original settings (no effect) */
  screenList: boolean;
}

export const defaultInputs: ScreenerMeanReversionChannelInputs = {
  indiSet: false,
  length: 200,
  type: 'SuperSmoother',
  source: 'hlc3',
  innermult: 1.0,
  outermult: 2.415,
  screenSet: false,
  custom_tf: '',
  checkweak: true,
  checknorm: true,
  checkstrong: true,
  screenList: false,
  ...(Object.fromEntries(ASSETS.map((id) => [id, ''])) as Record<AssetId, string>),
};

export const inputConfig: InputConfig[] = [
  { id: 'indiSet', type: 'bool', title: '═════════ MRC Parameter ════════', defval: false },
  { id: 'length', type: 'int', title: 'Lookback Period', defval: 200, min: 1 },
  { id: 'type', type: 'string', title: 'Filter Type', defval: 'SuperSmoother', options: ['SuperSmoother', 'Ehlers EMA', 'Gaussian', 'Butterworth', 'BandStop', 'SMA', 'EMA', 'RMA'] },
  { id: 'source', type: 'source', title: 'Price Source', defval: 'hlc3' },
  { id: 'innermult', type: 'float', title: 'Inner Channel Size Multiplier', defval: 1.0, min: 0.1 },
  { id: 'outermult', type: 'float', title: 'Outer Channel Size Multiplier', defval: 2.415, min: 0.1 },
  { id: 'screenSet', type: 'bool', title: '═════════ Screening Setting ════════', defval: false },
  { id: 'custom_tf', type: 'timeframe', title: 'Timeframe for Screening', defval: '' },
  { id: 'checkweak', type: 'bool', title: 'Screen for Weak OB/OS', defval: true },
  { id: 'checknorm', type: 'bool', title: 'Screen for OB/OS', defval: true },
  { id: 'checkstrong', type: 'bool', title: 'Screen for Strong OB/OS', defval: true },
  { id: 'screenList', type: 'bool', title: '═════════ Asset for Screening ════════', defval: false },
  ...ASSETS.map((id, i): InputConfig => ({ id, type: 'string', title: `Asset ${String(i + 1).padStart(2, '0')}`, defval: '' })),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Screener - Mean Reversion Channel',
  shortTitle: 'Screener - Mean Reversion Channel',
  overlay: true,
};

// Colour constants of Pine version 4
const BLACK = '#363A45';
const WHITE = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const nz = (v: number | undefined, other = 0) => (v === undefined || isNaN(v) ? other : v);

const PI = 2 * Math.asin(1);
const GRADSIZE = 0.5;

/** supersmoother(): 2-pole filter; the first values are seeded with the source */
function supersmoother(src: number[], length: number): number[] {
  const a1 = Math.exp((-Math.sqrt(2) * PI) / length);
  const b1 = 2 * a1 * Math.cos((Math.sqrt(2) * PI) / length);
  const c3 = -Math.pow(a1, 2);
  const c2 = b1;
  const c1 = 1 - c2 - c3;
  const ss: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const s1 = i >= 1 ? src[i - 1] : NaN;
    const s2 = i >= 2 ? src[i - 2] : NaN;
    ss.push(c1 * src[i] + c2 * nz(ss[i - 1], s1) + c3 * nz(ss[i - 2], s2));
  }
  return ss;
}

/** SAK_smoothing(): Ehlers "Swiss Army Knife" filter */
function sakSmoothing(type: string, src: number[], length: number): number[] {
  let c0 = 1.0;
  let c1 = 0.0;
  let b0 = 1.0;
  let b1 = 0.0;
  let b2 = 0.0;
  let a1 = 0.0;
  let a2 = 0.0;
  let alpha = 0.0;
  let beta = 0.0;
  const cycle = (2 * PI) / length;
  if (type === 'Ehlers EMA') {
    alpha = (Math.cos(cycle) + Math.sin(cycle) - 1) / Math.cos(cycle);
    b0 = alpha;
    a1 = 1 - alpha;
  }
  if (type === 'Gaussian') {
    beta = 2.415 * (1 - Math.cos(cycle));
    alpha = -beta + Math.sqrt(beta * beta + 2 * beta);
    c0 = alpha * alpha;
    a1 = 2 * (1 - alpha);
    a2 = -(1 - alpha) * (1 - alpha);
  }
  if (type === 'Butterworth') {
    beta = 2.415 * (1 - Math.cos(cycle));
    alpha = -beta + Math.sqrt(beta * beta + 2 * beta);
    c0 = (alpha * alpha) / 4;
    b1 = 2;
    b2 = 1;
    a1 = 2 * (1 - alpha);
    a2 = -(1 - alpha) * (1 - alpha);
  }
  if (type === 'BandStop') {
    beta = Math.cos(cycle);
    const gamma = 1 / Math.cos(cycle * 2 * 0.1);
    alpha = gamma - Math.sqrt(gamma * gamma - 1);
    c0 = (1 + alpha) / 2;
    b1 = -2 * beta;
    b2 = 1;
    a1 = beta * (1 + alpha);
    a2 = -alpha;
  }
  if (type === 'SMA') {
    c1 = 1 / length;
    b0 = 1 / length;
    a1 = 1;
  }
  if (type === 'EMA') {
    alpha = 2 / (length + 1);
    b0 = alpha;
    a1 = 1 - alpha;
  }
  if (type === 'RMA') {
    alpha = 1 / length;
    b0 = alpha;
    a1 = 1 - alpha;
  }
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const at = (k: number) => (i - k >= 0 ? nz(src[i - k]) : 0);
    out.push(c0 * (b0 * src[i] + b1 * at(1) + b2 * at(2)) + a1 * nz(out[i - 1]) + a2 * nz(out[i - 2]) - c1 * at(length));
  }
  return out;
}

/** screen_mrc() on the bars of one symbol: 1 / 2 / 3 overbought weak / normal / strong, -1 / -2 / -3 oversold, else 0 */
function screenMrc(bars: ReadonlyArray<Bar>, cfg: ScreenerMeanReversionChannelInputs): number[] {
  const source = getSourceSeries(bars as Bar[], cfg.source).toArray().map((v) => v ?? NaN);
  // tr: na on the first bar
  const tr = bars.map((b, i) => (i === 0 ? NaN
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  const meanrange = supersmoother(tr, cfg.length);
  const meanline = cfg.type === 'SuperSmoother' ? supersmoother(source, cfg.length) : sakSmoothing(cfg.type, source, cfg.length);
  const mult2 = PI * cfg.outermult;
  return bars.map(({ high, low, close }, i) => {
    const mean = meanline[i];
    const range = meanrange[i];
    let condition = 0;
    if (gt(close, mean)) {
      const upband2 = mean + range * mult2;
      const upband21 = upband2 + range * GRADSIZE * 4;
      const upband29 = upband2 + range * GRADSIZE * -4;
      if (cfg.checkweak && ge(high, upband29) && lt(high, upband2)) condition = 1;
      if (cfg.checknorm && ge(high, upband2) && lt(high, upband21)) condition = 2;
      if (cfg.checkstrong && ge(high, upband21)) condition = 3;
    }
    if (lt(close, mean)) {
      const loband2 = mean - range * mult2;
      const loband21 = loband2 - range * GRADSIZE * 4;
      const loband29 = loband2 - range * GRADSIZE * -4;
      if (cfg.checkweak && le(low, loband29) && gt(low, loband2)) condition = -1;
      if (cfg.checknorm && le(low, loband2) && gt(low, loband21)) condition = -2;
      if (cfg.checkstrong && le(low, loband21)) condition = -3;
    }
    return condition;
  });
}

/** Timeframe of the screen: the input, else the chart timeframe (from the context, else from the bar spacing) */
function screenTimeframe(cfg: ScreenerMeanReversionChannelInputs, chart: ChartContext | undefined, bars: ReadonlyArray<{ time: number }>): string {
  return cfg.custom_tf !== '' ? cfg.custom_tf : chartTimeframe(bars, chart);
}

/** One request per set asset (a symbol set twice is asked once) */
function symbolRequests(cfg: ScreenerMeanReversionChannelInputs, tf: string): SymbolRequest[] {
  return [...new Set(ASSETS.map((id) => cfg[id]).filter((s) => s !== ''))].map((symbol) => ({ symbol, timeframe: tf }));
}

/**
 * Bars of other symbols that the inputs need: each set asset on the screening timeframe, the chart timeframe of the
 * context when the input is empty ('' when the context has no timeframe: the port then asks for the chart timeframe
 * read from the bar spacing)
 */
export function requiredSymbols(inputs: Partial<ScreenerMeanReversionChannelInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  return symbolRequests(cfg, screenTimeframe(cfg, chart, []));
}

/** asset_NN_status on every chart bar (NaN: na, before the first bar of the symbol), 0 for an empty asset */
function assetStatuses(bars: Bar[], cfg: ScreenerMeanReversionChannelInputs, chart?: ChartContext): number[][] {
  const tf = screenTimeframe(cfg, chart, bars);
  const requests = symbolRequests(cfg, tf);
  const other = symbolBarsOf(requests, chart);
  const bySymbol = new Map<string, number[]>();
  requests.forEach((r, k) => {
    const values = screenMrc(other[k], cfg);
    bySymbol.set(r.symbol, securityOtherValues(bars, other[k], tf, values, { symbol: r.symbol }, chart));
  });
  return ASSETS.map((id) => bySymbol.get(cfg[id]) ?? bars.map(() => 0));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ScreenerMeanReversionChannelInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const statuses = assetStatuses(bars, cfg, chart);
  const labels: LabelData[] = [];

  // The label of each bar deletes the label of the bar before: only the label of the last bar stays. Its x is
  // time + round(change(time) * 10), na on a first bar (not drawn)
  if (n >= 2) {
    const assets = ASSETS.map((id) => cfg[id]);
    const at = statuses.map((s) => s[last]);
    const list = (status: number, tag: string) =>
      assets.map((a, k) => (a !== '' && at[k] === status ? `${a}${tag}\n` : '')).join('');
    const weakOb = list(1, ' (Weak) ');
    const normalOb = list(2, '');
    const strongOb = list(3, ' (Strong) ');
    const weakOs = list(-1, ' (Weak) ');
    const normalOs = list(-2, '');
    const strongOs = list(-3, ' (Strong) ');

    const assetcount = assets.every((a) => a === '') ? 0 : 1;
    // timeframe.period: "D", "W", "M" without a multiplier of 1
    const tf = cfg.custom_tf === '' ? chartTimeframe(bars, chart).replace(/^1([DWM])$/, '$1') : cfg.custom_tf;
    const brl = '\n-----------------------\n';
    const title = `Mean Reversal Screener:\nTimeframe = ${tf}${brl}`;
    let checklist = assetcount === 0 ? 'No Asset Defined\nPlease update parameter ' : '';
    let obList = '';
    let osList = '';
    if (assetcount > 0) {
      if (strongOb + normalOb + weakOb !== '') obList = `\nOverBought List: ${brl}${strongOb}${normalOb}${weakOb}`;
      if (strongOs + normalOs + weakOs !== '') osList = `\nOverSold List: ${brl}${strongOs}${normalOs}${weakOs}`;
      if (obList === '' && osList === '') checklist = 'Nothing Interesting';
    }

    const t = bars[last].time;
    let x = t + Math.round((t - bars[last - 1].time) * 10);
    // A time after the last bar is drawn on the bar that contains it: with the exchange calendar of the context,
    // the future bar of the trading calendar, given as a bar slot of the chart (last bar time plus k bar intervals)
    if (hasCalendar(chart) && x > t) {
      const k = barsAfterLastBar(bars, x, chart);
      if (!Number.isNaN(k)) x = t + k * barInterval(bars);
    }
    labels.push({
      time: x,
      price: bars[last].close,
      text: title + checklist + osList + obList,
      color: BLACK,
      style: 'label_left',
      textColor: WHITE,
      size: 'normal',
      textAlign: 'left',
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    labels,
  };
}

export const ScreenerMeanReversionChannel = { calculate, metadata, defaultInputs, inputConfig, plotConfig, requiredSymbols };
