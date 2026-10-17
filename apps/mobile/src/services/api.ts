import axios, { AxiosInstance, AxiosError } from 'axios';
import { mobileConfig } from '../config/env.js';
import { authStorage } from './auth-storage.js';

export const apiClient: AxiosInstance = axios.create({
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Dynamic BaseURL interceptor
apiClient.interceptors.request.use(async (config) => {
  config.baseURL = mobileConfig.apiUrl;
  const token = await authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response Error Interceptor
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    const errorMsg =
      error.response?.data?.message ||
      error.message ||
      'An unexpected network error occurred.';
    return Promise.reject(new Error(errorMsg));
  }
);
