import AsyncStorage from '@react-native-async-storage/async-storage';
import {DeviceEventEmitter} from 'react-native';

export const ACCESS_TOKEN_KEY = '@quizmate_token';
export const REFRESH_TOKEN_KEY = '@quizmate_refresh_token';
export const USER_KEY = '@quizmate_user';
export const LEGACY_ACCESS_TOKEN_KEY = '@quizmate_access_token';
export const AUTH_STORAGE_CHANGED_EVENT = 'auth:storage-changed';

type PersistedSessionInput = {
  accessToken: string;
  refreshToken?: string | null;
  user?: unknown;
};

function emitAuthStorageChanged() {
  DeviceEventEmitter.emit(AUTH_STORAGE_CHANGED_EVENT);
}

export async function readStoredSession() {
  const [accessToken, refreshToken, userJson] = await Promise.all([
    AsyncStorage.getItem(ACCESS_TOKEN_KEY),
    AsyncStorage.getItem(REFRESH_TOKEN_KEY),
    AsyncStorage.getItem(USER_KEY),
  ]);

  return {
    accessToken,
    refreshToken,
    userJson,
  };
}

export async function persistSession({
  accessToken,
  refreshToken,
  user,
}: PersistedSessionInput) {
  const writes = [AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken)];

  if (refreshToken) {
    writes.push(AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken));
  } else {
    writes.push(AsyncStorage.removeItem(REFRESH_TOKEN_KEY));
  }

  if (user !== undefined) {
    writes.push(AsyncStorage.setItem(USER_KEY, JSON.stringify(user)));
  }

  writes.push(AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY));

  await Promise.all(writes);
  emitAuthStorageChanged();
}

export async function updateStoredTokens({
  accessToken,
  refreshToken,
}: {
  accessToken: string;
  refreshToken?: string | null;
}) {
  const writes = [AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken)];

  if (refreshToken) {
    writes.push(AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken));
  }

  writes.push(AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY));

  await Promise.all(writes);
  emitAuthStorageChanged();
}

export async function updateStoredUser(user: unknown) {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  emitAuthStorageChanged();
}

export async function clearStoredSession() {
  await Promise.all([
    AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
    AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
    AsyncStorage.removeItem(USER_KEY),
    AsyncStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY),
  ]);
  emitAuthStorageChanged();
}
