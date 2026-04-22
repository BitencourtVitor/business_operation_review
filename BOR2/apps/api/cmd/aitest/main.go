// cmd/aitest — Aria quality test runner.
//
// Usage:
//
//	go run ./cmd/aitest [--company hvac] [--url http://localhost:8080] [--token <bearer>]
//
// Env vars (override flags):
//
//	TEST_COMPANY   TEST_API_URL   TEST_TOKEN
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
	"unicode"
)

// ── ANSI colours ──────────────────────────────────────────────────────────────

const (
	reset  = "\033[0m"
	bold   = "\033[1m"
	red    = "\033[31m"
	green  = "\033[32m"
	yellow = "\033[33m"
	cyan   = "\033[36m"
	grey   = "\033[90m"
)

func clr(c, s string) string { return c + s + reset }

// ── Test definitions ──────────────────────────────────────────────────────────

type Check struct {
	name    string
	mustHit []string // at least one of these must appear (OR)
	mustAll []string // ALL of these must appear (AND)
	mustNot []string // none of these may appear
	minWords int
	maxWords int // 0 = no limit
}

type TestCase struct {
	name    string
	message string
	checks  []Check
}

func testCases() []TestCase {
	return []TestCase{
		{
			name:    "Greeting — no data dump",
			message: "olá",
			checks: []Check{
				{
					name:    "short reply (≤80 words)",
					maxWords: 80,
				},
				{
					name:    "no financial figures leaked",
					mustNot: []string{"$", "YTD", "pipeline", "received", "paid", "invoice"},
				},
			},
		},
		{
			name:    "Confirmation — no data re-query",
			message: "certeza disso?",
			checks: []Check{
				{
					name:    "short reply (≤100 words)",
					maxWords: 100,
				},
				{
					name:    "no data dump",
					mustNot: []string{"YTD", "Total Invoiced", "Snapshot"},
				},
			},
		},
		{
			name:    "Cashflow — monthly breakdown",
			message: "como está o nosso fluxo de caixa nos últimos meses?",
			checks: []Check{
				{
					name:    "contains dollar amounts",
					mustHit: []string{"$"},
				},
				{
					name:    "mentions received or paid",
					mustHit: []string{"receb", "pag", "paid", "received"},
				},
				{
					name:    "substantive reply (≥60 words)",
					minWords: 60,
				},
			},
		},
		{
			name:    "Overdue — specific debtors",
			message: "quem está me devendo dinheiro e quanto?",
			checks: []Check{
				{
					name:    "contains dollar amounts",
					mustHit: []string{"$"},
				},
				{
					name:    "mentions overdue / vencido context",
					mustHit: []string{"vencid", "overdue", "atraso", "dias", "day", "balanc", "saldo"},
				},
				{
					name:    "substantive reply (≥40 words)",
					minWords: 40,
				},
			},
		},
		{
			name:    "Pipeline — open estimates",
			message: "o que temos em aberto no pipeline?",
			checks: []Check{
				{
					name:    "contains dollar amounts",
					mustHit: []string{"$"},
				},
				{
					name:    "mentions estimates or customers",
					mustHit: []string{"estimat", "orçament", "client", "customer", "pending", "pendente"},
				},
				{
					name:    "substantive reply (≥40 words)",
					minWords: 40,
				},
			},
		},
		{
			name:    "Forecast hard — conclusion + risks",
			message: "Considerando o que já recebemos esse ano, o que ainda temos em aberto no pipeline e o histórico dos últimos meses, você acha que a gente vai fechar o ano no positivo? Onde estão os maiores riscos?",
			checks: []Check{
				{
					name:    "gives a direct verdict",
					mustHit: []string{"sim,", "não,", "positiv", "negativ", "likely", "provavelmente", "cenário aponta", "fecha positiv", "fecha negativ", "close positive", "close negative"},
				},
				{
					name:    "mentions risks",
					mustHit: []string{"risco", "risk", "atenção", "preocup", "alerta", "cuidado", "concern", "warning"},
				},
				{
					name:    "cites YTD received amount",
					mustHit: []string{"$"},
				},
				{
					name:    "substantive reply (≥100 words)",
					minWords: 100,
				},
				{
					name:    "no generic risk disclaimer only",
					mustNot: []string{"market conditions", "economic uncertainty", "past performance"},
				},
			},
		},
		{
			name:    "Language match — English in, English out",
			message: "how are we doing this year?",
			checks: []Check{
				{
					name:    "responds in English",
					mustHit: []string{"we", "our", "year", "revenue", "received", "paid", "total", "overall", "so far"},
				},
				{
					name:    "contains numbers",
					mustHit: []string{"$"},
				},
			},
		},
		{
			name:    "Project margins — per-project detail",
			message: "qual é a margem dos nossos projetos?",
			checks: []Check{
				{
					name:    "mentions margin or profit",
					mustHit: []string{"margin", "margem", "lucro", "profit", "gross", "bruto"},
				},
				{
					name:    "contains dollar amounts",
					mustHit: []string{"$"},
				},
				{
					name:    "substantive reply (≥50 words)",
					minWords: 50,
				},
			},
		},
	}
}

// ── API client ────────────────────────────────────────────────────────────────

type chatBody struct {
	Company        string `json:"company"`
	Message        string `json:"message"`
	ConversationID string `json:"conversation_id"`
}

type chatResp struct {
	Data struct {
		Response       string `json:"response"`
		ConversationID string `json:"conversation_id"`
	} `json:"data"`
}

func deleteConversation(apiURL, token, convID string) {
	if convID == "" {
		return
	}
	req, _ := http.NewRequest(http.MethodDelete, apiURL+"/api/v1/ai/conversations/"+convID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

func sendChat(apiURL, token, company, convID, message string) (string, string, error) {
	body, _ := json.Marshal(chatBody{Company: company, Message: message, ConversationID: convID})
	req, _ := http.NewRequest(http.MethodPost, apiURL+"/api/v1/ai/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	var cr chatResp
	if err := json.NewDecoder(resp.Body).Decode(&cr); err != nil {
		return "", "", fmt.Errorf("decode: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("status %d — response: %s", resp.StatusCode, cr.Data.Response)
	}
	return cr.Data.Response, cr.Data.ConversationID, nil
}

// ── Evaluation ────────────────────────────────────────────────────────────────

type result struct {
	check   Check
	passed  bool
	detail  string
}

func wordCount(s string) int {
	return len(strings.Fields(s))
}

func containsAny(s string, candidates []string) (bool, string) {
	lower := strings.ToLower(s)
	for _, c := range candidates {
		if strings.Contains(lower, strings.ToLower(c)) {
			return true, c
		}
	}
	return false, ""
}

func evaluate(response string, checks []Check) []result {
	var results []result
	for _, ch := range checks {
		r := result{check: ch}
		wc := wordCount(response)

		switch {
		case ch.maxWords > 0 && wc > ch.maxWords:
			r.passed = false
			r.detail = fmt.Sprintf("%d words (limit %d)", wc, ch.maxWords)
		case ch.minWords > 0 && wc < ch.minWords:
			r.passed = false
			r.detail = fmt.Sprintf("%d words (need ≥%d)", wc, ch.minWords)
		default:
			r.passed = true
		}

		if r.passed && len(ch.mustHit) > 0 {
			if hit, kw := containsAny(response, ch.mustHit); !hit {
				r.passed = false
				r.detail = fmt.Sprintf("none of %v found", ch.mustHit)
			} else {
				_ = kw
			}
		}

		if r.passed && len(ch.mustAll) > 0 {
			for _, kw := range ch.mustAll {
				if !strings.Contains(strings.ToLower(response), strings.ToLower(kw)) {
					r.passed = false
					r.detail = fmt.Sprintf("missing required keyword %q", kw)
					break
				}
			}
		}

		if r.passed && len(ch.mustNot) > 0 {
			if hit, kw := containsAny(response, ch.mustNot); hit {
				r.passed = false
				r.detail = fmt.Sprintf("forbidden keyword %q found", kw)
			}
		}

		results = append(results, r)
	}
	return results
}

// ── Printer helpers ───────────────────────────────────────────────────────────

func printDivider() { fmt.Println(clr(grey, strings.Repeat("─", 72))) }

func printResponse(resp string) {
	const maxPrint = 600
	preview := resp
	if len([]rune(preview)) > maxPrint {
		preview = string([]rune(preview)[:maxPrint]) + "…"
	}
	// indent each line
	for _, line := range strings.Split(preview, "\n") {
		trimmed := strings.TrimRightFunc(line, unicode.IsSpace)
		if trimmed == "" {
			continue
		}
		fmt.Println(clr(grey, "  │ ") + trimmed)
	}
}

// ── Main ──────────────────────────────────────────────────────────────────────

func main() {
	company := flag.String("company", envOr("TEST_COMPANY", "hvac"), "company slug")
	apiURL  := flag.String("url",     envOr("TEST_API_URL", "http://localhost:8080"), "API base URL")
	token   := flag.String("token",   envOr("TEST_TOKEN", ""), "Bearer token")
	flag.Parse()

	if *token == "" {
		fmt.Fprintln(os.Stderr, clr(red, "✗ TEST_TOKEN not set. Export it or pass --token <value>"))
		os.Exit(1)
	}

	cases := testCases()
	fmt.Printf("\n%s\n", clr(bold, fmt.Sprintf("  Aria Quality Test Suite — company: %s   url: %s", *company, *apiURL)))
	fmt.Printf("%s\n\n", clr(grey, fmt.Sprintf("  %d test cases", len(cases))))

	totalChecks, passed, failed := 0, 0, 0

	consecutiveErrors := 0

	for i, tc := range cases {
		printDivider()
		fmt.Printf("%s %s\n", clr(cyan+bold, fmt.Sprintf("[%d/%d]", i+1, len(cases))), clr(bold, tc.name))
		fmt.Printf("%s %s\n\n", clr(grey, "  Q:"), clr(yellow, tc.message))

		if i > 0 {
			time.Sleep(3 * time.Second) // avoid OpenRouter rate limiting
		}

		start := time.Now()
		resp, convID, err := sendChat(*apiURL, *token, *company, "", tc.message)
		defer deleteConversation(*apiURL, *token, convID)
		elapsed := time.Since(start).Round(time.Millisecond)

		if err != nil {
			consecutiveErrors++
			fmt.Printf("  %s %v\n\n", clr(red, "✗ API error:"), err)
			if consecutiveErrors >= 3 {
				fmt.Printf("\n  %s\n\n", clr(red+bold, "⚠ 3 consecutive errors — is the backend running? Did you restart it after code changes?"))
			}
			failed += len(tc.checks)
			totalChecks += len(tc.checks)
			continue
		}
		consecutiveErrors = 0

		fmt.Printf("%s (%s)\n", clr(grey, "  Response:"), clr(grey, elapsed.String()))
		printResponse(resp)
		fmt.Println()

		results := evaluate(resp, tc.checks)
		for _, r := range results {
			totalChecks++
			if r.passed {
				passed++
				fmt.Printf("  %s %s\n", clr(green, "✓"), r.check.name)
			} else {
				failed++
				detail := ""
				if r.detail != "" {
					detail = " — " + clr(grey, r.detail)
				}
				fmt.Printf("  %s %s%s\n", clr(red, "✗"), r.check.name, detail)
			}
		}
		fmt.Println()
	}

	printDivider()
	score := 0
	if totalChecks > 0 {
		score = (passed * 100) / totalChecks
	}
	scoreColor := green
	if score < 70 {
		scoreColor = red
	} else if score < 90 {
		scoreColor = yellow
	}

	fmt.Printf("\n  %s   %s / %s checks passed\n\n",
		clr(bold+scoreColor, fmt.Sprintf("Score: %d%%", score)),
		clr(green, fmt.Sprintf("%d", passed)),
		clr(bold, fmt.Sprintf("%d", totalChecks)),
	)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
