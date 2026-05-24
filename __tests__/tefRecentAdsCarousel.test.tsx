import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TefSavedAd } from '../types';

vi.mock('../services/tefArchiveService', () => ({
  listSavedAds: vi.fn(async () => []),
}));

import { listSavedAds } from '../services/tefArchiveService';
import { TefRecentAdsCarousel } from '../components/TefRecentAdsCarousel';

const mockListSavedAds = vi.mocked(listSavedAds);

const FAKE_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ==';

function makeSavedAd(id: string, exerciseType: 'persuasion' | 'questioning' = 'persuasion'): TefSavedAd {
  return {
    id,
    exerciseType,
    imageDataUrl: FAKE_IMAGE,
    mimeType: 'image/png',
    confirmation: { summary: 'A car ad.', roleSummary: 'I am ready.' },
    createdAt: Date.now() - 10_000,
    lastUsedAt: Date.now() - 5_000,
  };
}

beforeEach(() => {
  mockListSavedAds.mockReset();
  mockListSavedAds.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('TefRecentAdsCarousel · empty state', () => {
  it('renders nothing when listSavedAds returns an empty array', async () => {
    const { container } = render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    // Wait for the async load
    await waitFor(() => {
      // Should not render any ad images
      expect(container.querySelector('img')).toBeNull();
    });
    expect(screen.queryByText(/or pick a recent ad/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Populated state
// ---------------------------------------------------------------------------

describe('TefRecentAdsCarousel · with ads', () => {
  const ad1 = makeSavedAd('ad-1');
  const ad2 = makeSavedAd('ad-2');

  beforeEach(() => {
    mockListSavedAds.mockResolvedValue([ad1, ad2]);
  });

  it('renders ad images when ads are loaded', async () => {
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => {
      const imgs = screen.getAllByRole('img', { name: /saved advertisement/i });
      expect(imgs).toHaveLength(2);
    });
  });

  it('shows "Recent" heading and ad count', async () => {
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Recent')).toBeTruthy();
      expect(screen.getByText('(2)')).toBeTruthy();
    });
  });

  it('shows the recent-ad divider only when ads exist', async () => {
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/or pick a recent ad/i)).toBeTruthy();
    });
  });

  it('does not show a scroll hint label', async () => {
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText('Recent'));
    expect(screen.queryByText(/scroll/i)).toBeNull();
  });

  it('renders Start and Topics buttons for each ad', async () => {
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => {
      const startButtons = screen.getAllByRole('button', { name: /start/i });
      const topicsButtons = screen.getAllByRole('button', { name: /topics/i });
      expect(startButtons).toHaveLength(2);
      expect(topicsButtons).toHaveLength(2);
    });
  });

  it('calls onStart with the correct ad when Start is clicked', async () => {
    const onStart = vi.fn();
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={onStart}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => screen.getAllByRole('button', { name: /start/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /start/i })[0]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith(ad1);
  });

  it('calls onTopics with the correct ad when Topics is clicked', async () => {
    const onTopics = vi.fn();
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={onTopics}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => screen.getAllByRole('button', { name: /topics/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /topics/i })[0]);
    expect(onTopics).toHaveBeenCalledTimes(1);
    expect(onTopics).toHaveBeenCalledWith(ad1);
  });

  it('calls onDelete with the correct ad when delete button is clicked', async () => {
    const onDelete = vi.fn();
    render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={onDelete}
      />
    );
    await waitFor(() => screen.getAllByRole('button', { name: /delete saved ad/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /delete saved ad/i })[0]);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith(ad1);
  });
});

// ---------------------------------------------------------------------------
// refreshToken triggers re-fetch
// ---------------------------------------------------------------------------

describe('TefRecentAdsCarousel · refreshToken', () => {
  it('calls listSavedAds again when refreshToken changes', async () => {
    const ad = makeSavedAd('ad-1');
    mockListSavedAds.mockResolvedValue([ad]);

    const { rerender } = render(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
        refreshToken={0}
      />
    );
    await waitFor(() => expect(mockListSavedAds).toHaveBeenCalledTimes(1));

    rerender(
      <TefRecentAdsCarousel
        exerciseType="persuasion"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
        refreshToken={1}
      />
    );
    await waitFor(() => expect(mockListSavedAds).toHaveBeenCalledTimes(2));
  });
});

// ---------------------------------------------------------------------------
// exerciseType filtering
// ---------------------------------------------------------------------------

describe('TefRecentAdsCarousel · exerciseType', () => {
  it('passes exerciseType to listSavedAds', async () => {
    render(
      <TefRecentAdsCarousel
        exerciseType="questioning"
        onStart={vi.fn()}
        onTopics={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    await waitFor(() => expect(mockListSavedAds).toHaveBeenCalledWith('questioning'));
  });
});
