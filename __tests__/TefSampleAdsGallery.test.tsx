/**
 * TDD tests for TefSampleAdsGallery: accessible thumbnails that fetch a sample
 * ad as a File and hand it to onSelect.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';
import * as GalleryModule from '../components/TefSampleAdsGallery';
import { TEF_SAMPLE_ADS } from '../services/tefSampleAds';
import type { TefExerciseType } from '../types';

const Gallery: React.ComponentType<{
  exerciseType: TefExerciseType;
  onSelect: (file: File) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}> = (GalleryModule as any).TefSampleAdsGallery ?? (GalleryModule as any).default;

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: async () => new Blob(['png-bytes'], { type: 'image/png' }),
  });
}

const EXERCISES: TefExerciseType[] = ['questioning', 'persuasion'];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

for (const type of EXERCISES) {
  describe(`TefSampleAdsGallery (${type})`, () => {
    it('renders 4 buttons, each with an aria-label containing the ad label and a decorative (alt="") thumbnail img', () => {
      render(<Gallery exerciseType={type} onSelect={vi.fn()} />);
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(4);
      TEF_SAMPLE_ADS[type].forEach((ad, i) => {
        expect(buttons[i].getAttribute('aria-label')).toContain(ad.label);
        const img = buttons[i].querySelector('img');
        expect(img).not.toBeNull();
        expect(img!.getAttribute('alt')).toBe('');
        expect(img!.getAttribute('src')).toContain(ad.url);
      });
    });

    it('clicking a thumbnail fetches its url and calls onSelect with a PNG File', async () => {
      const fetchMock = okFetch();
      vi.stubGlobal('fetch', fetchMock);
      const onSelect = vi.fn();
      render(<Gallery exerciseType={type} onSelect={onSelect} />);

      const ad = TEF_SAMPLE_ADS[type][2];
      fireEvent.click(screen.getByRole('button', { name: new RegExp(ad.label) }));

      await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(ad.url);
      const file = onSelect.mock.calls[0][0] as File;
      expect(file).toBeInstanceOf(File);
      expect(file.type).toBe('image/png');
      expect(file.name).toContain(ad.id);
    });
  });
}

describe('TefSampleAdsGallery behaviours', () => {
  const ad = TEF_SAMPLE_ADS.questioning[0];

  it('on non-ok fetch: calls onError with a message and never onSelect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, blob: async () => new Blob([]) }));
    const onSelect = vi.fn();
    const onError = vi.fn();
    render(<Gallery exerciseType="questioning" onSelect={onSelect} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ad.label) }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(typeof onError.mock.calls[0][0]).toBe('string');
    expect(onError.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('on network rejection: calls onError and never onSelect', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const onSelect = vi.fn();
    const onError = vi.fn();
    render(<Gallery exerciseType="questioning" onSelect={onSelect} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ad.label) }));

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not throw (unhandled) on fetch failure when onError is omitted', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const onSelect = vi.fn();
    render(<Gallery exerciseType="questioning" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ad.label) }));
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('is usable again after a failed fetch (retry succeeds)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) });
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    const onError = vi.fn();
    render(<Gallery exerciseType="questioning" onSelect={onSelect} onError={onError} />);
    const btn = screen.getByRole('button', { name: new RegExp(ad.label) });
    fireEvent.click(btn);
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    fireEvent.click(btn);
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });

  it('when disabled: all buttons are disabled and clicks do nothing', () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    render(<Gallery exerciseType="persuasion" onSelect={onSelect} disabled />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('double-click guard: repeated clicks on the same thumbnail while pending fetch once and select once', async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    render(<Gallery exerciseType="questioning" onSelect={onSelect} />);
    const btn = screen.getByRole('button', { name: new RegExp(ad.label) });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) });
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('double-click guard: clicking a different thumbnail while a fetch is pending is ignored', async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    render(<Gallery exerciseType="questioning" onSelect={onSelect} />);
    const [first, second] = TEF_SAMPLE_ADS.questioning;
    fireEvent.click(screen.getByRole('button', { name: new RegExp(first.label) }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(second.label) }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(first.url);

    resolveFetch({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) });
    await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
  });

  it('unmounting during a pending fetch aborts it and never calls onSelect or onError', async () => {
    let resolveFetch!: (v: unknown) => void;
    let rejectFetch!: (e: unknown) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise((res, rej) => { resolveFetch = res; rejectFetch = rej; }));
    vi.stubGlobal('fetch', fetchMock);
    const onSelect = vi.fn();
    const onError = vi.fn();
    const { unmount } = render(<Gallery exerciseType="questioning" onSelect={onSelect} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ad.label) }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]?.signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);

    // Whether the fetch settles as an abort rejection or (worst case) succeeds, nothing is reported.
    rejectFetch(new DOMException('Aborted', 'AbortError'));
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('unmounting during a pending fetch that later resolves still does not call onSelect', async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise((res) => { resolveFetch = res; })));
    const onSelect = vi.fn();
    const onError = vi.fn();
    const { unmount } = render(<Gallery exerciseType="questioning" onSelect={onSelect} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(ad.label) }));
    unmount();
    resolveFetch({ ok: true, status: 200, blob: async () => new Blob(['x'], { type: 'image/png' }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
