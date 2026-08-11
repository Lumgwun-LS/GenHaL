/**
 * useTabRecorder — captures this browser tab via getDisplayMedia and encodes
 * the result to a downloadable WebM file using MediaRecorder.
 *
 * The caller is responsible for:
 *   1. Calling startCapture() — opens the browser "Share Tab" dialog.
 *   2. Calling stopCapture()  — stops recording and triggers the download.
 */

import { useCallback, useRef, useState } from 'react';

export type RecorderStatus =
  | 'idle'
  | 'requesting'   // waiting for user to approve tab share
  | 'recording'    // MediaRecorder is running
  | 'processing'   // building the blob
  | 'done'         // download triggered
  | 'error';

export interface UseTabRecorderReturn {
  status: RecorderStatus;
  error: string | null;
  startCapture: () => Promise<boolean>; // returns true if stream acquired
  stopCapture: () => void;
  reset: () => void;
}

export function useTabRecorder(filename = 'awajimaa-investor-video.webm'): UseTabRecorderReturn {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const streamRef    = useRef<MediaStream | null>(null);
  const recorderRef  = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<BlobPart[]>([]);

  const reset = useCallback(() => {
    // Tear down any live stream/recorder
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    chunksRef.current = [];
    setStatus('idle');
    setError(null);
  }, []);

  const startCapture = useCallback(async (): Promise<boolean> => {
    reset();
    setStatus('requesting');

    try {
      // preferCurrentTab is a Chrome-only hint that pre-selects this tab,
      // reducing the clicks the user needs. Ignored by other browsers.
      const constraints: MediaStreamConstraints & { preferCurrentTab?: boolean } = {
        video: { frameRate: 30 } as MediaTrackConstraints,
        audio: true,
        preferCurrentTab: true,
      };

      const stream = await (navigator.mediaDevices as MediaDevices & {
        getDisplayMedia: (c: MediaStreamConstraints & { preferCurrentTab?: boolean }) => Promise<MediaStream>;
      }).getDisplayMedia(constraints);

      streamRef.current = stream;
      chunksRef.current = [];

      // Detect supported codec — prefer VP9 for quality, fall back to default
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

        // Stop all tracks so the "recording" indicator disappears from the tab
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };

      // If the user ends the share from the browser toolbar
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });

      recorder.start(1000); // collect chunks every 1 s
      setStatus('recording');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // NotAllowedError = user dismissed the dialog — treat as idle, not error
      if (msg.includes('NotAllowed') || msg.includes('Permission denied')) {
        setStatus('idle');
      } else {
        setError(msg);
        setStatus('error');
      }
      return false;
    }
  }, [reset, filename]);

  const stopCapture = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  }, []);

  return { status, error, startCapture, stopCapture, reset };
}
