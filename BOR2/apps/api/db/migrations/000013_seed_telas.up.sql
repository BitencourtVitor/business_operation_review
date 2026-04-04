-- Insert available screens/pages
INSERT INTO telas (descricao) VALUES
  ('Dashboard'),
  ('Takeoff Works'),
  ('AutoLog'),
  ('Data Control'),
  ('Forecast'),
  ('Fuel'),
  ('Accounting'),
  ('Permits'),
  ('Service Requests'),
  ('Subcontractors'),
  ('Timesheets'),
  ('Upload Timesheet'),
  ('OFI'),
  ('Workforce'),
  ('Project Monitoring'),
  ('Monthly Execution'),
  ('Inventory'),
  ('Settings')
ON CONFLICT DO NOTHING;
