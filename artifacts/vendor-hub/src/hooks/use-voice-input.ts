import { useCallback, useEffect, useRef, useState } from "react";

// ── Web Speech API type shims (not in all TS lib versions) ───────────────────
type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onresult: ((e: SpeechRecEvent) => void) | null;
  onerror: ((e: SpeechRecError) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type SpeechRecResult = { isFinal: boolean; [index: number]: { transcript: string } };
type SpeechRecResultList = { length: number; [index: number]: SpeechRecResult };
type SpeechRecEvent = { resultIndex: number; results: SpeechRecResultList };
type SpeechRecError = { error: string };

export type VoiceInputStatus = "idle" | "listening" | "unsupported";

interface UseVoiceInputOptions {
  continuous?: boolean;
  interimResults?: boolean;
  lang?: string;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

const isSupported =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

export function useVoiceInput({
  continuous = false,
  interimResults = true,
  lang = "en-US",
  onResult,
  onEnd,
  onError,
}: UseVoiceInputOptions = {}) {
  const [status, setStatus] = useState<VoiceInputStatus>(
    isSupported ? "idle" : "unsupported",
  );
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const recognitionRef = useRef<SpeechRec | null>(null);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!isSupported) {
      onError?.("Speech recognition is not supported in this browser.");
      return;
    }

    // Abort any running instance first
    recognitionRef.current?.abort();

    const SR: new () => SpeechRec =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SR();

    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = lang;

    recognition.onstart = () => setStatus("listening");

    recognition.onresult = (event: SpeechRecEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }

      if (finalText) {
        setTranscript(finalText);
        setInterimTranscript("");
        onResult?.(finalText.trim(), true);
      } else {
        setInterimTranscript(interimText);
        onResult?.(interimText.trim(), false);
      }
    };

    recognition.onerror = (event: SpeechRecError) => {
      if (event.error !== "aborted") {
        onError?.(event.error);
      }
      setStatus("idle");
    };

    recognition.onend = () => {
      setStatus("idle");
      setInterimTranscript("");
      onEnd?.();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [continuous, interimResults, lang, onResult, onEnd, onError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    status,
    listening: status === "listening",
    supported: isSupported,
    transcript,
    interimTranscript,
    start,
    stop,
    reset: () => {
      setTranscript("");
      setInterimTranscript("");
    },
  };
}
