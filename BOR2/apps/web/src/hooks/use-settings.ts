import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsService, Screen, UserWithPermissions } from '@/services/settings.service';

export function useScreens() {
  return useQuery({
    queryKey: ['settings', 'screens'],
    queryFn: () => settingsService.getScreens(),
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ['settings', 'users'],
    queryFn: () => settingsService.getUsers(),
  });
}

export function useUpdateUserPermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, telaIds }: { userId: string; telaIds: string[] }) =>
      settingsService.updateUserPermissions(userId, telaIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'users'] });
    },
  });
}
