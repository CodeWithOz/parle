import React, { useEffect, useState } from 'react';
import type { TefExerciseType, TefSavedAd } from '../types';
import { listSavedAds } from '../services/tefArchiveService';
import { formatLastUsedDate } from '../utils/tefArchiveDisplay';

interface TefRecentAdsCarouselProps {
  exerciseType: TefExerciseType;
  onStart: (ad: TefSavedAd) => void;
  onTopics: (ad: TefSavedAd) => void;
  onDelete: (ad: TefSavedAd) => void;
  refreshToken?: number;
}

export const TefRecentAdsCarousel: React.FC<TefRecentAdsCarouselProps> = ({
  exerciseType,
  onStart,
  onTopics,
  onDelete,
  refreshToken = 0,
}) => {
  const [ads, setAds] = useState<TefSavedAd[]>([]);

  useEffect(() => {
    void listSavedAds(exerciseType)
      .then(setAds)
      .catch(() => setAds([]));
  }, [exerciseType, refreshToken]);

  if (ads.length === 0) {
    return null;
  }

  const mostRecentId = ads[0]?.id;

  return (
    <section>
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-slate-500 mb-4">
        <div className="flex-1 h-px bg-slate-700" />
        or pick a recent ad
        <div className="flex-1 h-px bg-slate-700" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-violet-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
        </svg>
        <h3 className="text-sm font-medium text-slate-100">Recent</h3>
        <span className="text-[10px] text-slate-500">({ads.length})</span>
      </div>

      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 scroll-pl-1">
        {ads.map((ad) => (
          <div
            key={ad.id}
            className={`flex-shrink-0 snap-start w-[calc((100%-0.75rem)/1.5)] min-w-[9.5rem] max-w-[12rem] rounded-xl border bg-slate-900 overflow-hidden ${
              ad.id === mostRecentId ? 'border-green-500/60' : 'border-slate-700'
            }`}
          >
            <img
              src={ad.imageDataUrl}
              alt="Saved advertisement"
              className="h-24 w-full object-cover"
            />
            <div className="p-2.5">
              <div className="flex items-center justify-end mb-1.5">
                <button
                  type="button"
                  onClick={() => onDelete(ad)}
                  aria-label="Delete saved ad"
                  className="text-slate-500 hover:text-slate-300 p-0.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              <div className="text-[10px] text-slate-500 mb-2">
                {formatLastUsedDate(ad.lastUsedAt)}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onStart(ad)}
                  className="flex-1 h-7 rounded bg-green-600 hover:bg-green-500 text-white text-[10px] font-medium flex items-center justify-center gap-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => onTopics(ad)}
                  className="px-2 h-7 rounded border border-slate-700 text-slate-300 text-[10px] hover:bg-slate-800"
                >
                  Topics
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
