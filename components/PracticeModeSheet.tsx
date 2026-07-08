import React from 'react';
import { Drawer } from 'vaul';

interface PracticeModeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMode: (modeId: 'ad-persuasion' | 'role-play' | 'ad-questioning') => void;
  onOpenTopicHistory?: () => void;
}

export const PracticeModeSheet: React.FC<PracticeModeSheetProps> = ({
  open,
  onOpenChange,
  onSelectMode,
  onOpenTopicHistory,
}) => {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-parle-navy-900/40" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[min(96dvh,100%)] max-w-lg flex-col rounded-t-2xl bg-white border-t border-parle-navy-100 focus:outline-none">
          <Drawer.Handle className="mx-auto mt-3 mb-1 h-1.5 w-12 flex-shrink-0 rounded-full bg-parle-navy-200" />

          <div className="flex-shrink-0 px-6 pt-4 pb-2">
            <Drawer.Title asChild>
              <h2 className="text-lg font-semibold text-parle-navy-900">Choose a Practice Mode</h2>
            </Drawer.Title>
            <Drawer.Description className="text-sm text-parle-navy-500 mt-1">
              Select a structured practice scenario to get started.
            </Drawer.Description>
          </div>

          {/*
            No data-vaul-no-drag: vaul scrolls when a scrollable ancestor has scrollTop > 0,
            and allows dragging the sheet when content fits or when scrolled to the top.
          */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 pb-8 pt-2 space-y-3">
            <button
              onClick={() => onSelectMode('ad-persuasion')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-parle-navy-100 bg-parle-blue-50 hover:bg-parle-blue-100 hover:border-parle-blue-300 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-parle-blue-100 text-parle-blue-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-parle-navy-900">Ad Persuasion</div>
                <div className="text-xs text-parle-navy-500 mt-0.5">
                  Upload an ad and convince a skeptical friend — TEF exam practice.
                </div>
              </div>
            </button>

            <button
              onClick={() => onSelectMode('role-play')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-parle-navy-100 bg-parle-blue-50 hover:bg-parle-blue-100 hover:border-parle-blue-300 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-parle-blue-100 text-parle-blue-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H4a1 1 0 110-2V4zm3 1h6v4H7V5zm6 6H7v2h6v-2z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-parle-navy-900">Role Play</div>
                <div className="text-xs text-parle-navy-500 mt-0.5">
                  Practice everyday conversation scenarios with an AI partner.
                </div>
              </div>
            </button>

            <button
              onClick={() => onSelectMode('ad-questioning')}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-parle-navy-100 bg-parle-blue-50 hover:bg-parle-blue-100 hover:border-parle-blue-300 transition-colors text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-parle-blue-100 text-parle-blue-600 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-parle-navy-900">Ad Questioning</div>
                <div className="text-xs text-parle-navy-500 mt-0.5">
                  Call a company's customer service line and ask at least 10 questions — TEF exam practice.
                </div>
              </div>
            </button>

            {onOpenTopicHistory && (
              <>
                <div className="h-px bg-parle-navy-100 mx-4 mt-2" />
                <div className="px-4 pt-4 pb-2">
                  <button
                    type="button"
                    onClick={onOpenTopicHistory}
                    className="w-full text-left p-4 rounded-xl border border-parle-blue-500 bg-parle-blue-100 flex items-center gap-3 hover:bg-parle-blue-50 transition-colors"
                  >
                    <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 border border-parle-blue-300">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-parle-blue-600" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-parle-blue-700">Past topic suggestions</div>
                      <div className="text-xs text-parle-navy-500 mt-0.5">
                        Review topics and example phrases from previous sessions
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-parle-blue-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
};
