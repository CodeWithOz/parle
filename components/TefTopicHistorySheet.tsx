import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TefExerciseType, TefSavedAd, TefTopicArchive } from '../types';
import { deleteTopicArchive, getSavedAd, listTopicArchives } from '../services/tefArchiveService';
import { ImageLightbox } from './ImageLightbox';
import { TefTopicSuggestionsList } from './TefTopicSuggestionsList';
import {
  ARCHIVE_GROUP_ORDER,
  formatArchiveDateTime,
  groupArchivesByDate,
} from '../utils/tefArchiveDisplay';
import { confirmDelete } from '../utils/confirmDelete';

interface TefTopicHistorySheetProps {
  open: boolean;
  onClose: () => void;
  filterAdId?: string | null;
  /** When set, opens directly on this archive's topic detail (e.g. from carousel Topics). */
  initialArchiveId?: string | null;
  onRestartSavedAd?: (ad: TefSavedAd) => void;
}

export const TefTopicHistorySheet: React.FC<TefTopicHistorySheetProps> = ({
  open,
  onClose,
  filterAdId = null,
  initialArchiveId = null,
  onRestartSavedAd,
}) => {
  const [archives, setArchives] = useState<TefTopicArchive[]>([]);
  const [adCache, setAdCache] = useState<Record<string, TefSavedAd | null>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const adFetchTokenRef = useRef(0);

  const refresh = useCallback(() => {
    setArchives(listTopicArchives(filterAdId ?? undefined));
  }, [filterAdId]);

  useEffect(() => {
    if (open) {
      refresh();
      const archivesForView = listTopicArchives(filterAdId ?? undefined);
      if (
        initialArchiveId &&
        archivesForView.some((a) => a.id === initialArchiveId)
      ) {
        setSelectedId(initialArchiveId);
      } else {
        setSelectedId(null);
      }
      setLightboxOpen(false);
    }
  }, [open, refresh, initialArchiveId, filterAdId]);

  useEffect(() => {
    if (!open || archives.length === 0) {
      setAdCache({});
      return;
    }
    const fetchToken = ++adFetchTokenRef.current;
    const adIds = [...new Set(archives.map((a) => a.adId))];
    void Promise.allSettled(
      adIds.map(async (id) => [id, await getSavedAd(id)] as const)
    ).then((results) => {
      if (fetchToken !== adFetchTokenRef.current) return;
      const pairs = results
        .filter(
          (r): r is PromiseFulfilledResult<readonly [string, Awaited<ReturnType<typeof getSavedAd>>]> =>
            r.status === 'fulfilled'
        )
        .map((r) => r.value);
      setAdCache(Object.fromEntries(pairs));
    });
    return () => {
      adFetchTokenRef.current += 1;
    };
  }, [open, archives]);

  if (!open) return null;

  const selected = selectedId ? archives.find((a) => a.id === selectedId) ?? null : null;
  const selectedAd = selected ? adCache[selected.adId] : null;
  const grouped = groupArchivesByDate(archives);

  const exerciseLabel = (type: TefExerciseType) =>
    type === 'persuasion' ? 'Persuasion' : 'Questioning';

  const badgeClass = (type: TefExerciseType) =>
    type === 'persuasion'
      ? 'bg-parle-blue-100 text-parle-blue-700'
      : 'bg-parle-red-100 text-parle-red-700';

  const handleDelete = () => {
    if (!selected) return;
    if (
      !confirmDelete(
        'Delete this topic archive? This cannot be undone.'
      )
    ) {
      return;
    }
    deleteTopicArchive(selected.id);
    setSelectedId(null);
    refresh();
  };

  return (
    <div className="fixed inset-0 bg-parle-navy-900/40 z-[60] flex items-center justify-center p-4 overscroll-none">
      <div
        className="bg-white border border-parle-navy-100 rounded-2xl max-w-3xl w-full max-h-[min(88dvh,100%)] flex flex-col min-h-0"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tef-topic-history-title"
      >
        <div className="flex justify-between items-start p-5 border-b border-parle-navy-100 flex-shrink-0">
          <div>
            <h2 id="tef-topic-history-title" className="text-lg font-semibold text-parle-navy-900">
              Past topic suggestions
            </h2>
            <p className="text-xs text-parle-navy-500 mt-1">
              Topics from your completed sessions — saved on this device
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 hover:bg-parle-blue-50 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-parle-navy-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto overscroll-y-contain flex-1 min-h-0 p-5">
          {!selected ? (
            <>
              {archives.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-parle-navy-200 text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-auto text-parle-navy-300 mb-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <p className="text-xs text-parle-navy-300">
                    Complete a session to save topic suggestions here
                  </p>
                </div>
              ) : (
                ARCHIVE_GROUP_ORDER.map((groupLabel) => {
                  const items = grouped[groupLabel];
                  if (items.length === 0) return null;
                  return (
                    <div key={groupLabel} className="mb-5 last:mb-0">
                      <div className="text-[10px] uppercase tracking-widest text-parle-navy-300 mb-2">
                        {groupLabel}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {items.map((archive) => {
                          const ad = adCache[archive.adId];
                          return (
                            <button
                              key={archive.id}
                              type="button"
                              onClick={() => setSelectedId(archive.id)}
                              className="w-full flex items-center gap-3 p-3 rounded-xl bg-parle-blue-50 border border-parle-navy-100 hover:border-parle-blue-300 text-left transition-colors"
                            >
                              {ad?.imageDataUrl ? (
                                <img
                                  src={ad.imageDataUrl}
                                  alt=""
                                  className="h-12 w-12 rounded-lg object-cover flex-shrink-0 border border-parle-navy-100"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded-lg bg-parle-navy-50 flex-shrink-0 border border-parle-navy-100" />
                              )}
                              <div className="flex-1 min-w-0">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded ${badgeClass(archive.exerciseType)}`}
                                >
                                  {exerciseLabel(archive.exerciseType)}
                                </span>
                                <div className="text-xs text-parle-navy-700 mt-1">
                                  {archive.topicSuggestions.length} topics ·{' '}
                                  {formatArchiveDateTime(archive.createdAt)}
                                </div>
                              </div>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-parle-navy-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="text-xs text-parle-navy-500 hover:text-parle-navy-900"
              >
                ← All sessions
              </button>
              <div className="flex items-center gap-3">
                {selectedAd?.imageDataUrl ? (
                  <button
                    type="button"
                    onClick={() => setLightboxOpen(true)}
                    className="relative group h-14 w-14 flex-shrink-0 rounded-lg overflow-hidden border border-parle-navy-200 hover:border-parle-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-parle-blue-500"
                    title="View advertisement"
                    aria-label="View advertisement in full screen"
                  >
                    <img
                      src={selectedAd.imageDataUrl}
                      alt="Advertisement"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-parle-navy-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </button>
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-parle-navy-50 border border-parle-navy-100" />
                )}
                <div>
                  <div className="text-base font-semibold text-parle-navy-900">
                    {exerciseLabel(selected.exerciseType)} ·{' '}
                    {new Date(selected.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                  <div className="text-xs text-parle-navy-300">
                    {formatArchiveDateTime(selected.createdAt)} ·{' '}
                    {selected.topicSuggestions.length} topics
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-parle-blue-600 mb-2">
                  Topics You Could Have Mentioned
                </h3>
                <TefTopicSuggestionsList
                  topicSuggestions={selected.topicSuggestions}
                  gridOnMd
                />
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-parle-navy-100">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="text-xs text-parle-red-600 hover:text-parle-red-700"
                >
                  Delete this archive
                </button>
                <div className="flex items-center gap-2">
                  {onRestartSavedAd && selectedAd && (
                    <button
                      type="button"
                      onClick={() => onRestartSavedAd(selectedAd)}
                      className="text-xs font-medium text-white px-3 py-1.5 rounded-lg bg-parle-blue-500 hover:bg-parle-blue-600"
                    >
                      Restart
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="text-xs text-parle-navy-700 hover:text-parle-navy-900 px-3 py-1.5 rounded-lg border border-parle-navy-200"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {lightboxOpen && selectedAd?.imageDataUrl && (
          <ImageLightbox
            imageDataUrl={selectedAd.imageDataUrl}
            onClose={() => setLightboxOpen(false)}
          />
        )}

        {!selected && archives.length > 0 && (
          <div className="p-5 border-t border-parle-navy-100 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm text-parle-navy-700 hover:text-parle-navy-900 rounded-lg border border-parle-navy-200"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
