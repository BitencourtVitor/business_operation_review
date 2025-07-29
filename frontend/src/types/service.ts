export interface ServiceRequestRow {
  id: string;
  contractor: string;
  job_site: string;
  city: string;
  lot: string;
  address: string;
  close_date: string;
  date_received: string;
  material_available_date: string;
  resident_available_date: string;
  date_completed: string;
  additional_visits: string[];
  issue: string;
  warranty: boolean;
  cost: number;
  tech: string;
  created_at: string;
}

export interface ServiceRequestFilters {
  selectedYear: string;
  selectedMonth: string;
  selectedContractor: string[];
  selectedJobsite: string[];
  selectedCity: string[];
  selectedIssue: string[];
  selectedTech: string[];
}

export interface ServiceRequestMetrics {
  totalRequests: number;
  openRequests: number;
  inProgressRequests: number;
  closedRequests: number;
  avgResolutionTime: number;
} 