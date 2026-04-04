-- Remove seeded screens
DELETE FROM telas WHERE descricao IN (
  'Dashboard',
  'Takeoff Works',
  'AutoLog',
  'Data Control',
  'Forecast',
  'Fuel',
  'Accounting',
  'Permits',
  'Service Requests',
  'Subcontractors',
  'Timesheets',
  'Upload Timesheet',
  'OFI',
  'Workforce',
  'Project Monitoring',
  'Monthly Execution',
  'Inventory',
  'Settings'
);
