import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loginWithPassword, registerWithPassword } from '../api/auth.api';
import { DEMO_MODE, DEMO_USER_KEY, TOKEN_KEY } from '../api/axios';
import { getMe, updateProfile } from '../api/user.api';
import type { User } from '../types';

export interface AuthContextValue {
  user: User | null;
  /** true only while the very first "is there a session?" check is running */
  initializing: boolean;
  registerPassword: (phone: string, password: string) => Promise<void>;
  loginPassword: (phone: string, password: string) => Promise<{ isNewUser: boolean }>;
  completeProfile: (name: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
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

  const registerPassword = useCallback(async (phone: string, password: string) => {
    const { token, user: registeredUser } = await registerWithPassword(phone, password);
    localStorage.setItem(TOKEN_KEY, token);
    setUser(registeredUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(DEMO_USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, registerPassword, loginPassword, completeProfile, logout }),
    [user, initializing, registerPassword, loginPassword, completeProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
