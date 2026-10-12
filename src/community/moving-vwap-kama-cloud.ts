/**
 * Moving VWAP-KAMA Cloud
 *
 * Moving VWAP = EMA(EMA(VWAP, mvwapLength), mvwapSmooth). KAMA of the Moving VWAP: er = |MVWAP - MVWAP[kamaLength]| /
 * sum(|MVWAP - MVWAP[1]|, kamaLength) (0 when the sum is 0 or na), sc = (er * (fastest - slowest) + slowest)^2 with
 * fastest = 2 / (kamaFastest + 1), slowest = 2 / (kamaSlowest + 1), kama = kama[1] + sc * (MVWAP - kama[1]) (seeded
 * with the MVWAP). A cloud between the two lines: bullish colour when MVWAP >= KAMA, bearish colour otherwise. The
 * lines are hidden by default; when shown, MVWAP is olive when rising (maroon otherwise) and KAMA green when rising
 * (red otherwise).
 *
 * Timeframes: Pine `ta.vwap` resets on each new trading day (anchor timeframe.change("1D")). When each bar is one
 * trading day or more, it resets on every bar, so the VWAP is hlc3 of the bar (na when the volume is 0 or na). On
 * intraday bars (barInterval, the most frequent gap between bars, below one day) the reset needs the exchange time
 * zone and the session of the symbol: the port reads them from the optional third argument (see
 * src/chart-context.ts) and sums from the first bar of each trading day (from the first bar on the first day).
 * Without them calculate() throws an Error on intraday bars. With fewer than 2 bars (or no positive gap)
 * barInterval is 0 and no error is thrown: a single bar is the start of its anchor period, so its VWAP is hlc3 on
 * any timeframe.
 *
 * Reference: "Moving VWAP-KAMA Cloud" by SovereignCharts
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { barInterval } from '../bar-time';
import type { ChartContext } from '../chart-context';
import { executeScript, ta as scriptTa, hlc3 as scriptHlc3 } from 'oakscriptjs/script';

export interface MovingVwapKamaCloudInputs {
  /** EMA length applied to the VWAP */
  mvwapLength: number;
  /** EMA length of the second smoothing */
  mvwapSmooth: number;
  /** KAMA efficiency ratio length */
  kamaLength: number;
  /** KAMA fastest period */
  kamaFastest: number;
  /** KAMA slowest period */
  kamaSlowest: number;
  /** Show the Moving VWAP and KAMA lines */
  showLines: boolean;
  /** Cloud transparency (0-100) */
  cloudTransparency: number;
  /** Input of the Pine script (not used by its plots) */
  mvwapColor: string;
  /** Input of the Pine script (not used by its plots) */
  kamaColor: string;
  bullishCloudColor: string;
  bearishCloudColor: string;
}

export const defaultInputs: MovingVwapKamaCloudInputs = {
  mvwapLength: 30,
  mvwapSmooth: 10,
  kamaLength: 10,
  kamaFastest: 10,
  kamaSlowest: 30,
  showLines: false,
  cloudTransparency: 70,
  mvwapColor: '#14b8a6',
  kamaColor: '#06b6d4',
  bullishCloudColor: '#14b8a6',
  bearishCloudColor: '#a855f7',
};

export const inputConfig: InputConfig[] = [
  { id: 'mvwapLength', type: 'int', title: 'Moving VWAP Period', defval: 30, min: 1 },
  { id: 'mvwapSmooth', type: 'int', title: 'MVWAP Smoothing', defval: 10, min: 1 },
  { id: 'kamaLength', type: 'int', title: 'KAMA Length', defval: 10, min: 1 },
  { id: 'kamaFastest', type: 'int', title: 'KAMA Fastest', defval: 10, min: 1 },
  { id: 'kamaSlowest', type: 'int', title: 'KAMA Slowest', defval: 30, min: 1 },
  { id: 'showLines', type: 'bool', title: 'Display Lines', defval: false },
  { id: 'cloudTransparency', type: 'int', title: 'Cloud Transparency', defval: 70, min: 0, max: 100 },
  { id: 'mvwapColor', type: 'color', title: 'Moving VWAP Color', defval: '#14b8a6' },
  { id: 'kamaColor', type: 'color', title: 'KAMA Color', defval: '#06b6d4' },
  { id: 'bullishCloudColor', type: 'color', title: 'Bullish Cloud Color', defval: '#14b8a6' },
  { id: 'bearishCloudColor', type: 'color', title: 'Bearish Cloud Color', defval: '#a855f7' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Moving VWAP', color: '#2962ff', lineWidth: 1 },
  { id: 'plot1', title: 'KAMA', color: '#2962ff', lineWidth: 3 },
];

export const metadata = {
  title: 'Moving VWAP-KAMA Cloud',
  shortTitle: 'Moving VWAP-KAMA Cloud',
  overlay: true,
};

/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

const DAY_SECONDS = 86400;

/**
 * ta.vwap(hlc3) on intraday bars: the script API function with its default anchor, a new trading day of the exchange
 * (from the time zone and the session of the chart context); as in Pine, the sums start on the first bar
 */
function intradayVwap(bars: Bar[], chart: ChartContext): number[] {
  let vwap: number[] = [];
  const context = { ...chart, timeframe: chart.timeframe ?? timeframe.from_seconds(barInterval(bars)) };
  executeScript(() => { vwap = scriptTa.vwap(scriptHlc3).toArray().map((v) => v ?? NaN); }, bars, {}, context);
  return vwap;
}

export function calculate(bars: Bar[], inputs: Partial<MovingVwapKamaCloudInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const interval = barInterval(bars);
  const intraday = interval > 0 && interval < DAY_SECONDS;
  if (intraday && (chart?.timezone === undefined || chart.session === undefined)) {
    throw new Error(
      'Moving VWAP-KAMA Cloud supports daily and higher timeframes only: on intraday bars ta.vwap resets on each '
      + 'trading day, which needs the exchange time zone and session.',
    );
  }

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const at = (a: number[], i: number) => (i >= 0 && i < n ? a[i] : NaN);

  // ta.vwap (hlc3, anchor timeframe.change("1D")). Intraday bars: the sums restart on each trading day of the
  // exchange. Daily or higher bars: a new anchor on every bar, so sum(hlc3 * volume) / sum(volume) over the bar
  // alone (0 / 0 = na when the volume is 0, na when it is na)
  const vwap = intraday && chart ? intradayVwap(bars, chart) : bars.map((b) => {
    const v = b.volume ?? NaN;
    const hlc3 = (b.high + b.low + b.close) / 3;
    return (hlc3 * v) / v;
  });
  // MVWAP = ta.ema(ta.vwap, mvwap_length); MVWAP_smoothed = ta.ema(MVWAP, mvwap_smooth)
  const mvwap = A(ta.ema(S(vwap), cfg.mvwapLength));
  const sm = A(ta.ema(S(mvwap), cfg.mvwapSmooth));

  // kama_volatility = math.sum(math.abs(MVWAP_smoothed - MVWAP_smoothed[1]), kama_length)
  const absDiff = sm.map((v, i) => Math.abs(v - at(sm, i - 1)));
  const vol = A(math.sum(S(absDiff), cfg.kamaLength) as Series);
  const fastestSc = 2.0 / (cfg.kamaFastest + 1);
  const slowestSc = 2.0 / (cfg.kamaSlowest + 1);

  const kama: number[] = new Array(n);
  let prev = NaN; // var float kama = na
  for (let i = 0; i < n; i++) {
    const change = Math.abs(sm[i] - at(sm, i - cfg.kamaLength));
    // er = kama_volatility != 0 ? kama_change / kama_volatility : 0 (na != 0 is false)
    const er = !isNaN(vol[i]) && Math.abs(vol[i]) > EPS ? change / vol[i] : 0;
    const sc = Math.pow(er * (fastestSc - slowestSc) + slowestSc, 2);
    // kama := nz(kama[1], MVWAP_smoothed) + sc * (MVWAP_smoothed - nz(kama[1], MVWAP_smoothed))
    const base = isNaN(prev) ? sm[i] : prev;
    prev = base + sc * (sm[i] - base);
    kama[i] = prev;
  }

  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const cloud: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // color = show_lines ? (MVWAP_smoothed >= MVWAP_smoothed[1] ? color.olive : color.maroon) : na
    const mCol = cfg.showLines ? (ge(sm[i], at(sm, i - 1)) ? color.olive : color.maroon) : 'transparent';
    // color = show_lines ? (kama >= kama[1] ? color.green : color.red) : na
    const kCol = cfg.showLines ? (ge(kama[i], at(kama, i - 1)) ? color.green : color.red) : 'transparent';
    plot0.push({ time: t, value: Number.isFinite(sm[i]) ? sm[i] : NaN, color: mCol });
    plot1.push({ time: t, value: Number.isFinite(kama[i]) ? kama[i] : NaN, color: kCol });
    // cloud_color = MVWAP_smoothed >= kama ? bullish_cloud_color : bearish_cloud_color
    const c = ge(sm[i], kama[i]) ? cfg.bullishCloudColor : cfg.bearishCloudColor;
    cloud.push(String(color.new(c, cfg.cloudTransparency)));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'VWAP-KAMA Cloud' }, colors: cloud }],
  };
}

export const MovingVwapKamaCloud = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
