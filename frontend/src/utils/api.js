import axios from 'axios';

const API_BASE = '/api';

const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor - add auth token
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('disputeai_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle 401
axiosInstance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('disputeai_token');
      localStorage.removeItem('disputeai_user');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

export const api = {
  get: (url, params) => axiosInstance.get(url, { params }),
  post: (url, data) => axiosInstance.post(url, data),
  put: (url, data) => axiosInstance.put(url, data),
  patch: (url, data) => axiosInstance.patch(url, data),
  delete: (url) => axiosInstance.delete(url),
};

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount || 0);
}

export function formatDate(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default api;
