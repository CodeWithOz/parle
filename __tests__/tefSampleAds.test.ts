/**
 * TDD tests for the TEF sample ads catalog and fetch helper.
 * Spec: services/tefSampleAds.ts exports TEF_SAMPLE_ADS (4 per exercise) and
 * fetchSampleAdAsFile(ad) -> File (image/png, named after ad id).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TEF_SAMPLE_ADS, fetchSampleAdAsFile } from '../services/tefSampleAds';
import type { TefExerciseType } from '../types';

const EXERCISES: TefExerciseType[] = ['questioning', 'persuasion'];
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public', 'tef-samples');

describe('TEF_SAMPLE_ADS catalog', () => {
  for (const type of EXERCISES) {
    describe(type, () => {
      it('has exactly 4 samples', () => {
        expect(TEF_SAMPLE_ADS[type]).toHaveLength(4);
      });

      it('has unique, non-empty ids', () => {
        const ids = TEF_SAMPLE_ADS[type].map((a) => a.id);
        expect(ids.every((id) => id.length > 0)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it('has non-empty trimmed labels', () => {
        for (const ad of TEF_SAMPLE_ADS[type]) {
          expect(ad.label.trim().length).toBeGreaterThan(0);
        }
      });

      it('points urls at tef-samples/<type>-N.png (N = 1..4) under BASE_URL', () => {
        const base = import.meta.env.BASE_URL;
        const urls = TEF_SAMPLE_ADS[type].map((a) => a.url);
        expect(urls).toEqual(
          [1, 2, 3, 4].map((n) => `${base}tef-samples/${type}-${n}.png`.replace(/\/{2,}/g, '/'))
        );
      });
    });
  }

  it('ids and urls are unique across both exercises', () => {
    const all = EXERCISES.flatMap((t) => TEF_SAMPLE_ADS[t]);
    expect(new Set(all.map((a) => a.id)).size).toBe(8);
    expect(new Set(all.map((a) => a.url)).size).toBe(8);
  });
});

describe('sample PNG files on disk', () => {
  for (const type of EXERCISES) {
    for (const n of [1, 2, 3, 4]) {
      const name = `${type}-${n}.png`;
      it(`public/tef-samples/${name} exists and is a real PNG`, () => {
        const file = path.join(PUBLIC_DIR, name);
        expect(fs.existsSync(file)).toBe(true);
        const buf = fs.readFileSync(file);
        expect(buf.length).toBeGreaterThan(1000);
        expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      });
    }
  }
});

describe('fetchSampleAdAsFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const ad = { id: 'questioning-1', url: '/tef-samples/questioning-1.png', label: 'Annonce' };

  it('fetches the ad url and returns a PNG File named after the ad id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await fetchSampleAdAsFile(ad);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(ad.url);
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe('image/png');
    expect(file.name).toContain(ad.id);
    expect(file.size).toBe('png-bytes'.length);
  });

  it('forces image/png even if the server reports another content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: async () => new Blob(['x'], { type: 'application/octet-stream' }),
      })
    );
    const file = await fetchSampleAdAsFile(ad);
    expect(file.type).toBe('image/png');
  });

  it('throws a clear Error on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, blob: async () => new Blob([]) })
    );
    await expect(fetchSampleAdAsFile(ad)).rejects.toThrow(Error);
    await expect(fetchSampleAdAsFile(ad)).rejects.toThrow(/\S/);
  });

  it('throws an Error when the network request rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(fetchSampleAdAsFile(ad)).rejects.toBeInstanceOf(Error);
  });
});
