package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type MaintenanceContractRepository interface {
	List(ctx context.Context) ([]*domain.MaintenanceContract, error)
	SearchInvoices(ctx context.Context, q string) ([]domain.MaintenanceInvoice, error)
	Create(ctx context.Context, m *domain.MaintenanceContract) (string, error)
	Update(ctx context.Context, m *domain.MaintenanceContract) (bool, error)
	Delete(ctx context.Context, id string) (bool, error)
	ListComments(ctx context.Context, contractID string) ([]domain.MaintenanceComment, error)
	AddComment(ctx context.Context, contractID string, c *domain.MaintenanceComment) error
	UpdateComment(ctx context.Context, contractID string, commentID int64, authorID, body string) (bool, error)
	DeleteComment(ctx context.Context, contractID string, commentID int64, authorID string) (bool, error)
}

type PostgresMaintenanceContractRepository struct {
	db *pgxpool.Pool
}

func NewPostgresMaintenanceContractRepository(db *pgxpool.Pool) *PostgresMaintenanceContractRepository {
	return &PostgresMaintenanceContractRepository{db: db}
}

// invoiceJSON monta a invoice como a página lê, a partir de `q` (qb_invoices):
// valores, cliente no QuickBooks, itens e a data do último pagamento.
const invoiceJSON = `json_build_object(
	'number', q.doc_number, 'customer', q.customer_name,
	'date', q.txn_date::text, 'dueDate', q.due_date::text,
	'total', q.total_amount, 'balance', q.balance,
	'paidOn', (SELECT max(p.txn_date)::text FROM qb_invoice_links l
	           JOIN qb_payments p ON p.company = l.company AND p.external_id = l.linked_txn_id
	           WHERE l.invoice_id = q.id AND l.linked_txn_type = 'Payment'),
	'lines', COALESCE((SELECT json_agg(json_build_object('description', il.description, 'amount', il.amount))
	                   FROM qb_invoice_lines il WHERE il.invoice_id = q.id), '[]'))`

// List traz cada contrato com as suas invoices do QuickBooks da HVAC, casadas
// pelo número (doc_number). Número sem par no QuickBooks volta com found=false.
func (r *PostgresMaintenanceContractRepository) List(ctx context.Context) ([]*domain.MaintenanceContract, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.id, c.client_name, c.address, c.city, c.phone, c.email,
		       c.plan_sent_on::text, c.contract_start::text, c.contract_value, c.invoices,
		       c.first_service::text, c.second_service::text, c.archived,
		       COALESCE((
		         SELECT json_agg(CASE WHEN q.id IS NULL
		                  THEN jsonb_build_object('number', u.n, 'found', false)
		                  ELSE (`+invoiceJSON+`)::jsonb || '{"found": true}' END ORDER BY o)
		         FROM unnest(c.invoices) WITH ORDINALITY AS u(n, o)
		         LEFT JOIN qb_invoices q ON q.company = 'hvac' AND q.doc_number = u.n
		       ), '[]')
		FROM hvac_maintenance_contracts c
		ORDER BY c.client_name
	`)
	if err != nil {
		return nil, fmt.Errorf("list hvac_maintenance_contracts: %w", err)
	}
	defer rows.Close()

	var out []*domain.MaintenanceContract
	for rows.Next() {
		m := &domain.MaintenanceContract{}
		var inv []byte
		if err := rows.Scan(&m.ID, &m.ClientName, &m.Address, &m.City, &m.Phone, &m.Email,
			&m.PlanSentOn, &m.ContractStart, &m.ContractValue, &m.Invoices,
			&m.FirstService, &m.SecondService, &m.Archived, &inv); err != nil {
			return nil, fmt.Errorf("scan hvac_maintenance_contracts: %w", err)
		}
		if err := json.Unmarshal(inv, &m.InvoiceStatus); err != nil {
			return nil, fmt.Errorf("decode invoices: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// SearchInvoices procura invoices da HVAC por número ou cliente do QuickBooks,
// as mais novas primeiro, e diz a qual contrato cada uma já está ligada.
func (r *PostgresMaintenanceContractRepository) SearchInvoices(ctx context.Context, q string) ([]domain.MaintenanceInvoice, error) {
	var raw []byte
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(json_agg(x ORDER BY x->>'date' DESC NULLS LAST), '[]') FROM (
		  SELECT (`+invoiceJSON+`)::jsonb || jsonb_build_object('found', true, 'linkedTo',
		           (SELECT string_agg(c.client_name, ', ') FROM hvac_maintenance_contracts c WHERE q.doc_number = ANY(c.invoices))) AS x
		  FROM qb_invoices q
		  WHERE q.company = 'hvac'
		    AND ($1 = '' OR q.doc_number ILIKE $1 || '%' OR q.customer_name ILIKE '%' || $1 || '%')
		  ORDER BY q.txn_date DESC NULLS LAST
		  LIMIT 20
		) s
	`, q).Scan(&raw)
	if err != nil {
		return nil, fmt.Errorf("search qb_invoices: %w", err)
	}
	var out []domain.MaintenanceInvoice
	return out, json.Unmarshal(raw, &out)
}

func (r *PostgresMaintenanceContractRepository) Create(ctx context.Context, m *domain.MaintenanceContract) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, `
		INSERT INTO hvac_maintenance_contracts
		  (client_name, address, city, phone, email, plan_sent_on, contract_start,
		   invoices, first_service, second_service, archived, contract_value)
		VALUES ($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9::date,$10::date,$11,$12)
		RETURNING id
	`, m.ClientName, m.Address, m.City, m.Phone, m.Email, m.PlanSentOn, m.ContractStart,
		m.Invoices, m.FirstService, m.SecondService, m.Archived, m.ContractValue).Scan(&id)
	return id, err
}

func (r *PostgresMaintenanceContractRepository) Update(ctx context.Context, m *domain.MaintenanceContract) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE hvac_maintenance_contracts
		SET client_name=$1, address=$2, city=$3, phone=$4, email=$5,
		    plan_sent_on=$6::date, contract_start=$7::date, invoices=$8,
		    first_service=$9::date, second_service=$10::date, archived=$11,
		    contract_value=$13, updated_at=now()
		WHERE id=$12
	`, m.ClientName, m.Address, m.City, m.Phone, m.Email, m.PlanSentOn, m.ContractStart,
		m.Invoices, m.FirstService, m.SecondService, m.Archived, m.ID, m.ContractValue)
	return tag.RowsAffected() > 0, err
}

func (r *PostgresMaintenanceContractRepository) Delete(ctx context.Context, id string) (bool, error) {
	tag, err := r.db.Exec(ctx, "DELETE FROM hvac_maintenance_contracts WHERE id=$1", id)
	return tag.RowsAffected() > 0, err
}

func (r *PostgresMaintenanceContractRepository) ListComments(ctx context.Context, contractID string) ([]domain.MaintenanceComment, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, body, author_id, author_name, author_role, created_at
		FROM hvac_maintenance_comments
		WHERE contract_id = $1
		ORDER BY created_at, id
	`, contractID)
	if err != nil {
		return nil, fmt.Errorf("list hvac_maintenance_comments: %w", err)
	}
	defer rows.Close()
	out := []domain.MaintenanceComment{}
	for rows.Next() {
		var c domain.MaintenanceComment
		if err := rows.Scan(&c.ID, &c.Body, &c.AuthorID, &c.AuthorName, &c.AuthorRole, &c.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan hvac_maintenance_comments: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *PostgresMaintenanceContractRepository) AddComment(ctx context.Context, contractID string, c *domain.MaintenanceComment) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO hvac_maintenance_comments (contract_id, body, author_id, author_name, author_role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`, contractID, c.Body, c.AuthorID, c.AuthorName, c.AuthorRole).Scan(&c.ID, &c.CreatedAt)
}

// UpdateComment e DeleteComment só acham o comentário de quem o escreveu: para
// os outros ele simplesmente não existe.
func (r *PostgresMaintenanceContractRepository) UpdateComment(ctx context.Context, contractID string, commentID int64, authorID, body string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		UPDATE hvac_maintenance_comments SET body = $4
		WHERE id = $1 AND contract_id = $2 AND author_id = $3
	`, commentID, contractID, authorID, body)
	return tag.RowsAffected() > 0, err
}

func (r *PostgresMaintenanceContractRepository) DeleteComment(ctx context.Context, contractID string, commentID int64, authorID string) (bool, error) {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM hvac_maintenance_comments
		WHERE id = $1 AND contract_id = $2 AND author_id = $3
	`, commentID, contractID, authorID)
	return tag.RowsAffected() > 0, err
}
