import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_URL} from '@env';

const TOKEN_KEY = '@quizmate_token';

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

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const requestBaseUrl = String(config.baseURL || API_URL || '').replace(/\/+$/, '');
  const requestPath = String(config.url || '').replace(/^\/+/, '');
  const requestUrl = requestPath ? `${requestBaseUrl}/${requestPath}` : requestBaseUrl;

  console.log('[API REQUEST]', config.method?.toUpperCase(), requestUrl);

  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      AsyncStorage.removeItem(TOKEN_KEY);
      AsyncStorage.removeItem('@quizmate_user');
    }
    return Promise.reject(error);
  },
);

export default api;
