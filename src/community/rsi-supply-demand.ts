/**
 * RSI Based Automatic Supply and Demand
 *
 * RSI-based supply and demand zones, four of them (four RSI lengths: 7, 14, 21, 28; only zone 2 is shown by
 * default). For each zone: counts the consecutive bars on which the RSI is overbought or oversold (also only
 * overbought for the resistance zone, only oversold for the support zone); once the count reaches the confirmation
 * bars, the high / low of that bar become the zone boundaries, carried forward (fixnan). The zone fill has no colour
 * on the bar where the zone changes. No markers: the original draws only the zone plots and fills.
 * Alerts (alertcondition, `alerts` of the result): 'Price Enters S/D Zone 1' to '4' (the close inside the zone, the
 * zone unchanged since the bar before, and not inside on the bar before) and 'Price Enters Any S/D Zone'.
 *
 * Reference: "RSI Supply/Demand" by shtcoinr / Lij_MC
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RsiSupplyDemandInputs {
  /** Zone 2 (shown by default) */
  rsiLength: number;
  obLevel: number;
  osLevel: number;
  confirmationBars: number;
  showSD: boolean;
  showSupport: boolean;
  showResistance: boolean;
  /** Zone 1 */
  rsiLength1: number;
  obLevel1: number;
  osLevel1: number;
  confirmationBars1: number;
  showSD1: boolean;
  showSupport1: boolean;
  showResistance1: boolean;
  /** Zone 3 */
  rsiLength3: number;
  obLevel3: number;
  osLevel3: number;
  confirmationBars3: number;
  showSD3: boolean;
  showSupport3: boolean;
  showResistance3: boolean;
  /** Zone 4 */
  rsiLength4: number;
  obLevel4: number;
  osLevel4: number;
  confirmationBars4: number;
  showSD4: boolean;
  showSupport4: boolean;
  showResistance4: boolean;
}

export const defaultInputs: RsiSupplyDemandInputs = {
  rsiLength: 14,
  obLevel: 70,
  osLevel: 30,
  confirmationBars: 3,
  showSD: true,
  showSupport: false,
  showResistance: false,
  rsiLength1: 7,
  obLevel1: 70,
  osLevel1: 30,
  confirmationBars1: 3,
  showSD1: false,
  showSupport1: false,
  showResistance1: false,
  rsiLength3: 21,
  obLevel3: 70,
  osLevel3: 30,
  confirmationBars3: 3,
  showSD3: false,
  showSupport3: false,
  showResistance3: false,
  rsiLength4: 28,
  obLevel4: 70,
  osLevel4: 30,
  confirmationBars4: 3,
  showSD4: false,
  showSupport4: false,
  showResistance4: false,
};

const ZONES = [1, 2, 3, 4];

/** Input ids of zone k (zone 2: the ids without a number, those of the first version of the port) */
const zoneKeys = (k: number) => {
  const sfx = k === 2 ? '' : String(k);
  return {
    rsiLength: `rsiLength${sfx}`, obLevel: `obLevel${sfx}`, osLevel: `osLevel${sfx}`, confirmationBars: `confirmationBars${sfx}`,
    showSD: `showSD${sfx}`, showSupport: `showSupport${sfx}`, showResistance: `showResistance${sfx}`,
  };
};

const defaults = defaultInputs as unknown as Record<string, number | boolean>;

export const inputConfig: InputConfig[] = ZONES.flatMap((k): InputConfig[] => {
  const key = zoneKeys(k);
  const group = `Supply Demand ${k}`;
  return [
    { id: key.showSD, type: 'bool', title: 'Show Supply/Demand Zone', defval: defaults[key.showSD], group },
    { id: key.showSupport, type: 'bool', title: 'Show Support Zone', defval: defaults[key.showSupport], group },
    { id: key.showResistance, type: 'bool', title: 'Show Resistance Zone', defval: defaults[key.showResistance], group },
    { id: key.rsiLength, type: 'int', title: 'RSI Length', defval: defaults[key.rsiLength], min: 1, group },
    { id: key.obLevel, type: 'int', title: 'Overbought Level', defval: 70, min: 50, max: 100, group },
    { id: key.osLevel, type: 'int', title: 'Oversold Level', defval: 30, min: 0, max: 50, group },
    { id: key.confirmationBars, type: 'int', title: 'Confirmation Bars', defval: 3, min: 1, group },
  ];
});

/** Plot ids of zone k (zone 2: the ids of the first version of the port) */
const plotIds = (k: number) => (k === 2
  ? { resHigh: 'resistanceHigh', resLow: 'resistanceLow', supHigh: 'supportHigh', supLow: 'supportLow', sdHigh: 'sdHigh', sdLow: 'sdLow' }
  : {
    resHigh: `resistance${k}High`, resLow: `resistance${k}Low`, supHigh: `support${k}High`, supLow: `support${k}Low`,
    sdHigh: `sd${k}High`, sdLow: `sd${k}Low`,
  });

/** The six plots of each zone, with the original's titles */
export const plotConfig: PlotConfig[] = ZONES.flatMap((k): PlotConfig[] => {
  const id = plotIds(k);
  return [
    { id: id.resHigh, title: `Resistance Zone - ${k} - High`, color: '#FF3333', lineWidth: 1 },
    { id: id.resLow, title: `Resistance Zone - ${k} - Low`, color: '#FF3333', lineWidth: 1 },
    { id: id.supHigh, title: `Support Zone - ${k} - High`, color: '#33FF33', lineWidth: 1 },
    { id: id.supLow, title: `Support Zone - ${k} - Low`, color: '#33FF33', lineWidth: 1 },
    { id: id.sdHigh, title: `Supply Demand - ${k} - High`, color: '#3366FF', lineWidth: 1 },
    { id: id.sdLow, title: `Supply Demand - ${k} - Low`, color: '#3366FF', lineWidth: 1 },
  ];
});

export const metadata = {
  title: 'RSI Supply/Demand',
  shortTitle: 'RSI S/D',
  overlay: true,
};

/** Pine float comparisons: a <= b unless a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** fixnan: carry forward the last non-NaN value */
function fixnan(arr: number[]): number[] {
  const result: number[] = new Array(arr.length).fill(NaN);
  let lastVal = NaN;
  for (let i = 0; i < arr.length; i++) {
    if (!isNaN(arr[i])) lastVal = arr[i];
    result[i] = lastVal;
  }
  return result;
}

/** One zone: the S/D, resistance and support boundaries of one RSI length, and the bars where the close enters the S/D zone */
function zone(bars: Bar[], rsiLength: number, obLevel: number, osLevel: number, confirmationBars: number) {
  const n = bars.length;
  const closeSeries = new Series(bars, (b) => b.close);
  const rsiArr = ta.rsi(closeSeries, rsiLength).toArray();

  // Combined S/D zone (OB or OS), resistance zone (OB only), support zone (OS only)
  const rsx: number[] = new Array(n).fill(0);
  const sdRawH: number[] = new Array(n).fill(NaN);
  const sdRawL: number[] = new Array(n).fill(NaN);
  const rsu: number[] = new Array(n).fill(0);
  const resRawH: number[] = new Array(n).fill(NaN);
  const resRawL: number[] = new Array(n).fill(NaN);
  const rsd: number[] = new Array(n).fill(0);
  const supRawH: number[] = new Array(n).fill(NaN);
  const supRawL: number[] = new Array(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    const rsiVal = rsiArr[i] ?? NaN;
    const isOB = rsiVal > obLevel;
    const isOS = rsiVal < osLevel;
    const isEither = isOB || isOS;

    rsx[i] = isEither ? (i > 0 ? rsx[i - 1] : 0) + 1 : 0;
    if (rsx[i] >= confirmationBars) {
      sdRawH[i] = bars[i].high;
      sdRawL[i] = bars[i].low;
    }
    rsu[i] = isOB ? (i > 0 ? rsu[i - 1] : 0) + 1 : 0;
    if (rsu[i] >= confirmationBars) {
      resRawH[i] = bars[i].high;
      resRawL[i] = bars[i].low;
    }
    rsd[i] = isOS ? (i > 0 ? rsd[i - 1] : 0) + 1 : 0;
    if (rsd[i] >= confirmationBars) {
      supRawH[i] = bars[i].high;
      supRawL[i] = bars[i].low;
    }
  }

  const sdH = fixnan(sdRawH);
  const sdL = fixnan(sdRawL);
  // PriceInSDZone = close <= rH and close >= rL and rH == rH[1]; PriceEntersSDZone = in and not in[1]
  const inZone = bars.map((b, i) => le(b.close, sdH[i]) && ge(b.close, sdL[i]) && i > 0 && sdH[i] === sdH[i - 1]);
  const enters = inZone.map((v, i) => v && !(i > 0 && inZone[i - 1]));
  return { sdH, sdL, resH: fixnan(resRawH), resL: fixnan(resRawL), supH: fixnan(supRawH), supL: fixnan(supRawL), enters };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiSupplyDemandInputs> = {},
): Omit<IndicatorResult, 'markers'> & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const c = cfg as unknown as Record<string, number | boolean>;
  const n = bars.length;

  // Colors: transparent when zone changes (new != prev), normal otherwise
  const sdColor = 'rgba(51,102,255,0.15)';
  const resColor = 'rgba(255,51,51,0.08)';
  const supColor = 'rgba(51,255,51,0.08)';
  const transparent = 'transparent';

  const plots: IndicatorResult['plots'] = {};
  const fills: NonNullable<IndicatorResult['fills']> = [];
  const enters: boolean[][] = [];

  for (const k of ZONES) {
    const key = zoneKeys(k);
    const len = c[key.rsiLength] as number;
    const z = zone(bars, len, c[key.obLevel] as number, c[key.osLevel] as number, c[key.confirmationBars] as number);
    enters.push(z.enters);
    const warmup = len + 1;

    const sdFillColors: string[] = new Array(n).fill(transparent);
    const resFillColors: string[] = new Array(n).fill(transparent);
    const supFillColors: string[] = new Array(n).fill(transparent);
    for (let i = 0; i < n; i++) {
      if (i < warmup) continue;
      sdFillColors[i] = (i > 0 && z.sdH[i] !== z.sdH[i - 1]) ? transparent : sdColor;
      resFillColors[i] = (i > 0 && z.resH[i] !== z.resH[i - 1]) ? transparent : resColor;
      supFillColors[i] = (i > 0 && z.supL[i] !== z.supL[i - 1]) ? transparent : supColor;
    }

    const line = (values: number[], on: boolean) => values.map((v, i) => ({ time: bars[i].time, value: (i < warmup || !on) ? NaN : v }));
    const id = plotIds(k);
    plots[id.resHigh] = line(z.resH, c[key.showResistance] as boolean);
    plots[id.resLow] = line(z.resL, c[key.showResistance] as boolean);
    plots[id.supHigh] = line(z.supH, c[key.showSupport] as boolean);
    plots[id.supLow] = line(z.supL, c[key.showSupport] as boolean);
    plots[id.sdHigh] = line(z.sdH, c[key.showSD] as boolean);
    plots[id.sdLow] = line(z.sdL, c[key.showSD] as boolean);
    // The original's fill titles (its resistance fill is titled "Support Zone - k - Fill" too)
    fills.push(
      { plot1: id.resHigh, plot2: id.resLow, options: { color: resColor, title: `Support Zone - ${k} - Fill` }, colors: resFillColors },
      { plot1: id.supHigh, plot2: id.supLow, options: { color: supColor, title: `Support Zone - ${k} - Fill` }, colors: supFillColors },
      { plot1: id.sdHigh, plot2: id.sdLow, options: { color: sdColor, title: `Supply Demand - ${k} - Fill` }, colors: sdFillColors },
    );
  }

  const any = enters[0].map((v, i) => v || enters[1][i] || enters[2][i] || enters[3][i]);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    alerts: alertStates(alertConditions, bars, [...enters, any]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Alert - Price Enters S/D Zone 1', message: 'Price Enters S/D Zone 1 - RSI S/D' },
  { id: 'alert1', title: 'Alert - Price Enters S/D Zone 2', message: 'Price Enters S/D Zone 2 - RSI S/D' },
  { id: 'alert2', title: 'Alert - Price Enters S/D Zone 3', message: 'Price Enters S/D Zone 3 - RSI S/D' },
  { id: 'alert3', title: 'Alert - Price Enters S/D Zone 4', message: 'Price Enters S/D Zone 4 - RSI S/D' },
  { id: 'alert4', title: 'Alert - Price Enters Any S/D Zone', message: 'Price Enters Any S/D Zone - RSI S/D' },
];

export const RsiSupplyDemand = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
