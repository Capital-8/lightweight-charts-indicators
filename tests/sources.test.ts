/**
 * The built-in sources (scripts/build-sources.mjs): one per standard registry entry, plain JavaScript that imports
 * only oakscriptjs and the helpers entry, carrying the registry's names, and computing what the registry computes.
 */
import { describe, expect, it } from 'vitest';
import { join, sep } from 'node:path';
import ts from 'typescript';
import * as oak from 'oakscriptjs';
import * as helpers from '../src/helpers';
import { indicatorRegistry } from '../src/index';
// @ts-expect-error plain JavaScript build script
import { buildSources } from '../scripts/build-sources.mjs';

const sources: Record<string, string> = buildSources(join(__dirname, '..'));
const standard = indicatorRegistry.filter((e) => e.group === 'standard');

// Each source runs as its own module, its imports pointed at the instances the test already loaded.
(globalThis as Record<string, unknown>).__srcTestOak = oak;
(globalThis as Record<string, unknown>).__srcTestHelpers = helpers;
const shim = (global: string, mod: Record<string, unknown>) =>
  'data:text/javascript,' +
  encodeURIComponent(
    `const m = globalThis.${global};\n` +
      Object.keys(mod)
        .filter((k) => k !== 'default' && /^[A-Za-z_$][\w$]*$/.test(k))
        .map((k) => `export const ${k} = m[${JSON.stringify(k)}];`)
        .join('\n'),
  );
const OAK_URL = shim('__srcTestOak', oak as unknown as Record<string, unknown>);
const HELPERS_URL = shim('__srcTestHelpers', helpers as unknown as Record<string, unknown>);

async function load(source: string): Promise<Record<string, any>> {
  const code = source
    .replace(/from 'oakscriptjs'/g, `from '${OAK_URL}'`)
    .replace(/from 'lightweight-charts-indicators\/helpers'/g, `from '${HELPERS_URL}'`);
  return import(/* @vite-ignore */ 'data:text/javascript,' + encodeURIComponent(code));
}

/** Import specifiers of a module source (import / export ... from statements). */
const IMPORT_FROM = /^(?:import|export|\})[^'\n]*\bfrom '([^']+)';/gm;

function bars(n: number) {
  const out = [];
  let price = 100;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = Math.max(1, open + (rnd() - 0.5) * 4);
    const high = Math.max(open, close) + rnd() * 2;
    const low = Math.min(open, close) - rnd() * 2;
    out.push({ time: 1_600_000_000 + i * 86_400, open, high, low, close, volume: 1_000 + Math.round(rnd() * 5_000) });
    price = close;
  }
  return out;
}

describe('built-in sources', () => {
  it('has a source for every standard registry entry', () => {
    expect(Object.keys(sources).sort()).toEqual(standard.map((e) => e.id).sort());
  });

  it('imports only oakscriptjs and the helpers entry, with no types left', () => {
    for (const [id, src] of Object.entries(sources)) {
      const specs = [...src.matchAll(IMPORT_FROM)].map((m) => m[1]);
      for (const s of specs) expect(['oakscriptjs', 'lightweight-charts-indicators/helpers'], `${id}: ${s}`).toContain(s);
      expect(src, id).not.toMatch(/^\s*(export\s+)?(interface|type)\s+\w+/m);
    }
  });

  it('type-checks as JavaScript (checkJs) with the types kept as JSDoc', () => {
    const root = join(__dirname, '..');
    const files = new Map(Object.entries(sources).map(([id, src]) => [join(root, '.sources-check', `${id}.js`), src]));
    const options: ts.CompilerOptions = {
      allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true,
      target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.esnext.d.ts'], baseUrl: root,
      paths: { 'lightweight-charts-indicators/helpers': ['src/helpers.ts'] },
    };
    const host = ts.createCompilerHost(options);
    const read = host.readFile.bind(host);
    host.readFile = (f) => files.get(f.replace(/\//g, sep)) ?? files.get(f) ?? read(f);
    const exists = host.fileExists.bind(host);
    host.fileExists = (f) => files.has(f.replace(/\//g, sep)) || files.has(f) || exists(f);
    const program = ts.createProgram([...files.keys()], options, host);
    const checked = program.getSourceFiles().filter((f) => files.has(f.fileName.replace(/\//g, sep)));
    expect(checked.length).toBe(files.size);
    // The oakscriptjs types are read (a call with a wrong argument type is an error).
    expect(program.getSourceFiles().some((f) => /oakscriptjs[\\/]dist/.test(f.fileName))).toBe(true);
    const errors = ts.getPreEmitDiagnostics(program)
      .filter((d) => d.category === ts.DiagnosticCategory.Error && d.file && files.has(d.file.fileName.replace(/\//g, sep)))
      .map((d) => `${d.file!.fileName.split(/[\\/]/).pop()}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160)}`);
    expect(errors).toEqual([]);
  }, 120_000);

  it('declares the names and shape of its registry entry, and computes the same plots', async () => {
    const data = bars(400);
    for (const entry of standard) {
      const mod = await load(sources[entry.id]);
      expect(mod.metadata.title, entry.id).toBe(entry.metadata.title);
      expect(mod.metadata.shortTitle, entry.id).toBe(entry.metadata.shortTitle);
      expect(mod.inputConfig, entry.id).toEqual(entry.inputConfig);
      expect(mod.plotConfig, entry.id).toEqual(entry.plotConfig);
      // The Style-settings declarations of the entry (style-outputs.ts).
      for (const key of ['hlineConfig', 'fillConfig', 'shapeConfig', 'barColorConfig', 'markerDrawing', 'drawingKinds'] as const) {
        if (entry[key] !== undefined) expect(mod[key], `${entry.id} ${key}`).toEqual(entry[key]);
      }
      expect(typeof mod.calculate, entry.id).toBe('function');
      if (entry.requiredSymbols) continue; // reads other symbols' bars
      let expected: any;
      try {
        expected = entry.calculate(data, {});
      } catch {
        continue; // needs a chart context
      }
      const got = mod.calculate(data, {});
      expect(JSON.stringify(got.plots), entry.id).toBe(JSON.stringify(expected.plots));
    }
  }, 120_000);
});
