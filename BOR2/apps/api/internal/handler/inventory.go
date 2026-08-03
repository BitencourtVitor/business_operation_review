package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

// flexString unmarshals both JSON strings and JSON numbers into a Go string.
// Supabase may return integer IDs (e.g. product_id = 42) or UUID strings;
// this type handles both so json.Unmarshal never fails on type mismatch.
type flexString string

func (s *flexString) UnmarshalJSON(b []byte) error {
	trimmed := strings.TrimSpace(string(b))
	if len(trimmed) > 0 && trimmed[0] == '"' {
		// It's a JSON string — decode normally
		var str string
		if err := json.Unmarshal(b, &str); err != nil {
			return err
		}
		*s = flexString(str)
		return nil
	}
	// It's a number, bool, or null — convert the raw token to string
	if trimmed == "null" {
		*s = ""
		return nil
	}
	*s = flexString(trimmed)
	return nil
}

type InventoryHandler struct {
	db *pgxpool.Pool
}

func NewInventoryHandler(db *pgxpool.Pool) *InventoryHandler {
	return &InventoryHandler{db: db}
}

// ─── Data structures ─────────────────────────────────────────────────────────

type ConsumoVsLimite struct {
	ProjectID           string   `json:"project_id"`
	ProjectNome         string   `json:"project_nome"`
	HouseModelID        string   `json:"house_model_id"`
	HouseModelNome      string   `json:"house_model_nome"`
	ProductID           string   `json:"product_id"`
	ProductNome         string   `json:"product_nome"`
	UnidadeMedida       string   `json:"unidade_medida"`
	QuantidadeLimite    float64  `json:"quantidade_limite"`
	QuantidadeConsumida float64  `json:"quantidade_consumida"`
	PercentualConsumido *float64 `json:"percentual_consumido"`
	LimiteExcedido      bool     `json:"limite_excedido"`
}

type HistoricoSaldo struct {
	Mes            string  `json:"mes"`
	ProductID      string  `json:"product_id"`
	ProductNome    string  `json:"product_nome"`
	SaldoMinimo    float64 `json:"saldo_minimo"`
	SaldoAcumulado float64 `json:"saldo_acumulado"`
	AbaixoMinimo   bool    `json:"abaixo_minimo"`
	Source         string  `json:"source"`
}

type DetalheExcesso struct {
	ProjectID               string   `json:"project_id"`
	ProjectNome             string   `json:"project_nome"`
	HouseModelNome          string   `json:"house_model_nome"`
	ProductID               string   `json:"product_id"`
	ProductNome             string   `json:"product_nome"`
	UsuarioResponsavel      string   `json:"usuario_responsavel"`
	DestinatarioID          *string  `json:"destinatario_id"`
	MovementDate            string   `json:"movement_date"`
	QuantidadeRetirada      float64  `json:"quantidade_retirada"`
	QuantidadeLimite        float64  `json:"quantidade_limite"`
	ConsumoAcumuladoMomento float64  `json:"consumo_acumulado_momento"`
	ExcedeuNesteMomento     bool     `json:"excedeu_neste_momento"`
	ValorUnitario           *float64 `json:"valor_unitario"`
	Source                  string   `json:"source"`
}

type GastoUsuario struct {
	UsuarioID          string  `json:"usuario_id"`
	UsuarioNome        string  `json:"usuario_nome"`
	Role               string  `json:"role"`
	Mes                string  `json:"mes"`
	TotalRetiradas     int     `json:"total_retiradas"`
	ValorTotalRetirado float64 `json:"valor_total_retirado"`
}

type InventoryResponse struct {
	ConsumoVsLimite []ConsumoVsLimite  `json:"consumo_vs_limite"`
	HistoricoSaldo  []HistoricoSaldo   `json:"historico_saldo"`
	DetalhesExcesso []DetalheExcesso   `json:"detalhes_excesso"`
	GastosUsuario   []GastoUsuario     `json:"gastos_usuario"`
	ProductPrices   map[string]float64 `json:"product_prices"`
	ResetDate       string             `json:"reset_date"`
	BackupThrough   string             `json:"backup_through"`
}

func (h *InventoryHandler) loadInventoryBackup(result *InventoryResponse) {
	ctx := context.Background()
	if err := h.db.QueryRow(ctx, `
		SELECT reset_date::text, backup_through::text
		FROM inventory_history_sources WHERE source='backup'`).
		Scan(&result.ResetDate, &result.BackupThrough); err != nil {
		return
	}

	rows, err := h.db.Query(ctx, `
		SELECT reference_month::text, product_id, product_name, minimum_balance,
		       accumulated_balance, below_minimum, source
		FROM inventory_history_balances WHERE source='backup'
		ORDER BY reference_month, product_name`)
	if err == nil {
		for rows.Next() {
			var row HistoricoSaldo
			if rows.Scan(&row.Mes, &row.ProductID, &row.ProductNome, &row.SaldoMinimo,
				&row.SaldoAcumulado, &row.AbaixoMinimo, &row.Source) == nil {
				result.HistoricoSaldo = append(result.HistoricoSaldo, row)
			}
		}
		rows.Close()
	}

	rows, err = h.db.Query(ctx, `
		SELECT project_id, project_name, house_model_name, product_id, product_name,
		       responsible_user, recipient_id, movement_date::text, withdrawn_quantity,
		       quantity_limit, accumulated_consumption, exceeded_at_movement, unit_price, source
		FROM inventory_history_withdrawals WHERE source='backup'
		ORDER BY movement_date, original_item_id`)
	if err == nil {
		for rows.Next() {
			var row DetalheExcesso
			if rows.Scan(&row.ProjectID, &row.ProjectNome, &row.HouseModelNome, &row.ProductID,
				&row.ProductNome, &row.UsuarioResponsavel, &row.DestinatarioID, &row.MovementDate,
				&row.QuantidadeRetirada, &row.QuantidadeLimite, &row.ConsumoAcumuladoMomento,
				&row.ExcedeuNesteMomento, &row.ValorUnitario, &row.Source) == nil {
				result.DetalhesExcesso = append(result.DetalhesExcesso, row)
			}
		}
		rows.Close()
	}
}

func inventoryMonth(value string) string {
	if len(value) < 7 {
		return ""
	}
	return value[:7]
}

func filterInventoryHistory(data []HistoricoSaldo, visibleIDs, movementMonths map[string]bool) []HistoricoSaldo {
	if len(movementMonths) == 0 {
		return []HistoricoSaldo{}
	}
	filtered := make([]HistoricoSaldo, 0, len(data))
	for _, h := range data {
		if len(visibleIDs) > 0 && !visibleIDs[string(h.ProductID)] {
			continue
		}
		if movementMonths[inventoryMonth(h.Mes)] {
			filtered = append(filtered, h)
		}
	}
	return filtered
}

// ─── Handler ──────────────────────────────────────────────────────────────────

func (h *InventoryHandler) GetInventory(c *fiber.Ctx) error {
	storageURL := os.Getenv("PREMIUM_STORAGE_URL")
	storageKey := os.Getenv("PREMIUM_STORAGE_KEY")

	result := &InventoryResponse{
		ConsumoVsLimite: []ConsumoVsLimite{},
		HistoricoSaldo:  []HistoricoSaldo{},
		DetalhesExcesso: []DetalheExcesso{},
		GastosUsuario:   []GastoUsuario{},
		ProductPrices:   map[string]float64{},
	}

	// Helper
	fetch := func(table, query string) ([]byte, error) {
		url := fmt.Sprintf("%s/rest/v1/%s?%s", storageURL, table, query)
		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("apikey", storageKey)
		req.Header.Set("Authorization", "Bearer "+storageKey)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Range-Unit", "items")
		req.Header.Set("Range", "0-9999")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return nil, err
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}
		if resp.StatusCode != 200 && resp.StatusCode != 206 {
			return nil, fmt.Errorf("storage %d: %s", resp.StatusCode, string(body))
		}
		return body, nil
	}

	// ConsumoVsLimite
	if body, err := fetch("vw_consumo_vs_limite", "select=*&limit=5000"); err == nil {
		var data []ConsumoVsLimite
		if json.Unmarshal(body, &data) == nil {
			result.ConsumoVsLimite = data
		}
	}

	// Step 1 — Fetch only visible products; build id→name map and visible-ID set.
	// Archived products (visible=false) must be excluded from all metrics.
	productNames := map[string]string{} // id-string → nome
	visibleIDs := map[string]bool{}
	if body, err := fetch("products", "select=id,nome&visible=eq.true&limit=5000"); err == nil {
		var rawProducts []map[string]interface{}
		if json.Unmarshal(body, &rawProducts) == nil {
			for _, p := range rawProducts {
				if rawID := p["id"]; rawID != nil {
					pid := fmt.Sprintf("%v", rawID)
					visibleIDs[pid] = true
					if nome, ok := p["nome"].(string); ok && nome != "" {
						productNames[pid] = nome
					}
				}
			}
		}
	}

	movementMonths := map[string]bool{}
	if body, err := fetch("stock_movements", "select=movement_date&limit=5000"); err == nil {
		var movements []struct {
			MovementDate string `json:"movement_date"`
		}
		if json.Unmarshal(body, &movements) == nil {
			for _, movement := range movements {
				if month := inventoryMonth(movement.MovementDate); month != "" {
					movementMonths[month] = true
				}
			}
		}
	}

	// The monthly balance view emits rows for months with no movements.
	if body, err := fetch("vw_historico_saldo_mensal", "select=*&limit=5000"); err == nil {
		var data []HistoricoSaldo
		if json.Unmarshal(body, &data) == nil {
			for i := range data {
				data[i].Source = "live"
			}
			result.HistoricoSaldo = filterInventoryHistory(data, visibleIDs, movementMonths)
		}
	}

	// DetalhesExcesso
	if body, err := fetch("vw_detalhes_excesso_limite", "select=*&limit=5000"); err == nil {
		var data []DetalheExcesso
		if json.Unmarshal(body, &data) == nil {
			for i := range data {
				data[i].Source = "live"
			}
			result.DetalhesExcesso = data
		}
	}

	// GastosUsuario
	if body, err := fetch("vw_gasto_por_usuario", "select=*&limit=5000"); err == nil {
		var data []GastoUsuario
		if json.Unmarshal(body, &data) == nil {
			result.GastosUsuario = data
		}
	}

	// Step 2 — Build ProductPrices from stock_movement_items (latest first).
	// Index by both product_id string and product name, mirroring BOR1.
	if body, err := fetch("stock_movement_items", "select=product_id,valor_unitario&order=id.desc&limit=5000"); err == nil {
		var rawItems []map[string]interface{}
		if json.Unmarshal(body, &rawItems) == nil {
			for _, item := range rawItems {
				price, ok := item["valor_unitario"].(float64)
				if !ok || price <= 0 {
					continue
				}
				pid := ""
				if rawID := item["product_id"]; rawID != nil {
					pid = fmt.Sprintf("%v", rawID)
				}
				if pid != "" && pid != "<nil>" {
					if _, exists := result.ProductPrices[pid]; !exists {
						result.ProductPrices[pid] = price
					}
					// Also index by name using the products table map
					if nome, ok := productNames[pid]; ok && nome != "" {
						if _, exists := result.ProductPrices[nome]; !exists {
							result.ProductPrices[nome] = price
						}
					}
				}
			}
		}
	}

	h.loadInventoryBackup(result)
	return c.JSON(result)
}
