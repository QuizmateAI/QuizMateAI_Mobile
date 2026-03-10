import React, {createContext, useContext, useState, useEffect, useCallback} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  refreshToken: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  updateUser: async () => {},
});

const ACCESS_TOKEN_KEY = '@quizmate_access_token';
const REFRESH_TOKEN_KEY = '@quizmate_refresh_token';
const USER_KEY = '@quizmate_user';

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedAccessToken, storedRefreshToken, storedUser] = await Promise.all([
          AsyncStorage.getItem(ACCESS_TOKEN_KEY),
          AsyncStorage.getItem(REFRESH_TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ]);
        if (storedAccessToken && storedUser) {
          setAccessToken(storedAccessToken);
          setRefreshToken(storedRefreshToken);
          setUser(JSON.parse(storedUser));
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (newAccessToken: string, newRefreshToken: string, newUser: User) => {
    // Prevent storing undefined/null tokens
    if (newAccessToken) {
      await AsyncStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
    } else {
      await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
    }
    if (newRefreshToken) {
      await AsyncStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    } else {
      await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
    }
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setAccessToken(newAccessToken || null);
    setRefreshToken(newRefreshToken || null);
    setUser(newUser);
  }, []);

  const logout = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(USER_KEY),
    ]);
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback(async (updatedUser: User) => {
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
    setUser(updatedUser);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        isLoading,
        isAuthenticated: !!accessToken,
        login,
        logout,
        updateUser,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
