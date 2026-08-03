import { useQuery } from '@tanstack/react-query';
import { inventoryService, type InventoryData } from '@/services/inventory.service';

export function useInventory() {
  return useQuery<InventoryData>({
    queryKey: ['inventory'],
    queryFn: () => inventoryService.getInventory(),
  });
}
