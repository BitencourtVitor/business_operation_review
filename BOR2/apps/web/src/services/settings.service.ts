const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

export interface Screen {
  id: string;
  description: string;
}

export interface UserWithPermissions {
  id: string;
  email: string;
  name: string;
  role: string;
  telas: string[];
}

export const settingsService = {
  async getScreens(): Promise<Screen[]> {
    const res = await fetch(`${API_URL}/api/v1/settings/screens`, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch screens: ${res.statusText}`);
    return res.json();
  },

  async getUsers(): Promise<UserWithPermissions[]> {
    const res = await fetch(`${API_URL}/api/v1/settings/users`, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    });
    if (!res.ok) throw new Error(`Failed to fetch users: ${res.statusText}`);
    return res.json();
  },

  async updateUserPermissions(userId: string, telaIds: string[]): Promise<void> {
    const res = await fetch(`${API_URL}/api/v1/settings/users/${userId}/permissions`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
      body: JSON.stringify({ telas: telaIds }),
    });
    if (!res.ok) throw new Error(`Failed to update permissions: ${res.statusText}`);
  },
};
