/**
 * The built-in sources (scripts/build-sources.mjs): one per standard registry entry, plain JavaScript that imports
 * only oakscriptjs and the helpers entry, carrying the registry's names, and computing what the registry computes.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
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

  it('declares the names and shape of its registry entry, and computes the same plots', async () => {
    const data = bars(400);
    for (const entry of standard) {
      const mod = await load(sources[entry.id]);
      expect(mod.metadata.title, entry.id).toBe(entry.metadata.title);
      expect(mod.metadata.shortTitle, entry.id).toBe(entry.metadata.shortTitle);
      expect(mod.inputConfig, entry.id).toEqual(entry.inputConfig);
      expect(mod.plotConfig, entry.id).toEqual(entry.plotConfig);
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
