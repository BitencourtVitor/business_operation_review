import { timesheetService } from "@/services/timesheet.service"
import { useQuery } from "@tanstack/react-query"

export function useTimesheets() {
  return useQuery({
    queryKey: ["timesheets"],
    queryFn: () => timesheetService.list(),
  })
}
