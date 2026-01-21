import { useState, useRef, useEffect, useCallback } from 'react';
import { blobToBase64 } from '../services/audioUtils';

export const useAudio = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Playback refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        setIsPlaying(false);
      }

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

      mediaRecorder.stop();
      setIsRecording(false);
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

  const playAudio = useCallback(async (audioBuffer: AudioBuffer, speed: number, onEnded: () => void) => {
    const ctx = getAudioContext();

    // Stop previous if exists
    if (currentSourceRef.current) {
      try { currentSourceRef.current.stop(); } catch (e) { }
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = speed;

    // Simple visualizer for playback
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    analyserRef.current = analyser;

    // Only start visualization loop if not already running
    if (!animationFrameRef.current) {
      const updateVolume = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
        setVolume(average / 128);
        animationFrameRef.current = requestAnimationFrame(updateVolume);
      };
      updateVolume();
    }

    source.onended = () => {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      setVolume(0);
      onEnded();
    };

    currentSourceRef.current = source;
    source.start();
    setIsPlaying(true);
  }, [getAudioContext]);

  const updatePlaybackSpeed = useCallback((speed: number) => {
    if (currentSourceRef.current && isPlaying) {
      // AudioParam.value change is immediate
      currentSourceRef.current.playbackRate.value = speed;
    }
  }, [isPlaying]);

  return {
    isRecording,
    isPlaying,
    volume,
    startRecording,
    stopRecording,
    cancelRecording,
    playAudio,
    updatePlaybackSpeed,
    getAudioContext // Exposed to initialize context on user interaction
  };
};