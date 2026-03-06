import React from 'react';

interface AdThumbnailProps {
  imageDataUrl: string;
  onOpenLightbox: () => void;
}

export const AdThumbnail: React.FC<AdThumbnailProps> = ({ imageDataUrl, onOpenLightbox }) => {
  return (
    <button
      onClick={onOpenLightbox}
      className="relative group w-9 h-9 flex-shrink-0 rounded-lg overflow-hidden border border-slate-600 hover:border-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      title="View advertisement"
      aria-label="View advertisement in full screen"
    >
      <img
        src={imageDataUrl}
        alt="Advertisement"
        className="w-full h-full object-cover"
      />
      {/* Hover overlay with maximize icon */}
      <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
        </svg>
      </div>
    </button>
  );
};
