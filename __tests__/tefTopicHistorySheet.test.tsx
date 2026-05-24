import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TefSavedAd, TefTopicArchive } from '../types';

vi.mock('../services/tefArchiveService', () => ({
  listTopicArchives: vi.fn(() => []),
  getSavedAd: vi.fn(async () => null),
  deleteTopicArchive: vi.fn(),
}));

vi.mock('../components/ImageLightbox', () => ({
  ImageLightbox: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="image-lightbox">
      <button type="button" onClick={onClose}>
        Close lightbox
      </button>
    </div>
  ),
}));

import {
  listTopicArchives,
  getSavedAd,
  deleteTopicArchive,
} from '../services/tefArchiveService';
import { TefTopicHistorySheet } from '../components/TefTopicHistorySheet';

const mockList = vi.mocked(listTopicArchives);
const mockGetSavedAd = vi.mocked(getSavedAd);
const mockDelete = vi.mocked(deleteTopicArchive);

const SAMPLE_ARCHIVE: TefTopicArchive = {
  id: 'arc-1',
  adId: 'ad-1',
  exerciseType: 'persuasion',
  createdAt: Date.now() - 60_000,
  topicSuggestions: [
    {
      topic: 'Pricing',
      examples: [
        { french: 'Quel est le prix?', english: 'What is the price?' },
        { french: 'Y a-t-il des réductions?', english: 'Are there discounts?' },
      ],
    },
  ],
};

const QUESTIONING_ARCHIVE: TefTopicArchive = {
  id: 'arc-2',
  adId: 'ad-2',
  exerciseType: 'questioning',
  createdAt: Date.now() - 120_000,
  topicSuggestions: [
    {
      topic: 'Shipping',
      examples: [
        { french: 'Combien coûte la livraison?', english: 'How much is delivery?' },
        { french: 'Quel est le délai?', english: 'What is the lead time?' },
      ],
    },
  ],
};

beforeEach(() => {
  mockList.mockReset();
  mockGetSavedAd.mockReset();
  mockDelete.mockReset();
  mockList.mockReturnValue([]);
  mockGetSavedAd.mockResolvedValue(null);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// Closed state
// ---------------------------------------------------------------------------

describe('TefTopicHistorySheet · closed state', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <TefTopicHistorySheet open={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty state (open, no archives)
// ---------------------------------------------------------------------------

describe('TefTopicHistorySheet · empty state', () => {
  it('shows the sheet title "Past topic suggestions"', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Past topic suggestions')).toBeTruthy();
  });

  it('shows empty-state copy when no archives exist', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/complete a session to save/i)).toBeTruthy();
  });

  it('close X button fires onClose', () => {
    const onClose = vi.fn();
    render(<TefTopicHistorySheet open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// List view (one archive present)
// ---------------------------------------------------------------------------

describe('TefTopicHistorySheet · list view', () => {
  beforeEach(() => {
    mockList.mockReturnValue([SAMPLE_ARCHIVE]);
  });

  it('renders a "Persuasion" badge for a persuasion archive', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Persuasion')).toBeTruthy();
  });

  it('renders topic count text "1 topics"', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    expect(screen.getByText(/1 topics/)).toBeTruthy();
  });

  it('renders a "Questioning" badge for a questioning archive', () => {
    mockList.mockReturnValue([QUESTIONING_ARCHIVE]);
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Questioning')).toBeTruthy();
  });

  it('shows a footer Close button when list is non-empty', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    // The footer button has the visible text "Close" (distinct from the X button which has aria-label only)
    expect(screen.getByText('Close')).toBeTruthy();
  });

  it('footer Close button fires onClose', () => {
    const onClose = vi.fn();
    render(<TefTopicHistorySheet open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close').closest('button')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Detail view navigation
// ---------------------------------------------------------------------------

describe('TefTopicHistorySheet · detail view', () => {
  beforeEach(() => {
    mockList.mockReturnValue([SAMPLE_ARCHIVE]);
  });

  it('shows detail view when an archive card is clicked', async () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    const card = screen.getByText(/1 topics/).closest('button');
    expect(card).toBeTruthy();
    fireEvent.click(card!);
    await waitFor(() => {
      expect(screen.getByText(/← All sessions/i)).toBeTruthy();
    });
  });

  it('detail view shows the topic name "Pricing"', async () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/1 topics/).closest('button')!);
    await waitFor(() => {
      expect(screen.getByText('Pricing')).toBeTruthy();
    });
  });

  it('"← All sessions" button returns to the list', async () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/1 topics/).closest('button')!);
    await waitFor(() => screen.getByText(/← All sessions/i));
    fireEvent.click(screen.getByText(/← All sessions/i));
    expect(screen.queryByText(/← All sessions/i)).toBeNull();
    // Back in list view, badge is visible again
    expect(screen.getByText('Persuasion')).toBeTruthy();
  });

  it('"Back" button also returns to the list', async () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/1 topics/).closest('button')!);
    await waitFor(() => screen.getByRole('button', { name: /^Back$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Back$/i }));
    expect(screen.queryByText(/← All sessions/i)).toBeNull();
  });

  it('"Delete this archive" calls deleteTopicArchive with correct id', async () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/1 topics/).closest('button')!);
    await waitFor(() => screen.getByText(/delete this archive/i));
    fireEvent.click(screen.getByText(/delete this archive/i));
    expect(mockDelete).toHaveBeenCalledWith('arc-1');
  });

  it('after delete the list view is shown again (selectedId cleared)', async () => {
    // After delete, the component clears selectedId and refreshes
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText(/1 topics/).closest('button')!);
    await waitFor(() => screen.getByText(/delete this archive/i));
    // Simulate delete: mockList now returns empty for the refresh
    mockList.mockReturnValue([]);
    fireEvent.click(screen.getByText(/delete this archive/i));
    await waitFor(() => {
      expect(screen.queryByText(/← All sessions/i)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// filterAdId prop
// ---------------------------------------------------------------------------

describe('TefTopicHistorySheet · filterAdId', () => {
  it('passes filterAdId to listTopicArchives when provided', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} filterAdId="ad-42" />);
    expect(mockList).toHaveBeenCalledWith('ad-42');
  });

  it('calls listTopicArchives with undefined when filterAdId is null', () => {
    render(<TefTopicHistorySheet open={true} onClose={vi.fn()} filterAdId={null} />);
    expect(mockList).toHaveBeenCalledWith(undefined);
  });

  it('does not call listTopicArchives when sheet is closed', () => {
    render(<TefTopicHistorySheet open={false} onClose={vi.fn()} />);
    expect(mockList).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// initialArchiveId — open detail directly
// ---------------------------------------------------------------------------

const FAKE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ==';

const SAVED_AD: TefSavedAd = {
  id: 'ad-1',
  exerciseType: 'persuasion',
  imageDataUrl: FAKE_IMAGE,
  mimeType: 'image/png',
  confirmation: { summary: 'A car ad.', roleSummary: 'I am ready.' },
  createdAt: Date.now() - 10_000,
  lastUsedAt: Date.now() - 5_000,
};

describe('TefTopicHistorySheet · initialArchiveId', () => {
  beforeEach(() => {
    mockList.mockReturnValue([SAMPLE_ARCHIVE]);
    mockGetSavedAd.mockResolvedValue(SAVED_AD);
  });

  it('opens directly on topic detail when initialArchiveId matches an archive', async () => {
    render(
      <TefTopicHistorySheet
        open={true}
        onClose={vi.fn()}
        filterAdId="ad-1"
        initialArchiveId="arc-1"
      />
    );
    await waitFor(() => {
      expect(screen.getByText('Pricing')).toBeTruthy();
      expect(screen.queryByText(/1 topics ·/)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Restart and image lightbox on detail view
// ---------------------------------------------------------------------------

describe('TefTopicHistorySheet · detail actions', () => {
  beforeEach(() => {
    mockList.mockReturnValue([SAMPLE_ARCHIVE]);
    mockGetSavedAd.mockResolvedValue(SAVED_AD);
  });

  it('Restart button calls onRestartSavedAd with the cached ad', async () => {
    const onRestartSavedAd = vi.fn();
    render(
      <TefTopicHistorySheet
        open={true}
        onClose={vi.fn()}
        initialArchiveId="arc-1"
        onRestartSavedAd={onRestartSavedAd}
      />
    );
    await waitFor(() => screen.getByRole('button', { name: /^Restart$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Restart$/i }));
    expect(onRestartSavedAd).toHaveBeenCalledWith(SAVED_AD);
  });

  it('clicking the ad image opens the lightbox', async () => {
    render(
      <TefTopicHistorySheet
        open={true}
        onClose={vi.fn()}
        initialArchiveId="arc-1"
      />
    );
    await waitFor(() =>
      screen.getByRole('button', { name: /view advertisement in full screen/i })
    );
    fireEvent.click(
      screen.getByRole('button', { name: /view advertisement in full screen/i })
    );
    expect(screen.getByTestId('image-lightbox')).toBeTruthy();
  });
});
