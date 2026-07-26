import { useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, MicVocal, CheckCircle2, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoice } from "@/contexts/voice-context";
import { useVoiceInput } from "@/hooks/use-voice-input";
import { useState } from "react";
import { toast } from "sonner";

export default function VoiceFAB() {
  const { voiceEnabled, handleTranscript, utterances, setNavigateHandler } = useVoice();
  const [, setLocation] = useLocation();
  const [panelOpen, setPanelOpen] = useState(false);

  // Wire navigate handler into context once
  useEffect(() => {
    setNavigateHandler((path: string) => setLocation(path));
  }, [setNavigateHandler, setLocation]);

  const { listening, supported, start, stop } = useVoiceInput({
    continuous: false,
    interimResults: false,
    onResult: (text, isFinal) => {
      if (isFinal && text) {
        handleTranscript(text);
      }
    },
    onError: (err) => {
      if (err === "no-speech") {
        toast.info("No speech detected — try again.");
      } else if (err !== "aborted") {
        toast.error(`Voice error: ${err}`);
      }
    },
  });

  const toggle = useCallback(() => {
    if (listening) {
      stop();
    } else {
      setPanelOpen(true);
      start();
    }
  }, [listening, start, stop]);

  if (!voiceEnabled) return null;

  return (
    <>
      {/* Transcript panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="fixed bottom-[14.5rem] right-4 z-40 w-72 rounded-xl border bg-popover shadow-xl overflow-hidden"
          >
            {/* Panel header */}
            <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
              <div className="flex items-center gap-2">
                {listening ? (
                  <span className="flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                ) : (
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                )}
                <span className="text-xs font-semibold text-foreground">
                  {listening ? "Listening…" : "Voice Control"}
                </span>
              </div>
              <button
                onClick={() => { stop(); setPanelOpen(false); }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close transcript panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Utterances list */}
            <div className="p-2 space-y-1.5 max-h-48 overflow-y-auto">
              {utterances.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  {listening ? "Start speaking…" : "Tap the mic and speak a command or field value."}
                </div>
              ) : (
                utterances.map((u) => (
                  <div
                    key={u.id}
                    className={cn(
                      "flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs",
                      u.applied
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {u.applied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                    ) : (
                      <HelpCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className="leading-snug">{u.text}</span>
                  </div>
                ))
              )}
            </div>

            {/* Hint footer */}
            <div className="px-3 py-2 border-t bg-muted/30">
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Say <em>"Go to inventory"</em>, <em>"New product"</em>, <em>"Name: Basmati Rice"</em>, or speak to fill the focused field.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB button */}
      <div className="fixed bottom-44 right-6 z-40 flex flex-col items-center">
        {!supported ? (
          <button
            className="w-12 h-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center shadow-lg cursor-not-allowed"
            title="Voice input not supported in this browser"
            onClick={() => toast.error("Voice input requires Chrome or Edge.")}
          >
            <MicOff className="w-5 h-5" />
          </button>
        ) : (
          <motion.button
            onClick={toggle}
            whileTap={{ scale: 0.92 }}
            title={listening ? "Stop listening" : "Start voice control"}
            aria-label={listening ? "Stop voice control" : "Start voice control"}
            className={cn(
              "relative w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              listening
                ? "bg-red-500 text-white"
                : "bg-violet-600 hover:bg-violet-700 text-white",
            )}
          >
            {/* Pulse ring while listening */}
            {listening && (
              <>
                <span className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-60" />
                <span className="absolute inset-0 rounded-full bg-red-500 animate-pulse opacity-40" />
              </>
            )}
            {listening ? (
              <MicVocal className="w-5 h-5 relative z-10" />
            ) : (
              <Mic className="w-5 h-5 relative z-10" />
            )}
          </motion.button>
        )}
      </div>
    </>
  );
}
