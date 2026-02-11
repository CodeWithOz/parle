import { useState, useRef, useEffect, useCallback } from 'react';
import { blobToBase64 } from '../services/audioUtils';

export type MicrophonePermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export const useAudio = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Initialize AudioContext lazily (must be after user interaction)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  /**
   * Check the current microphone permission state using the Permissions API.
   * Returns 'granted', 'denied', 'prompt', or 'unsupported' if the API is not available.
   */
  const checkMicrophonePermission = useCallback(async (): Promise<MicrophonePermissionState> => {
    // Check if Permissions API is supported
    if (!navigator.permissions || !navigator.permissions.query) {
      return 'unsupported';
    }

    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state as MicrophonePermissionState;
    } catch {
      // Some browsers don't support querying microphone permission
      return 'unsupported';
    }
  }, []);

  /**
   * Request microphone permission explicitly.
   * Returns true if permission was granted, false otherwise.
   * This will show the browser's permission prompt if permission hasn't been granted yet.
   */
  const requestMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      // Request permission by attempting to access the microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop all tracks - we just wanted to trigger the permission prompt
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (err) {
      console.error("Microphone permission denied:", err);
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      // Setup visualizer for recording
      const audioCtx = getAudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const updateVolume = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolume(average / 128); // Normalize somewhat
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Stop current playback if any
      if (audioElementRef.current) {
        const audio = audioElementRef.current;
        audio.onpause = null;
        audio.pause();
        audioElementRef.current = null;
      }
      if (currentAudioUrlRef.current) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      setIsPaused(false);

    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access denied or not available.");
    }
  }, [getAudioContext]);

  const stopRecording = useCallback((): Promise<{ base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder) {
        reject("No media recorder found");
        return;
      }

      // Guard against stopping an already-stopped recorder (e.g., if cancelRecording was called)
      if (mediaRecorder.state === 'inactive') {
        reject("MediaRecorder is already stopped");
        return;
      }

      mediaRecorder.onstop = async () => {
        // Use the actual mime type from the recorder or fallback
        const mimeType = mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Cleanup visualizer
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        setVolume(0);

        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach(track => track.stop());

        try {
          const base64 = await blobToBase64(audioBlob);
          resolve({ base64, mimeType });
        } catch (e) {
          reject(e);
        }
      };

      try {
        // Only call stop() if recorder is in recording state
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        setIsRecording(false);
      } catch (error) {
        // Ignore InvalidStateError if recorder was already stopped
        if (error instanceof DOMException && error.name === 'InvalidStateError') {
          reject("MediaRecorder is already stopped");
        } else {
          reject(error);
        }
      }
    });
  }, []);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || !isRecording) {
      return;
    }

    // Stop the recorder without processing
    mediaRecorder.stop();

    // Cleanup visualizer
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setVolume(0);

    // Stop all tracks
    mediaRecorder.stream.getTracks().forEach(track => track.stop());

    // Clear audio chunks
    audioChunksRef.current = [];

    setIsRecording(false);
  }, [isRecording]);

  const playAudio = useCallback((audioUrl: string, speed: number, onEnded: () => void) => {
    // Clean up previous audio if exists
    if (audioElementRef.current) {
      // Remove event listeners before pausing to avoid triggering onpause
      const prevAudio = audioElementRef.current;
      prevAudio.onpause = null;
      prevAudio.pause();
      audioElementRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
    }

    // Create new audio element
    const audio = new Audio(audioUrl);
    audio.playbackRate = speed;
    currentAudioUrlRef.current = audioUrl;
    audioElementRef.current = audio;

    // Set up event listeners
    audio.onloadedmetadata = () => {
      setDuration(audio.duration);
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
    };

    audio.onplay = () => {
      setIsPlaying(true);
      setIsPaused(false);
    };

    audio.onpause = () => {
      setIsPlaying(false);
      setIsPaused(true);
    };

    audio.onended = () => {
      setIsPlaying(false);
      setIsPaused(false);
      setCurrentTime(0);
      onEnded();
    };

    // Start playing
    audio.play().catch(err => {
      console.error("Error playing audio:", err);
    });
  }, []);

  const pauseAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }
  }, []);

  const resumeAudio = useCallback(() => {
    if (audioElementRef.current) {
      audioElementRef.current.play().catch(err => {
        console.error("Error resuming audio:", err);
      });
    }
  }, []);

  const replayAudio = useCallback((audioUrl: string, speed: number, onEnded: () => void) => {
    playAudio(audioUrl, speed, onEnded);
  }, [playAudio]);

  const seekTo = useCallback((timeInSeconds: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.currentTime = timeInSeconds;
      setCurrentTime(timeInSeconds);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioElementRef.current) {
      // Set flag to prevent onpause handler from firing
      const audio = audioElementRef.current;
      audio.onpause = null;
      audio.pause();
      audio.currentTime = 0;
      audioElementRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const updatePlaybackSpeed = useCallback((speed: number) => {
    if (audioElementRef.current) {
      audioElementRef.current.playbackRate = speed;
    }
  }, []);

  /**
   * Play multiple audio files sequentially
   * @param audioUrls Array of audio URLs to play in sequence
   * @param speed Playback speed
   * @param onEachEnded Callback fired when each audio finishes (with index)
   * @param onAllEnded Callback fired when all audios have finished playing
   */
  const playAudioSequence = useCallback((
    audioUrls: string[],
    speed: number,
    onEachEnded: (index: number) => void,
    onAllEnded: () => void
  ) => {
    if (audioUrls.length === 0) {
      onAllEnded();
      return;
    }

    let currentIndex = 0;

    const playNext = () => {
      if (currentIndex >= audioUrls.length) {
        onAllEnded();
        return;
      }

      // Clean up previous audio if exists
      if (audioElementRef.current) {
        const prevAudio = audioElementRef.current;
        prevAudio.onended = null;
        prevAudio.onpause = null;
        prevAudio.pause();
      }
      if (currentAudioUrlRef.current && currentIndex > 0) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }

      // Create new audio element for current URL
      const audio = new Audio(audioUrls[currentIndex]);
      audio.playbackRate = speed;
      currentAudioUrlRef.current = audioUrls[currentIndex];
      audioElementRef.current = audio;

      // Set up event listeners for this audio
      audio.onloadedmetadata = () => {
        setDuration(audio.duration);
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onplay = () => {
        setIsPlaying(true);
        setIsPaused(false);
      };

      audio.onpause = () => {
        // Only update if audio was actually playing
        if (audio.currentTime > 0 && audio.currentTime < audio.duration) {
          setIsPlaying(false);
          setIsPaused(true);
        }
      };

      audio.onended = () => {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentTime(0);
        onEachEnded(currentIndex);
        currentIndex++;
        playNext(); // Play next audio
      };

      // Start playing
      audio.play().catch(err => {
        console.error(`Error playing audio at index ${currentIndex}:`, err);
        // Try to continue with next audio even if this one fails
        currentIndex++;
        playNext();
      });
    };

    playNext();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  return {
    isRecording,
    isPlaying,
    isPaused,
    currentTime,
    duration,
    volume,
    startRecording,
    stopRecording,
    cancelRecording,
    playAudio,
    pauseAudio,
    resumeAudio,
    replayAudio,
    seekTo,
    stopAudio,
    updatePlaybackSpeed,
    playAudioSequence,
    getAudioContext, // Exposed to initialize context on user interaction
    checkMicrophonePermission,
    requestMicrophonePermission
  };
};
