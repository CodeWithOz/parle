import React from 'react';
import { AppState } from '../types';

interface OrbProps {
  state: AppState;
  volume?: number; // 0 to 1, used for recording visualization
  size?: 'large' | 'small';
  onClick?: () => void;
  disabled?: boolean;
}

export const Orb: React.FC<OrbProps> = ({ state, volume = 0, size = 'large', onClick, disabled = false }) => {
  const isLarge = size === 'large';
  const isRecording = state === AppState.RECORDING;
  const isProcessing = state === AppState.PROCESSING;

  // Container and orb sizing
  const containerClass = isLarge ? 'w-36 h-36' : 'w-16 h-16';
  const orbSize = isLarge ? 'w-28 h-28' : 'w-14 h-14';
  const pingSize = isLarge ? 'w-28 h-28' : 'w-14 h-14';

  // Dynamic styles based on state
  const getOrbStyle = (): React.CSSProperties => {
    switch (state) {
      case AppState.RECORDING: {
        const scale = 1 + volume * (isLarge ? 0.3 : 0.15);
        return {
          transform: `scale(${scale})`,
          backgroundColor: '#ef4444',
          boxShadow: `0 0 ${20 + volume * 50}px ${5 + volume * 20}px rgba(239, 68, 68, 0.4)`,
        };
      }
      case AppState.PROCESSING:
        return {
          backgroundColor: '#f8fafc',
          animation: 'spin 3s linear infinite',
          opacity: 0.8,
          boxShadow: '0 0 30px 10px rgba(255, 255, 255, 0.3)',
        };
      case AppState.PLAYING:
        return {
          backgroundColor: '#38bdf8',
          boxShadow: '0 0 40px 15px rgba(56, 189, 248, 0.4)',
        };
      case AppState.IDLE:
      default:
        return {
          backgroundColor: '#1e293b',
          border: '2px solid #334155',
          boxShadow: '0 0 0 0 rgba(0,0,0,0)',
        };
    }
  };

  const getAnimationClass = () => {
    switch (state) {
      case AppState.PLAYING: return 'orb-speaking';
      case AppState.IDLE: return 'orb-idle';
      default: return '';
    }
  };

  // Icon sizing
  const iconClass = isLarge ? 'h-10 w-10' : 'h-6 w-6';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex items-center justify-center ${containerClass} cursor-pointer transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed focus:outline-none`}
      aria-label={isRecording ? 'Stop recording' : isProcessing ? 'Stop processing' : 'Start recording'}
    >
      {/* Orb glow ring */}
      <div
        className={`absolute ${orbSize} rounded-full transition-all duration-300 ease-out ${getAnimationClass()}`}
        style={getOrbStyle()}
      ></div>

      {/* Recording ping animation */}
      {isRecording && (
        <div className={`absolute ${pingSize} rounded-full border-4 border-white opacity-20 animate-ping`}></div>
      )}

      {/* Icon overlay */}
      <div className="relative z-10 flex items-center justify-center">
        {isRecording ? (
          // Stop icon (square)
          <div className={`${isLarge ? 'w-7 h-7' : 'w-4 h-4'} bg-white rounded-sm`}></div>
        ) : isProcessing ? (
          // Stop icon during processing (allows abort)
          <div className={`${isLarge ? 'w-7 h-7' : 'w-4 h-4'} bg-slate-600 rounded-sm`}></div>
        ) : (
          // Mic icon
          <svg xmlns="http://www.w3.org/2000/svg" className={`${iconClass} text-white`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
          </svg>
        )}
      </div>
    </button>
  );
};
