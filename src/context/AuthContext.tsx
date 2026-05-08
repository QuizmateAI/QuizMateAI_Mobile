import React, {createContext, useContext, useState, useEffect, useCallback} from 'react';
import {DeviceEventEmitter} from 'react-native';
import {
  AUTH_STORAGE_CHANGED_EVENT,
  clearStoredSession,
  persistSession,
  readStoredSession,
  updateStoredUser,
} from '../utils/authStorage';

interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (
    accessToken: string,
    user: User,
    refreshToken?: string | null,
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  updateUser: async () => {},
});

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncFromStorage = async () => {
      try {
        const {accessToken, userJson} = await readStoredSession();

        if (!mounted) {
          return;
        }

        if (accessToken && userJson) {
          setToken(accessToken);
          setUser(JSON.parse(userJson));
        } else {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    syncFromStorage().catch(() => {
      /* sync failure leaves auth empty */
    });

    const subscription = DeviceEventEmitter.addListener(
      AUTH_STORAGE_CHANGED_EVENT,
      () => {
        syncFromStorage().catch(() => {
          /* sync failure leaves auth empty */
        });
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const login = useCallback(
    async (newToken: string, newUser: User, refreshToken?: string | null) => {
      await persistSession({
        accessToken: newToken,
        refreshToken,
        user: newUser,
      });
      setToken(newToken);
      setUser(newUser);
    },
    [],
  );

  const logout = useCallback(async () => {
    await clearStoredSession();
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback(async (updatedUser: User) => {
    await updateStoredUser(updatedUser);
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!token,
        login,
        logout,
        updateUser,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
