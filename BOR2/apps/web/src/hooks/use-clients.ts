import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientsCatalogService } from "@/services/clients.service"

export function useClients() {
  return useQuery({
    queryKey: ["catalog", "clients"],
    queryFn: () => clientsCatalogService.listClients().then(d => Array.isArray(d) ? d : []),
  })
}

export function useJobSites() {
  return useQuery({
    queryKey: ["catalog", "job-sites"],
    queryFn: () => clientsCatalogService.listJobSites().then(d => Array.isArray(d) ? d : []),
  })
}

export function useAddClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => clientsCatalogService.addClient(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "clients"] }),
  })
}

export function useUpdateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      clientsCatalogService.updateClient(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "clients"] }),
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => clientsCatalogService.deleteClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog", "clients"] })
      qc.invalidateQueries({ queryKey: ["catalog", "job-sites"] })
    },
  })
}

export function useAddJobSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clientId, name }: { clientId: number; name: string }) =>
      clientsCatalogService.addJobSite(clientId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "job-sites"] }),
  })
}

export function useUpdateJobSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      clientsCatalogService.updateJobSite(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "job-sites"] }),
  })
}

export function useDeleteJobSite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => clientsCatalogService.deleteJobSite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", "job-sites"] }),
  })
}
