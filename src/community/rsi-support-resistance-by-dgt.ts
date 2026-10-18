/**
 * RSI Support & Resistance by DGT
 *
 * Price levels taken from the RSI, drawn on the price chart.
 * - Support / resistance levels: each time the RSI (of the close or of the On Balance Volume) crosses a threshold,
 *   the script keeps a price of that bar: the mean of high and close on a cross up, the mean of low and close on a
 *   cross down. Six levels: overbought cross up, overbought cross down, bull zone (both ways), bear zone (both
 *   ways), oversold cross up, oversold cross down. A level has no colour on the bar where it changes. The areas
 *   between the overbought level and the bull zone, and between the oversold level and the bear zone, are filled.
 * - Optional triangles on the bars where the RSI is overbought / oversold.
 * - Reverse RSI: the price that the current bar needs to bring the RSI to each threshold (and to 50), from the
 *   running averages of gains and losses. Shown as five labels two bars after the last bar and, when enabled, as
 *   five bands with two fills.
 * - RSI overlay: on the last bar the RSI of the last "Overlay Display Length" bars is drawn with lines above (or
 *   below) the price range of those bars, with dotted threshold lines and two fills.
 * - A one-cell table with the logo of the author.
 *
 * Chart context (optional third argument): `chart.mintick`, the symbol tick of the label texts and of the
 * "already reached" test. Without it 0.01.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Price Crossed Above OB Level' (close crosses over the
 * overbought cross-up level) and 'Price Crossed Below OS Level' (close crosses under the oversold cross-down level).
 *
 * Reference: "RSI Support & Resistance by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import {
  ta, str, color, Series, barInterval, barTime,
  type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData, MarkerData, PineSize, TableData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RsiSupportResistanceByDgtInputs {
  /** Source */
  source: 'Price (close)' | 'On Balance Volume (OBV)';
  /** Length */
  length: number;
  /** Overbought */
  obThreshold: number;
  /** Bull Zone */
  bullZone: number;
  /** Bear Zone */
  bearZone: number;
  /** Oversold */
  osThreshold: number;
  /** Bullish */
  bullColor: string;
  /** Neutral */
  midColor: string;
  /** Bearish */
  bearColor: string;
  /** Show RSI S&R Zones */
  showSR: boolean;
  /** Zone Fills */
  fill: boolean;
  /** RSI Overbought/Oversold Bar Marks */
  obos: boolean;
  /** Reverse RSI Price Levels */
  showRRSI: boolean;
  /** Size of the reverse RSI labels */
  rrsiSize: 'Tiny' | 'Small' | 'Normal';
  /** Reverse RSI Price Bands */
  shRRSI: boolean;
  /** Enable RSI Overlay */
  rsiOsc: boolean;
  /** Placement */
  oscPlacement: 'Top' | 'Bottom';
  /** Height */
  oscHeight: number;
  /** Overlay Display Length */
  lookbackLength: number;
}

const TEAL = '#089981';
const GRAY = '#787B86';
const RED = '#F23645';

export const defaultInputs: RsiSupportResistanceByDgtInputs = {
  source: 'Price (close)',
  length: 14,
  obThreshold: 70,
  bullZone: 60,
  bearZone: 40,
  osThreshold: 30,
  bullColor: TEAL,
  midColor: GRAY,
  bearColor: RED,
  showSR: true,
  fill: true,
  obos: false,
  showRRSI: true,
  rrsiSize: 'Small',
  shRRSI: false,
  rsiOsc: true,
  oscPlacement: 'Top',
  oscHeight: 7,
  lookbackLength: 200,
};

const G_RSI = 'RSI Settings';
const G_SR = 'RSI S&R Zones';
const G_REV = 'Reverse RSI Labels';
const G_OSC = 'RSI Overlay Display';

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'string', title: 'Source', defval: 'Price (close)', options: ['Price (close)', 'On Balance Volume (OBV)'],
    inline: 'RSI', group: G_RSI, display: 'data_window',
    tooltip: 'Select the data source used to compute RSI.\n• Price (close): Classic RSI based on price action\n'
      + '• OBV: Volume-weighted momentum using On Balance Volume' },
  { id: 'length', type: 'int', title: '   Length', defval: 14, min: 1, inline: 'RSI', group: G_RSI, display: 'data_window' },
  { id: 'obThreshold', type: 'int', title: 'Overbought', defval: 70, min: 50, max: 100, inline: 'Thresh1', group: G_RSI, display: 'data_window' },
  { id: 'bullZone', type: 'int', title: 'Bull Zone', defval: 60, min: 50, max: 65, inline: 'Thresh1', group: G_RSI, display: 'data_window',
    tooltip: 'Overbought:\nOverbought threshold.\nCrosses above this level may indicate exhaustion and potential resistance formation.\n\n'
      + 'Bull Zone:\nBullish momentum zone.\nRSI holding above this level indicates sustained bullish pressure.' },
  { id: 'bearZone', type: 'int', title: 'Bear Zone ', defval: 40, min: 35, max: 50, inline: 'Thresh2', group: G_RSI, display: 'data_window' },
  { id: 'osThreshold', type: 'int', title: 'Oversold', defval: 30, min: 1, max: 50, inline: 'Thresh2', group: G_RSI, display: 'data_window',
    tooltip: 'Bear Zone:\nBearish momentum zone.\nRSI holding below this level indicates sustained bearish pressure.\n\n'
      + 'Oversold:\nOversold threshold.\nCrosses below this level may indicate capitulation and potential support formation.' },
  { id: 'bullColor', type: 'color', title: 'Bullish', defval: TEAL, inline: 'ob', group: G_RSI },
  { id: 'midColor', type: 'color', title: 'Neutral', defval: GRAY, inline: 'ob', group: G_RSI },
  { id: 'bearColor', type: 'color', title: 'Bearish', defval: RED, inline: 'ob', group: G_RSI },
  { id: 'showSR', type: 'bool', title: 'Show RSI S&R Zones', defval: true, inline: 'RSI', group: G_SR, display: 'data_window',
    tooltip: 'Displays dynamic support and resistance zones derived from RSI threshold crossings.\n\n'
      + 'Zones are plotted directly on price — each level marks where RSI crossed a key threshold in the past, translating oscillator conditions into actionable price levels.\n\n'
      + '• Overbought crossover → potential resistance zone\n'
      + '• Overbought exit (crossunder back below) → resistance weakening\n'
      + '• Bull Zone (RSI 60) cross → dynamic support in uptrends\n'
      + '• Bear Zone (RSI 40) cross → dynamic resistance in downtrends\n'
      + '• Oversold crossunder → potential support zone\n'
      + '• Oversold exit (crossover back above) → support strengthening' },
  { id: 'fill', type: 'bool', title: 'Zone Fills', defval: true, inline: 'RSI', group: G_SR },
  { id: 'obos', type: 'bool', title: 'RSI Overbought/Oversold Bar Marks', defval: false, group: G_SR,
    tooltip: 'Marks price bars when RSI is in overbought or oversold conditions.' },
  { id: 'showRRSI', type: 'bool', title: 'Reverse RSI Price Levels', defval: true, inline: 'REV', group: G_REV, display: 'data_window',
    tooltip: 'Displays the price required on the current bar to push RSI to each threshold level.\n\n'
      + 'Complements the historical S&R zones with forward-looking price targets.\n'
      + 'Uses the same RSI length and source as the S&R settings above.\n\n'
      + '↑ = price needs to rise to reach this RSI level\n'
      + '↓ = price needs to fall to reach this RSI level' },
  { id: 'rrsiSize', type: 'string', title: '', defval: 'Small', options: ['Tiny', 'Small', 'Normal'], inline: 'REV', group: G_REV, display: 'data_window' },
  { id: 'shRRSI', type: 'bool', title: 'Reverse RSI Price Bands', defval: false, group: G_REV, display: 'data_window',
    tooltip: 'Plots the required price levels as continuous bands across the chart.\n'
      + 'Shows how each RSI target evolves bar by bar — useful for spotting whether a target is converging toward or diverging from current price.\n'
      + 'Use alongside labels for point-in-time reference at the right edge.' },
  { id: 'rsiOsc', type: 'bool', title: 'Enable RSI Overlay', defval: true, group: G_OSC,
    tooltip: 'Displays RSI oscillator directly on the price chart.' },
  { id: 'oscPlacement', type: 'string', title: 'Placement', defval: 'Top', options: ['Top', 'Bottom'], inline: 'VOL', group: G_OSC, display: 'data_window',
    tooltip: 'Choose where the RSI overlay is projected:\n• Top: Above price\n• Bottom: Below price' },
  { id: 'oscHeight', type: 'int', title: ' Height', defval: 7, min: 3, max: 10, inline: 'VOL', group: G_OSC, display: 'data_window' },
  { id: 'lookbackLength', type: 'int', title: 'Overlay Display Length', defval: 200, min: 10, max: 495, group: G_OSC, display: 'data_window' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI Overbought Crossover Level', color: TEAL, lineWidth: 2 },
  { id: 'plot1', title: 'RSI Overbought Exit Level', color: TEAL, lineWidth: 1, style: 'cross' },
  { id: 'plot2', title: 'RSI Bullish Threshold Level', color: TEAL, lineWidth: 1 },
  { id: 'plot3', title: 'RSI Bearish Threshold Level', color: RED, lineWidth: 1 },
  { id: 'plot4', title: 'RSI Oversold Rebound Level', color: RED, lineWidth: 1, style: 'cross' },
  { id: 'plot5', title: 'RSI Oversold Breakdown Level', color: RED, lineWidth: 2 },
  { id: 'plot6', title: 'RevRSI OB Level', color: TEAL, lineWidth: 1 },
  { id: 'plot7', title: 'RevRSI Bull Level', color: String(color.new(TEAL, 40)), lineWidth: 1 },
  { id: 'plot8', title: 'RevRSI Mid Level', color: String(color.new(GRAY, 20)), lineWidth: 1 },
  { id: 'plot9', title: 'RevRSI Bear Level', color: String(color.new(RED, 40)), lineWidth: 1 },
  { id: 'plot10', title: 'RevRSI OS Level', color: RED, lineWidth: 1 },
];

/** The four fills with the default colours (the result `fills` carry the input colours) */
export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot0', plot2: 'plot2', color: String(color.new(TEAL, 90)), title: 'RSI Bullish Momentum Zone' },
  { id: 'fill1', plot1: 'plot5', plot2: 'plot3', color: String(color.new(RED, 90)), title: 'RSI Bearish Momentum Zone' },
  { id: 'fill2', plot1: 'plot6', plot2: 'plot7', color: 'transparent', title: 'RevRSI Bullish Zone' },
  { id: 'fill3', plot1: 'plot9', plot2: 'plot10', color: 'transparent', title: 'RevRSI Bearish Zone' },
];

export const metadata = {
  title: 'RSI Support & Resistance by DGT',
  shortTitle: 'RSI S&R ☼☾',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10); na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiSupportResistanceByDgtInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  markers: MarkerData[]; lines: LineDrawingData[]; linefills: LinefillData[]; labels: LabelData[]; tables: TableData[];
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // syminfo.mintick
  const MINTICK = mintickOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const len = cfg.length;
  const lookback = cfg.lookbackLength;
  // oscHight = 11 - input.int(7, ' Height')
  const oscHight = 11 - cfg.oscHeight;
  const { bullColor, midColor, bearColor } = cfg;
  const isPrice = cfg.source === 'Price (close)';
  const top = cfg.oscPlacement === 'Top';

  const closeSeries = new Series(bars, (b) => b.close);
  const rsiSrcSeries = isPrice ? closeSeries : ta.obv(bars);
  const rsiSrc = A(rsiSrcSeries);
  const oscSeries = ta.rsi(rsiSrcSeries, len);
  const osc = A(oscSeries);

  // f_getPrice(): one level per call (var return_1 = 0.)
  const level = (threshold: number, cross: 'over' | 'under' | 'both'): number[] => {
    const over = cross !== 'under' ? ta.crossover(oscSeries, threshold).toArray() : null;
    const under = cross !== 'over' ? ta.crossunder(oscSeries, threshold).toArray() : null;
    const out: number[] = new Array(n);
    let value = 0;
    for (let i = 0; i < n; i++) {
      if (over && over[i]) value = (bars[i].high + bars[i].close) / 2;
      if (under && under[i]) value = (bars[i].low + bars[i].close) / 2;
      out[i] = value;
    }
    return out;
  };
  const crossoverOverbought = level(cfg.obThreshold, 'over');
  const crossunderOverbought = level(cfg.obThreshold, 'under');
  const bullZone = level(cfg.bullZone, 'both');
  const bearZone = level(cfg.bearZone, 'both');
  const crossoverOversold = level(cfg.osThreshold, 'over');
  const crossunderOversold = level(cfg.osThreshold, 'under');

  // f_rsiComponents(): math.max / math.min give na with an na argument
  const change = A(ta.change(rsiSrcSeries));
  const avgGain = A(ta.rma(Series.fromArray(bars, change.map((c) => (isNaN(c) ? NaN : Math.max(c, 0)))), len));
  const avgLoss = A(ta.rma(Series.fromArray(bars, change.map((c) => (isNaN(c) ? NaN : Math.abs(Math.min(c, 0))))), len));

  // f_reverseRSI(): the price that brings the RSI to the target
  const reverseRsi = (target: number): number[] => {
    const rs = target / Math.max(100 - target, 0.001);
    return rsiSrc.map((src, i) => {
      if (gt(target, osc[i])) {
        const gainNew = rs * avgLoss[i] * len - avgGain[i] * (len - 1);
        return gt(gainNew, 0) ? src + gainNew : src;
      }
      if (lt(target, osc[i])) {
        const lossNew = (avgGain[i] / Math.max(rs, 0.0001)) * len - avgLoss[i] * (len - 1);
        return gt(lossNew, 0) ? src - lossNew : src;
      }
      return src;
    });
  };
  const priceOB = reverseRsi(cfg.obThreshold);
  const priceBull = reverseRsi(cfg.bullZone);
  const priceMid = reverseRsi(50);
  const priceBear = reverseRsi(cfg.bearZone);
  const priceOS = reverseRsi(cfg.osThreshold);

  // Level plots: no value while the level is 0, no colour on the bar where the level changes
  const levelPlot = (values: number[], css: string) => bars.map((b, i) => ({
    time: b.time,
    value: cfg.showSR && gt(values[i], 0) ? values[i] : NaN,
    color: i > 0 && eq(values[i], values[i - 1]) ? css : 'transparent',
  }));
  const bandPlot = (values: number[], css: string) => bars.map((b, i) => ({
    time: b.time, value: cfg.shRRSI && Number.isFinite(values[i]) ? values[i] : NaN, color: css,
  }));

  const markers: MarkerData[] = [];
  if (cfg.obos) {
    const obCss = String(color.new(bearColor, 25));
    const osCss = String(color.new(bullColor, 25));
    for (let i = 0; i < n; i++) {
      if (gt(osc[i], cfg.obThreshold)) {
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: obCss, size: 'tiny' });
      }
      if (lt(osc[i], cfg.osThreshold)) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: osCss, size: 'tiny' });
      }
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const last = n - 1;
  const lines: LineDrawingData[] = [];
  const linefills: LinefillData[] = [];
  const labels: LabelData[] = [];
  const tables: TableData[] = [];

  if (n > 0 && cfg.rsiOsc) {
    // RSI overlay of the last bar
    const priceHighest = A(ta.highest(new Series(bars, (b) => b.high), lookback))[last];
    const priceLowest = A(ta.lowest(new Series(bars, (b) => b.low), lookback))[last];
    const priceChangeRate = (priceHighest - priceLowest) / priceHighest / oscHight / 100;
    const base = top ? priceHighest : priceLowest;
    const y = (rsi: number) => base * (1 + (top ? rsi : -1 * (100 - rsi)) * priceChangeRate);
    const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
    // a line with an na coordinate is not drawn (bar_index[lookbackLength] is na on the first bars)
    const mk = (x1: number, y1: number, x2: number, y2: number, css: string, dotted: boolean, width: number): LineDrawingData | null => {
      if (x1 < 0 || x2 < 0 || !Number.isFinite(y1) || !Number.isFinite(y2)) return null;
      return {
        time1: T(x1), price1: y1, time2: T(x2), price2: y2, color: css, width, style: dotted ? 'dotted' : 'solid', extend: 'none',
      };
    };
    const x0 = last - lookback;
    const obLine = mk(x0, y(cfg.obThreshold), last, y(cfg.obThreshold), bullColor, true, 2);
    const bullLine = mk(x0, y(cfg.bullZone), last, y(cfg.bullZone), bullColor, true, 1);
    const bearLine = mk(x0, y(cfg.bearZone), last, y(cfg.bearZone), bearColor, true, 1);
    const osLine = mk(x0, y(cfg.osThreshold), last, y(cfg.osThreshold), bearColor, true, 2);
    const midLine = mk(x0, y(50), last, y(50), midColor, true, 1);
    for (const l of [obLine, bullLine, bearLine, osLine, midLine]) if (l) lines.push(l);
    if (obLine && bullLine) linefills.push({ line1: obLine, line2: bullLine, color: String(color.new(bullColor, 90)) });
    if (bearLine && osLine) linefills.push({ line1: bearLine, line2: osLine, color: String(color.new(bearColor, 90)) });
    for (let k = 0; k <= lookback - 1; k++) {
      const l = mk(last - k, y(at(osc, last - k)), last - k - 1, y(at(osc, last - k - 1)), '#7e57c2', false, 2);
      if (l) lines.push(l);
    }
  }

  if (n > 0 && isPrice && cfg.showRRSI) {
    // f_rrsiLabel(): five labels two bars after the last bar
    const size: PineSize = cfg.rrsiSize === 'Normal' ? 'normal' : cfg.rrsiSize === 'Small' ? 'small' : 'tiny';
    const close = bars[last].close;
    const rrsiLabel = (price: number, target: number, css: string) => {
      if (isNaN(price)) return;
      const dist = price - close;
      const distPct = Math.abs(dist / close) * 100;
      const already = lt(Math.abs(dist), MINTICK); // price == close means already met
      const dir = already ? '✓ ' : gt(dist, 0) ? '↑ ' : '↓ ';
      const priceText = str.tostring(price, 'mintick', MINTICK);
      const tip = 'RSI target ........ : ' + str.tostring(target) + '\n'
        + 'Required price .. : ' + (already ? 'Already reached' : priceText) + '\n'
        + 'Distance .......... : ' + (already ? '—' : dir + str.tostring(Math.abs(dist), 'mintick', MINTICK)
          + '  (' + str.tostring(distPct, '#.##') + '%)') + '\n'
        + 'Current RSI ...... : ' + str.tostring(osc[last], '#.##');
      const text = 'RSI ' + str.tostring(target) + (already ? ' ✓' : ' → ' + priceText);
      labels.push({
        time: T(last + 2), price, text, color: String(color.new(css, 80)), textColor: css, style: 'label_left', size, tooltip: tip,
      });
    };
    rrsiLabel(priceOB[last], cfg.obThreshold, bullColor);
    rrsiLabel(priceBull[last], cfg.bullZone, String(color.new(bullColor, 40)));
    rrsiLabel(priceMid[last], 50, String(color.new(midColor, 20)));
    rrsiLabel(priceBear[last], cfg.bearZone, String(color.new(bearColor, 40)));
    rrsiLabel(priceOS[last], cfg.osThreshold, bearColor);
  }

  if (n > 0) {
    // var table logo = table.new(position.bottom_right, 1, 1)
    tables.push({
      position: 'bottom_right', columns: 1, rows: 1,
      cells: [{ column: 0, row: 0, text: '☼☾  ', textSize: 'normal', textColor: TEAL, tooltip: 'SoleMare Analytics' }],
    });
  }

  // alertcondition(ta.crossover(close, crossover_overbought), 'Price Crossed Above OB Level')
  // alertcondition(ta.crossunder(close, crossunder_oversold), 'Price Crossed Below OS Level')
  const closes = bars.map((b) => b.close);
  const aboveOB = crossedOver(closes, crossoverOverbought);
  const belowOS = crossedUnder(closes, crossunderOversold);

  const bullFill = cfg.fill ? String(color.new(bullColor, 90)) : 'transparent';
  const bearFill = cfg.fill ? String(color.new(bearColor, 90)) : 'transparent';
  const revBullFill = cfg.shRRSI ? String(color.new(bullColor, 90)) : 'transparent';
  const revBearFill = cfg.shRRSI ? String(color.new(bearColor, 90)) : 'transparent';

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: levelPlot(crossoverOverbought, bullColor),
      plot1: levelPlot(crossunderOverbought, bullColor),
      plot2: levelPlot(bullZone, bullColor),
      plot3: levelPlot(bearZone, bearColor),
      plot4: levelPlot(crossoverOversold, bearColor),
      plot5: levelPlot(crossunderOversold, bearColor),
      plot6: bandPlot(priceOB, bullColor),
      plot7: bandPlot(priceBull, String(color.new(bullColor, 40))),
      plot8: bandPlot(priceMid, String(color.new(midColor, 20))),
      plot9: bandPlot(priceBear, String(color.new(bearColor, 40))),
      plot10: bandPlot(priceOS, bearColor),
    },
    fills: [
      { plot1: 'plot0', plot2: 'plot2', options: { title: 'RSI Bullish Momentum Zone' }, colors: new Array<string>(n).fill(bullFill) },
      { plot1: 'plot5', plot2: 'plot3', options: { title: 'RSI Bearish Momentum Zone' }, colors: new Array<string>(n).fill(bearFill) },
      { plot1: 'plot6', plot2: 'plot7', options: { title: 'RevRSI Bullish Zone' }, colors: new Array<string>(n).fill(revBullFill) },
      { plot1: 'plot9', plot2: 'plot10', options: { title: 'RevRSI Bearish Zone' }, colors: new Array<string>(n).fill(revBearFill) },
    ],
    markers,
    lines,
    linefills,
    labels,
    tables,
    alerts: alertStates(alertConditions, bars, [aboveOB, belowOS]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0', title: 'Price Crossed Above OB Level',
    message: 'RSI S&R: Price crossed above prior RSI overbought level\n{{exchange}}:{{ticker}} | Price={{close}} | {{time}}',
  },
  {
    id: 'alert1', title: 'Price Crossed Below OS Level',
    message: 'RSI S&R: Price crossed below prior RSI oversold level\n{{exchange}}:{{ticker}} | Price={{close}} | {{time}}',
  },
];

export const RsiSupportResistanceByDgt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  fillConfig,
  alertConditions,
};
