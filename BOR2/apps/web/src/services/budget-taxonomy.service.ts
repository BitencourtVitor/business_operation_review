import { api } from "@/lib/api"
import { useAuthStore } from "@/store/auth.store"

function getToken() {
  return useAuthStore.getState().token ?? ""
}

export type ProjectType = "house" | "building"

export interface Category {
  id: string
  project_type: ProjectType
  name: string
  icon: string
  sort_order: number
  default_max: number | null
  active: boolean
}

export interface AccountMapping {
  account_ref_id: string
  account_name: string
  account_type: string
  category_id: string | null
  category_name: string | null
}

export interface VendorMapping {
  vendor_id: string
  display_name: string
  category_id: string | null
  category_name: string | null
}

export interface ProjectLimit {
  category_id: string
  max_value: number
}

export interface ProjectVendorCategory {
  vendor_id: string
  category_id: string
}

export interface VendorLimit {
  category_id: string
  vendor_id: string
  amount: number
}

export const budgetTaxonomyService = {
  listCategories: (projectType?: ProjectType) =>
    api.get<Category[]>(`/api/v1/budget/categories${projectType ? `?project_type=${projectType}` : ""}`, getToken()).then(r => r ?? []),

  createCategory: (body: Partial<Category>) =>
    api.post<{ id: string }>(`/api/v1/budget/categories`, body, getToken()),

  updateCategory: (id: string, body: Partial<Category>) =>
    api.put(`/api/v1/budget/categories/${id}`, body, getToken()),

  deleteCategory: (id: string) =>
    api.delete(`/api/v1/budget/categories/${id}`, getToken()),

  listAccountMappings: (company: string, projectType: ProjectType) =>
    api.get<AccountMapping[]>(`/api/v1/budget/account-categories?company=${company}&project_type=${projectType}`, getToken()).then(r => r ?? []),

  setAccountMapping: (body: { company: string; account_ref_id: string; project_type: ProjectType; category_id: string | null }) =>
    api.put(`/api/v1/budget/account-categories`, body, getToken()),

  listVendorMappings: (company: string, projectType: ProjectType) =>
    api.get<VendorMapping[]>(`/api/v1/budget/vendor-categories?company=${company}&project_type=${projectType}`, getToken()).then(r => r ?? []),

  setVendorMapping: (body: { company: string; vendor_id: string; project_type: ProjectType; category_id: string | null }) =>
    api.put(`/api/v1/budget/vendor-categories`, body, getToken()),

  listProjectLimits: (company: string, projectId: string) =>
    api.get<ProjectLimit[]>(`/api/v1/budget/project-limits?company=${company}&project_id=${encodeURIComponent(projectId)}`, getToken()).then(r => r ?? []),

  setProjectLimit: (body: { company: string; project_id: string; category_id: string; max_value: number }) =>
    api.put(`/api/v1/budget/project-limits`, body, getToken()),

  // Per-project vendor→category override ("cada sub pode ir pra outra categoria
  // em determinada obra"). category_id null reverts to the global mapping.
  listProjectVendorCategories: (company: string, projectId: string) =>
    api.get<ProjectVendorCategory[]>(`/api/v1/budget/project-vendor-categories?company=${company}&project_id=${encodeURIComponent(projectId)}`, getToken()).then(r => r ?? []),

  setProjectVendorCategory: (body: { company: string; project_id: string; vendor_id: string; category_id: string | null }) =>
    api.put(`/api/v1/budget/project-vendor-categories`, body, getToken()),

  // Per-sub budget within a category, per project.
  listVendorLimits: (company: string, projectId: string) =>
    api.get<VendorLimit[]>(`/api/v1/budget/vendor-limits?company=${company}&project_id=${encodeURIComponent(projectId)}`, getToken()).then(r => r ?? []),

  setVendorLimit: (body: { company: string; project_id: string; category_id: string; vendor_id: string; amount: number }) =>
    api.put(`/api/v1/budget/vendor-limits`, body, getToken()),
}
