import React from 'react';

export type NavMode = 'free-talk' | 'role-play' | 'tef-ad' | 'tef-questioning';

interface NavItem {
  mode: NavMode;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { mode: 'free-talk', label: 'Free Talk', icon: '💬' },
  { mode: 'role-play', label: 'Role Play', icon: '🎭' },
  { mode: 'tef-ad', label: 'TEF Ad', icon: '📢' },
  { mode: 'tef-questioning', label: 'TEF Questions', icon: '❓' },
];

interface NavRailProps {
  activeMode: NavMode;
  onSelect: (mode: NavMode) => void;
  /** Only Free Talk and the currently active mode are actionable while a
   * non-free-talk mode is running, to avoid stacking setup flows on top of
   * an in-progress practice session. */
  disabledModes?: NavMode[];
}

/**
 * Left nav rail mode switcher (wireframe turn 2/t2, section 2a). Desktop
 * shows icon + label; tablet collapses to icon-only; mobile hides this rail
 * entirely (see TopBar's hamburger menu for the mobile equivalent).
 */
export const NavRail: React.FC<NavRailProps> = ({ activeMode, onSelect, disabledModes = [] }) => {
  return (
    <nav
      aria-label="Practice mode"
      className="hidden tablet:flex flex-col gap-1.5 flex-shrink-0 w-14 desktop:w-44 px-2 py-3 border-r border-parle-navy-100 bg-white/60"
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.mode === activeMode;
        const isDisabled = !isActive && disabledModes.includes(item.mode);
        return (
          <button
            key={item.mode}
            type="button"
            onClick={() => onSelect(item.mode)}
            disabled={isDisabled}
            aria-current={isActive ? 'true' : undefined}
            title={item.label}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 desktop:px-3 py-2.5 text-sm transition-colors justify-center desktop:justify-start ${
              isActive
                ? 'bg-parle-blue-100 border border-parle-blue-500 text-parle-navy-900 font-medium'
                : isDisabled
                ? 'text-parle-navy-300 cursor-not-allowed'
                : 'text-parle-navy-700 hover:bg-parle-blue-50 border border-transparent'
            }`}
          >
            <span className="text-base leading-none" aria-hidden="true">{item.icon}</span>
            <span className="hidden desktop:inline truncate">{item.label}</span>
            {isActive && (
              <span className="hidden desktop:inline text-parle-red-500 ml-auto" aria-hidden="true">●</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export const NAV_MODE_ITEMS = NAV_ITEMS;
