import { useQuery } from '@tanstack/react-query';
import { inventoryService, type InventoryData } from '@/services/inventory.service';
import { MOCK_INVENTORY } from '@/lib/mock-data';

export function useInventory() {
  return useQuery<InventoryData>({
    queryKey: ['inventory'],
    queryFn: async () => {
      try {
        const data = await inventoryService.getInventory();
        return (data?.consumo_vs_limite?.length ?? 0) > 0 ? data : MOCK_INVENTORY as InventoryData;
      } catch {
        return MOCK_INVENTORY as InventoryData;
      }
    },
  });
}
