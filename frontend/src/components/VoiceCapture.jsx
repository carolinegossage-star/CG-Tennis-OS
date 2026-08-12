import React, { useState, useRef, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import { saveVoiceCapture, isOnline, registerSyncListener } from '../utils/offlineStorage';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function VoiceCapture({ sessionId, playerId, onCaptureSaved }) {
  const { addToast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [offline, setOffline] = useState(!isOnline());
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('cgto_token')}`,
  });

  // ─── Network Status Monitoring ────────────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setOffline(false);
      addToast({ type: 'success', message: 'Back online — syncing captures...' });
      registerSyncListener(() => console.log('[Voice] Background sync ready'));
    };

    const handleOffline = () => {
      setOffline(true);
      addToast({ type: 'warning', message: 'Offline mode — captures will sync when online' });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    registerSyncListener(() => console.log('[Voice] Background sync registered'));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Start Recording ──────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // Save to offline storage first
        try {
          await saveVoiceCapture(audioBlob, playerId || 'unknown', sessionId || 'unknown', {
            recordedAt: new Date().toISOString(),
            offline: !isOnline(),
            recordingDuration: recordingTime
          });
          addToast({ type: 'success', message: '✓ Capture saved locally' });
        } catch (err) {
          console.error('[Voice] Offline storage error:', err);
          addToast({ type: 'error', message: 'Failed to save locally' });
        }

        // If online, upload immediately
        if (isOnline()) {
          await uploadRecording(audioBlob);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);

      addToast({ type: 'success', message: 'Recording started' });
    } catch (err) {
      addToast({ type: 'error', message: `Microphone access denied: ${err.message}` });
    }
  };

  // ─── Stop Recording ───────────────────────────────────────────────────────
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  // ─── Upload Recording ─────────────────────────────────────────────────────
  const uploadRecording = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, `voice-${Date.now()}.webm`);
      if (sessionId) formData.append('session_id', sessionId);
      if (playerId) formData.append('player_id', playerId);

      const res = await fetch(`${API_BASE}/voice-capture/record`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });

      if (!res.ok) throw new Error(`${res.status}`);

      const data = await res.json();
      addToast({ type: 'success', message: 'Voice note captured and processed!' });

      if (onCaptureSaved) {
        onCaptureSaved(data);
      }
    } catch (err) {
      addToast({ type: 'error', message: `Upload failed: ${err.message}` });
    } finally {
      setIsProcessing(false);
    }
  };

  // ─── Format Time ──────────────────────────────────────────────────────────
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {offline && (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-700 border border-amber-200">
          <span>📡</span>
          <span>Offline Mode — Captures saved locally and will sync when online</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
          <div>
            <p className="text-sm font-semibold text-gray-800">
              {isRecording ? 'Recording…' : isProcessing ? 'Processing…' : 'Voice Capture'}
            </p>
            {isRecording && (
              <p className="text-xs text-gray-500">{formatTime(recordingTime)}</p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {!isRecording && !isProcessing && (
            <button
              type="button"
              onClick={startRecording}
              className="rounded-lg bg-[--primary-green] px-4 py-2 text-sm font-medium text-white hover:bg-[--primary-green]/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[--primary-green]"
              aria-label="Start recording"
            >
              🎙️ {offline ? 'Capture (Offline)' : 'Capture'}
            </button>
          )}

          {isRecording && (
            <button
              type="button"
              onClick={stopRecording}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              aria-label="Stop recording"
            >
              ⏹️ Stop
            </button>
          )}

          {isProcessing && (
            <div className="flex items-center gap-2 px-4 py-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-[--primary-green]" />
              <span className="text-sm text-gray-600">{offline ? 'Saving…' : 'Processing…'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
