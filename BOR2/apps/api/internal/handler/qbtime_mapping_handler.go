package handler

import (
	"context"
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
)

type QBTimeMappingHandler struct {
	db *pgxpool.Pool
}

func NewQBTimeMappingHandler(db *pgxpool.Pool) *QBTimeMappingHandler {
	return &QBTimeMappingHandler{db: db}
}

// ── Domain helpers ─────────────────────────────────────────────────────────────

// Top-level jobcode roots that are overhead / PTO, never a billable project.
var overheadRoots = map[string]bool{
	"transport": true, "office": true, "admin": true, "sick": true,
	"premium hvac": true, "jobcode 0": true, "unregistered location (new)": true,
	"holiday unpaid": true, "unpaid holiday": true, "vacation not paid": true,
	"lunch break": true, "lunch break office": true, "lunch break es": true,
	"lunck break paid": true,
}

// Work-type leaves stripped off the path to obtain the address key.
var workTypes = map[string]bool{
	"normal labor": true, "service": true, "new installation": true,
	"new instalation": true, "maintenance": true,
	"back charge": true, "extra": true, "warranty": true, "labor": true,
	"punch": true, "punch list": true,
}

// Builders label the unit "Lot 04", "Building 4" or "Bldg 4" — capture the number.
var lotRe = regexp.MustCompile(`(?i)(?:lot|building|bldg)\s*0*(\d+)`)
var numRe = regexp.MustCompile(`\d+`)

// streetNumber is the first integer in a free-text address ("141 phoebe st" → 141).
func streetNumber(s string) (int, bool) {
	m := numRe.FindString(s)
	if m == "" {
		return 0, false
	}
	n, err := strconv.Atoi(m)
	return n, err == nil
}

// lastSeg is the trailing ":"-separated segment of a QBO FQN (the address/lot).
func lastSeg(fqn string) string {
	p := strings.Split(fqn, ":")
	return strings.TrimSpace(p[len(p)-1])
}

// QBO sub-scope projects (e.g. "Lot 05 … (Deck)", "Building 4 … (Chutes)") never
// receive the parent unit's QB Time labor — demote them so the main unit wins.
var deckRe = regexp.MustCompile(`(?i)\b(?:deck|chutes)\b`)

func isOverhead(path []string) bool {
	if len(path) < 2 {
		return true
	}
	return overheadRoots[strings.ToLower(strings.TrimSpace(path[0]))]
}

// addressKey drops the work-type leaf (or the leaf of any 4+ level builder path)
// and joins the rest, e.g. ["Toll","Broadleaf","LOT 19","Service"] → "Toll › Broadleaf › LOT 19".
func addressKey(path []string) string {
	p := path
	if len(p) > 1 {
		leaf := strings.ToLower(strings.TrimSpace(p[len(p)-1]))
		if workTypes[leaf] || len(p) >= 4 {
			p = p[:len(p)-1]
		}
	}
	return strings.Join(p, " › ")
}

func lotNumber(s string) (int, bool) {
	m := lotRe.FindStringSubmatch(s)
	if m == nil {
		return 0, false
	}
	n, err := strconv.Atoi(m[1])
	return n, err == nil
}

// normalize lowercases and strips noise tokens so the fuzzy compare is meaningful.
var noiseRe = regexp.MustCompile(`\(new\)|,?\s*inc\.?|,?\s*llc\.?|the pinehills\s*-?|at plymouth|[:,›\-]+`)

func normalize(s string) string {
	s = strings.ToLower(s)
	s = noiseRe.ReplaceAllString(s, " ")
	s = strings.Join(strings.Fields(s), " ")
	return s
}

// jaroWinkler returns a 0..1 similarity (1 = identical).
func jaroWinkler(a, b string) float64 {
	if a == b {
		return 1
	}
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	ra, rb := []rune(a), []rune(b)
	maxDist := max(len(ra), len(rb))/2 - 1
	if maxDist < 0 {
		maxDist = 0
	}
	matchA := make([]bool, len(ra))
	matchB := make([]bool, len(rb))
	matches := 0
	for i := range ra {
		lo := max(0, i-maxDist)
		hi := min(i+maxDist+1, len(rb))
		for j := lo; j < hi; j++ {
			if matchB[j] || ra[i] != rb[j] {
				continue
			}
			matchA[i], matchB[j] = true, true
			matches++
			break
		}
	}
	if matches == 0 {
		return 0
	}
	// transpositions
	t := 0.0
	k := 0
	for i := range ra {
		if !matchA[i] {
			continue
		}
		for !matchB[k] {
			k++
		}
		if ra[i] != rb[k] {
			t++
		}
		k++
	}
	t /= 2
	m := float64(matches)
	jaro := (m/float64(len(ra)) + m/float64(len(rb)) + (m-t)/m) / 3
	// Winkler prefix boost
	prefix := 0
	for i := 0; i < min(4, min(len(ra), len(rb))); i++ {
		if ra[i] == rb[i] {
			prefix++
		} else {
			break
		}
	}
	return jaro + float64(prefix)*0.1*(1-jaro)
}

// ── Types ──────────────────────────────────────────────────────────────────────

type qboCustomer struct {
	id  string
	fqn string
}

type Suggestion struct {
	CustomerID string  `json:"customer_id"`
	Name       string  `json:"name"`
	Score      float64 `json:"score"`
}

type QueueItem struct {
	AddressKey  string       `json:"address_key"`
	IsPrivate   bool         `json:"is_private"`
	Blocks      int          `json:"blocks"`
	Suggestions []Suggestion `json:"suggestions"`
}

// ── GET /qbtime/mapping/queue?company=hvac ─────────────────────────────────────

func (h *QBTimeMappingHandler) Queue(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	ctx := c.Context()

	// Already-decided keys (mapped or skipped) are excluded from the queue.
	done := map[string]bool{}
	if rows, err := h.db.Query(ctx, `SELECT address_key FROM qbtime_project_mappings WHERE company=$1`, company); err == nil {
		for rows.Next() {
			var k string
			rows.Scan(&k)
			done[k] = true
		}
		rows.Close()
	}
	if rows, err := h.db.Query(ctx, `SELECT address_key FROM qbtime_mapping_skips WHERE company=$1`, company); err == nil {
		for rows.Next() {
			var k string
			rows.Scan(&k)
			done[k] = true
		}
		rows.Close()
	}

	// Distinct jobcode paths with block counts.
	rows, err := h.db.Query(ctx, `
		SELECT jobcode_path::text, COUNT(*) AS blocks
		FROM qbtime_timesheets WHERE company=$1
		GROUP BY jobcode_path`, company)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	type agg struct {
		blocks  int
		private bool
	}
	keys := map[string]*agg{}
	for rows.Next() {
		var pathJSON string
		var blocks int
		if err := rows.Scan(&pathJSON, &blocks); err != nil {
			continue
		}
		var path []string
		if json.Unmarshal([]byte(pathJSON), &path) != nil || len(path) == 0 {
			continue
		}
		if isOverhead(path) {
			continue
		}
		k := addressKey(path)
		if k == "" || done[k] {
			continue
		}
		a := keys[k]
		if a == nil {
			a = &agg{private: !builderRoot(path[0])}
			keys[k] = a
		}
		a.blocks += blocks
	}
	rows.Close()

	// Load QBO customers once for scoring.
	customers := h.loadCustomers(ctx, company)

	out := []QueueItem{}
	for k, a := range keys {
		out = append(out, QueueItem{
			AddressKey:  k,
			IsPrivate:   a.private,
			Blocks:      a.blocks,
			Suggestions: suggest(k, customers),
		})
	}
	// Strongest suggestion first so the operator clears easy wins quickly.
	sort.Slice(out, func(i, j int) bool {
		si := topScore(out[i].Suggestions)
		sj := topScore(out[j].Suggestions)
		if si != sj {
			return si > sj
		}
		return out[i].AddressKey < out[j].AddressKey
	})
	return c.JSON(fiber.Map{"data": out, "remaining": len(out)})
}

var builderRoots = map[string]bool{
	"pulte homes (new)": true, "toll brothers (new)": true, "pcg (new)": true,
}

func builderRoot(root string) bool {
	return builderRoots[strings.ToLower(strings.TrimSpace(root))]
}

// ── GET /qbtime/mapping/jobsites?company=hvac ──────────────────────────────────
// Groups QB Time addresses by (client, job site) and resolves the whole group to
// the QBO development whose lot numbers overlap most — so the operator confirms a
// job site once instead of every lot. Client matches modulo "(NEW)"/"Inc.", the
// job-site name may diverge, the lot number must match exactly.

type LotRow struct {
	AddressKey string      `json:"address_key"`
	Lot        string      `json:"lot"`
	IsPrivate  bool        `json:"is_private"`
	Suggestion *Suggestion `json:"suggestion"`
}

type JobsiteGroup struct {
	Client       string   `json:"client"`
	Jobsite      string   `json:"jobsite"`
	SuggestedQBO string   `json:"suggested_qbo"`
	Matched      int      `json:"matched"`
	Total        int      `json:"total"`
	Lots         []LotRow `json:"lots"`
}

// qboParse splits a QBO FQN "Client : Job site : Lot …" into its parts.
func qboParse(fqn string) (client, jobsite string, lotNum int) {
	p := strings.Split(fqn, ":")
	for i := range p {
		p[i] = strings.TrimSpace(p[i])
	}
	if len(p) >= 1 {
		client = p[0]
	}
	if len(p) >= 3 {
		jobsite = p[1]
	}
	lotNum = -1
	if len(p) >= 1 {
		if n, ok := lotNumber(p[len(p)-1]); ok {
			lotNum = n
		}
	}
	return
}

func (h *QBTimeMappingHandler) Jobsites(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	ctx := c.Context()

	done := map[string]bool{}
	for _, tbl := range []string{"qbtime_project_mappings", "qbtime_mapping_skips"} {
		if rows, err := h.db.Query(ctx, `SELECT address_key FROM `+tbl+` WHERE company=$1`, company); err == nil {
			for rows.Next() {
				var k string
				rows.Scan(&k)
				done[k] = true
			}
			rows.Close()
		}
	}

	// ── QB Time groups ────────────────────────────────────────────────────────
	type qbtLot struct {
		addressKey, lot string
		lotNum          int
		private         bool
	}
	type qbtGroup struct {
		client, jobsite string
		lots            []qbtLot
		lotSet          map[int]bool
	}
	groups := map[string]*qbtGroup{}

	rows, err := h.db.Query(ctx, `
		SELECT jobcode_path::text FROM qbtime_timesheets WHERE company=$1
		GROUP BY jobcode_path`, company)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	seen := map[string]bool{}
	for rows.Next() {
		var pathJSON string
		if rows.Scan(&pathJSON) != nil {
			continue
		}
		var path []string
		if json.Unmarshal([]byte(pathJSON), &path) != nil || len(path) == 0 || isOverhead(path) {
			continue
		}
		k := addressKey(path)
		if k == "" || done[k] || seen[k] {
			continue
		}
		seen[k] = true

		kp := strings.Split(k, " › ")
		client := kp[0]
		jobsite := "Individual addresses"
		if len(kp) >= 3 {
			jobsite = kp[1]
		}
		lotLabel := kp[len(kp)-1]
		ln, _ := lotNumber(lotLabel)
		if _, ok := lotNumber(lotLabel); !ok {
			ln = -1
		}
		gk := client + "|" + jobsite
		g := groups[gk]
		if g == nil {
			g = &qbtGroup{client: client, jobsite: jobsite, lotSet: map[int]bool{}}
			groups[gk] = g
		}
		g.lots = append(g.lots, qbtLot{addressKey: k, lot: lotLabel, lotNum: ln, private: !builderRoot(client)})
		if ln >= 0 {
			g.lotSet[ln] = true
		}
	}
	rows.Close()

	// No auto-matching: the operator links each address to a QBO project by hand
	// (the string heuristics didn't reflect the real project assignment).
	out := []JobsiteGroup{}
	for _, g := range groups {
		jg := JobsiteGroup{Client: g.client, Jobsite: g.jobsite, Total: len(g.lots)}
		for _, lt := range g.lots {
			jg.Lots = append(jg.Lots, LotRow{AddressKey: lt.addressKey, Lot: lt.lot, IsPrivate: lt.private})
		}
		out = append(out, jg)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Client != out[j].Client {
			return out[i].Client < out[j].Client
		}
		return out[i].Jobsite < out[j].Jobsite
	})
	return c.JSON(fiber.Map{"data": out})
}

// suggestPrivate matches a private/individual street address to a QBO customer:
// the street number must match exactly (the strong discriminator — "58 Phoebe"
// vs "141 Phoebe" are different houses), then rank by similarity on the rest.
func suggestPrivate(addr string, byNum map[int][]qboCustomer) *Suggestion {
	num, ok := streetNumber(addr)
	if !ok {
		return nil
	}
	na := normalize(addr)
	var best *qboCustomer
	var bestScore float64
	for i := range byNum[num] {
		cu := &byNum[num][i]
		score := jaroWinkler(na, normalize(lastSeg(cu.fqn)))
		if deckRe.MatchString(cu.fqn) {
			score -= 1
		}
		if score > bestScore {
			bestScore, best = score, cu
		}
	}
	if best == nil {
		return nil
	}
	return &Suggestion{CustomerID: best.id, Name: best.fqn, Score: round3(bestScore)}
}

// chooseNonDeck prefers a real lot customer over a "(Deck)" sub-scope.
func chooseNonDeck(cands []Suggestion) *Suggestion {
	if len(cands) == 0 {
		return nil
	}
	for i := range cands {
		if !deckRe.MatchString(cands[i].Name) {
			return &cands[i]
		}
	}
	return &cands[0]
}

// loadCustomers returns QBO customers that can be a project target (leaf jobs
// under a parent — i.e. the FQN has at least one ':' separator).
func (h *QBTimeMappingHandler) loadCustomers(ctx context.Context, company string) []qboCustomer {
	rows, err := h.db.Query(ctx, `
		SELECT external_id, COALESCE(NULLIF(fully_qualified_name,''), display_name) AS fqn
		FROM qb_customers
		WHERE company=$1 AND external_id<>''
		  AND COALESCE(NULLIF(fully_qualified_name,''), display_name) <> ''`, company)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := []qboCustomer{}
	for rows.Next() {
		var cu qboCustomer
		if rows.Scan(&cu.id, &cu.fqn) == nil {
			out = append(out, cu)
		}
	}
	return out
}

func topScore(s []Suggestion) float64 {
	if len(s) == 0 {
		return 0
	}
	return s[0].Score
}

// suggest ranks QBO customers for an address key: exact lot-number match is the
// strong signal, Jaro-Winkler on the normalized strings ranks the rest.
func suggest(key string, customers []qboCustomer) []Suggestion {
	nk := normalize(key)
	lot, hasLot := lotNumber(key)
	scored := make([]Suggestion, 0, len(customers))
	for _, cu := range customers {
		score := jaroWinkler(nk, normalize(cu.fqn)) * 0.5
		if hasLot {
			if cl, ok := lotNumber(cu.fqn); ok && cl == lot {
				score += 0.5
			}
		}
		if deckRe.MatchString(cu.fqn) {
			score -= 1.0 // a "(Deck)" candidate is never the labor target
		}
		scored = append(scored, Suggestion{CustomerID: cu.id, Name: cu.fqn, Score: round3(score)})
	}
	sort.Slice(scored, func(i, j int) bool { return scored[i].Score > scored[j].Score })
	if len(scored) > 5 {
		scored = scored[:5]
	}
	return scored
}

func round3(f float64) float64 {
	return float64(int(f*1000+0.5)) / 1000
}

// ── POST /qbtime/mapping/accept ────────────────────────────────────────────────

func (h *QBTimeMappingHandler) Accept(c *fiber.Ctx) error {
	var b struct {
		Company    string `json:"company"`
		AddressKey string `json:"address_key"`
		CustomerID string `json:"customer_id"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.AddressKey == "" || b.CustomerID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company, address_key and customer_id are required")
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO qbtime_project_mappings (company, address_key, customer_id, updated_at)
		VALUES ($1,$2,$3,now())
		ON CONFLICT (company, address_key) DO UPDATE SET customer_id=EXCLUDED.customer_id, updated_at=now()
	`, b.Company, b.AddressKey, b.CustomerID)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// ── GET /qbtime/mapping/customers?company=hvac&q=broadleaf ─────────────────────
// Free-text search of QBO customers for the manual-override picker.

func (h *QBTimeMappingHandler) Customers(c *fiber.Ctx) error {
	company := c.Query("company")
	if company == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company is required")
	}
	q := "%" + strings.TrimSpace(c.Query("q")) + "%"
	rows, err := h.db.Query(c.Context(), `
		SELECT external_id, COALESCE(NULLIF(fully_qualified_name,''), display_name) AS fqn
		FROM qb_customers
		WHERE company=$1 AND external_id<>''
		  AND COALESCE(NULLIF(fully_qualified_name,''), display_name) ILIKE $2
		ORDER BY fqn LIMIT 30`, company, q)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []Suggestion{}
	for rows.Next() {
		var s Suggestion
		rows.Scan(&s.CustomerID, &s.Name)
		out = append(out, s)
	}
	return c.JSON(fiber.Map{"data": out})
}

// ── POST /qbtime/mapping/skip ──────────────────────────────────────────────────

func (h *QBTimeMappingHandler) Skip(c *fiber.Ctx) error {
	var b struct {
		Company    string `json:"company"`
		AddressKey string `json:"address_key"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.AddressKey == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and address_key are required")
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO qbtime_mapping_skips (company, address_key)
		VALUES ($1,$2) ON CONFLICT DO NOTHING
	`, b.Company, b.AddressKey)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// POST /budget/qbtime-mapping/unlink  body {company, address_key}
// Removes an address↔project link so its hours stop accruing to the project.
func (h *QBTimeMappingHandler) Unlink(c *fiber.Ctx) error {
	var b struct {
		Company    string `json:"company"`
		AddressKey string `json:"address_key"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Company == "" || b.AddressKey == "" {
		return fiber.NewError(fiber.StatusBadRequest, "company and address_key are required")
	}
	if _, err := h.db.Exec(c.Context(),
		`DELETE FROM qbtime_project_mappings WHERE company=$1 AND address_key=$2`,
		b.Company, b.AddressKey); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}
