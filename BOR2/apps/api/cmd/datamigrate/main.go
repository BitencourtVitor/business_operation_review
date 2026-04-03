package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
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
		log.Fatal("SUPABASE_URL, SUPABASE_KEY, and DATABASE_URL are required")
	}

	var err error
	conn, err = pgx.Connect(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("db connect error: %v", err)
	}
	defer conn.Close(context.Background())

	fmt.Println("=== BOR1 → BOR2 Data Migration ===\n")

	// Migrate each table
	migrateForecasts()
	migratePermitControl()
	migrateServiceRequests()
	migrateSamsaraEvents()
	migrateWexTransactions()
	migrateEmployeeNames()
	migrateTimesheetAnalysis()
	migrateTimesheetDataNew()
	migrateProjectMonitoringHvac()
	migrateSubcontractorEvents()
	migrateReceivables()
	migratePayables()

	fmt.Println("\n=== Migration Complete ===")
}

// fetchSupabase fetches all rows from a Supabase table using REST API with pagination
func fetchSupabase(table string) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	offset := 0
	limit := 1000

	for {
		url := fmt.Sprintf("%s/rest/v1/%s?select=*&offset=%d&limit=%d", supabaseURL, table, offset, limit)
		req, _ := http.NewRequest("GET", url, nil)
		req.Header.Set("apikey", supabaseKey)
		req.Header.Set("Authorization", "Bearer "+supabaseKey)
		req.Header.Set("Prefer", "return=representation")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("fetch %s: %v", table, err)
		}

		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("fetch %s: %d %s", table, resp.StatusCode, string(body))
		}

		var rows []map[string]interface{}
		if err := json.Unmarshal(body, &rows); err != nil {
			return nil, fmt.Errorf("parse %s: %v", table, err)
		}

		all = append(all, rows...)

		if len(rows) < limit {
			break
		}
		offset += limit
	}

	return all, nil
}

func str(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func num(m map[string]interface{}, key string) float64 {
	if v, ok := m[key]; ok && v != nil {
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

func boolVal(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok && v != nil {
		switch b := v.(type) {
		case bool:
			return b
		}
	}
	return false
}

func parseDate(m map[string]interface{}, key string) *time.Time {
	s := str(m, key)
	if s == "" || s == "null" {
		return nil
	}
	for _, layout := range []string{"2006-01-02", "2006-01-02T15:04:05", "2006-01-02T15:04:05Z", "01/02/2006", time.RFC3339} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

func migrateForecasts() {
	rows, err := fetchSupabase("forecast_data")
	if err != nil {
		log.Printf("✗ forecast_data: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		id := str(r, "id")
		if id == "" {
			continue
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO forecast_projects (id, company, name, status, start_date, end_date, cliente, job_site, type, lote_bld, address, obs, hvac, buildertrend, storage, qb_time, machine_provider, previous_start_date, previous_end_date, previous_beams_date)
			VALUES ($1, 'framing', $2, 'planned', COALESCE($3, CURRENT_DATE), COALESCE($4, CURRENT_DATE), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $3, $4, $16)
			ON CONFLICT (id) DO UPDATE SET job_site=$6, cliente=$5, type=$7, lote_bld=$8, address=$9, obs=$10, hvac=$11, buildertrend=$12, storage=$13, qb_time=$14, machine_provider=$15
		`, id, str(r, "job_site"), parseDate(r, "previous_start_date"), parseDate(r, "previous_end_date"),
			str(r, "cliente"), str(r, "job_site"), str(r, "type"), str(r, "lote_bld"),
			str(r, "address"), str(r, "obs"), boolVal(r, "hvac"), boolVal(r, "buildertrend"),
			boolVal(r, "storage"), boolVal(r, "qbtime"), str(r, "machine_provider"),
			parseDate(r, "previous_beams_date"))
		if err != nil {
			log.Printf("  forecast %s: %v", id, err)
			continue
		}
		count++
	}
	fmt.Printf("✓ forecast_data: %d/%d rows\n", count, len(rows))

	// Sub-tables
	for _, sub := range []struct{ table, target string }{
		{"forecast_fieldwire", "forecast_fieldwire"},
		{"forecast_machines", "forecast_machines"},
		{"forecast_contract_steps", "forecast_contract_steps"},
	} {
		subRows, err := fetchSupabase(sub.table)
		if err != nil {
			log.Printf("✗ %s: %v", sub.table, err)
			continue
		}
		sc := 0
		for _, sr := range subRows {
			switch sub.target {
			case "forecast_fieldwire":
				_, err = conn.Exec(context.Background(), `INSERT INTO forecast_fieldwire (obra_id, category, document, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
					str(sr, "obra_id"), str(sr, "category"), str(sr, "document"), boolVal(sr, "status"))
			case "forecast_machines":
				_, err = conn.Exec(context.Background(), `INSERT INTO forecast_machines (obra_id, category, subcategory, equipment_category, title, status, unit) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
					str(sr, "obra_id"), str(sr, "category"), str(sr, "subcategory"), str(sr, "equipment_category"), str(sr, "title"), boolVal(sr, "status"), str(sr, "unit"))
			case "forecast_contract_steps":
				_, err = conn.Exec(context.Background(), `INSERT INTO forecast_contract_steps (obra_id, step, status, team) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
					str(sr, "obra_id"), str(sr, "step"), boolVal(sr, "status"), str(sr, "team"))
			}
			if err == nil {
				sc++
			}
		}
		fmt.Printf("✓ %s: %d/%d rows\n", sub.table, sc, len(subRows))
	}
}

func migratePermitControl() {
	rows, err := fetchSupabase("permit_control")
	if err != nil {
		log.Printf("✗ permit_control: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO permit_control (model, jobsite, lot_address, situacao, solicitacao, aplicacao, emissao, observacao, arquivo)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			str(r, "model"), str(r, "jobsite"), str(r, "lot_address"), str(r, "situacao"),
			parseDate(r, "solicitacao"), parseDate(r, "aplicacao"), parseDate(r, "emissao"),
			str(r, "observacao"), str(r, "arquivo"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ permit_control: %d/%d rows\n", count, len(rows))
}

func migrateServiceRequests() {
	rows, err := fetchSupabase("service_requests")
	if err != nil {
		log.Printf("✗ service_requests: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		// Parse additional_visits as text array
		var visits []string
		if v := str(r, "additional_visits"); v != "" && v != "null" {
			_ = json.Unmarshal([]byte(v), &visits)
		}

		_, err := conn.Exec(context.Background(), `
			INSERT INTO service_requests (contractor, job_site, city, lot, address, close_date, date_received, material_available_date, resident_available_date, date_completed, additional_visits, issue, warranty, tech)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
			str(r, "contractor"), str(r, "job_site"), str(r, "city"), str(r, "lot"),
			str(r, "address"), parseDate(r, "close_date"), parseDate(r, "date_received"),
			parseDate(r, "material_available_date"), parseDate(r, "resident_available_date"),
			parseDate(r, "date_completed"), visits, str(r, "issue"), boolVal(r, "warranty"), str(r, "tech"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ service_requests: %d/%d rows\n", count, len(rows))
}

func migrateSamsaraEvents() {
	rows, err := fetchSupabase("samsara_events")
	if err != nil {
		log.Printf("✗ samsara_events: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		eventType := str(r, "type")
		if eventType != "trip" && eventType != "idle" {
			eventType = "trip"
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO samsara_events (id, event_key, event_date, driver_name, location, distance, units, type)
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7)
			ON CONFLICT (event_key) DO NOTHING`,
			str(r, "event_key"), parseDate(r, "event_date"), str(r, "nome"),
			str(r, "local"), num(r, "distancia"), str(r, "units"), eventType)
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ samsara_events: %d/%d rows\n", count, len(rows))
}

func migrateWexTransactions() {
	rows, err := fetchSupabase("wex_transactions")
	if err != nil {
		log.Printf("✗ wex_transactions: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO wex_transactions (id, transaction_key, transaction_date, driver_name, units, total_fuel_cost, merchant_city)
			VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
			ON CONFLICT (transaction_key) DO NOTHING`,
			str(r, "transaction_key"), parseDate(r, "transaction_date"), str(r, "nome"),
			num(r, "units"), num(r, "valor"), str(r, "local"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ wex_transactions: %d/%d rows\n", count, len(rows))
}

func migrateEmployeeNames() {
	rows, err := fetchSupabase("employee_names")
	if err != nil {
		log.Printf("✗ employee_names: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO employee_names (wex_name, samsara_name, normalized_name, is_active, vehicle_model, vehicle_min_consumption, vehicle_max_consumption)
			VALUES ($1, $2, $3, $4, $5, $6, $7)`,
			str(r, "wex_name"), str(r, "samsara_name"), str(r, "normalized_name"),
			boolVal(r, "is_active"), str(r, "vehicle_model"),
			num(r, "vehicle_min_consumption"), num(r, "vehicle_max_consumption"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ employee_names: %d/%d rows\n", count, len(rows))
}

func migrateTimesheetAnalysis() {
	rows, err := fetchSupabase("timesheet_analysis")
	if err != nil {
		log.Printf("✗ timesheet_analysis: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO timesheet_analysis (date, nome, error, team, corporation, payrate, add_time_hour, remove_time_hour, add_dollar, remove_dollar, total, jobsite, lot_building, worktype, regular_hours)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
			parseDate(r, "date"), str(r, "nome"), str(r, "error"), str(r, "team"),
			str(r, "corporation"), num(r, "payrate"), num(r, "add_time_hour"),
			num(r, "remove_time_hour"), num(r, "add_dollar"), num(r, "remove_dollar"),
			num(r, "total"), str(r, "jobsite"), str(r, "lot_building"),
			str(r, "worktype"), num(r, "regular_hours"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ timesheet_analysis: %d/%d rows\n", count, len(rows))
}

func migrateTimesheetDataNew() {
	rows, err := fetchSupabase("timesheet_data_new")
	if err != nil {
		log.Printf("✗ timesheet_data_new: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		_, err := conn.Exec(context.Background(), `
			INSERT INTO timesheet_data_new (client, jobsite, lot_building, worktype, employee_name, regular_rate, regular_hours, reference_month, company)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			str(r, "client"), str(r, "jobsite"), str(r, "lot_building"), str(r, "worktype"),
			str(r, "employee_name"), num(r, "regular_rate"), num(r, "regular_hours"),
			str(r, "reference_month"), str(r, "company"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ timesheet_data_new: %d/%d rows\n", count, len(rows))
}

func migrateProjectMonitoringHvac() {
	rows, err := fetchSupabase("project_monitoring_hvac")
	if err != nil {
		log.Printf("✗ project_monitoring_hvac: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
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
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ project_monitoring_hvac: %d/%d rows\n", count, len(rows))
}

func migrateSubcontractorEvents() {
	rows, err := fetchSupabase("subcontractor_performance")
	if err != nil {
		log.Printf("✗ subcontractor_performance (events): %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		eventDt := str(r, "event_datetime")
		var eventTime *time.Time
		if eventDt != "" && eventDt != "null" {
			for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04:05Z"} {
				if t, err := time.Parse(layout, eventDt); err == nil {
					eventTime = &t
					break
				}
			}
		}

		_, err := conn.Exec(context.Background(), `
			INSERT INTO subcontractor_events (obra_id, event, estimated_date_type, subcontractor, event_datetime, user_email)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (obra_id, event, event_datetime) DO NOTHING`,
			str(r, "obra_id"), str(r, "event"), str(r, "estimated_date_type"),
			str(r, "subcontractor"), eventTime, str(r, "user_email"))
		if err == nil {
			count++
		}
	}
	fmt.Printf("✓ subcontractor_events: %d/%d rows\n", count, len(rows))
}

func migrateReceivables() {
	rows, err := fetchSupabase("receivables_accounting")
	if err != nil {
		log.Printf("✗ receivables_accounting: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		internID := str(r, "intern_id")
		if internID == "" {
			internID = str(r, "id")
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO receivables_accounting (intern_id, date_field, inv_date, transaction_type, inv_num, customer_full_name, due_date, open_balance, category, aging_intervals)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (intern_id) DO UPDATE SET open_balance=$8, aging_intervals=$10`,
			internID, parseDate(r, "date_field"), parseDate(r, "inv_date"),
			str(r, "transaction_type"), str(r, "inv_num"), str(r, "customer_full_name"),
			parseDate(r, "due_date"), num(r, "open_balance"), str(r, "category"),
			str(r, "aging_intervals"))
		if err == nil {
			count++
		} else if !strings.Contains(err.Error(), "duplicate") {
			log.Printf("  receivable: %v", err)
		}
	}
	fmt.Printf("✓ receivables_accounting: %d/%d rows\n", count, len(rows))
}

func migratePayables() {
	rows, err := fetchSupabase("payables_accounting")
	if err != nil {
		log.Printf("✗ payables_accounting: %v", err)
		return
	}
	count := 0
	for _, r := range rows {
		internID := str(r, "intern_id")
		if internID == "" {
			internID = str(r, "id")
		}
		_, err := conn.Exec(context.Background(), `
			INSERT INTO payables_accounting (intern_id, date_field, expense_date, transaction_type, bill_num, vendor_display_name, due_date, open_balance, category, aging_intervals)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
			ON CONFLICT (intern_id) DO UPDATE SET open_balance=$8, aging_intervals=$10`,
			internID, parseDate(r, "date_field"), parseDate(r, "expense_date"),
			str(r, "transaction_type"), str(r, "bill_num"), str(r, "vendor_display_name"),
			parseDate(r, "due_date"), num(r, "open_balance"), str(r, "category"),
			str(r, "aging_intervals"))
		if err == nil {
			count++
		} else if !strings.Contains(err.Error(), "duplicate") {
			log.Printf("  payable: %v", err)
		}
	}
	fmt.Printf("✓ payables_accounting: %d/%d rows\n", count, len(rows))
}
