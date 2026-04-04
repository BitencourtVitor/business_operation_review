'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useScreens, useUsers, useUpdateUserPermissions } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export default function SettingsPage() {
  const { user } = useAuth();
  const { data: screens, isLoading: screensLoading } = useScreens();
  const { data: users, isLoading: usersLoading } = useUsers();
  const updatePermissions = useUpdateUserPermissions();
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedTelas, setSelectedTelas] = useState<Record<string, Set<string>>>({});

  // Only admin, dev, and owner can access
  if (user && !['admin', 'dev', 'owner'].includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Only administrators can access the Settings page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screensLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  const startEditing = (userId: string, currentTelas: string[]) => {
    setEditing(userId);
    setSelectedTelas({ [userId]: new Set(currentTelas) });
  };

  const toggleTela = (userId: string, telaId: string) => {
    setSelectedTelas((prev) => {
      const current = prev[userId] || new Set();
      const updated = new Set(current);
      if (updated.has(telaId)) {
        updated.delete(telaId);
      } else {
        updated.add(telaId);
      }
      return { ...prev, [userId]: updated };
    });
  };

  const handleSave = async (userId: string) => {
    const telas = Array.from(selectedTelas[userId] || []);
    await updatePermissions.mutateAsync({ userId, telaIds: telas });
    setEditing(null);
  };

  const handleCancel = () => {
    setEditing(null);
    setSelectedTelas({});
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Manage user permissions and screen access
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {users?.map((u) => (
              <div key={u.id} className="flex items-start justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                  <Badge className="mt-2" variant="outline">
                    {u.role}
                  </Badge>
                </div>

                {editing === u.id ? (
                  <div className="space-y-3 flex-1 ml-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {screens?.map((screen) => (
                        <label key={screen.id} className="flex items-center space-x-2 cursor-pointer">
                          <Checkbox
                            checked={selectedTelas[u.id]?.has(screen.id) ?? false}
                            onCheckedChange={() => toggleTela(u.id, screen.id)}
                          />
                          <span className="text-sm">{screen.description}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-4">
                      <Button
                        size="sm"
                        onClick={() => handleSave(u.id)}
                        disabled={updatePermissions.isPending}
                      >
                        {updatePermissions.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          'Save'
                        )}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancel}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">
                        {u.telas.length} screens assigned
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEditing(u.id, u.telas)}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
