/**
 * useTabRecorder — captures this browser tab via getDisplayMedia and encodes
 * the result to a downloadable WebM file using MediaRecorder.
 */

import { useCallback, useRef, useState } from 'react';

export type RecorderStatus =
  | 'idle'
  | 'unsupported'  // browser doesn't support tab capture
  | 'requesting'   // waiting for user to approve tab share
  | 'recording'    // MediaRecorder is running
  | 'processing'   // building the blob
  | 'done'         // download triggered
  | 'error';

export interface UseTabRecorderReturn {
  status: RecorderStatus;
  error: string | null;
  isSupported: boolean;
  startCapture: () => Promise<boolean>;
  stopCapture: () => void;
  reset: () => void;
}

function detectSupport(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof (navigator.mediaDevices as unknown as Record<string, unknown>).getDisplayMedia === 'function'
  );
}

export function useTabRecorder(filename = 'genhal-explainer.webm'): UseTabRecorderReturn {
  const supported = detectSupport();
  const [status, setStatus] = useState<RecorderStatus>(supported ? 'idle' : 'unsupported');
  const [error, setError] = useState<string | null>(null);

  const streamRef   = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<BlobPart[]>([]);

  const reset = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setStatus(supported ? 'idle' : 'unsupported');
    setError(null);
  }, [supported]);

  const startCapture = useCallback(async (): Promise<boolean> => {
    if (!supported) {
      setStatus('unsupported');
      return false;
    }

    reset();
    setStatus('requesting');

    try {
      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (c: object) => Promise<MediaStream>;
      }).getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
        preferCurrentTab: true,      // Chrome pre-selects this tab
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude', // hides non-tab options in Chrome 112+
      });

      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : '';

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        setStatus('processing');
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setStatus('done');
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });

      recorder.start(1000);
      setStatus('recording');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('NotAllowed') || msg.includes('Permission denied') || msg.includes('cancelled')) {
        setStatus('idle');
      } else {
        setError(msg);
        setStatus('error');
      }
      return false;
    }
  }, [reset, supported]);

  const stopCapture = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  return { status, error, isSupported: supported, startCapture, stopCapture, reset };
}
