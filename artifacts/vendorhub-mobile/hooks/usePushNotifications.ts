/**
 * Registers this device for Expo push notifications and keeps the
 * api-server in sync with the current push token so vendors get instant
 * alerts (e.g. payment status changes) on their phone.
 *
 * Also listens for notification taps and routes to the relevant screen —
 * currently every push we send links back to the Payments tab.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import {
  registerExternalPushToken,
  unregisterExternalPushToken,
} from '@workspace/api-client-react';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens require a physical device (or aren't meaningful on web).
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
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
    return data;
  } catch (err) {
    console.warn('[push] Failed to get Expo push token', err);
    return null;
  }
}

/** Registers/unregisters this device's push token as `enabled` toggles (i.e. as auth state changes). */
export function usePushNotifications(enabled: boolean): void {
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Signed out: best-effort unregister so this device stops getting
      // notifications meant for the previous vendor.
      if (registeredToken.current) {
        void unregisterExternalPushToken({ expoPushToken: registeredToken.current }).catch(() => {});
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
  }, [enabled]);

  // Tapping a notification opens the Payments tab.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'payments') {
        router.push('/(tabs)/payments');
      }
    });
    return () => subscription.remove();
  }, []);
}
