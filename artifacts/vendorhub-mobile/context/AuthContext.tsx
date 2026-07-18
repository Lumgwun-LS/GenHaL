import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { getSecureItem, setSecureItem, deleteSecureItem } from '@/lib/secure-storage';
import {
  externalAuthMobileHandshake,
  externalAuthRevoke,
  getExternalProfile,
  updateExternalProfile,
} from '@workspace/api-client-react';
import type { ExternalProfileUpdate, Vendor } from '@workspace/api-client-react';
import { setAuthToken } from '@/lib/auth-token';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const TOKEN_STORAGE_KEY = 'vendorhub-mobile-token';

export type AwajimaaUserType =
  | 'state'
  | 'hospital'
  | 'emergency'
  | 'business'
  | 'individual';

interface AuthContextValue {
  /** True until we've finished restoring any saved VendorHub session. */
  isLoading: boolean;
  /** True once we hold a valid VendorHub external-session JWT. */
  isAuthenticated: boolean;
  /** True when Clerk has a signed-in user but onboarding (account type
   * selection) hasn't been completed yet — route to /onboarding. */
  needsOnboarding: boolean;
  vendor: Vendor | null;
  features: string[];
  /** True if the current vendor's Clerk user ID is listed in ADMIN_USER_IDS. */
  isAdmin: boolean;
  /** Completes onboarding for an already Clerk-signed-in user by minting
   * a VendorHub session bound to their verified Clerk identity. */
  completeOnboarding: (input: { userType: AwajimaaUserType; phone?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: ExternalProfileUpdate) => Promise<void>;
  /** Vendor's on-device preference for phone push alerts (Account tab toggle). */
  pushAlertsEnabled: boolean;
  isLoadingPushPreference: boolean;
  isTogglingPushAlerts: boolean;
  setPushAlertsEnabled: (next: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded: isClerkLoaded, isSignedIn, getToken, signOut } = useClerkAuth();

  const [isRestoring, setIsRestoring] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [jti, setJti] = useState<string | null>(null);

  const applyToken = useCallback((next: string | null) => {
    setToken(next);
    setAuthToken(next);
  }, []);

  const clearSession = useCallback(async () => {
    applyToken(null);
    setVendor(null);
    setFeatures([]);
    setIsAdmin(false);
    setJti(null);
    await deleteSecureItem(TOKEN_STORAGE_KEY);
  }, [applyToken]);

  const refreshProfile = useCallback(async () => {
    const profile = await getExternalProfile();
    setVendor(profile.vendor);
    setFeatures(profile.features);
    setIsAdmin((profile as any).isAdmin === true);
  }, []);

  // Restore a previously-issued VendorHub session from secure storage.
  useEffect(() => {
    (async () => {
      try {
        const stored = await getSecureItem(TOKEN_STORAGE_KEY);
        if (!stored) return;
        applyToken(stored);
        setJti(extractJti(stored));
        const profile = await getExternalProfile();
        setVendor(profile.vendor);
        setFeatures(profile.features);
        setIsAdmin((profile as any).isAdmin === true);
      } catch {
        // Stored token is invalid/expired — fall back to logged-out state.
        await clearSession();
      } finally {
        setIsRestoring(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the Clerk session ends (e.g. signed out elsewhere), drop our own
  // VendorHub session too — it should never outlive the identity it's bound to.
  useEffect(() => {
    if (isClerkLoaded && !isSignedIn && token) {
      void clearSession();
    }
  }, [isClerkLoaded, isSignedIn, token, clearSession]);

  const completeOnboarding = useCallback(
    async ({ userType, phone }: { userType: AwajimaaUserType; phone?: string }) => {
      // Explicit Authorization header: this call must carry the *Clerk*
      // session token, not our own external JWT (there isn't one yet).
      // Passing headers here bypasses the global setAuthTokenGetter, which
      // otherwise attaches our external JWT to every /external/* request.
      const clerkToken = await getToken();
      if (!clerkToken) {
        throw new Error('Not signed in');
      }
      const res = await externalAuthMobileHandshake(
        { userType, phone },
        { headers: { Authorization: `Bearer ${clerkToken}` } },
      );
      applyToken(res.token);
      setFeatures(res.features);
      setJti(extractJti(res.token));
      await setSecureItem(TOKEN_STORAGE_KEY, res.token);
      const profile = await getExternalProfile();
      setVendor(profile.vendor);
      setFeatures(profile.features);
      setIsAdmin((profile as any).isAdmin === true);
    },
    [applyToken, getToken],
  );

  const logout = useCallback(async () => {
    try {
      if (jti) {
        await externalAuthRevoke({ jti });
      }
    } catch {
      // Best-effort revoke — proceed with local logout regardless.
    }
    await clearSession();
    await signOut();
  }, [jti, clearSession, signOut]);

  const updateProfile = useCallback(async (patch: ExternalProfileUpdate) => {
    const updated = await updateExternalProfile(patch);
    setVendor(updated);
  }, []);

  const isLoading = !isClerkLoaded || isRestoring;

  const {
    alertsEnabled: pushAlertsEnabled,
    isLoadingPreference: isLoadingPushPreference,
    isToggling: isTogglingPushAlerts,
    setAlertsEnabled: setPushAlertsEnabled,
  } = usePushNotifications(!!token);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoading,
      isAuthenticated: !!token,
      needsOnboarding: isClerkLoaded && !!isSignedIn && !isRestoring && !token,
      vendor,
      features,
      isAdmin,
      completeOnboarding,
      logout,
      refreshProfile,
      updateProfile,
      pushAlertsEnabled,
      isLoadingPushPreference,
      isTogglingPushAlerts,
      setPushAlertsEnabled,
    }),
    [
      isLoading,
      token,
      isClerkLoaded,
      isSignedIn,
      isRestoring,
      vendor,
      features,
      isAdmin,
      completeOnboarding,
      logout,
      refreshProfile,
      updateProfile,
      pushAlertsEnabled,
      isLoadingPushPreference,
      isTogglingPushAlerts,
      setPushAlertsEnabled,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/** Decodes the `jti` claim out of a JWT without verifying its signature. */
function extractJti(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(base64UrlDecode(payload));
    return typeof decoded?.jti === 'string' ? decoded.jti : null;
  } catch {
    return null;
  }
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  // atob is polyfilled by the Hermes/React Native runtime.
  return decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  );
}
