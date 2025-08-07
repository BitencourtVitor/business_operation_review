export interface ProjectMonitoringHvacRow {
  id: string;
  city: string;
  job_site: string;
  lot_number: string;
  team: string;
  start_date: string;
  finish_date: string;
  s1_rough: string;
  s2_machines: string;
  s3_condenser: string;
  s4_finish: string;
  percent_completed: number;
  last_update: string;
  notes: string;
  created_at: string;
  // Campos adicionais para compatibilidade
  project_name?: string;
  location?: string;
  status?: string;
  planning_date?: string;
  completion_date?: string;
}

export interface ProjectMonitoringHvacFilters {
  selectedCity?: string;
  selectedJobSite?: string;
  selectedTeam?: string;
  selectedStatus?: string;
}

export interface ProjectMonitoringHvacMetrics {
  totalProjects: number;
  completedProjects: number;
  inProgressProjects: number;
  averageCompletion: number;
  projectsByStatus: {
    [key: string]: number;
  };
}
