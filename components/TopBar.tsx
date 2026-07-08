import React, { useState } from 'react';
import { Drawer } from 'vaul';
import { GearIcon } from './icons/GearIcon';
import { NAV_MODE_ITEMS, NavMode } from './NavRail';

interface TopBarProps {
  activeMode: NavMode;
  onSelectMode: (mode: NavMode) => void;
  onOpenSettings: () => void;
  /** Right-aligned slot before the settings gear (TEF timer/thumbnail, etc). */
  rightSlot?: React.ReactNode;
  /** Mirrors NavRail's disabledModes so the mobile menu has the same
   * can't-stack-a-setup-flow-on-a-running-session guardrail as the rail. */
  disabledModes?: NavMode[];
}

/**
 * App shell top bar: brand mark + settings gear (desktop/tablet), plus a
 * hamburger menu on mobile that reveals the same mode-switch options the
 * nav rail offers at larger breakpoints (nav rail is hidden below `tablet:`).
 */
export const TopBar: React.FC<TopBarProps> = ({ activeMode, onSelectMode, onOpenSettings, rightSlot, disabledModes = [] }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-parle-navy-100 bg-white z-10 flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        {/* Mobile hamburger — nav rail is hidden below `tablet:`, this is its mobile equivalent */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="tablet:hidden p-2 -ml-1 text-parle-navy-700 hover:text-parle-navy-900 rounded-lg hover:bg-parle-blue-50 transition-colors"
          aria-label="Open menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 bg-parle-red-500 rounded-full flex-shrink-0"></div>
          <h1 className="text-xl font-bold tracking-tight text-parle-navy-900 truncate">Parle</h1>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {rightSlot}

        <button
          onClick={onOpenSettings}
          className="p-2 text-parle-navy-700 hover:text-parle-navy-900 transition-colors bg-white rounded-full border border-parle-navy-100 hover:border-parle-navy-200"
          title="Settings"
          aria-label="Open API settings"
        >
          <GearIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile mode-switch menu — same handler as the desktop/tablet nav rail.
          Guarded by `mobileMenuOpen` here (not left to Drawer.Root's internal
          presence handling) so its buttons are never mounted — and never
          collide with the always-mounted nav rail's identically-labeled
          buttons — while the menu is closed. */}
      {mobileMenuOpen && (
      <Drawer.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-parle-navy-900/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[80dvh] max-w-lg flex-col rounded-t-2xl bg-white border-t border-parle-navy-100 focus:outline-none">
            <Drawer.Handle className="mx-auto mt-3 mb-1 h-1.5 w-12 flex-shrink-0 rounded-full bg-parle-navy-200" />
            <div className="flex-shrink-0 px-6 pt-3 pb-2">
              <Drawer.Title asChild>
                <h2 className="text-lg font-semibold text-parle-navy-900">Practice Mode</h2>
              </Drawer.Title>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 pt-1 space-y-2">
              {NAV_MODE_ITEMS.map((item) => {
                const isActive = item.mode === activeMode;
                const isDisabled = !isActive && disabledModes.includes(item.mode);
                return (
                  <button
                    key={item.mode}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onSelectMode(item.mode);
                    }}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${
                      isActive
                        ? 'bg-parle-blue-100 border-parle-blue-500 text-parle-navy-900 font-medium'
                        : isDisabled
                        ? 'border-parle-navy-100 text-parle-navy-300 cursor-not-allowed'
                        : 'border-parle-navy-100 text-parle-navy-700 hover:bg-parle-blue-50'
                    }`}
                  >
                    <span className="text-lg" aria-hidden="true">{item.icon}</span>
                    <span className="text-sm">{item.label}</span>
                    {isActive && <span className="text-parle-red-500 ml-auto" aria-hidden="true">●</span>}
                  </button>
                );
              })}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      )}
    </header>
  );
};
