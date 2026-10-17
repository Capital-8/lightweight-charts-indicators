/**
 * Applies the Style-settings declarations of style-outputs.ts to the registry entries: line plots the reference does
 * not list get `editable: false`, hlines and fills their titles, and the entry its shapes, background / bar colours,
 * candle colours and drawing kinds. `calculate` then stamps the id of its declaration on the background / bar colours
 * and the fills between plots of its result, so a host can change or hide each of them.
 */
import type { BarColorConfig, CandleConfig, FillConfig, HLineConfig, PlotConfig } from 'oakscriptjs';
import { STYLE_OUTPUTS, type StudyDrawingKind, type StyleOutputs, type StyleShapeConfig } from './style-outputs';

/** A plotcandle() / plotbar() output of an entry: id of its candles in the result's `plotCandles`, title, colours */
export type PlotCandleDecl = { id: string; title: string } & Partial<Omit<CandleConfig, 'id' | 'title' | 'kind'>>;

interface StyleTarget {
  id: string;
  plotConfig: PlotConfig[];
  hlineConfig?: HLineConfig[];
  fillConfig?: FillConfig[];
  plotCandleConfig?: PlotCandleDecl[];
  shapeConfig?: StyleShapeConfig[];
  barColorConfig?: BarColorConfig[];
  markerDrawing?: StudyDrawingKind;
  drawingKinds?: StudyDrawingKind[];
  calculate: (...args: any[]) => any;
}

/** The result with the declaration ids on its background / bar colours and its fills between plots. */
function stampIds(result: any, decl: StyleOutputs): any {
  if (!result || typeof result !== 'object') return result;
  let out = result;
  const copy = () => (out === result ? (out = { ...result }) : out);
  for (const [key, kind] of [['bgColors', 'bgcolor'], ['barColors', 'barcolor']] as const) {
    const list = result[key];
    const own = (decl.barColors ?? []).filter((b) => b.kind === kind);
    // one declaration of the kind: every entry is its
    if (!Array.isArray(list) || own.length !== 1 || list.every((x: any) => x.id)) continue;
    copy()[key] = list.map((x: any) => (x.id ? x : { ...x, id: own[0].id }));
  }
  const plotFills = (decl.fills ?? []).filter((f) => !String(f.plot1).startsWith('hline'));
  if (Array.isArray(result.fills) && plotFills.length && result.fills.some((f: any) => !f.id)) {
    const used = new Set<string>();
    copy().fills = result.fills.map((f: any) => {
      if (f.id) return f;
      const same = (d: FillConfig) => !used.has(d.id) && d.plot1 === f.plot1 && d.plot2 === f.plot2;
      const d = plotFills.find((x) => same(x) && (x.title ?? '') === (f.options?.title ?? '')) ?? plotFills.find(same);
      if (!d) return f;
      used.add(d.id);
      return { ...f, id: d.id };
    });
  }
  return out;
}

export function withStyleOutputs<T extends StyleTarget>(entry: T): T {
  const decl = STYLE_OUTPUTS[entry.id];
  if (!decl) return entry;
  const hidden = new Set(decl.hiddenPlots ?? []);
  const e: T = { ...entry };
  if (hidden.size) e.plotConfig = entry.plotConfig.map((p) => (hidden.has(p.id) ? { ...p, editable: false } : p));
  if (decl.hlines && entry.hlineConfig) {
    e.hlineConfig = entry.hlineConfig.map((h) => (decl.hlines![h.id] ? { ...h, ...decl.hlines![h.id] } : h));
  }
  if (decl.fills) {
    const own = new Map((entry.fillConfig ?? []).map((f) => [f.id, f]));
    const merged = (entry.fillConfig ?? []).map((f) => {
      const d = decl.fills!.find((x) => x.id === f.id);
      return d ? { ...f, ...d } : f;
    });
    for (const d of decl.fills) if (!own.has(d.id)) merged.push(d);
    e.fillConfig = merged;
  }
  if (decl.shapes) e.shapeConfig = decl.shapes;
  if (decl.markerDrawing) e.markerDrawing = decl.markerDrawing;
  if (decl.barColors) e.barColorConfig = decl.barColors;
  if (decl.candles && entry.plotCandleConfig) {
    e.plotCandleConfig = entry.plotCandleConfig.map((c) => (decl.candles![c.id] ? { ...c, ...decl.candles![c.id], id: c.id } as PlotCandleDecl : c));
  }
  if (decl.drawings) e.drawingKinds = decl.drawings;
  if (decl.barColors || decl.fills) {
    const calculate = entry.calculate;
    e.calculate = (...args: any[]) => stampIds(calculate(...args), decl);
  }
  return e;
}
