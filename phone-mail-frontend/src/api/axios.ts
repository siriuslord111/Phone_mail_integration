import axios from 'axios';

export const TOKEN_KEY = 'phonemail_token';
export const DEMO_USER_KEY = 'phonemail_demo_user';

/** When true, every api/*.ts function answers from local mock data (no backend needed). */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

/** Small artificial latency so demo mode still shows loading states. */
export const demoDelay = (ms = 350) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Expired / invalid session → back to login. (A wrong OTP has no token yet, so it is left alone.)
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Turn any thrown value into a message that is safe to show under a form field. */
export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { message?: string } | undefined)?.message ?? fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
