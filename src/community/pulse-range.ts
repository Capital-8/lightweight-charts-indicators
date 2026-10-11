/**
 * Pulse Range
 *
 * Adaptive range: EMA(EMA(|src - src[1]|, period), 2 * period - 1) * multiplier. The center track follows the source
 * only when it moves more than the range away (src - range when above the previous center, src + range when
 * below, else the previous center). Upper / lower tracks at center +- range with fills to the center. The center is
 * green while it rises, red while it falls (grey before the first move); the bars take the same colour. A triangle
 * at center -+ range * offset marks each turn of the direction (red to green, green to red).
 *
 * Last bar: with 'Confirm Signal On Bar Close' a signal needs a closed bar. The port reads the state of the last bar
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Pulse Range" by MarketStructureLab
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface PulseRangeInputs {
  /** Source */
  src: SourceType;
  /** Sampling period */
  rangeLength: number;
  /** Range multiplier */
  rangeScale: number;
  /** Signal only on a closed bar */
  confirmAtClose: boolean;
  /** Draw the upper / lower tracks */
  displayBands: boolean;
  /** Draw the fills between the tracks and the center */
  displayFill: boolean;
  /** Colour the bars by the direction */
  repaintCandles: boolean;
  /** Draw the signal triangles */
  displaySignals: boolean;
  /** Triangle distance from the center, in ranges */
  signalOffset: number;
  /** Enable the alert conditions (alerts are not ported) */
  alertsEnabled: boolean;
}

export const defaultInputs: PulseRangeInputs = {
  src: 'close',
  rangeLength: 40,
  rangeScale: 3.4,
  confirmAtClose: true,
  displayBands: true,
  displayFill: true,
  repaintCandles: true,
  displaySignals: true,
  signalOffset: 0.85,
  alertsEnabled: true,
};

const CALC = 'Calculation';
const VISUAL = 'Visuals';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: CALC },
  { id: 'rangeLength', type: 'int', title: 'Sampling Period', defval: 40, min: 1, group: CALC },
  { id: 'rangeScale', type: 'float', title: 'Range Multiplier', defval: 3.4, min: 0.1, step: 0.1, group: CALC },
  { id: 'confirmAtClose', type: 'bool', title: 'Confirm Signal On Bar Close', defval: true, group: CALC,
    tooltip: 'Сигнал подтверждается после закрытия свечи.' },
  { id: 'displayBands', type: 'bool', title: 'Show Range Bands', defval: true, group: VISUAL },
  { id: 'displayFill', type: 'bool', title: 'Show Range Fill', defval: true, group: VISUAL },
  { id: 'repaintCandles', type: 'bool', title: 'Color Candles', defval: true, group: VISUAL },
  { id: 'displaySignals', type: 'bool', title: 'Show Signal Triangles', defval: true, group: VISUAL },
  { id: 'signalOffset', type: 'float', title: 'Triangle Distance From Center', defval: 0.85, min: 0.05, step: 0.05, group: VISUAL,
    tooltip: 'Расстояние треугольника от центральной линии.' },
  { id: 'alertsEnabled', type: 'bool', title: 'Enable Alert Conditions', defval: true, group: 'Alerts' },
];

const RISING = String(color.rgb(0, 205, 115));
const FALLING = String(color.rgb(255, 65, 70));
const FLAT = String(color.rgb(120, 130, 145));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Center Track', color: FLAT, lineWidth: 4 },
  { id: 'plot1', title: 'Upper Track', color: String(color.new(RISING, 65)), lineWidth: 1 },
  { id: 'plot2', title: 'Lower Track', color: String(color.new(FALLING, 65)), lineWidth: 1 },
];

export const metadata = {
  title: 'Pulse Range',
  shortTitle: 'Pulse Range',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<PulseRangeInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const price = A(getSourceSeries(bars, cfg.src));

  // buildRange: ta.ema(ta.ema(math.abs(price - price[1]), period), period * 2 - 1) * multiplier
  const absChange = price.map((p, i) => (i > 0 ? Math.abs(p - price[i - 1]) : NaN));
  const averageChange = ta.ema(Series.fromArray(bars, absChange), cfg.rangeLength);
  const filteredChange = A(ta.ema(averageChange, cfg.rangeLength * 2 - 1));
  const range = filteredChange.map((x) => x * cfg.rangeScale);

  // buildCenter (var centerValue = na)
  const center: number[] = new Array(n);
  let cv = NaN;
  for (let i = 0; i < n; i++) {
    const prev = cv; // centerValue[1]
    const p = price[i];
    const r = range[i];
    if (isNaN(prev)) cv = p;
    else if (gt(p, prev)) cv = lt(p - r, prev) ? prev : p - r;
    else cv = gt(p + r, prev) ? prev : p + r;
    center[i] = cv;
  }

  // var int trackDirection = 0: 1 when the center rises, -1 when it falls, else unchanged
  const dir: number[] = new Array(n);
  let d = 0;
  for (let i = 0; i < n; i++) {
    const prevCenter = i > 0 ? center[i - 1] : NaN;
    if (gt(center[i], prevCenter)) d = 1;
    else if (lt(center[i], prevCenter)) d = -1;
    dir[i] = d;
  }

  const dirColor = (x: number) => (x === 1 ? RISING : x === -1 ? FALLING : FLAT);
  const upperCol = String(color.new(RISING, 65));
  const lowerCol = String(color.new(FALLING, 65));
  const NA = 'transparent';
  const upperFill = cfg.displayFill ? String(color.new(RISING, 90)) : NA;
  const lowerFill = cfg.displayFill ? String(color.new(FALLING, 90)) : NA;

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const prior = i > 0 ? dir[i - 1] : 0; // nz(trackDirection[1], 0)
    // barConfirmed = not confirmAtClose or barstate.isconfirmed
    const barConfirmed = !cfg.confirmAtClose || barIsConfirmed(i);
    const greenSignal = dir[i] === 1 && prior === -1 && barConfirmed;
    const redSignal = dir[i] === -1 && prior === 1 && barConfirmed;
    if (cfg.displaySignals && greenSignal) {
      // plotshape(greenMarkerPrice, "Green Signal", shape.triangleup, location.absolute, risingColor, size = size.small)
      const price0 = center[i] - range[i] * cfg.signalOffset;
      if (!isNaN(price0)) {
        markers.push({ time, position: 'atPriceMiddle', price: price0, shape: 'triangleUp', color: RISING, size: 'small' });
      }
    }
    if (cfg.displaySignals && redSignal) {
      // plotshape(redMarkerPrice, "Red Signal", shape.triangledown, location.absolute, fallingColor, size = size.small)
      const price1 = center[i] + range[i] * cfg.signalOffset;
      if (!isNaN(price1)) {
        markers.push({ time, position: 'atPriceMiddle', price: price1, shape: 'triangleDown', color: FALLING, size: 'small' });
      }
    }
    // barcolor(repaintCandles ? activeCandleColor : na)
    if (cfg.repaintCandles) barColors.push({ time, color: dirColor(dir[i]) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(centerTrack, "Center Track", trackColor, linewidth = 4)
      plot0: bars.map((b, i) => ({ time: b.time, value: center[i], color: dirColor(dir[i]) })),
      // plot(displayBands ? upperTrack : na, "Upper Track", color.new(risingColor, 65))
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.displayBands ? center[i] + range[i] : NaN, color: upperCol })),
      // plot(displayBands ? lowerTrack : na, "Lower Track", color.new(fallingColor, 65))
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.displayBands ? center[i] - range[i] : NaN, color: lowerCol })),
    },
    fills: [
      // fill(upperPlot, centerPlot, displayFill ? color.new(risingColor, 90) : na, "Upper Fill")
      { plot1: 'plot1', plot2: 'plot0', options: { title: 'Upper Fill' }, colors: new Array<string>(n).fill(upperFill) },
      // fill(lowerPlot, centerPlot, displayFill ? color.new(fallingColor, 90) : na, "Lower Fill")
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Lower Fill' }, colors: new Array<string>(n).fill(lowerFill) },
    ],
    markers,
    barColors,
  };
}

export const PulseRange = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
