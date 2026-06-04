import axios from 'axios';
import {API_URL} from '@env';
import {
  ACCESS_TOKEN_KEY,
  LEGACY_ACCESS_TOKEN_KEY,
  clearStoredSession,
  readStoredSession,
  updateStoredTokens,
} from '../utils/authStorage';

function classifyApiUrl(url?: string) {
  const normalized = String(url || '').trim().toLowerCase();
  if (!normalized) {
    return 'MISSING';
  }

  if (
    normalized.includes('localhost') ||
    normalized.includes('127.0.0.1') ||
    normalized.includes('10.0.2.2') ||
    normalized.includes('10.0.3.2') ||
    normalized.includes('192.168.') ||
    normalized.includes('172.16.') ||
    normalized.includes('172.17.') ||
    normalized.includes('172.18.') ||
    normalized.includes('172.19.') ||
    normalized.includes('http://')
  ) {
    return 'LOCAL';
  }

  return 'REMOTE';
}

const API_TARGET = classifyApiUrl(API_URL);

console.log('[API CONFIG] API_URL =', API_URL || '(empty)');
console.log('[API CONFIG] Target =', API_TARGET);

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<string> | null = null;

function isRefreshRequest(url?: string) {
  return String(url || '').includes('/auth/refresh');
}

function isAuthRequest(url?: string) {
  return String(url || '').includes('/auth/');
}

function buildAbsoluteApiUrl(path: string) {
  return `${String(API_URL || '').replace(/\/+$/, '')}${path}`;
}

async function readAccessToken() {
  const {accessToken} = await readStoredSession();
  return accessToken;
}

async function refreshAccessToken() {
  const {refreshToken} = await readStoredSession();

  if (!refreshToken) {
    throw new Error('MISSING_REFRESH_TOKEN');
  }

  const response = await axios.post(
    buildAbsoluteApiUrl('/auth/refresh'),
    {refreshToken},
    {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  );

  const payload = response?.data?.data ?? response?.data;
  const newAccessToken = payload?.accessToken;
  const newRefreshToken = payload?.refreshToken;

  if (!newAccessToken) {
    throw new Error('INVALID_REFRESH_RESPONSE');
  }

  await updateStoredTokens({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });

  return newAccessToken;
}

function getOrStartRefresh() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

api.interceptors.request.use(async config => {
  const token = await readAccessToken();
  const headers = config.headers ?? {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else {
    delete headers.Authorization;
  }

  config.headers = headers;

  const requestBaseUrl = String(config.baseURL || API_URL || '').replace(/\/+$/, '');
  const requestPath = String(config.url || '').replace(/^\/+/, '');
  const requestUrl = requestPath ? `${requestBaseUrl}/${requestPath}` : requestBaseUrl;

  console.log('[API REQUEST]', config.method?.toUpperCase(), requestUrl);

  return config;
});

api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error?.config ?? {};
    const status = error?.response?.status;

    if (
      status === 401 &&
      !originalRequest._retry &&
      !isRefreshRequest(originalRequest.url) &&
      !isAuthRequest(originalRequest.url)
    ) {
      originalRequest._retry = true;

      try {
        const nextAccessToken = await getOrStartRefresh();
        originalRequest.headers = {
          ...(originalRequest.headers ?? {}),
          Authorization: `Bearer ${nextAccessToken}`,
        };
        return api(originalRequest);
      } catch (refreshError) {
        await clearStoredSession();
        return Promise.reject(refreshError);
      }
    }

    if (status === 401 && isRefreshRequest(originalRequest.url)) {
      await clearStoredSession();
    }

    return Promise.reject(error);
  },
);

export {ACCESS_TOKEN_KEY, LEGACY_ACCESS_TOKEN_KEY};
export default api;
