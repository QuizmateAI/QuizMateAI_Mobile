import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@quizmate_token';

const api = axios.create({
  baseURL: 'https://api.quizmateai.io.vn',
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
