package main

import (
	"context"
	"fmt"
	"os"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	db, err := pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil { panic(err) }
	defer db.Close()

	fmt.Println("=== OFI obra_ids vs forecast_core ids ===")
	rows, err := db.Query(context.Background(), `
		SELECT o.obra_id, fc.id AS fc_id, fc.name, fc.job_site, fc.lote_bld
		FROM operational_forecast_index o
		LEFT JOIN forecast_core fc ON LOWER(fc.id) = LOWER(o.obra_id)
		LIMIT 6
	`)
	if err != nil { panic(err) }
	defer rows.Close()
	for rows.Next() {
		var obraID string
		var fcID, name, jobSite, loteBld *string
		rows.Scan(&obraID, &fcID, &name, &jobSite, &loteBld)
		s := func(p *string) string { if p == nil { return "<NULL>" }; return *p }
		fmt.Printf("obra_id=%-20s fc_id=%-20s name=%q job_site=%q lote_bld=%q\n",
			obraID, s(fcID), s(name), s(jobSite), s(loteBld))
	}

	fmt.Println("\n=== Sample forecast_core ids ===")
	rows2, err := db.Query(context.Background(), `SELECT id, name, job_site, lote_bld FROM forecast_core LIMIT 6`)
	if err != nil { panic(err) }
	defer rows2.Close()
	for rows2.Next() {
		var id, name, jobSite, loteBld string
		rows2.Scan(&id, &name, &jobSite, &loteBld)
		fmt.Printf("id=%-20s name=%q job_site=%q lote_bld=%q\n", id, name, jobSite, loteBld)
	}
}
