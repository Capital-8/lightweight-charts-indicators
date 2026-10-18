/**
 * Scalping Line Indicator
 *
 * Non-overlay oscillator: ScalpLine = SMA(close, signalPeriod) - ssMA
 * where ssMA is a double-smoothed SMA clamped to close when price moves beyond percent band.
 * Fill between ScalpLine and zero: green when >= 0, red when < 0.
 * As the original, ScalpLine exists from the first signal-line value (bar signalPeriod - 1): while the MA is na both
 * band tests are false, so ssMA = close; the zero line is drawn from the first bar. The MA reads the Source input,
 * the band tests, ssMA and the signal line read the close.
 * Alerts (alertcondition, `alerts` of the result): 'BUY ALARM!' / 'SELL ALARM!', ScalpLine crossing above / below 0.
 *
 * Reference: "Scalping Line Indicator" by KivancOzbilgic
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ScalpingLineInputs {
  src: SourceType;
  percent: number;
  mainPeriod: number;
  signalPeriod: number;
}

export const defaultInputs: ScalpingLineInputs = {
  src: 'close',
  percent: 1.0,
  mainPeriod: 100,
  signalPeriod: 7,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'percent', type: 'float', title: 'Percent', defval: 1.0, min: 0, step: 0.1 },
  { id: 'mainPeriod', type: 'int', title: 'Main Period', defval: 100, min: 1 },
  { id: 'signalPeriod', type: 'int', title: 'Signal Period', defval: 7, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Scalp Line', color: '#800000', lineWidth: 2 },
  { id: 'plot1', title: 'Zero', color: '#787B86', lineWidth: 1 },
];

export const metadata = {
  title: 'Scalping Line',
  shortTitle: 'SLI',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<ScalpingLineInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const { src, percent, mainPeriod, signalPeriod } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const source = getSourceSeries(bars, src);
  const closeSeries = getSourceSeries(bars, 'close');
  const closeArr = closeSeries.toArray();

  // MA = sma(sma(src, ceil(mainPeriod/2)), floor(mainPeriod/2) + 1)
  const halfUp = Math.ceil(mainPeriod / 2);
  const halfDown = Math.floor(mainPeriod / 2) + 1;
  const sma1 = ta.sma(source, halfUp);
  const smaArr = ta.sma(sma1, halfDown).toArray();

  // ssMA = MA > close + MA * percent / 100 ? MA : MA < close - MA * percent / 100 ? MA : close
  // (na MA: both tests false, ssMA = close)
  const ssMAArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ma = smaArr[i];
    const c = closeArr[i] ?? NaN;
    if (ma == null || isNaN(ma)) {
      ssMAArr[i] = c;
      continue;
    }
    const band = ma * percent / 100;
    if (ma > c + band) {
      ssMAArr[i] = ma;
    } else if (ma < c - band) {
      ssMAArr[i] = ma;
    } else {
      ssMAArr[i] = c;
    }
  }

  // signalline = sma(close, signalPeriod)
  const signalArr = ta.sma(closeSeries, signalPeriod).toArray();

  // ScalpLine = signalline - ssMA
  const scalpArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const sig = signalArr[i];
    const ss = ssMAArr[i];
    scalpArr[i] = (sig != null && !isNaN(sig) && !isNaN(ss)) ? sig - ss : NaN;
  }

  const plot0 = scalpArr.map((v, i) => ({ time: bars[i].time, value: v }));

  // plot(0, "") on every bar
  const plot1 = bars.map((b) => ({ time: b.time, value: 0 }));

  // Fill colour: ScalpLine >= 0 ? green : red (transp 80); no fill where ScalpLine is na
  const fillColors = scalpArr.map((v) => {
    if (isNaN(v)) return 'transparent';
    return v >= 0 ? 'rgba(0,128,0,0.2)' : 'rgba(255,0,0,0.2)';
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: 'rgba(0,128,0,0.2)' }, colors: fillColors }],
    // alertcondition(crossover(ScalpLine, 0), "BUY ALARM!") / alertcondition(crossunder(ScalpLine, 0), "SELL ALARM!")
    alerts: alertStates(alertConditions, bars, [crossedOver(scalpArr, 0), crossedUnder(scalpArr, 0)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY ALARM!', message: 'SLI BUY Signal!' },
  { id: 'alert1', title: 'SELL ALARM!', message: 'SLI SELL Signal!' },
];

export const ScalpingLine = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
