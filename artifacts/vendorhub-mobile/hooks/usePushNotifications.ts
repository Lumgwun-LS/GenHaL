/**
 * Registers this device for Expo push notifications and keeps the
 * api-server in sync with the current push token so vendors get instant
 * alerts (e.g. payment status changes) on their phone.
 *
 * Also listens for notification taps and routes to the relevant screen:
 * payment pushes open the Payments tab, voice-campaign pushes open the
 * specific campaign's detail screen (falling back to the campaigns list
 * if no campaignId was included).
 *
 * Registration only happens when both:
 *  - `signedIn` is true (there's a VendorHub session to attach the token to)
 *  - the vendor's own preference (persisted on-device, toggled from the
 *    Account tab) is enabled
 * Flipping either off unregisters the current device token so the server
 * stops sending pushes to it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  registerExternalPushToken,
  unregisterExternalPushToken,
} from '@workspace/api-client-react';

const PREFERENCE_STORAGE_KEY = 'vendorhub-push-alerts-enabled';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  console.log('[push] registerForPushNotificationsAsync: Device.isDevice =', Device.isDevice);
  if (!Device.isDevice) {
    // Push tokens require a physical device (or aren't meaningful on web).
    console.log('[push] Skipping registration: not a physical device.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  console.log('[push] existing permission status =', existingStatus);
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    console.log('[push] requested permission, result =', status);
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    console.log('[push] Permission not granted, aborting registration.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  try {
    const { data } = await Notifications.getExpoPushTokenAsync();
    console.log('[push] Got Expo push token:', data);
    return data;
  } catch (err) {
    console.warn('[push] Failed to get Expo push token', err);
    return null;
  }
}

interface UsePushNotificationsResult {
  /** The vendor's on-device preference for phone alerts. Defaults to true
   * (matches historical behavior: enabled automatically once OS permission
   * is granted). */
  alertsEnabled: boolean;
  /** True while the persisted preference is still being read from storage. */
  isLoadingPreference: boolean;
  /** True while a toggle is in flight (permission prompt / register / unregister call). */
  isToggling: boolean;
  /** Flip the preference on/off, persisting it and (un)registering the
   * current device token with the server accordingly. */
  setAlertsEnabled: (next: boolean) => Promise<void>;
}

/** Registers/unregisters this device's push token as `signedIn` and the
 * persisted alert preference change. */
export function usePushNotifications(signedIn: boolean): UsePushNotificationsResult {
  const registeredToken = useRef<string | null>(null);
  const [alertsEnabled, setAlertsEnabledState] = useState(true);
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  // Load the persisted preference once on mount.
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(PREFERENCE_STORAGE_KEY);
        if (stored !== null) {
          setAlertsEnabledState(stored === 'true');
        }
      } finally {
        setIsLoadingPreference(false);
      }
    })();
  }, []);

  const shouldBeRegistered = signedIn && alertsEnabled && !isLoadingPreference;

  useEffect(() => {
    if (!shouldBeRegistered) {
      // Signed out or alerts disabled: best-effort unregister so this
      // device stops getting notifications.
      if (registeredToken.current) {
        void unregisterExternalPushToken({ expoPushToken: registeredToken.current }).catch(
          () => {},
        );
        registeredToken.current = null;
      }
      return;
    }

    let cancelled = false;
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (!token || cancelled) return;
      try {
        await registerExternalPushToken({ expoPushToken: token });
        registeredToken.current = token;
      } catch (err) {
        console.warn('[push] Failed to register push token with server', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldBeRegistered]);

  // Tapping a notification routes to the screen it's about.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { screen?: string; campaignId?: number | string }
        | undefined;
      const screen = data?.screen;
      if (screen === 'payments') {
        router.push('/(tabs)/payments');
      } else if (screen === 'voice-campaigns') {
        if (data?.campaignId != null) {
          router.push(`/voice-campaigns/${data.campaignId}`);
        } else {
          router.push('/voice-campaigns');
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const setAlertsEnabled = useCallback(async (next: boolean) => {
    setIsToggling(true);
    try {
      if (next) {
        // Re-registering may need to (re-)request OS permission; if the
        // user denies it, don't claim the preference is on.
        const token = await registerForPushNotificationsAsync();
        if (!token) {
          setAlertsEnabledState(false);
          await AsyncStorage.setItem(PREFERENCE_STORAGE_KEY, 'false');
          return;
        }
        try {
          await registerExternalPushToken({ expoPushToken: token });
          registeredToken.current = token;
        } catch (err) {
          console.warn('[push] Failed to register push token with server', err);
        }
      } else if (registeredToken.current) {
        try {
          await unregisterExternalPushToken({ expoPushToken: registeredToken.current });
        } catch (err) {
          console.warn('[push] Failed to unregister push token with server', err);
        }
        registeredToken.current = null;
      }
      setAlertsEnabledState(next);
      await AsyncStorage.setItem(PREFERENCE_STORAGE_KEY, String(next));
    } finally {
      setIsToggling(false);
    }
  }, []);

  return { alertsEnabled, isLoadingPreference, isToggling, setAlertsEnabled };
}
