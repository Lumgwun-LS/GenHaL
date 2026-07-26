import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VoiceUtterance {
  id: number;
  text: string;
  applied: boolean; // true = field filled / command executed; false = unrecognised
  ts: number;
}

export interface RegisteredField {
  label: string;
  setter: (value: string) => void;
}

type NavigateHandler = (path: string) => void;

interface VoiceContextValue {
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;

  // Field registry — forms register their fields so voice can fill them
  registerField: (id: string, label: string, setter: (v: string) => void) => void;
  unregisterField: (id: string) => void;

  // Called by VoiceFAB when a final transcript arrives
  handleTranscript: (text: string) => void;

  // Transcript history (last 5)
  utterances: VoiceUtterance[];

  // Navigation handler — set by VoiceFAB which has access to useLocation
  setNavigateHandler: (fn: NavigateHandler) => void;

  // Form-open callbacks — forms register themselves so voice commands can open them
  registerCommand: (name: string, fn: () => void) => void;
  unregisterCommand: (name: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const VoiceContext = createContext<VoiceContextValue | null>(null);

const STORAGE_KEY = "voice_control_enabled";
const MAX_UTTERANCES = 5;

// ── Navigation command map ────────────────────────────────────────────────────

const NAV_COMMANDS: Array<{ patterns: RegExp[]; path: string }> = [
  { patterns: [/\bdashboard\b/i, /\bhome\b/i], path: "/dashboard" },
  { patterns: [/\bproducts?\b/i, /\bcatalog\b/i], path: "/products" },
  { patterns: [/\binventor(y|ies)\b/i], path: "/inventory" },
  { patterns: [/\border(s)?\b/i], path: "/orders" },
  { patterns: [/\bsales?\b/i], path: "/sales" },
  { patterns: [/\bexpenses?\b/i], path: "/expenses" },
  { patterns: [/\bleads?\b/i], path: "/leads" },
  { patterns: [/\banalytics?\b/i, /\breports?\b/i], path: "/analytics" },
  { patterns: [/\bsocial\b/i, /\bposts?\b/i], path: "/social" },
  { patterns: [/\bsms\b/i], path: "/sms-campaigns" },
  { patterns: [/\bemail.campaign/i], path: "/email-campaigns" },
  { patterns: [/\bvoice.campaign/i], path: "/voice-campaigns" },
  { patterns: [/\bcustomer\b/i], path: "/orders" },
  { patterns: [/\bfinance\b/i, /\binvestment/i], path: "/finance-analytics" },
  { patterns: [/\bbranch(es)?\b/i], path: "/branches" },
  { patterns: [/\bworkers?\b/i, /\bstaff\b/i], path: "/workers" },
  { patterns: [/\bpricings?\b/i, /\bplans?\b/i], path: "/pricing" },
  { patterns: [/\bsettings?\b/i, /\baccount\b/i], path: "/account" },
  { patterns: [/\bads?\b/i, /\badvertis/i], path: "/ads" },
];

// ── Smart field-filling helpers ───────────────────────────────────────────────

/**
 * Attempt to parse "Field name: value" pattern from the transcript.
 * Returns { label, value } or null.
 */
function parseFieldColonValue(text: string): { label: string; value: string } | null {
  const match = text.match(/^([a-zA-Z\s]+?):\s*(.+)$/);
  if (!match) return null;
  return { label: match[1]!.trim().toLowerCase(), value: match[2]!.trim() };
}

/**
 * Fuzzy-match a spoken label against registered field labels.
 * Returns the field id or null.
 */
function matchFieldLabel(
  spokenLabel: string,
  fields: Map<string, RegisteredField>,
): string | null {
  const spoken = spokenLabel.toLowerCase().replace(/[^a-z0-9\s]/g, "");

  for (const [id, field] of fields) {
    const registered = field.label.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    if (registered === spoken) return id;
    if (registered.includes(spoken) || spoken.includes(registered)) return id;
  }
  return null;
}

/**
 * Attempt to fill the currently-focused text input with the transcript.
 * Returns true if filled.
 */
function fillFocusedInput(text: string): boolean {
  const el = document.activeElement;
  if (!el) return false;
  if (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") return false;
  const input = el as HTMLInputElement | HTMLTextAreaElement;
  if (input.readOnly || input.disabled) return false;

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    el.tagName === "TEXTAREA"
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype,
    "value",
  )?.set;
  nativeInputValueSetter?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

// ── Provider ──────────────────────────────────────────────────────────────────

let utteranceCounter = 0;

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [voiceEnabled, setVoiceEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [utterances, setUtterances] = useState<VoiceUtterance[]>([]);

  const fieldsRef = useRef<Map<string, RegisteredField>>(new Map());
  const commandsRef = useRef<Map<string, () => void>>(new Map());
  const navigateRef = useRef<NavigateHandler | null>(null);

  const setVoiceEnabled = useCallback((enabled: boolean) => {
    setVoiceEnabledState(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {}
  }, []);

  const registerField = useCallback(
    (id: string, label: string, setter: (v: string) => void) => {
      fieldsRef.current.set(id, { label, setter });
    },
    [],
  );

  const unregisterField = useCallback((id: string) => {
    fieldsRef.current.delete(id);
  }, []);

  const registerCommand = useCallback((name: string, fn: () => void) => {
    commandsRef.current.set(name, fn);
  }, []);

  const unregisterCommand = useCallback((name: string) => {
    commandsRef.current.delete(name);
  }, []);

  const setNavigateHandler = useCallback((fn: NavigateHandler) => {
    navigateRef.current = fn;
  }, []);

  const addUtterance = useCallback((text: string, applied: boolean) => {
    const entry: VoiceUtterance = {
      id: ++utteranceCounter,
      text,
      applied,
      ts: Date.now(),
    };
    setUtterances((prev) => [entry, ...prev].slice(0, MAX_UTTERANCES));
  }, []);

  const handleTranscript = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;

      // ── 1. "submit" / "save" — always exits here; never falls through to field fill
      if (/\b(submit|save|done|confirm)\b/i.test(text)) {
        const active = document.activeElement as HTMLElement | null;
        active?.blur();
        const form = (active?.closest("form") ||
          document.querySelector("form")) as HTMLFormElement | null;
        if (form) {
          form.requestSubmit?.();
          addUtterance(text, true);
        } else {
          addUtterance(text, false);
        }
        return;
      }

      // ── 2. "cancel" / "close" — press Escape
      if (/\b(cancel|close|dismiss|stop)\b/i.test(text)) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        addUtterance(text, true);
        return;
      }

      // ── 3. Registered form-open / action commands ("new product", "record sale", …)
      //    Must run BEFORE navigation so these are never swallowed by nav patterns.
      const lower = text.toLowerCase();
      for (const [name, fn] of commandsRef.current) {
        if (lower.includes(name.toLowerCase())) {
          fn();
          addUtterance(text, true);
          return;
        }
      }

      // ── 4. Smart field-filling: "Label: value" pattern
      //    Must run BEFORE navigation so "Customer name: …" is never consumed as nav.
      const parsed = parseFieldColonValue(text);
      if (parsed) {
        const fieldId = matchFieldLabel(parsed.label, fieldsRef.current);
        if (fieldId) {
          fieldsRef.current.get(fieldId)!.setter(parsed.value);
          addUtterance(text, true);
          return;
        }
      }

      // ── 5. Navigation commands — ONLY when an explicit nav prefix is present
      //    ("go to X", "navigate to X", "open X").  No full-transcript fallback
      //    to avoid matching arbitrary field names or product names as routes.
      const NAV_PREFIX = /^(go|navigate|take me|open)\s+(to\s+)?/i;
      if (NAV_PREFIX.test(text)) {
        const navIntent = text.toLowerCase().replace(NAV_PREFIX, "");
        for (const { patterns, path } of NAV_COMMANDS) {
          if (patterns.some((p) => p.test(navIntent))) {
            navigateRef.current?.(path);
            addUtterance(text, true);
            return;
          }
        }
      }

      // ── 6. Fill currently focused input
      if (fillFocusedInput(text)) {
        addUtterance(text, true);
        return;
      }

      // ── 7. Unrecognised
      addUtterance(text, false);
    },
    [addUtterance],
  );

  return (
    <VoiceContext.Provider
      value={{
        voiceEnabled,
        setVoiceEnabled,
        registerField,
        unregisterField,
        handleTranscript,
        utterances,
        setNavigateHandler,
        registerCommand,
        unregisterCommand,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

// ── Consumer hooks ────────────────────────────────────────────────────────────

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside <VoiceProvider>");
  return ctx;
}

/**
 * Register a form field with the VoiceContext so it can be filled by voice.
 * Call once per field; label should match what the user would say.
 */
export function useVoiceField(
  id: string,
  label: string,
  setter: (v: string) => void,
) {
  const { registerField, unregisterField } = useVoice();

  useEffect(() => {
    registerField(id, label, setter);
    return () => unregisterField(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, label]);
}

/**
 * Register a named command (e.g. "new product") that opens a modal/action.
 */
export function useVoiceCommand(name: string, fn: () => void) {
  const { registerCommand, unregisterCommand } = useVoice();

  useEffect(() => {
    registerCommand(name, fn);
    return () => unregisterCommand(name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
}
