import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser, UserRole } from '@aurangabad-ambulance/shared';
import { authStorage } from '../services/auth-storage.js';
import { apiClient } from '../services/api.js';
import { disconnectMobileSocket } from '../services/socket.js';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore stored session on startup
  useEffect(() => {
    async function loadStoredAuth() {
      try {
        const storedToken = await authStorage.getToken();
        const storedUser = await authStorage.getUser();

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(storedUser);

          // Verify token validity against backend /api/v1/auth/me
          try {
            const profile = await apiClient.get<AuthUser>('/api/v1/auth/me');
            setUser(profile.data);
            await authStorage.saveUser(profile.data);
          } catch {
            // If token invalid, clear
            await authStorage.clear();
            setToken(null);
            setUser(null);
          }
        }
      } catch {
        // Fallback to logged out
      } finally {
        setIsLoading(false);
      }
    }

    loadStoredAuth();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const res = await apiClient.post<{ user: AuthUser; token: string }>('/api/v1/auth/login', {
      email,
      password,
    });

    const { user: authUser, token: authToken } = res.data;
    setUser(authUser);
    setToken(authToken);

    await authStorage.saveToken(authToken);
    await authStorage.saveUser(authUser);
  };

  const logout = async (): Promise<void> => {
    disconnectMobileSocket();
    await authStorage.clear();
    setUser(null);
    setToken(null);
  };

  const refreshUser = async (): Promise<void> => {
    if (!token) return;
    try {
      const res = await apiClient.get<AuthUser>('/api/v1/auth/me');
      setUser(res.data);
      await authStorage.saveUser(res.data);
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role: user ? (user.role as UserRole) : null,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useMobileAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useMobileAuth must be used within an AuthProvider');
  }
  return context;
}
