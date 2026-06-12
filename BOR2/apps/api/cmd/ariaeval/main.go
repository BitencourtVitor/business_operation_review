// Evaluation harness for Aria's SQL-generating agent (Gemini). For each battery
// question it prints the exact SQL the agent produced — no analyst, no audit log —
// so we can verify the queries and parameters across every table and scenario.
//
//	go run ./cmd/ariaeval [company]   (default company: framing)
package main

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/bitencourtVitor/bor2-api/internal/config"
	"github.com/bitencourtVitor/bor2-api/internal/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

type item struct{ cat, q string }

var battery = []item{
	{"cashflow", "Qual foi o fluxo de caixa dos últimos 6 meses?"},
	{"payments", "Quanto recebemos de clientes este ano?"},
	{"bill_payments", "Quanto pagamos a fornecedores em 2024?"},
	{"invoices/overdue", "Quais faturas estão vencidas e ainda não foram pagas?"},
	{"invoices/receivable", "Qual o total a receber em aberto?"},
	{"invoices/top", "Quais as 5 maiores faturas do ano?"},
	{"invoices/monthly", "Quanto faturamos por mês em 2023?"},
	{"bills/payable", "Quanto devemos a fornecedores no total?"},
	{"bills/overdue", "Quais contas a pagar estão vencidas?"},
	{"bills/top-vendor", "Quais os maiores fornecedores por valor de bills?"},
	{"estimates/pipeline", "Qual o valor total do pipeline em aberto?"},
	{"estimates/status", "Quantos orçamentos foram aceitos este ano?"},
	{"purchases", "Quanto gastamos em compras que não são bills?"},
	{"vendor_credits", "Temos créditos de fornecedores? Qual o total?"},
	{"deposits", "Quanto foi depositado no banco este ano?"},
	{"project/margin", "Qual a margem por projeto?"},
	{"project/loss", "Quais projetos estão dando prejuízo?"},
	{"year/best", "Qual foi o ano mais lucrativo?"},
	{"year/worst", "Qual foi o pior ano completo?"},
	{"year/compare", "Compare a receita recebida de 2022 e 2023."},
	{"top-customers", "Top 10 clientes por valor faturado."},
	{"aging", "Mostra o aging dos recebíveis em atraso."},
	{"greeting", "Olá, tudo bem?"},
	// Relational / multi-table intersection scenarios (the *_links tables).
	{"rel/bill-paid", "Quais bills foram pagas e por qual pagamento, com o valor aplicado?"},
	{"rel/invoice-paid", "Quais faturas já foram pagas e por quais pagamentos de clientes?"},
	{"rel/pay-timing", "Qual o tempo médio em dias entre emitir a fatura e receber o pagamento?"},
	{"rel/estimate-conv", "Qual a taxa de conversão de orçamentos em faturas?"},
	{"rel/vendor-paid", "Quanto cada fornecedor recebeu em pagamentos este ano, somando os valores aplicados às bills?"},
	{"rel/unpaid-invoices", "Quais faturas não têm nenhum pagamento vinculado?"},
}

var wsRe = regexp.MustCompile(`\s+`)

func oneLine(s string) string { return strings.TrimSpace(wsRe.ReplaceAllString(s, " ")) }

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Println("config:", err)
		os.Exit(1)
	}
	ctx := context.Background()

	company := "framing"
	if len(os.Args) > 1 {
		company = os.Args[1]
	}

	db, err := pgxpool.New(ctx, cfg.Database.URL)
	if err != nil {
		fmt.Println("db:", err)
		os.Exit(1)
	}
	defer db.Close()

	roURL := cfg.AI.ReadOnlyDBURL
	if roURL == "" {
		roURL = cfg.Database.URL
	}
	ro, err := pgxpool.New(ctx, roURL)
	if err != nil {
		fmt.Println("ro db:", err)
		os.Exit(1)
	}
	defer ro.Close()

	sqlLLM := service.NewOpenRouterClient(cfg.AI.OpenRouterKey, cfg.AI.SQLModel)
	analyst := service.NewOpenRouterClient(cfg.AI.OpenRouterKey, cfg.AI.AnalystModel)
	aria := service.NewAriaSQL(ro)
	dict, err := service.BuildDataDictionary(ctx, db)
	if err != nil {
		fmt.Println("dict:", err)
		os.Exit(1)
	}
	svc := service.NewAIService(db, sqlLLM, analyst, aria, dict)

	fmt.Printf("=== Aria SQL-agent evaluation — company=%s, model=%s ===\n", company, cfg.AI.SQLModel)
	for _, it := range battery {
		fmt.Printf("\n[%s] %s\n", it.cat, it.q)
		attempts := svc.GatherDebug(ctx, company, it.q)
		if len(attempts) == 0 {
			fmt.Println("   (no queries generated)")
			continue
		}
		for i, a := range attempts {
			status := fmt.Sprintf("%d rows", a.RowCount)
			if a.Truncated {
				status += " (truncated)"
			}
			if a.Err != "" {
				status = "ERROR: " + a.Err
			}
			fmt.Printf("   %d. [%s, %dms] %s\n", i+1, status, a.DurationMs, oneLine(a.SQL))
		}
	}
}
