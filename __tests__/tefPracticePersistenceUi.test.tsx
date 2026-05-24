import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PracticeGuidePanel } from '../components/PracticeGuidePanel';
import { TefTopicSuggestionsList } from '../components/TefTopicSuggestionsList';
import { PracticeModeSheet } from '../components/PracticeModeSheet';
import { TefTopicHistorySheet } from '../components/TefTopicHistorySheet';
import * as tefArchiveService from '../services/tefArchiveService';

describe('PracticeGuidePanel', () => {
  const topics = [
    {
      topic: 'Pricing',
      examples: [
        { french: 'Quel est le prix?', english: 'What is the price?' },
      ],
    },
    {
      topic: 'Insurance',
      examples: [
        { french: "L'assurance est incluse?", english: 'Is insurance included?' },
      ],
    },
  ];

  it('renders practice guide with topic accordions', () => {
    render(<PracticeGuidePanel topics={topics} />);
    expect(screen.getByText('Practice guide')).toBeTruthy();
    expect(screen.getByText('2 topics · from your last review')).toBeTruthy();
    expect(screen.getByText('Pricing')).toBeTruthy();
    fireEvent.click(screen.getByText('Insurance'));
    expect(screen.getByText("L'assurance est incluse?")).toBeTruthy();
  });
});

describe('TefTopicSuggestionsList', () => {
  it('renders empty fallback', () => {
    render(<TefTopicSuggestionsList topicSuggestions={[]} />);
    expect(screen.getByText(/No additional topic suggestions/)).toBeTruthy();
  });
});

describe('PracticeModeSheet · topic history entry', () => {
  it('renders Past topic suggestions when onOpenTopicHistory is provided', () => {
    const onOpenTopicHistory = vi.fn();
    render(
      <PracticeModeSheet
        open={true}
        onOpenChange={() => {}}
        onSelectMode={() => {}}
        onOpenTopicHistory={onOpenTopicHistory}
      />
    );
    fireEvent.click(screen.getByText('Past topic suggestions'));
    expect(onOpenTopicHistory).toHaveBeenCalledOnce();
  });
});

describe('TefTopicHistorySheet', () => {
  it('shows empty state when no archives', () => {
    vi.spyOn(tefArchiveService, 'listTopicArchives').mockReturnValue([]);
    render(<TefTopicHistorySheet open={true} onClose={() => {}} />);
    expect(screen.getByText(/Complete a session to save topic suggestions/)).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('App.tsx · TEF persistence integration', () => {
  it('calls persistReviewTopics after successful review in startTefAdReview', async () => {
    const src = await import('../App.tsx?raw');
    expect(src.default).toMatch(/persistReviewTopics\(adId, 'persuasion', r\)/);
    expect(src.default).toMatch(/persistReviewTopics\(adId, 'questioning', r\)/);
    expect(src.default).toMatch(/upsertSavedAd/);
    expect(src.default).toMatch(/loadPracticeGuideForAd/);
  });
});

describe('App.tsx · TEF hint removal', () => {
  it('ConversationHint uses isConversationHintVisible (role-play only)', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/isVisible=\{isConversationHintVisible\(scenarioMode, appState\)\}/);
    expect(text).not.toMatch(/tefAdMode === 'practice' \|\| tefQuestioningMode === 'practice'\)[\s\S]{0,80}ConversationHint/);
  });
});

// ---------------------------------------------------------------------------
// App.tsx source-text: persistReviewTopics / saveTopicArchive integration
// ---------------------------------------------------------------------------

describe('App.tsx · persistReviewTopics calls saveTopicArchive', () => {
  it('imports saveTopicArchive from tefArchiveService', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/saveTopicArchive/);
    expect(text).toMatch(/tefArchiveService/);
  });

  it('persistReviewTopics calls saveTopicArchive with adId, exerciseType, and topicSuggestions', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/persistReviewTopics[\s\S]{0,400}saveTopicArchive\s*\(\s*\{/);
    expect(text).toMatch(/saveTopicArchive[\s\S]{0,200}adId/);
    expect(text).toMatch(/saveTopicArchive[\s\S]{0,200}exerciseType/);
    expect(text).toMatch(/saveTopicArchive[\s\S]{0,200}topicSuggestions/);
  });

  it('captures adId when review starts and passes it to persistReviewTopics', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/startTefAdReview[\s\S]{0,120}const adId = currentTefAdIdRef\.current/);
    expect(text).toMatch(/persistReviewTopics\(adId,/);
  });

  it('returns false (and does not save) when adId is missing', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/persistReviewTopics[\s\S]{0,200}if\s*\(\s*!adId/);
    expect(text).toMatch(/return false/);
  });

  it('wraps saveTopicArchive in try/catch inside persistReviewTopics', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/persistReviewTopics[\s\S]{0,400}try\s*\{[\s\S]{0,200}saveTopicArchive/);
    expect(text).toMatch(/catch[\s\S]{0,120}return false/);
  });
});

describe('App.tsx · setTefAdTopicArchiveSaved after successful review', () => {
  it('calls setTefAdTopicArchiveSaved(true) when persistReviewTopics returns true for ad review', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/setTefAdTopicArchiveSaved\s*\(\s*true\s*\)/);
  });

  it('calls setTefQuestioningTopicArchiveSaved(true) when persistReviewTopics returns true for questioning review', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/setTefQuestioningTopicArchiveSaved\s*\(\s*true\s*\)/);
  });
});

describe('App.tsx · currentTefAdIdRef assigned on TEF session start', () => {
  it('sets currentTefAdIdRef.current = adId in the TEF ad conversation handler', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/currentTefAdIdRef\.current\s*=\s*adId/);
  });

  it('resets currentTefAdIdRef.current to null in dismiss/exit handlers', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/currentTefAdIdRef\.current\s*=\s*null/);
  });
});

describe('App.tsx · practiceGuide state loaded from topic archive', () => {
  it('declares practiceGuide state', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/practiceGuide/);
    expect(text).toMatch(/setPracticeGuide/);
  });

  it('renders PracticeGuidePanel when practiceGuide is non-empty', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/PracticeGuidePanel/);
    // Allow for whitespace/newlines between the two conditions
    expect(text).toMatch(/practiceGuide &&[\s\S]{0,30}practiceGuide\.length > 0/);
  });

  it('loadPracticeGuideForAd is called after review with a valid adId', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/loadPracticeGuideForAd/);
    expect(text).toMatch(/if \(adId && persistReviewTopics\(adId,[\s\S]{0,200}loadPracticeGuideForAd\(adId\)/);
  });
});

describe('App.tsx · PracticeModeSheet receives onOpenTopicHistory prop', () => {
  it('passes onOpenTopicHistory to PracticeModeSheet', async () => {
    const src = await import('../App.tsx?raw');
    const text = src.default as string;
    expect(text).toMatch(/onOpenTopicHistory/);
    expect(text).toMatch(/PracticeModeSheet[\s\S]{0,200}onOpenTopicHistory/);
  });
});
