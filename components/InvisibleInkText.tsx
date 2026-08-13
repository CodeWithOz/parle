import React, { useEffect, useRef, useState } from 'react';

const REVEAL_DURATION_MS = 60_000;

interface InvisibleInkTextProps {
  text: string;
  className?: string;
}

export const InvisibleInkText: React.FC<InvisibleInkTextProps> = ({
  text,
  className = '',
}) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const concealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConcealTimer = () => {
    if (concealTimerRef.current !== null) {
      clearTimeout(concealTimerRef.current);
      concealTimerRef.current = null;
    }
  };

  useEffect(() => {
    setIsRevealed(false);
    clearConcealTimer();

    return clearConcealTimer;
  }, [text]);

  const reveal = () => {
    if (isRevealed) return;

    setIsRevealed(true);
    clearConcealTimer();
    concealTimerRef.current = setTimeout(() => {
      setIsRevealed(false);
      concealTimerRef.current = null;
    }, REVEAL_DURATION_MS);
  };

  return (
    <button
      type="button"
      className={`invisible-ink ${isRevealed ? 'invisible-ink--revealed' : ''} ${className}`}
      data-state={isRevealed ? 'revealed' : 'concealed'}
      onClick={reveal}
      aria-label={
        isRevealed
          ? `French text revealed: ${text}`
          : 'Reveal French text for 60 seconds'
      }
      title={isRevealed ? 'French text is revealed for 60 seconds' : 'Reveal French text'}
    >
      <span className="invisible-ink__text" aria-hidden="true">{text}</span>
      <span className="invisible-ink__veil" data-text={text} aria-hidden="true" />
    </button>
  );
};
