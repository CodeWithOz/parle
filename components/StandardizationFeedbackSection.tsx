import React from 'react';
import type { ScenarioStandardizationItem } from '../types';

interface StandardizationFeedbackSectionProps {
  items: ScenarioStandardizationItem[];
}

export const StandardizationFeedbackSection: React.FC<StandardizationFeedbackSectionProps> = ({
  items,
}) => {
  return (
    <>
      <div>
        <h3 className="text-parle-navy-900 font-semibold text-sm mb-2">More Standard French</h3>
        <p className="text-parle-navy-500 text-sm">
          Only the places where your spoken French sounded less standard or less idiomatic.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-parle-blue-50 border border-parle-navy-100 rounded-xl p-4">
          <p className="text-parle-navy-700 text-sm">
            Nothing notable stood out here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={`${item.original}-${i}`}
              className="bg-parle-blue-50 rounded-xl border border-parle-navy-100 p-4 space-y-3"
            >
              <div>
                <p className="text-[11px] uppercase tracking-wider text-parle-navy-300 mb-1">You said</p>
                <p className="text-parle-navy-700 text-sm">{item.original}</p>
              </div>
              <div className="h-px bg-parle-navy-100" />
              <div>
                <p className="text-[11px] uppercase tracking-wider text-parle-blue-600 mb-1">More standard</p>
                <p className="text-parle-blue-700 text-sm">{item.standard}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
};
