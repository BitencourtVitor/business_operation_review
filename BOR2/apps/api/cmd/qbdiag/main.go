// cmd/qbdiag — DIAGNÓSTICO read-only (não grava nada).
// Reconcilia o custo de purchases do projeto framing/3468 (Building 1 - Emerald
// Run) entre o banco do BOR2 e o QuickBooks, e lista os fantasmas (purchases que
// estão no BOR2 mas não existem mais no QB).
//
// Rodar de BOR2/apps/api:  go run ./cmd/qbdiag
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/pipeline/quickbooks"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

const (
	COMPANY  = "framing"
	CUSTOMER = "3468" // Building 1 - Emerald Run
)

type ref struct {
	Value string `json:"value"`
	Name  string `json:"name"`
}
type detail struct {
	CustomerRef *ref `json:"CustomerRef"`
	AccountRef  *ref `json:"AccountRef"`
}
type qline struct {
	Amount     float64 `json:"Amount"`
	DetailType string  `json:"DetailType"`
	ABE        *detail `json:"AccountBasedExpenseLineDetail"`
	IBE        *detail `json:"ItemBasedExpenseLineDetail"`
}
type qpur struct {
	Id       string  `json:"Id"`
	TxnDate  string  `json:"TxnDate"`
	TotalAmt float64 `json:"TotalAmt"`
	Line     []qline `json:"Line"`
}

func main() {
	_ = godotenv.Load(".env")
	_ = godotenv.Load(".env.qbsync")
	logger.Init("development")
	ctx := context.Background()

	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Println("connect:", err)
		os.Exit(1)
	}
	defer db.Close()

	// ── BOR2: breakdown por conta (só purchases) para 3468 ──
	fmt.Println("══ BOR2 — purchase_lines de framing/3468 por conta ══")
	br, _ := db.Query(ctx, `
		SELECT COALESCE(NULLIF(account_ref_name,''),'(vazio)') acct, SUM(amount), count(*)
		FROM qb_purchase_lines WHERE company=$1 AND customer_id=$2
		GROUP BY acct ORDER BY 2 DESC`, COMPANY, CUSTOMER)
	for br.Next() {
		var acct string
		var sum float64
		var n int
		br.Scan(&acct, &sum, &n)
		fmt.Printf("  %-34s %12.2f  (%d linhas)\n", acct, sum, n)
	}
	br.Close()

	// ── BOR2: por purchase (external_id → soma das linhas 3468) ──
	type pinfo struct {
		amount float64
		date   string
	}
	bor2 := map[string]*pinfo{}
	var bor2Total float64
	pr, _ := db.Query(ctx, `
		SELECT p.external_id, COALESCE(p.txn_date::text,''), SUM(pl.amount)
		FROM qb_purchase_lines pl JOIN qb_purchases p ON p.id=pl.purchase_id
		WHERE pl.company=$1 AND pl.customer_id=$2
		GROUP BY p.external_id, p.txn_date`, COMPANY, CUSTOMER)
	for pr.Next() {
		var id, date string
		var amt float64
		pr.Scan(&id, &date, &amt)
		bor2[id] = &pinfo{amt, date}
		bor2Total += amt
	}
	pr.Close()
	fmt.Printf("\n  BOR2: %d purchases distintos com linha p/ 3468, soma = %.2f\n", len(bor2), bor2Total)

	// ── QB: busca todas as purchases de framing e soma as linhas do 3468 ──
	fmt.Println("\n══ QuickBooks — buscando purchases de framing… ══")
	oauth := service.NewQBOAuthService(repository.NewPostgresQBCredentialsRepository(db))
	at, rt, realm, cid, csec, err := oauth.SyncClientConfig(ctx, COMPANY)
	if err != nil {
		fmt.Println("token:", err)
		os.Exit(1)
	}
	client := quickbooks.NewClient(quickbooks.CompanyFraming, quickbooks.CompanyConfig{
		RealmID: realm, AccessToken: at, RefreshToken: rt, ClientID: cid, ClientSecret: csec,
	}, false).WithRefresher(oauth)
	rows, err := client.QueryUpdated(ctx, "Purchase", time.Time{})
	if err != nil {
		fmt.Println("QB fetch:", err)
		os.Exit(1)
	}

	qb := map[string]*pinfo{}
	qbDetail := map[string]qpur{}
	qbByAcct := map[string]float64{}
	var qbTotal float64
	for _, raw := range rows {
		var p qpur
		if json.Unmarshal(raw, &p) != nil {
			continue
		}
		var sum float64
		for _, l := range p.Line {
			d := l.ABE
			if d == nil {
				d = l.IBE
			}
			if d == nil || d.CustomerRef == nil || d.CustomerRef.Value != CUSTOMER {
				continue
			}
			sum += l.Amount
			acct := "(vazio)"
			if d.AccountRef != nil && d.AccountRef.Name != "" {
				acct = d.AccountRef.Name
			}
			qbByAcct[acct] += l.Amount
		}
		if sum != 0 {
			qb[p.Id] = &pinfo{sum, p.TxnDate}
			qbDetail[p.Id] = p
			qbTotal += sum
		}
	}
	fmt.Printf("  QB: %d purchases com linha p/ 3468, soma = %.2f\n", len(qb), qbTotal)

	fmt.Println("\n══ QB — por conta (3468) ══")
	type kv struct {
		k string
		v float64
	}
	var accs []kv
	for k, v := range qbByAcct {
		accs = append(accs, kv{k, v})
	}
	sort.Slice(accs, func(i, j int) bool { return accs[i].v > accs[j].v })
	for _, a := range accs {
		fmt.Printf("  %-34s %12.2f\n", a.k, a.v)
	}

	// ── DIFF ──
	fmt.Printf("\n══ DIFERENÇA (BOR2 %.2f − QB %.2f = %.2f) ══\n", bor2Total, qbTotal, bor2Total-qbTotal)

	fmt.Println("\n── FANTASMAS: no BOR2 mas NÃO no QB (sobrando) ──")
	var ghostSum float64
	var ghosts []string
	for id := range bor2 {
		if _, ok := qb[id]; !ok {
			ghosts = append(ghosts, id)
		}
	}
	sort.Strings(ghosts)
	for _, id := range ghosts {
		fmt.Printf("  purchase %-8s  %s  %.2f\n", id, bor2[id].date, bor2[id].amount)
		ghostSum += bor2[id].amount
	}
	fmt.Printf("  → %d fantasmas, soma = %.2f\n", len(ghosts), ghostSum)

	fmt.Println("\n── FALTANDO: no QB mas NÃO no BOR2 ──")
	var missSum float64
	var miss []string
	for id := range qb {
		if _, ok := bor2[id]; !ok {
			miss = append(miss, id)
		}
	}
	sort.Strings(miss)
	for _, id := range miss {
		fmt.Printf("  purchase %-8s  %s  %.2f\n", id, qb[id].date, qb[id].amount)
		missSum += qb[id].amount
	}
	fmt.Printf("  → %d faltando, soma = %.2f\n", len(miss), missSum)

	fmt.Printf("\n══ RESUMO: sobrando %.2f − faltando %.2f = %.2f (deveria bater com a diferença) ══\n",
		ghostSum, missSum, ghostSum-missSum)
}
