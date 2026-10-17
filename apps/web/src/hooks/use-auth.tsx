import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser, LoginInput, RegisterInput, UserRole } from '@aurangabad-ambulance/shared';
import { api, ApiError } from '../lib/api-client.js';
import { resetSocket, getSocket } from '../lib/socket-client.js';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (credentials: LoginInput) => Promise<AuthUser>;
  register: (payload: RegisterInput) => Promise<AuthUser>;
  logout: () => void;
  hasRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadUser() {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await api.get<AuthUser>('/api/v1/auth/me');
        setUser(profile);
        getSocket(); // Initialize socket
      } catch (err) {
        console.warn('Session expired or invalid, clearing credentials:', err);
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (credentials: LoginInput): Promise<AuthUser> => {
    setIsLoading(true);
    try {
      const res = await api.post<{ user: AuthUser; token: string }>('/api/v1/auth/login', credentials);
      localStorage.setItem('token', res.token);
      setToken(res.token);
      setUser(res.user);
      resetSocket();
      getSocket();
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload: RegisterInput): Promise<AuthUser> => {
    setIsLoading(true);
    try {
      const res = await api.post<{ user: AuthUser; token: string }>('/api/v1/auth/register', payload);
      localStorage.setItem('token', res.token);
      setToken(res.token);
      setUser(res.user);
      resetSocket();
      getSocket();
      return res.user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    resetSocket();
  };

  const hasRole = (roles: UserRole[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
