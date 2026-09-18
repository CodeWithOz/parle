import React, { useRef } from 'react';
import type { TefExerciseType } from '../types';
import { TEF_SAMPLE_ADS, fetchSampleAdAsFile } from '../services/tefSampleAds';
import type { TefSampleAd } from '../services/tefSampleAds';

interface TefSampleAdsGalleryProps {
  exerciseType: TefExerciseType;
  onSelect: (file: File) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}

export const TefSampleAdsGallery: React.FC<TefSampleAdsGalleryProps> = ({
  exerciseType,
  onSelect,
  disabled = false,
  onError,
}) => {
  // Shared across all thumbnails: only one sample fetch may be in flight at a time.
  const inFlightRef = useRef(false);

  const handleClick = async (ad: TefSampleAd) => {
    if (disabled || inFlightRef.current) return;
    inFlightRef.current = true;
    let file: File;
    try {
      file = await fetchSampleAdAsFile(ad);
    } catch {
      inFlightRef.current = false;
      onError?.('Failed to load the sample ad. Please try again.');
      return;
    }
    inFlightRef.current = false;
    onSelect(file);
  };

  return (
    <section>
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-parle-navy-300 mb-4">
        <div className="flex-1 h-px bg-parle-navy-100" />
        or try an official sample ad
        <div className="flex-1 h-px bg-parle-navy-100" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TEF_SAMPLE_ADS[exerciseType].map((ad) => (
          <button
            key={ad.id}
            type="button"
            disabled={disabled}
            onClick={() => void handleClick(ad)}
            aria-label={`Use sample ad: ${ad.label}`}
            className="rounded-xl border border-parle-navy-100 bg-white overflow-hidden text-left transition-colors hover:border-parle-blue-500/60 focus:outline-none focus:ring-2 focus:ring-parle-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <img
              src={ad.url}
              alt={ad.label}
              loading="lazy"
              className="h-24 w-full object-cover object-bottom"
            />
            <div className="px-2 py-1.5 text-[10px] text-parle-navy-700 truncate">{ad.label}</div>
          </button>
        ))}
      </div>
    </section>
  );
};
