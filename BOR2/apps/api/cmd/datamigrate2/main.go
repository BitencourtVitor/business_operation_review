package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	_ "strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/joho/godotenv"
)

var (
	supabaseURL string
	supabaseKey string
	conn        *pgx.Conn
)

func main() {
	_ = godotenv.Load()
	supabaseURL = os.Getenv("SUPABASE_URL")
	supabaseKey = os.Getenv("SUPABASE_KEY")
	dbURL := os.Getenv("DATABASE_URL")
	if supabaseURL == "" || supabaseKey == "" || dbURL == "" {
		log.Fatal("SUPABASE_URL, SUPABASE_KEY, DATABASE_URL required")
	}
	var err error
	conn, err = pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(context.Background())

	fmt.Println("=== BOR1 → BOR2 Data Migration (Round 2) ===\n")

	migrate("wex_transactions", func(r map[string]interface{}) error {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO wex_transactions (id, transaction_key, transaction_date, driver_name, units, total_fuel_cost, merchant_city)
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
			ON CONFLICT (transaction_key) DO NOTHING`,
			str(r, "transaction_key"), parseDate(r, "transaction_date"), str(r, "nome"),
			num(r, "units"), num(r, "valor"), str(r, "local"))
		return err
	})

	migrate("employee_names", func(r map[string]interface{}) error {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO employee_names (wex_name, samsara_name, normalized_name, is_active, vehicle_model, vehicle_min_consumption, vehicle_max_consumption)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			str(r, "wex_name"), str(r, "samsara_name"), str(r, "normalized_name"),
			boolVal(r, "is_active"), str(r, "vehicle_model"),
			num(r, "vehicle_min_consumption"), num(r, "vehicle_max_consumption"))
		return err
	})

	migrate("timesheet_analysis", func(r map[string]interface{}) error {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO timesheet_analysis (date, nome, error, team, corporation, payrate, add_time_hour, remove_time_hour, add_dollar, remove_dollar, total, jobsite, lot_building, worktype, regular_hours)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
			parseDate(r, "date"), str(r, "nome"), str(r, "error"), str(r, "team"),
			str(r, "corporation"), num(r, "payrate"), num(r, "add_time_hour"),
			num(r, "remove_time_hour"), num(r, "add_dollar"), num(r, "remove_dollar"),
			num(r, "total"), str(r, "jobsite"), str(r, "lot_building"),
			str(r, "worktype"), num(r, "regular_hours"))
		return err
	})

	migrate("project_monitoring_hvac", func(r map[string]interface{}) error {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO project_monitoring_hvac (city, job_site, lot_number, team, start_date, finish_date, s1_rough, s1_date, s2_machines, s2_date, s3_condenser, s3_date, s4_finish, s4_date, percent_completed, notes)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
			str(r, "city"), str(r, "job_site"), str(r, "lot_number"), str(r, "team"),
			parseDate(r, "start_date"), parseDate(r, "finish_date"),
			str(r, "s1_rough"), parseDate(r, "s1_date"),
			str(r, "s2_machines"), parseDate(r, "s2_date"),
			str(r, "s3_condenser"), parseDate(r, "s3_date"),
			str(r, "s4_finish"), parseDate(r, "s4_date"),
			num(r, "percent_completed"), str(r, "notes"))
		return err
	})

	migrate("subcontractor_performance", func(r map[string]interface{}) error {
		evtDt := str(r, "event_datetime")
		var evtTime *time.Time
		if evtDt != "" && evtDt != "null" {
			for _, l := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04:05Z"} {
				if t, e := time.Parse(l, evtDt); e == nil {
					evtTime = &t
					break
				}
			}
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO subcontractor_events (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
			VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
			str(r, "obra_id"), str(r, "event"), str(r, "estimated_date_type"),
			str(r, "subcontractor"), evtTime, str(r, "user_email"))
		return err
	})

	migrate("receivables_accounting", func(r map[string]interface{}) error {
		internID := str(r, "intern_id")
		if internID == "" {
			internID = str(r, "id")
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO receivables_accounting (intern_id, date_field, inv_date, transaction_type, inv_num, customer_full_name, due_date, open_balance, category, aging_intervals)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (intern_id) DO NOTHING`,
			internID, parseDate(r, "date_field"), parseDate(r, "inv_date"),
			str(r, "transaction_type"), str(r, "inv_num"), str(r, "customer_full_name"),
			parseDate(r, "due_date"), num(r, "open_balance"), str(r, "category"), str(r, "aging_intervals"))
		return err
	})

	migrate("payables_accounting", func(r map[string]interface{}) error {
		internID := str(r, "intern_id")
		if internID == "" {
			internID = str(r, "id")
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO payables_accounting (intern_id, date_field, expense_date, transaction_type, bill_num, vendor_display_name, due_date, open_balance, category, aging_intervals)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (intern_id) DO NOTHING`,
			internID, parseDate(r, "date_field"), parseDate(r, "expense_date"),
			str(r, "transaction_type"), str(r, "bill_num"), str(r, "vendor_display_name"),
			parseDate(r, "due_date"), num(r, "open_balance"), str(r, "category"), str(r, "aging_intervals"))
		return err
	})

	migrate("operational_forecast_index", func(r map[string]interface{}) error {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO operational_forecast_index (obra_id, reference_month, reference_year, fieldwire_score, machines_score, contract_score, systems_score, total_score)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			str(r, "obra_id"), int(num(r, "reference_month")), int(num(r, "reference_year")),
			num(r, "fieldwire_score"), num(r, "machines_score"), num(r, "contract_score"),
			num(r, "systems_score"), num(r, "total_score"))
		return err
	})

	migrate("takeoff_works", func(r map[string]interface{}) error {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO takeoff_works (project, data_solicitacao, data_inicio, data_estimada_entrega, entrega_real, description, doc_links, modelo_da_casa)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
			str(r, "project"), parseDate(r, "data_solicitacao"), parseDate(r, "data_inicio"),
			parseDate(r, "data_estimada_entrega"), parseDate(r, "entrega_real"),
			str(r, "description"), str(r, "doc_links"), str(r, "modelo_da_casa"))
		return err
	})

	fmt.Println("\n=== Migration Complete ===")
}

func migrate(table string, insert func(map[string]interface{}) error) {
	rows, err := fetchAll(table)
	if err != nil {
		fmt.Printf("✗ %-35s %v\n", table, err)
		return
	}
	count := 0
	for _, r := range rows {
		if insert(r) == nil {
			count++
		}
	}
	fmt.Printf("✓ %-35s %d/%d\n", table, count, len(rows))
}

func fetchAll(table string) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	offset := 0
	for {
		url := fmt.Sprintf("%s/rest/v1/%s?select=*&offset=%d&limit=1000", supabaseURL, table, offset)
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("apikey", supabaseKey)
		req.Header.Set("Authorization", "Bearer "+supabaseKey)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("%d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
		}
		var rows []map[string]interface{}
		json.Unmarshal(body, &rows)
		all = append(all, rows...)
		if len(rows) < 1000 {
			break
		}
		offset += 1000
	}
	return all, nil
}

func str(m map[string]interface{}, k string) string {
	if v, ok := m[k]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}
func num(m map[string]interface{}, k string) float64 {
	if v, ok := m[k]; ok && v != nil {
		switch n := v.(type) {
		case float64:
			return n
		case json.Number:
			f, _ := n.Float64()
			return f
		}
	}
	return 0
}
func boolVal(m map[string]interface{}, k string) bool {
	if v, ok := m[k]; ok && v != nil {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return false
}
func parseDate(m map[string]interface{}, k string) *time.Time {
	s := str(m, k)
	if s == "" || s == "null" {
		return nil
	}
	for _, l := range []string{"2006-01-02", "2006-01-02T15:04:05", "2006-01-02T15:04:05Z", "01/02/2006", time.RFC3339} {
		if t, err := time.Parse(l, s); err == nil {
			return &t
		}
	}
	return nil
}
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
