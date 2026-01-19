import React from 'react';
import { AppState } from '../types';

interface OrbProps {
  state: AppState;
  volume?: number; // 0 to 1, used for recording visualization
}

export const Orb: React.FC<OrbProps> = ({ state, volume = 0 }) => {
  
  // Dynamic styles based on state
  const getOrbStyle = () => {
    switch (state) {
      case AppState.RECORDING:
        // Pulse red/orange based on volume
        const scale = 1 + volume * 0.5; // Scale up to 1.5x based on volume
        return {
          transform: `scale(${scale})`,
          backgroundColor: '#ef4444', // Red-500
          boxShadow: `0 0 ${20 + volume * 50}px ${5 + volume * 20}px rgba(239, 68, 68, 0.4)`
        };
      case AppState.PROCESSING:
        // Spinning/Thinking white/blue
        return {
          backgroundColor: '#f8fafc', // Slate-50
          animation: 'spin 3s linear infinite',
          opacity: 0.8,
          boxShadow: '0 0 30px 10px rgba(255, 255, 255, 0.3)'
        };
      case AppState.PLAYING:
        // Speaking animation (blue/cyan)
        return {
          backgroundColor: '#38bdf8', // Sky-400
          boxShadow: '0 0 40px 15px rgba(56, 189, 248, 0.4)'
        };
      case AppState.IDLE:
      default:
        // Resting state
        return {
          backgroundColor: '#1e293b', // Slate-800
          border: '2px solid #334155',
          boxShadow: '0 0 0 0 rgba(0,0,0,0)'
        };
    }
  };

  const getAnimationClass = () => {
    switch (state) {
        case AppState.PLAYING: return 'orb-speaking';
        case AppState.IDLE: return 'orb-idle';
        default: return '';
    }
  }

  return (
    <div className="relative flex items-center justify-center w-64 h-64">
      {/* Outer Glow Ring */}
      <div 
        className={`absolute w-48 h-48 rounded-full transition-all duration-300 ease-out ${getAnimationClass()}`}
        style={getOrbStyle()}
      ></div>

      {/* Inner Core */}
      {state === AppState.RECORDING && (
         <div className="absolute w-48 h-48 rounded-full border-4 border-white opacity-20 animate-ping"></div>
      )}
    </div>
  );
};
