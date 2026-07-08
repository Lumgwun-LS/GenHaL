/**
 * Cross-platform secure(-ish) key/value storage for the app's own external
 * session JWT.
 *
 * `expo-secure-store` (Keychain/Keystore-backed) is used on iOS/Android for
 * real on-device security. It does not implement its native API on web, so
 * we fall back to AsyncStorage there — web has no equivalent OS-level secure
 * enclave anyway, and this mirrors how Clerk's own web token cache behaves.
 */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const isWeb = Platform.OS === 'web';

export async function getSecureItem(key: string): Promise<string | null> {
  return isWeb ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

export async function deleteSecureItem(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key);
  }
}
