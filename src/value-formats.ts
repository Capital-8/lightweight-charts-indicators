/**
 * Value format of the built-ins, as the reference declares them (metaInfo `format`): a price with a fixed number of
 * decimals, a volume (abbreviated: 5.37 K, 47.46 M) or a percentage. A study not listed shows its values in the
 * symbol's price format (the reference `inherit`).
 */
export interface StudyFormat {
  type: 'price' | 'volume' | 'percent';
  /** Decimals of a price or percentage; unset: the default (2). */
  precision?: number;
}

export const VALUE_FORMATS: Record<string, StudyFormat> = {
  '24-hour-volume': { type: 'volume' },
  'accumulation-distribution': { type: 'volume' },
  'adr-bars': { type: 'price', precision: 2 },
  'adx': { type: 'price', precision: 2 },
  'aroon': { type: 'percent', precision: 2 },
  'auto-key-levels': { type: 'volume' },
  'bb-bandwidth': { type: 'price', precision: 2 },
  'bb-percent-b': { type: 'price', precision: 2 },
  'bop': { type: 'price', precision: 2 },
  'cci': { type: 'price', precision: 2 },
  'chaikin-mf': { type: 'price', precision: 2 },
  'chaikin-osc': { type: 'volume' },
  'chande-mo': { type: 'price', precision: 2 },
  'chop-zone': { type: 'price', precision: 0 },
  'choppiness': { type: 'price', precision: 2 },
  'connors-rsi': { type: 'price', precision: 2 },
  'correlation-coefficient': { type: 'price', precision: 2 },
  'cvd': { type: 'volume' },
  'dmi': { type: 'price', precision: 4 },
  'dpo': { type: 'price', precision: 2 },
  'elder-force': { type: 'volume' },
  'eom': { type: 'volume' },
  'fisher-transform': { type: 'price', precision: 2 },
  'hist-volatility': { type: 'price', precision: 2 },
  'klinger': { type: 'volume' },
  'kst': { type: 'price', precision: 4 },
  'mass-index': { type: 'price', precision: 2 },
  'mfi': { type: 'price', precision: 2 },
  'net-volume': { type: 'volume' },
  'obv': { type: 'volume' },
  'price-oscillator': { type: 'percent', precision: 2 },
  'pvt': { type: 'volume' },
  'rci': { type: 'price', precision: 2 },
  'rci-ribbon': { type: 'price', precision: 2 },
  'roc': { type: 'price', precision: 2 },
  'rsi': { type: 'price', precision: 2 },
  'rsi-divergence-indicator': { type: 'price' },
  'rvi': { type: 'price', precision: 4 },
  'rvol': { type: 'price', precision: 2 },
  'smi-ergodic': { type: 'price', precision: 4 },
  'smi-ergodic-osc': { type: 'price', precision: 4 },
  'stoch': { type: 'price', precision: 2 },
  'stoch-rsi': { type: 'price', precision: 2 },
  'technicals': { type: 'price', precision: 2 },
  'trend-strength': { type: 'price', precision: 2 },
  'trix': { type: 'price', precision: 2 },
  'tsi': { type: 'price', precision: 4 },
  'ultimate-osc': { type: 'price', precision: 2 },
  'up-down-volume': { type: 'volume' },
  'volume-delta': { type: 'volume' },
  'volume-osc': { type: 'percent', precision: 2 },
  'vortex': { type: 'price', precision: 4 },
  'williams-fractals': { type: 'price', precision: 0 },
  'williams-r': { type: 'price', precision: 2 },
};

/** The registry entry with its value format (when it has one). */
export function withValueFormat<T extends { id: string; format?: StudyFormat }>(entry: T): T {
  const f = VALUE_FORMATS[entry.id];
  return f && !entry.format ? { ...entry, format: f } : entry;
}
