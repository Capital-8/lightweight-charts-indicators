/**
 * Range Tightening Indicator (RTI)
 *
 * The bar range (high - low) is scaled between the lowest (0) and the highest (100) range of the lookback period.
 * The RTI line is green when it at least doubles after a value at or below 20 (range expansion), blue otherwise.
 * An orange dot marks every bar after two or more consecutive bars below 20. Zones 0-5 (red) and 5-20 (green) are
 * shaded, with bounds at 0 and 100.
 * Alerts (alertcondition, `alerts` of the result): 'Orange Dot Triggered' (two or more bars in a row below 20), 'RTI
 * Below 20 Triggered' and 'Range Expansion Triggered' (the green RTI bars).
 *
 * Reference: "Range Tightening Indicator (RTI)" by Ollie_AllCaps
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Orange Dot Triggered', message: 'Orange Dot Condition Met!' },
  { id: 'alert1', title: 'RTI Below 20 Triggered', message: 'RTI is Below 20!' },
  { id: 'alert2', title: 'Range Expansion Triggered', message: 'RTI Range Expansion Condition Met!' },
];

export type RTILookbackOption = '5' | '15' | 'Custom Lookback';

export interface RangeTighteningIndicatorInputs {
  /** Lookback period: 5, 15 or the custom lookback period */
  lookbackOption: RTILookbackOption;
  /** Lookback period used with 'Custom Lookback' */
  customLength: number;
}

export const defaultInputs: RangeTighteningIndicatorInputs = {
  lookbackOption: '5',
  customLength: 50,
};

export const inputConfig: InputConfig[] = [
  { id: 'lookbackOption', type: 'string', title: 'Lookback Period', defval: '5', options: ['5', '15', 'Custom Lookback'] },
  { id: 'customLength', type: 'int', title: 'Custom Lookback Period', defval: 50, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RTI', color: color.blue, lineWidth: 2 },
  { id: 'plot1', title: 'Zone 1 (0-5)', color: color.red, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Bound', color: color.red, lineWidth: 1 },
  { id: 'plot3', title: 'Zone 2 (5-20)', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'Zone 1 (0-5)', color: color.green, lineWidth: 1 },
  { id: 'plot5', title: 'Zone 1 Line (0-5)', color: color.gray, lineWidth: 1 },
  { id: 'plot6', title: 'Zone 2 Line (5-20)', color: color.gray, lineWidth: 1 },
];

export const metadata = {
  title: 'Range Tightening Indicator (RTI)+',
  shortTitle: 'RTI+',
  overlay: false,
};

// Pine compares floats with a tolerance of 1e-10
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS; // false when a value is na
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<RangeTighteningIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { lookbackOption, customLength } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // length = lookback_option == '5' ? 5 : lookback_option == '15' ? 15 : custom_length
  const length = lookbackOption === '5' ? 5 : lookbackOption === '15' ? 15 : customLength;

  // volatility = high - low; max / min volatility over the lookback period
  const volatility = bars.map((b) => b.high - b.low);
  const volS = Series.fromArray(bars, volatility);
  const maxVol = ta.highest(volS, length).toArray().map((v) => v ?? NaN);
  const minVol = ta.lowest(volS, length).toArray().map((v) => v ?? NaN);

  // rti = 100 * (volatility - min_volatility) / (max_volatility - min_volatility). When max = min, volatility = min:
  // Pine gives 0 / 0 = NaN
  const rti = volatility.map((v, i) => {
    const den = maxVol[i] - minVol[i];
    return den === 0 || isNaN(den) ? NaN : (100 * (v - minVol[i])) / den;
  });

  const rtiPlot: { time: number; value: number; color: string }[] = [];
  const markers: MarkerData[] = [];
  let consecutiveCount = 0; // var int consecutive_count = 0
  const dotFlags: boolean[] = [];
  const below20Flags: boolean[] = [];
  const expansionFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const r = rti[i];
    // range_expansion_condition = rti[1] <= 20 and rti >= 2 * rti[1]
    const prev = i > 0 ? rti[i - 1] : NaN;
    const expansion = le(prev, 20) && ge(r, 2 * prev);
    // plot(rti, color = range_expansion_condition ? color.green : color.blue, linewidth = 2, title = 'RTI')
    rtiPlot.push({ time: t, value: r, color: expansion ? color.green : color.blue });
    // below_20 = rti < 20: consecutive_count + 1, else 0
    consecutiveCount = lt(r, 20) ? consecutiveCount + 1 : 0;
    dotFlags.push(consecutiveCount >= 2);
    below20Flags.push(lt(r, 20));
    expansionFlags.push(expansion);
    // plotshape(consecutive_count >= 2 ? rti : na, location.absolute, shape.circle, size.tiny, color.orange)
    if (consecutiveCount >= 2 && !isNaN(r)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: r, shape: 'circle', color: color.orange, size: 'tiny' });
    }
  }

  const constant = (v: number) => bars.map((b) => ({ time: b.time, value: v }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: rtiPlot,
      plot1: constant(5),
      plot2: constant(0),
      plot3: constant(20),
      plot4: constant(5),
      plot5: constant(5),
      plot6: constant(20),
    },
    // fill(plot(5), plot(0), color.new(color.red, 90)); fill(plot(20), plot(5), color.new(color.green, 80))
    fills: [
      { plot1: 'plot1', plot2: 'plot2', options: { color: String(color.new(color.red, 90)) } },
      { plot1: 'plot3', plot2: 'plot4', options: { color: String(color.new(color.green, 80)) } },
    ],
    // hline(100) / hline(0): default hline style (dashed)
    hlines: [
      { value: 100, options: { title: 'RTI Upper Bound', color: color.gray, linestyle: 'dashed' } },
      { value: 0, options: { title: 'RTI Lower Bound', color: color.gray, linestyle: 'dashed' } },
    ],
    markers,
    // alertcondition(dot_condition), (below_20_condition), (range_expansion_condition)
    alerts: alertStates(alertConditions, bars, [dotFlags, below20Flags, expansionFlags]),
  };
}

export const RangeTighteningIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
