package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ForecastRepository interface {
	List(ctx context.Context, filters domain.ForecastFilters) ([]*domain.ForecastProject, error)
	FindByID(ctx context.Context, id string) (*domain.ForecastProject, error)
	Create(ctx context.Context, p *domain.ForecastProject) error
	Update(ctx context.Context, p *domain.ForecastProject) error
	Delete(ctx context.Context, id string) error
	UpdateFieldwireStatus(ctx context.Context, fwID int64, status bool) error
	UpdateMachineStatus(ctx context.Context, machID int64, status string) error
	UpdateMachineUnit(ctx context.Context, machID int64, unit string) error
	UpdateContractStepStatus(ctx context.Context, stepID int64, status bool) error
	CreateContractStep(ctx context.Context, projectID string, team string, step string) (int64, error)
	DeleteContractTeam(ctx context.Context, projectID string, team string) error
	AddContractTeam(ctx context.Context, projectID string, team string) error
}

type PostgresForecastRepository struct {
	db *pgxpool.Pool
}

func NewPostgresForecastRepository(db *pgxpool.Pool) *PostgresForecastRepository {
	return &PostgresForecastRepository{db: db}
}

// statusToDisplay maps BOR1 status strings to BOR2 ForecastStatus values.
// Used as a SQL CASE expression in queries.
const statusCASE = `
	CASE lower(status)
		WHEN 'open'        THEN 'active'
		WHEN 'not started' THEN 'planned'
		WHEN 'closed'      THEN 'completed'
		ELSE                    'planned'
	END`

const forecastCTE = `
WITH mapped AS (
	SELECT
		id,
		COALESCE(company, 'framing')                                       AS company,
		COALESCE(NULLIF(name,''), NULLIF(lote_bld,''), cliente, '')        AS name,
		` + statusCASE + `                                                 AS status,
		COALESCE(previous_start_date, CURRENT_DATE)                        AS start_date,
		COALESCE(previous_end_date,   CURRENT_DATE)                        AS end_date,
		COALESCE(contract_value, 0.0)                                      AS contract_value,
		COALESCE(team, '')                                                  AS team,
		COALESCE(qb_time, false)                                            AS qb_time,
		COALESCE(cliente,          '')    AS cliente,
		COALESCE(job_site,         '')    AS job_site,
		COALESCE(type,             '')    AS type,
		COALESCE(lote_bld,         '')    AS lote_bld,
		COALESCE(address,          '')    AS address,
		COALESCE(obs,              '')    AS obs,
		COALESCE(hvac,          false)    AS hvac,
		COALESCE(buildertrend,  false)    AS buildertrend,
		COALESCE(storage,       false)    AS storage,
		COALESCE(has_orders,    false)    AS has_orders,
		COALESCE(machine_provider, '')    AS machine_provider,
		previous_beams_date,
		previous_start_date,
		previous_end_date,
		COALESCE(create_datetime, lastupdate_datetimez, NOW())  AS created_at,
		COALESCE(lastupdate_datetimez, NOW())                   AS updated_at
	FROM forecast_core
)
`

const forecastSelect = `
SELECT
	m.id, m.company, m.name, m.status,
	m.start_date, m.end_date, m.contract_value, m.team, m.qb_time,
	m.cliente, m.job_site, m.type, m.lote_bld, m.address, m.obs,
	m.hvac, m.buildertrend, m.storage, m.has_orders, m.machine_provider,
	m.previous_beams_date, m.previous_start_date, m.previous_end_date,
	m.created_at, m.updated_at,
	COALESCE(
		(SELECT json_agg(json_build_object(
			'id',       fw.id,
			'status',   fw.status::text,
			'category', COALESCE(fw.category, ''),
			'document', COALESCE(fw.document, '')
		) ORDER BY fw.id)
		 FROM forecast_fieldwire fw WHERE LOWER(fw.project_id) = LOWER(m.id)),
		'[]'::json
	) AS fieldwire,
	COALESCE(
		(SELECT json_agg(json_build_object('id', mac.id, 'title', mac.title, 'unit', COALESCE(mac.unit,''), 'status', mac.status))
		 FROM forecast_machines mac WHERE LOWER(mac.project_id) = LOWER(m.id)),
		'[]'::json
	) AS machines,
	COALESCE(
		(SELECT json_agg(json_build_object('id', cs.id, 'team', cs.team, 'step', cs.step, 'status', cs.status::text))
		 FROM forecast_contract_steps cs WHERE LOWER(cs.project_id) = LOWER(m.id)),
		'[]'::json
	) AS contract_steps
FROM mapped m
`

func scanProject(scan func(...any) error) (*domain.ForecastProject, error) {
	p := &domain.ForecastProject{}
	var (
		fieldwireJSON     []byte
		machinesJSON      []byte
		contractStepsJSON []byte
	)
	if err := scan(
		&p.ID, &p.Company, &p.Name, &p.Status,
		&p.StartDate, &p.EndDate, &p.ContractValue, &p.Team, &p.QBTime,
		&p.Cliente, &p.JobSite, &p.Type, &p.LoteBld, &p.Address, &p.Obs,
		&p.Hvac, &p.Buildertrend, &p.Storage, &p.HasOrders, &p.MachineProvider,
		&p.PreviousBeamsDate, &p.PreviousStartDate, &p.PreviousEndDate,
		&p.CreatedAt, &p.UpdatedAt,
		&fieldwireJSON, &machinesJSON, &contractStepsJSON,
	); err != nil {
		return nil, err
	}
	json.Unmarshal(fieldwireJSON, &p.Fieldwire)         //nolint:errcheck
	json.Unmarshal(machinesJSON, &p.Machines)           //nolint:errcheck
	json.Unmarshal(contractStepsJSON, &p.ContractSteps) //nolint:errcheck
	return p, nil
}

func (r *PostgresForecastRepository) List(ctx context.Context, f domain.ForecastFilters) ([]*domain.ForecastProject, error) {
	query := forecastCTE + forecastSelect + `
WHERE ($1 = '' OR m.company = $1)
  AND ($2 = '' OR m.status  = $2)
  AND ($3 = 0  OR EXTRACT(YEAR FROM m.start_date) = $3)
ORDER BY m.start_date ASC
`
	rows, err := r.db.Query(ctx, query, f.Company, string(f.Status), f.Year)
	if err != nil {
		return nil, fmt.Errorf("list forecast: %w", err)
	}
	defer rows.Close()

	var projects []*domain.ForecastProject
	for rows.Next() {
		p, err := scanProject(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("scan forecast row: %w", err)
		}
		projects = append(projects, p)
	}
	return projects, nil
}

func (r *PostgresForecastRepository) FindByID(ctx context.Context, id string) (*domain.ForecastProject, error) {
	query := forecastCTE + forecastSelect + `WHERE m.id = $1`
	row := r.db.QueryRow(ctx, query, id)
	p, err := scanProject(row.Scan)
	if err != nil {
		return nil, fmt.Errorf("find forecast by id: %w", err)
	}
	return p, nil
}

func (r *PostgresForecastRepository) Create(ctx context.Context, p *domain.ForecastProject) error {
	now := time.Now()
	if _, err := r.db.Exec(ctx, `
		INSERT INTO forecast_core
		  (id, name, company, status,
		   previous_beams_date, previous_start_date, previous_end_date,
		   contract_value, team, qb_time,
		   cliente, job_site, type, lote_bld, address, obs,
		   hvac, buildertrend, storage, has_orders, machine_provider,
		   create_datetime, lastupdate_datetimez)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22)
	`,
		p.ID, p.Name, p.Company, statusToBOR1(p.Status),
		p.PreviousBeamsDate, p.PreviousStartDate, p.PreviousEndDate,
		p.ContractValue, p.Team, p.QBTime,
		p.Cliente, p.JobSite, p.Type, p.LoteBld, p.Address, p.Obs,
		p.Hvac, p.Buildertrend, p.Storage, p.HasOrders, p.MachineProvider,
		now,
	); err != nil {
		return err
	}

	// Auto-seed fieldwire docs from catalog:
	// - client+type specific entries (matched by project cliente and type)
	// - universal entries (client = '' and type = '' → apply to all projects)
	if _, err := r.db.Exec(ctx, `
		WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_fieldwire)
		INSERT INTO forecast_fieldwire (id, project_id, category, document, status)
		SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY c.document),
		       $1,
		       CASE WHEN c.client = '' THEN '' ELSE c.client || ' – ' || c.type END,
		       c.document,
		       false
		FROM catalog_forecast_fieldwire c, max_id
		WHERE (LOWER(c.client) = LOWER($2) AND LOWER(c.type) = LOWER($3))
		   OR (LOWER(c.client) = LOWER($2) AND c.type = '')
		   OR (c.client = '' AND c.type = '')
	`, p.ID, p.Cliente, p.Type); err != nil {
		return fmt.Errorf("seeding fieldwire docs: %w", err)
	}

	// Auto-seed machines from catalog based on client (category) + type (subcategory).
	if _, err := r.db.Exec(ctx, `
		WITH max_id AS (SELECT COALESCE(MAX(id), 0) AS m FROM forecast_machines)
		INSERT INTO forecast_machines (id, project_id, category, subcategory, equipment_category, title, unit, status)
		SELECT max_id.m + ROW_NUMBER() OVER (ORDER BY c.id),
		       $1,
		       c.category,
		       c.subcategory,
		       c.equipment_category,
		       c.title,
		       '',
		       NULL
		FROM catalog_forecast_machines c, max_id
		WHERE LOWER(c.category)    = LOWER($2)
		  AND LOWER(c.subcategory) = LOWER($3)
	`, p.ID, p.Cliente, p.Type); err != nil {
		return fmt.Errorf("seeding machines: %w", err)
	}

	return nil
}

func (r *PostgresForecastRepository) Update(ctx context.Context, p *domain.ForecastProject) error {
	_, err := r.db.Exec(ctx, `
		UPDATE forecast_core SET
		  name=$1, status=$2,
		  previous_beams_date=$3, previous_start_date=$4, previous_end_date=$5,
		  contract_value=$6, team=$7, qb_time=$8,
		  cliente=$9, job_site=$10, type=$11, lote_bld=$12,
		  address=$13, obs=$14,
		  hvac=$15, buildertrend=$16, storage=$17, has_orders=$18, machine_provider=$19,
		  lastupdate_datetimez=NOW()
		WHERE id=$20
	`,
		p.Name, statusToBOR1(p.Status),
		p.PreviousBeamsDate, p.PreviousStartDate, p.PreviousEndDate,
		p.ContractValue, p.Team, p.QBTime,
		p.Cliente, p.JobSite, p.Type, p.LoteBld,
		p.Address, p.Obs,
		p.Hvac, p.Buildertrend, p.Storage, p.HasOrders, p.MachineProvider,
		p.ID,
	)
	return err
}

func (r *PostgresForecastRepository) Delete(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "DELETE FROM forecast_core WHERE id=$1", id)
	return err
}

func (r *PostgresForecastRepository) UpdateFieldwireStatus(ctx context.Context, fwID int64, status bool) error {
	_, err := r.db.Exec(ctx,
		"UPDATE forecast_fieldwire SET status=$1 WHERE id=$2",
		status, fwID,
	)
	return err
}

func (r *PostgresForecastRepository) UpdateMachineStatus(ctx context.Context, machID int64, status string) error {
	var val *string
	if status != "" {
		val = &status
	}
	_, err := r.db.Exec(ctx,
		"UPDATE forecast_machines SET status=$1 WHERE id=$2",
		val, machID,
	)
	return err
}

func (r *PostgresForecastRepository) UpdateMachineUnit(ctx context.Context, machID int64, unit string) error {
	_, err := r.db.Exec(ctx,
		"UPDATE forecast_machines SET unit=$1 WHERE id=$2",
		unit, machID,
	)
	return err
}

func (r *PostgresForecastRepository) UpdateContractStepStatus(ctx context.Context, stepID int64, status bool) error {
	_, err := r.db.Exec(ctx,
		"UPDATE forecast_contract_steps SET status=$1 WHERE id=$2",
		status, stepID,
	)
	return err
}

func (r *PostgresForecastRepository) CreateContractStep(ctx context.Context, projectID string, team string, step string) (int64, error) {
	var id int64
	err := r.db.QueryRow(ctx, `
		INSERT INTO forecast_contract_steps (id, project_id, team, step, status)
		SELECT COALESCE(MAX(id), 0) + 1, $1, $2, $3, false FROM forecast_contract_steps
		RETURNING id`,
		projectID, team, step,
	).Scan(&id)
	return id, err
}

func (r *PostgresForecastRepository) DeleteContractTeam(ctx context.Context, projectID string, team string) error {
	var count int
	if err := r.db.QueryRow(ctx,
		"SELECT COUNT(*) FROM forecast_contract_steps WHERE LOWER(project_id)=LOWER($1) AND team=$2 AND status=true",
		projectID, team,
	).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("cannot delete team with active steps")
	}
	_, err := r.db.Exec(ctx,
		"DELETE FROM forecast_contract_steps WHERE LOWER(project_id)=LOWER($1) AND team=$2",
		projectID, team,
	)
	return err
}

func (r *PostgresForecastRepository) AddContractTeam(ctx context.Context, projectID string, team string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO forecast_contract_steps (id, project_id, team, step, status)
		SELECT
			(SELECT COALESCE(MAX(id), 0) FROM forecast_contract_steps) + row_number() OVER (),
			$1, $2, cs.step, false
		FROM catalog_forecast_contract_steps cs
		WHERE NOT EXISTS (
			SELECT 1 FROM forecast_contract_steps fcs
			WHERE LOWER(fcs.project_id) = LOWER($1) AND fcs.team = $2
		)
	`, projectID, team)
	return err
}

// statusToBOR1 converts BOR2 status enum back to BOR1 string for writes.
func statusToBOR1(s domain.ForecastStatus) string {
	switch s {
	case domain.ForecastStatusActive:
		return "open"
	case domain.ForecastStatusCompleted:
		return "closed"
	default:
		return "not started"
	}
}

// nullTime returns nil if t is zero, otherwise a pointer to t.
func nullTime(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t
}
