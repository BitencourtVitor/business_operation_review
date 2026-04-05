-- 000014_user_permissions_jsonb.up.sql
-- Replaces usuarios_telas (UUID junction) with a single JSONB row per user.

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     TEXT        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB       NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate existing data from usuarios_telas → user_permissions
INSERT INTO user_permissions (user_id, permissions)
SELECT
  ut.usuario_id,
  jsonb_object_agg(
    CASE t.descricao
      WHEN 'Dashboard'           THEN 'dashboard'
      WHEN 'Takeoff Works'       THEN 'takeoff'
      WHEN 'AutoLog'             THEN 'autolog'
      WHEN 'Data Control'        THEN 'data_control'
      WHEN 'Forecast'            THEN 'forecast'
      WHEN 'Fuel'                THEN 'fuel'
      WHEN 'Accounting'          THEN 'accounting'
      WHEN 'Permits'             THEN 'permits'
      WHEN 'Service Requests'    THEN 'service_requests'
      WHEN 'Subcontractors'      THEN 'subcontractors'
      WHEN 'Timesheets'          THEN 'timesheet'
      WHEN 'Upload Timesheet'    THEN 'upload_timesheet'
      WHEN 'OFI'                 THEN 'ofi'
      WHEN 'Workforce'           THEN 'workforce'
      WHEN 'Project Monitoring'  THEN 'project_monitoring'
      WHEN 'Monthly Execution'   THEN 'monthly_execution'
      WHEN 'Inventory'           THEN 'inventory'
      WHEN 'Settings'            THEN 'settings'
      ELSE lower(replace(t.descricao, ' ', '_'))
    END,
    true
  ) AS permissions
FROM   usuarios_telas ut
JOIN   telas          t  ON t.id = ut.tela_id
GROUP  BY ut.usuario_id
ON CONFLICT (user_id) DO UPDATE
  SET permissions = EXCLUDED.permissions,
      updated_at  = NOW();
