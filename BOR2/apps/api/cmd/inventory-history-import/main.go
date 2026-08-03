package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/jackc/pgx/v5"
)

type balance struct {
	Month       string  `json:"mes"`
	ProductID   string  `json:"product_id"`
	ProductName string  `json:"product_nome"`
	Minimum     float64 `json:"saldo_minimo"`
	Accumulated float64 `json:"saldo_acumulado"`
	Below       bool    `json:"abaixo_minimo"`
}

type withdrawal struct {
	ID, MovementID, ProjectID, ProjectName, ModelName string
	ProductID, ProductName, Responsible, Date         string
	RecipientID                                       *string
	Quantity, Limit, Accumulated, UnitPrice           float64
	Exceeded                                          bool
}

func (w *withdrawal) UnmarshalJSON(raw []byte) error {
	var row struct {
		ID          string  `json:"id"`
		MovementID  string  `json:"movement_id"`
		ProjectID   string  `json:"project_id"`
		ProjectName string  `json:"project_nome"`
		ModelName   string  `json:"house_model_nome"`
		ProductID   string  `json:"product_id"`
		ProductName string  `json:"product_nome"`
		Responsible string  `json:"usuario_responsavel"`
		RecipientID *string `json:"destinatario_id"`
		Date        string  `json:"movement_date"`
		Quantity    float64 `json:"quantidade_retirada"`
		Limit       float64 `json:"quantidade_limite"`
		Accumulated float64 `json:"consumo_acumulado_momento"`
		Exceeded    bool    `json:"excedeu_neste_momento"`
		UnitPrice   float64 `json:"valor_unitario"`
	}
	if err := json.Unmarshal(raw, &row); err != nil {
		return err
	}
	w.ID, w.MovementID, w.ProjectID, w.ProjectName, w.ModelName = row.ID, row.MovementID, row.ProjectID, row.ProjectName, row.ModelName
	w.ProductID, w.ProductName, w.Responsible, w.Date = row.ProductID, row.ProductName, row.Responsible, row.Date
	w.RecipientID, w.Quantity, w.Limit, w.Accumulated = row.RecipientID, row.Quantity, row.Limit, row.Accumulated
	w.Exceeded, w.UnitPrice = row.Exceeded, row.UnitPrice
	return nil
}

type snapshot struct {
	ResetDate     string       `json:"reset_date"`
	BackupThrough string       `json:"backup_through"`
	MovementCount int          `json:"movement_count"`
	ItemCount     int          `json:"item_count"`
	Balances      []balance    `json:"historico_saldo"`
	Withdrawals   []withdrawal `json:"detalhes_excesso"`
}

func main() {
	if len(os.Args) != 2 {
		log.Fatal("usage: inventory-history-import <snapshot.json>")
	}
	raw, err := os.ReadFile(os.Args[1])
	if err != nil {
		log.Fatal(err)
	}
	var data snapshot
	if err := json.Unmarshal(raw, &data); err != nil {
		log.Fatal(err)
	}
	if len(data.Balances) == 0 || len(data.Withdrawals) == 0 {
		log.Fatal("refusing to import an empty inventory snapshot")
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer tx.Rollback(ctx)
	const source = "backup"
	if _, err := tx.Exec(ctx, `DELETE FROM inventory_history_sources WHERE source=$1`, source); err != nil {
		log.Fatal(err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO inventory_history_sources
		(source,reset_date,backup_through,movement_count,item_count) VALUES($1,$2,$3,$4,$5)`,
		source, data.ResetDate, data.BackupThrough, data.MovementCount, data.ItemCount); err != nil {
		log.Fatal(err)
	}
	for _, row := range data.Balances {
		if _, err := tx.Exec(ctx, `INSERT INTO inventory_history_balances
			(source,reference_month,product_id,product_name,minimum_balance,accumulated_balance,below_minimum)
			VALUES($1,$2,$3,$4,$5,$6,$7)`, source, row.Month, row.ProductID, row.ProductName,
			row.Minimum, row.Accumulated, row.Below); err != nil {
			log.Fatal(err)
		}
	}
	for _, row := range data.Withdrawals {
		if _, err := tx.Exec(ctx, `INSERT INTO inventory_history_withdrawals
			(source,original_item_id,original_movement_id,movement_date,project_id,project_name,house_model_name,
			 product_id,product_name,responsible_user,recipient_id,withdrawn_quantity,quantity_limit,
			 accumulated_consumption,exceeded_at_movement,unit_price)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, source,
			row.ID, row.MovementID, row.Date, row.ProjectID, row.ProjectName, row.ModelName, row.ProductID,
			row.ProductName, row.Responsible, row.RecipientID, row.Quantity, row.Limit, row.Accumulated,
			row.Exceeded, row.UnitPrice); err != nil {
			log.Fatal(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Printf("imported source=%s balances=%d withdrawals=%d reset=%s\n", source, len(data.Balances), len(data.Withdrawals), data.ResetDate)
}
