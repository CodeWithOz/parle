import React from 'react';
import { Drawer } from 'vaul';

interface PracticeModeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMode: (modeId: 'ad-persuasion' | 'role-play') => void;
}

export const PracticeModeSheet: React.FC<PracticeModeSheetProps> = ({
  open,
  onOpenChange,
  onSelectMode,
}) => {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-slate-900 border-t border-slate-700/50 focus:outline-none">
          {/* Drag handle */}
          <div className="mx-auto mt-3 mb-1 h-1.5 w-12 rounded-full bg-slate-600" />

          {/* Header */}
          <div className="px-6 pt-4 pb-2">
            <Drawer.Title asChild>
              <h2 className="text-lg font-semibold text-slate-100">Choose a Practice Mode</h2>
            </Drawer.Title>
            <Drawer.Description className="text-sm text-slate-400 mt-1">
              Select a structured practice scenario to get started.
            </Drawer.Description>
          </div>

          {/* Mode cards */}
          <div className="px-4 pb-8 pt-2 space-y-3">
            {/* Ad Persuasion */}
            <button
              onClick={() => onSelectMode('ad-persuasion')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                {/* Image/ad icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100">Ad Persuasion</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Upload an ad and convince a skeptical friend — TEF exam practice.
                </div>
              </div>
            </button>

            {/* Role Play */}
            <button
              onClick={() => onSelectMode('role-play')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-slate-700/50 bg-slate-800/50 hover:bg-slate-800 hover:border-slate-600 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
                {/* Document/scenario icon */}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h6v4H7V5zm6 6H7v2h6v-2z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-100">Role Play</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Practice everyday conversation scenarios with an AI partner.
                </div>
              </div>
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
