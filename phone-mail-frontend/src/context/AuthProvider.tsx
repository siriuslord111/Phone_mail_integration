import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loginWithPassword, requestOtp, verifyOtp } from '../api/auth.api';
import { DEMO_MODE, DEMO_USER_KEY, TOKEN_KEY } from '../api/axios';
import { getMe, updateProfile } from '../api/user.api';
import type { User } from '../types';

export interface AuthContextValue {
  user: User | null;
  /** true only while the very first "is there a session?" check is running */
  initializing: boolean;
  pendingPhone: string | null;
  sendOtp: (phone: string) => Promise<void>;
  confirmOtp: (otp: string) => Promise<{ isNewUser: boolean }>;
  loginPassword: (phone: string, password: string) => Promise<{ isNewUser: boolean }>;
  completeProfile: (name: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

  useEffect(() => {
    const hasSession = DEMO_MODE
      ? Boolean(localStorage.getItem(DEMO_USER_KEY))
      : Boolean(localStorage.getItem(TOKEN_KEY));

    if (!hasSession) {
      setInitializing(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(DEMO_USER_KEY);
      })
      .finally(() => setInitializing(false));
  }, []);

  const sendOtp = useCallback(async (phone: string) => {
    await requestOtp(phone);
    setPendingPhone(phone);
  }, []);

  const confirmOtp = useCallback(
    async (otp: string) => {
      if (!pendingPhone) throw new Error('Start over: no phone number on file.');
      const { token, user: verifiedUser, isNewUser } = await verifyOtp(pendingPhone, otp);
      localStorage.setItem(TOKEN_KEY, token);
      setUser(verifiedUser);
      return { isNewUser };
    },
    [pendingPhone],
  );

  const completeProfile = useCallback(async (name: string) => {
    const updated = await updateProfile({ name });
    setUser(updated);
  }, []);

  const loginPassword = useCallback(async (phone: string, password: string) => {
    const { token, user: loggedInUser, isNewUser } = await loginWithPassword(phone, password);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(loggedInUser);
    return { isNewUser };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_USER_KEY);
    setUser(null);
    setPendingPhone(null);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, pendingPhone, sendOtp, confirmOtp, loginPassword, completeProfile, logout }),
    [user, initializing, pendingPhone, sendOtp, confirmOtp, loginPassword, completeProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
