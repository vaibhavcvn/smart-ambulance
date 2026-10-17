import * as SecureStore from 'expo-secure-store';
import { AuthUser } from '@aurangabad-ambulance/shared';

const TOKEN_KEY = 'aurangabad_ems_auth_token';
const USER_KEY = 'aurangabad_ems_auth_user';

// In-memory fallback if SecureStore is unavailable
let memoryToken: string | null = null;
let memoryUser: AuthUser | null = null;

export const authStorage = {
  async saveToken(token: string): Promise<void> {
    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      } else {
        memoryToken = token;
      }
    } catch {
      memoryToken = token;
    }
  },

  async getToken(): Promise<string | null> {
    try {
      if (await SecureStore.isAvailableAsync()) {
        return await SecureStore.getItemAsync(TOKEN_KEY);
      }
      return memoryToken;
    } catch {
      return memoryToken;
    }
  },

  async removeToken(): Promise<void> {
    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
      memoryToken = null;
    } catch {
      memoryToken = null;
    }
  },

  async saveUser(user: AuthUser): Promise<void> {
    try {
      const serialized = JSON.stringify(user);
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.setItemAsync(USER_KEY, serialized);
      } else {
        memoryUser = user;
      }
    } catch {
      memoryUser = user;
    }
  },

  async getUser(): Promise<AuthUser | null> {
    try {
      if (await SecureStore.isAvailableAsync()) {
        const data = await SecureStore.getItemAsync(USER_KEY);
        return data ? JSON.parse(data) : null;
      }
      return memoryUser;
    } catch {
      return memoryUser;
    }
  },

  async removeUser(): Promise<void> {
    try {
      if (await SecureStore.isAvailableAsync()) {
        await SecureStore.deleteItemAsync(USER_KEY);
      }
      memoryUser = null;
    } catch {
      memoryUser = null;
    }
  },

  async clear(): Promise<void> {
    await this.removeToken();
    await this.removeUser();
  },
};
