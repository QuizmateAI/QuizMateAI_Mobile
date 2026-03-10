import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {API_URL} from '@env';

const ACCESS_TOKEN_KEY = '@quizmate_access_token';

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(async config => {
  const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
      AsyncStorage.removeItem('@quizmate_refresh_token');
      AsyncStorage.removeItem('@quizmate_user');
    }
    return Promise.reject(error);
  },
);

export default api;
