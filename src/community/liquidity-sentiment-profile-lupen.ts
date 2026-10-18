/**
 * Liquidity Sentiment Profile (LSP)
 *
 * Candle micro-structure weighted by volume: the bullish pressure is the body of a bullish bar plus the lower wick,
 * the bearish pressure the body of a bearish bar plus the upper wick, both times the volume. Over `length` bars,
 * LSP = (bull sum - bear sum) / (bull sum + bear sum) * 100 (0 when the total is 0), with an EMA signal line.
 * The LSP is drawn as an area coloured by its sign and its direction, with a fill between the LSP and the signal
 * and a fill between the LSP and zero. Optional triangles mark the crossings of the LSP and its signal.
 * Alerts (alertcondition, `alerts` of the result): 'LSP Buy' / 'LSP Sell' when the LSP crosses over / under its signal.
 *
 * Reference: "Liquidity Sentiment Profile | LUPEN" by Horazio
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: @LUPEN
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LiquiditySentimentProfileLupenInputs {
  /** Length of the volume weighted sums */
  length: number;
  /** EMA length of the signal line */
  smooth: number;
  /** Show the crossings of the LSP and its signal */
  showCrossings: boolean;
  bullStrong: string;
  bullWeak: string;
  bearStrong: string;
  bearWeak: string;
  /** Neutral colour (an input of the Pine script, not used in its outputs) */
  neutral: string;
}

export const defaultInputs: LiquiditySentimentProfileLupenInputs = {
  length: 14,
  smooth: 5,
  showCrossings: false,
  bullStrong: '#29ff7b',
  bullWeak: '#29ff7f',
  bearStrong: '#ff6685',
  bearWeak: '#ff668f',
  neutral: '#455A64',
};

const GRP_CALC = '═══ SIGNAL INPUTS ═══';
const GRP_VIS = '═══ COLORS GROUP ═══';

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'LENGHT', defval: 14, min: 1, group: GRP_CALC },
  { id: 'smooth', type: 'int', title: 'SMOOTHING', defval: 5, min: 1, group: GRP_CALC },
  { id: 'showCrossings', type: 'bool', title: 'Show the corsings?', defval: false, group: GRP_CALC },
  { id: 'bullStrong', type: 'color', title: 'Bull Strong HEX', defval: '#29ff7b', group: GRP_VIS },
  { id: 'bullWeak', type: 'color', title: 'Bull Weak HEX', defval: '#29ff7f', group: GRP_VIS },
  { id: 'bearStrong', type: 'color', title: 'Bear Strong HEX', defval: '#ff6685', group: GRP_VIS },
  { id: 'bearWeak', type: 'color', title: 'Bear Weak HEX', defval: '#ff668f', group: GRP_VIS },
  { id: 'neutral', type: 'color', title: 'Neutral HEX', defval: '#455A64', group: GRP_VIS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Base', color: '#90A4AE', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'LSP Intensity Area', color: String(color.new('#29ff7b', 80)), lineWidth: 1, style: 'area' },
  { id: 'plot2', title: 'LSP Line', color: '#29ff7b', lineWidth: 2, display: 'none' },
  { id: 'plot3', title: 'Signal Line', color: '#FFEB3B', lineWidth: 1, display: 'none' },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 50, title: 'Upper Zone', color: '#546E7A', linestyle: 'dotted' },
  { id: 'hline_lower', price: -50, title: 'Lower Zone', color: '#546E7A', linestyle: 'dotted' },
];

export const metadata = {
  title: 'Liquidity Sentiment Profile | LUPEN',
  shortTitle: 'LSP',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false); a != b false within 1e-10 or na */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquiditySentimentProfileLupenInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const volBull: number[] = new Array(n);
  const volBear: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const { open, high, low, close } = bars[i];
    const volume = bars[i].volume ?? NaN;
    const bodySize = Math.abs(close - open);
    const upperWick = high - Math.max(close, open);
    const lowerWick = Math.min(close, open) - low;
    const bullPressureRaw = (gt(close, open) ? bodySize : 0) + lowerWick;
    const bearPressureRaw = (lt(close, open) ? bodySize : 0) + upperWick;
    volBull[i] = bullPressureRaw * volume;
    volBear[i] = bearPressureRaw * volume;
  }
  const smaBull = A(ta.sma(S(volBull), cfg.length));
  const smaBear = A(ta.sma(S(volBear), cfg.length));
  const lspRaw = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const sumBull = smaBull[i] * cfg.length;
    const sumBear = smaBear[i] * cfg.length;
    const totalFlow = sumBull + sumBear;
    // total_flow != 0 ? ... : 0 (na != 0 is false: 0 during the warm-up)
    lspRaw[i] = ne(totalFlow, 0) ? ((sumBull - sumBear) / totalFlow) * 100 : 0;
  }
  const lspSignal = A(ta.ema(S(lspRaw), cfg.smooth));
  // cross_up = ta.crossover(lsp_raw, lsp_signal), cross_down = ta.crossunder(lsp_raw, lsp_signal)
  const crossUp = crossedOver(lspRaw, lspSignal);
  const crossDown = crossedUnder(lspRaw, lspSignal);

  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const coreColors: string[] = new Array(n);
  const baseColors: string[] = new Array(n);
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const raw = lspRaw[i];
    const sig = lspSignal[i];
    const isBullish = gt(raw, 0);
    const isGrowing = i > 0 && gt(raw, lspRaw[i - 1]);
    const isAboveSignal = gt(raw, sig);
    const colDynamic = isBullish ? (isGrowing ? cfg.bullStrong : cfg.bullWeak) : isGrowing ? cfg.bearWeak : cfg.bearStrong;
    coreColors[i] = String(isAboveSignal
      ? (isGrowing ? color.new(cfg.bullStrong, 40) : color.new(cfg.bullWeak, 60))
      : (isGrowing ? color.new(cfg.bearWeak, 60) : color.new(cfg.bearStrong, 40)));
    baseColors[i] = String(isBullish ? color.new(cfg.bullStrong, 90) : color.new(cfg.bearStrong, 90));

    plot0.push({ time, value: 0, color: '#90A4AE' });
    plot1.push({ time, value: fin(raw), color: String(color.new(colDynamic, 80)) });
    plot2.push({ time, value: fin(raw), color: colDynamic });
    plot3.push({ time, value: fin(sig), color: '#FFEB3B' });

    // ta.crossover / ta.crossunder (exact comparisons)
    if (cfg.showCrossings && i > 0) {
      const prevRaw = lspRaw[i - 1];
      const prevSig = lspSignal[i - 1];
      if (raw > sig && prevRaw <= prevSig) {
        markers.push({ time, position: 'atPriceMiddle', price: -105, shape: 'triangleUp', color: '#00E676', size: 'small' });
      }
      if (raw < sig && prevRaw >= prevSig) {
        markers.push({ time, position: 'atPriceMiddle', price: 105, shape: 'triangleDown', color: '#FF1744', size: 'small' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: { plot0, plot1, plot2, plot3 },
    hlines: [
      { value: 50, options: { title: 'Upper Zone', color: '#546E7A', linestyle: 'dotted' } },
      { value: -50, options: { title: 'Lower Zone', color: '#546E7A', linestyle: 'dotted' } },
    ],
    fills: [
      // fill(p_lsp, p_sig, color = fill_core_color, title = 'Trend Intensity Core')
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Trend Intensity Core' }, colors: coreColors },
      // fill(p_lsp, p_zero, color = fill_base_color, title = 'Volume Depth')
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'Volume Depth' }, colors: baseColors },
    ],
    markers,
    // alertcondition(cross_up, 'LSP Buy') / alertcondition(cross_down, 'LSP Sell')
    alerts: alertStates(alertConditions, bars, [crossUp, crossDown]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'LSP Buy', message: 'LSP Bullish Crossover' },
  { id: 'alert1', title: 'LSP Sell', message: 'LSP Bearish Crossover' },
];

export const LiquiditySentimentProfileLupen = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
