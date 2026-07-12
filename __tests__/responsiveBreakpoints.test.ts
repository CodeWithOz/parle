/**
 * TDD test pinning down the new responsive breakpoint tokens required by the
 * French-flag redesign's app shell collapse behavior (wireframe turn 2/t2):
 *
 *   - Desktop  >= 1200px : nav rail + content + roadmap sidebar all visible
 *   - Tablet   ~760-1199px : nav rail icon-only, roadmap collapses to an edge tab
 *   - Mobile   < 760px : nav rail hidden, roadmap becomes a tappable step chip
 *
 * There is no Tailwind config file in this project (Tailwind v4 is wired via
 * `@import "tailwindcss"` in index.css, with no `@theme` block and no custom
 * breakpoints today). This test does not attempt pixel-level rendering
 * assertions (out of scope for unit tests) — it pins down the CONTRACT that
 * the two new breakpoints must be defined as discoverable, named Tailwind v4
 * theme tokens in `index.css`, so `tablet:` / `desktop:` variants can be used
 * across the app shell consistently instead of ad-hoc arbitrary-value media
 * queries scattered per component.
 *
 * Contract this test file pins down for the builder (index.css):
 *
 *   An `@theme { ... }` block containing:
 *     --breakpoint-tablet: 760px;
 *     --breakpoint-desktop: 1200px;
 *
 *   (Tailwind v4 convention: `--breakpoint-<name>` in `@theme` generates a
 *   `<name>:` responsive variant, e.g. `tablet:hidden`, `desktop:flex`.)
 *
 * Tests FAIL before index.css is updated (no `@theme` block exists yet).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_CSS_PATH = join(__dirname, '..', 'index.css');

function readIndexCss(): string {
  return readFileSync(INDEX_CSS_PATH, 'utf-8');
}

describe('index.css · responsive breakpoint tokens for the app shell redesign', () => {
  it('contains an @theme block', () => {
    const css = readIndexCss();
    expect(css).toMatch(/@theme\s*\{/);
  });

  it('defines a 760px "tablet" breakpoint variable inside @theme', () => {
    const css = readIndexCss();
    const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
    expect(themeMatch, '@theme block not found in index.css').toBeTruthy();

    const themeBody = themeMatch ? themeMatch[1] : '';
    expect(themeBody).toMatch(/--breakpoint-tablet\s*:\s*760px\s*;/);
  });

  it('defines a 1200px "desktop" breakpoint variable inside @theme', () => {
    const css = readIndexCss();
    const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
    expect(themeMatch, '@theme block not found in index.css').toBeTruthy();

    const themeBody = themeMatch ? themeMatch[1] : '';
    expect(themeBody).toMatch(/--breakpoint-desktop\s*:\s*1200px\s*;/);
  });

  it('still imports tailwindcss (sanity check that we are reading the right file)', () => {
    const css = readIndexCss();
    expect(css).toMatch(/@import\s+["']tailwindcss["']/);
  });
});
