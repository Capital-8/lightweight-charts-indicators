/**
 * DEMO ONLY, not a port and not in the registry: listed by the page with the query parameter `?visibleRangeDemo=1`.
 * One box from the highest high to the lowest low of the bars visible on the chart, to show an indicator that reads
 * the visible range of the chart context (`usesVisibleRange`) and is calculated again on scroll / zoom.
 */

import type { Bar } from 'oakscriptjs';
import { visibleRangeOf, type ChartContext, type IndicatorRegistryEntry } from '../../src/index';

const metadata = { title: 'Visible Range Box (demo)', shortTitle: 'VR Box', overlay: true };

function calculate(bars: Bar[], _inputs?: unknown, chart?: ChartContext) {
  const { left, right } = visibleRangeOf(bars, chart);
  let high = -Infinity;
  let low = Infinity;
  for (let i = left; i <= right; i++) {
    if (bars[i].high > high) high = bars[i].high;
    if (bars[i].low < low) low = bars[i].low;
  }

  return {
    metadata,
    plots: {},
    boxes: right < left ? [] : [{
      time1: bars[left].time,
      price1: high,
      time2: bars[right].time,
      price2: low,
      bgColor: 'rgba(41, 98, 255, 0.1)',
      borderColor: '#2962FF',
      borderWidth: 1,
    }],
  };
}

export const visibleRangeDemo: IndicatorRegistryEntry = {
  id: 'visible-range-demo',
  group: 'standard',
  name: metadata.title,
  shortName: metadata.shortTitle,
  category: 'Volatility',
  overlay: true,
  metadata,
  inputConfig: [],
  plotConfig: [],
  defaultInputs: {},
  usesVisibleRange: true,
  calculate,
};
