package handler

import (
	"fmt"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/bitencourtVitor/bor2-api/internal/service"
)

// SubcontractorDocsHandler manages the Subcontractor Docs page: tracks
// compliance document status/expiry per subcontractor (insurance
// certificates, W-9, master contract, ID, policy binder), replacing the
// manual "COI Subcontractors" spreadsheet.
type SubcontractorDocsHandler struct {
	db    *pgxpool.Pool
	email service.EmailSender
}

func NewSubcontractorDocsHandler(db *pgxpool.Pool, email service.EmailSender) *SubcontractorDocsHandler {
	return &SubcontractorDocsHandler{db: db, email: email}
}

type SubDocType struct {
	Key       string `json:"key"`
	Label     string `json:"label"`
	HasExpiry bool   `json:"has_expiry"`
	// Which divisions require this document. The catalog is shared, the list of
	// what each division asks for is not.
	Divisions []string `json:"divisions"`
}

type SubDocDivision struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type SubDocEmailUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type SubDocEmailRecipientSettings struct {
	ToUserIDs []string `json:"to_user_ids"`
	CCUserIDs []string `json:"cc_user_ids"`
}

// GET /subcontractor-docs/email-recipients
// Recipients are deliberately modeled as user ids. The delivery job resolves
// the e-mail at send time, so an address change in Settings never leaves a
// stale compliance recipient behind.
func (h *SubcontractorDocsHandler) ListEmailRecipients(c *fiber.Ctx) error {
	usersRows, err := h.db.Query(c.Context(), `SELECT id, name, email FROM users ORDER BY name, email`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer usersRows.Close()
	users := []SubDocEmailUser{}
	for usersRows.Next() {
		var user SubDocEmailUser
		if err := usersRows.Scan(&user.ID, &user.Name, &user.Email); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		users = append(users, user)
	}

	var settings SubDocEmailRecipientSettings
	err = h.db.QueryRow(c.Context(), `
		SELECT COALESCE(array_agg(r.user_id) FILTER (WHERE r.recipient_type = 'to'), '{}'),
		       COALESCE(array_agg(r.user_id) FILTER (WHERE r.recipient_type = 'cc'), '{}')
		FROM sub_doc_email_recipient_settings s
		LEFT JOIN sub_doc_email_recipients r ON r.alert_type = s.alert_type
		WHERE s.alert_type = 'workers_comp'
	`).Scan(&settings.ToUserIDs, &settings.CCUserIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"users": users, "settings": settings}})
}

type updateSubDocEmailRecipientsReq struct {
	ToUserIDs []string `json:"to_user_ids"`
	CCUserIDs []string `json:"cc_user_ids"`
}

func uniqueUserIDs(ids []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func (h *SubcontractorDocsHandler) validateEmailRecipients(c *fiber.Ctx, req updateSubDocEmailRecipientsReq) ([]string, []string, error) {
	toIDs := uniqueUserIDs(req.ToUserIDs)
	if len(toIDs) == 0 {
		return nil, nil, fiber.NewError(fiber.StatusBadRequest, "at least one primary recipient is required")
	}
	toSet := map[string]bool{}
	for _, id := range toIDs {
		toSet[id] = true
	}
	ccIDs := []string{}
	for _, id := range uniqueUserIDs(req.CCUserIDs) {
		if !toSet[id] {
			ccIDs = append(ccIDs, id)
		}
	}
	allIDs := append(append([]string{}, toIDs...), ccIDs...)
	var userCount int
	if err := h.db.QueryRow(c.Context(), `SELECT count(*) FROM users WHERE id = ANY($1)`, allIDs).Scan(&userCount); err != nil {
		return nil, nil, fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if userCount != len(allIDs) {
		return nil, nil, fiber.NewError(fiber.StatusBadRequest, "one or more recipients are not system users")
	}
	return toIDs, ccIDs, nil
}

// PUT /subcontractor-docs/email-recipients
func (h *SubcontractorDocsHandler) UpdateEmailRecipients(c *fiber.Ctx) error {
	var req updateSubDocEmailRecipientsReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	toIDs, ccIDs, err := h.validateEmailRecipients(c, req)
	if err != nil {
		return err
	}

	actorID, _ := c.Locals("userID").(string)
	tx, err := h.db.Begin(c.Context())
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer tx.Rollback(c.Context())
	if _, err = tx.Exec(c.Context(), `
		INSERT INTO sub_doc_email_recipient_settings (alert_type, updated_by, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (alert_type) DO UPDATE SET updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
	`, "workers_comp", actorID); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	if _, err = tx.Exec(c.Context(), `DELETE FROM sub_doc_email_recipients WHERE alert_type = $1`, "workers_comp"); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	for _, recipient := range []struct {
		kind string
		ids  []string
	}{{"to", toIDs}, {"cc", ccIDs}} {
		for _, userID := range recipient.ids {
			if _, err = tx.Exec(c.Context(), `
				INSERT INTO sub_doc_email_recipients (alert_type, recipient_type, user_id) VALUES ($1, $2, $3)
			`, "workers_comp", recipient.kind, userID); err != nil {
				return fiber.NewError(fiber.StatusInternalServerError, err.Error())
			}
		}
	}
	if err = tx.Commit(c.Context()); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": SubDocEmailRecipientSettings{ToUserIDs: toIDs, CCUserIDs: ccIDs}})
}

// POST /subcontractor-docs/email-recipients/test
// Sends a deliberately generic message only after the caller explicitly asks
// for it. The same recipient validation prevents arbitrary e-mail addresses.
func (h *SubcontractorDocsHandler) SendEmailRecipientsTest(c *fiber.Ctx) error {
	var req updateSubDocEmailRecipientsReq
	if err := c.BodyParser(&req); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid request body")
	}
	toIDs, ccIDs, err := h.validateEmailRecipients(c, req)
	if err != nil {
		return err
	}
	allIDs := append(append([]string{}, toIDs...), ccIDs...)
	rows, err := h.db.Query(c.Context(), `SELECT id, email FROM users WHERE id = ANY($1)`, allIDs)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	emails := map[string]string{}
	for rows.Next() {
		var id, email string
		if err := rows.Scan(&id, &email); err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		emails[id] = email
	}
	toEmails, ccEmails := []string{}, []string{}
	for _, id := range toIDs {
		toEmails = append(toEmails, emails[id])
	}
	for _, id := range ccIDs {
		ccEmails = append(ccEmails, emails[id])
	}

	delivery, err := h.email.Send(c.Context(), service.EmailMessage{To: toEmails, CC: ccEmails, Subject: "BOR2 - Subcontractor Docs email test", Text: "This is a test of the Subcontractor Docs compliance-alert recipient list. No compliance action is required."})
	if err != nil {
		return fiber.NewError(fiber.StatusBadGateway, err.Error())
	}
	return c.JSON(fiber.Map{"data": delivery})

	from, password := os.Getenv("GMAIL_USER"), os.Getenv("GMAIL_APP_PASSWORD")
	if from == "" || password == "" {
		return fiber.NewError(fiber.StatusServiceUnavailable, "email delivery is not configured")
	}
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\n", from, strings.Join(toEmails, ", "))
	if len(ccEmails) > 0 {
		msg += fmt.Sprintf("Cc: %s\r\n", strings.Join(ccEmails, ", "))
	}
	msg += "Subject: BOR2 — Subcontractor Docs email test\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nThis is a test of the Subcontractor Docs compliance-alert recipient list. No compliance action is required."
	auth := smtp.PlainAuth("", from, password, "smtp.gmail.com")
	if err := smtp.SendMail("smtp.gmail.com:587", auth, from, append(toEmails, ccEmails...), []byte(msg)); err != nil {
		return fiber.NewError(fiber.StatusBadGateway, "unable to send test email")
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func emailRecipientsForProvider(emails []string) []map[string]string {
	recipients := make([]map[string]string, 0, len(emails))
	for _, email := range emails {
		recipients = append(recipients, map[string]string{"email": email})
	}
	return recipients
}

// GET /subcontractor-docs/divisions
func (h *SubcontractorDocsHandler) ListDivisions(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `SELECT key, label FROM sub_doc_divisions ORDER BY sort_order`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []SubDocDivision{}
	for rows.Next() {
		var d SubDocDivision
		rows.Scan(&d.Key, &d.Label)
		out = append(out, d)
	}
	return c.JSON(fiber.Map{"data": out})
}

// GET /subcontractor-docs/types
func (h *SubcontractorDocsHandler) ListTypes(c *fiber.Ctx) error {
	rows, err := h.db.Query(c.Context(), `
		SELECT t.key, t.label, t.has_expiry, COALESCE(array_agg(d.division) FILTER (WHERE d.division IS NOT NULL), '{}')
		FROM sub_doc_types t
		LEFT JOIN sub_doc_type_divisions d ON d.doc_type = t.key
		GROUP BY t.key, t.label, t.has_expiry, t.sort_order
		ORDER BY t.sort_order
	`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer rows.Close()
	out := []SubDocType{}
	for rows.Next() {
		t := SubDocType{Divisions: []string{}}
		rows.Scan(&t.Key, &t.Label, &t.HasExpiry, &t.Divisions)
		out = append(out, t)
	}
	return c.JSON(fiber.Map{"data": out})
}

type SubDocRecord struct {
	DocType string `json:"doc_type"`
	// Which division's list this record answers. "" is a sub with no division yet.
	Division      string  `json:"division"`
	Status        string  `json:"status"` // missing | requested | received | not_applicable
	StartDate     *string `json:"start_date"`
	ExpiryDate    *string `json:"expiry_date"`
	RequestedDate *string `json:"requested_date"`
	Notes         string  `json:"notes"`
	URL           string  `json:"url"` // where the document lives, normally SharePoint
}

// Urgency buckets, computed from the soonest expiry among this contractor's
// received dated docs (GL/Auto/WC) — the signal Amanda asked to have surface
// automatically instead of scanning a raw spreadsheet by eye.
const (
	UrgencyExpired = "expired" // already past expiry
	UrgencyUrgent  = "urgent"  // expires within 30 days
	UrgencySoon    = "soon"    // expires within 90 days
	UrgencyOK      = "ok"      // expires beyond 90 days
	UrgencyNone    = "none"    // no dated doc on file yet
)

func urgencyFor(daysUntil int, hasExpiry bool) string {
	if !hasExpiry {
		return UrgencyNone
	}
	switch {
	case daysUntil < 0:
		return UrgencyExpired
	case daysUntil <= 30:
		return UrgencyUrgent
	case daysUntil <= 90:
		return UrgencySoon
	default:
		return UrgencyOK
	}
}

type SubDocContractor struct {
	ID int `json:"id"`
	// Kept for the company filter the rest of the app still speaks. Divisions are
	// what this page works in now: a sub can serve several, and each one asks for
	// its own set of documents.
	Company    *string        `json:"company"`
	Divisions  []string       `json:"divisions"`
	Name       string         `json:"name"`
	Email      string         `json:"email"`
	Phone      string         `json:"phone"`
	Notes      string         `json:"notes"`
	Archived   bool           `json:"archived"`
	Records    []SubDocRecord `json:"records"`
	NextExpiry *string        `json:"next_expiry"`
	Urgency    string         `json:"urgency"`
	Status     string         `json:"status"` // active | pending | inactive — see lifecycleFor
}

// Lifecycle buckets — the "arquivado vs ativo" split Amanda asked to widen.
// Off-boarded (manual archive) is one thing; a sub that just let a doc lapse is
// another. We derive "pending" automatically from the docs she already feeds so
// she never has to hand-maintain a third status.
const (
	LifecycleActive   = "active"   // every required doc received & current
	LifecyclePending  = "pending"  // still a sub, but a required doc is missing/expired
	LifecycleInactive = "inactive" // archived — no longer works with the company
)

// docSatisfied: a doc type is "in order" when it's marked N/A, or it's received
// and (for dated docs) not past expiry. Missing/requested/expired counts against
// the sub being fully Active — matching "eles ficam inativos até mandar todos os
// documentos".
func docSatisfied(rec SubDocRecord, hasExpiry bool, today time.Time) bool {
	if rec.Status == "not_applicable" {
		return true
	}
	if rec.Status != "received" {
		return false
	}
	if !hasExpiry {
		return true
	}
	if rec.ExpiryDate == nil {
		return false
	}
	exp, err := time.Parse("2006-01-02", *rec.ExpiryDate)
	if err != nil {
		return false
	}
	return !exp.Before(today)
}

// GET /subcontractor-docs/contractors
// Sorted soonest-expiry-first (Amanda's core ask): whoever needs attention
// next surfaces at the top instead of being buried in a flat spreadsheet.
func (h *SubcontractorDocsHandler) ListContractors(c *fiber.Ctx) error {
	includeArchived := c.Query("include_archived") == "true"

	// Required doc types — needed to tell "fully in order" (Active) from a sub
	// with an outstanding/expired doc (Pending), including doc types with no
	// record row at all (implicitly Missing).
	typeRows, err := h.db.Query(c.Context(), `SELECT key, has_expiry FROM sub_doc_types`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	docTypeHasExpiry := map[string]bool{}
	for typeRows.Next() {
		var key string
		var hasExpiry bool
		typeRows.Scan(&key, &hasExpiry)
		docTypeHasExpiry[key] = hasExpiry
	}
	typeRows.Close()

	// What each division asks for. Since the catalog stopped being global, "in
	// order" has to be judged against the divisions this sub actually serves —
	// otherwise a Framing-only sub is pending for a document only PCG wants.
	divTypeRows, err := h.db.Query(c.Context(), `SELECT division, doc_type FROM sub_doc_type_divisions`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	requiredBy := map[string][]string{}
	for divTypeRows.Next() {
		var division, docType string
		divTypeRows.Scan(&division, &docType)
		requiredBy[division] = append(requiredBy[division], docType)
	}
	divTypeRows.Close()

	query := `
		SELECT c.id, c.company, c.name, c.email, c.phone, c.notes, c.archived,
		       COALESCE(array_agg(d.division ORDER BY d.division) FILTER (WHERE d.division IS NOT NULL), '{}')
		FROM sub_doc_contractors c
		LEFT JOIN sub_doc_contractor_divisions d ON d.contractor_id = c.id`
	if !includeArchived {
		query += ` WHERE c.archived = false`
	}
	query += ` GROUP BY c.id, c.company, c.name, c.email, c.phone, c.notes, c.archived ORDER BY c.name`
	rows, err := h.db.Query(c.Context(), query)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	out := []*SubDocContractor{}
	byID := map[int]*SubDocContractor{}
	for rows.Next() {
		ctr := &SubDocContractor{Records: []SubDocRecord{}, Divisions: []string{}}
		rows.Scan(&ctr.ID, &ctr.Company, &ctr.Name, &ctr.Email, &ctr.Phone, &ctr.Notes, &ctr.Archived, &ctr.Divisions)
		out = append(out, ctr)
		byID[ctr.ID] = ctr
	}
	rows.Close()
	if len(out) == 0 {
		return c.JSON(fiber.Map{"data": out})
	}

	recRows, err := h.db.Query(c.Context(), `
		SELECT r.contractor_id, r.doc_type, r.division, r.status,
		       to_char(r.start_date,'YYYY-MM-DD'), to_char(r.expiry_date,'YYYY-MM-DD'),
		       to_char(r.requested_date,'YYYY-MM-DD'), r.notes, r.url, t.has_expiry
		FROM sub_doc_records r
		JOIN sub_doc_types t ON t.key = r.doc_type
	`)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	defer recRows.Close()

	today := time.Now().UTC().Truncate(24 * time.Hour)
	for recRows.Next() {
		var contractorID int
		var rec SubDocRecord
		var hasExpiry bool
		var startDate, expiryDate, requestedDate *string
		recRows.Scan(&contractorID, &rec.DocType, &rec.Division, &rec.Status, &startDate, &expiryDate, &requestedDate, &rec.Notes, &rec.URL, &hasExpiry)
		rec.StartDate, rec.ExpiryDate, rec.RequestedDate = startDate, expiryDate, requestedDate

		ctr, ok := byID[contractorID]
		if !ok {
			continue
		}
		ctr.Records = append(ctr.Records, rec)

		if hasExpiry && rec.Status == "received" && expiryDate != nil {
			if exp, err := time.Parse("2006-01-02", *expiryDate); err == nil {
				if ctr.NextExpiry == nil {
					v := *expiryDate
					ctr.NextExpiry = &v
				} else if prev, _ := time.Parse("2006-01-02", *ctr.NextExpiry); exp.Before(prev) {
					v := *expiryDate
					ctr.NextExpiry = &v
				}
			}
		}
	}

	for _, ctr := range out {
		if ctr.NextExpiry == nil {
			ctr.Urgency = UrgencyNone
		} else {
			exp, _ := time.Parse("2006-01-02", *ctr.NextExpiry)
			days := int(exp.Sub(today).Hours() / 24)
			ctr.Urgency = urgencyFor(days, true)
		}

		switch {
		case ctr.Archived:
			ctr.Status = LifecycleInactive
		default:
			// Keyed by division as well: the same document can be received for
			// one division and still missing for another.
			recByType := make(map[string]SubDocRecord, len(ctr.Records))
			for _, r := range ctr.Records {
				recByType[r.Division+"\x00"+r.DocType] = r
			}
			// A sub with no division yet is judged against nothing, the way it
			// was before divisions existed.
			divisions := ctr.Divisions
			if len(divisions) == 0 {
				divisions = []string{""}
			}
			outstanding := false
			for _, division := range divisions {
				for _, key := range requiredBy[division] {
					rec, ok := recByType[division+"\x00"+key]
					if !ok || !docSatisfied(rec, docTypeHasExpiry[key], today) {
						outstanding = true
						break
					}
				}
				if outstanding {
					break
				}
			}
			if outstanding {
				ctr.Status = LifecyclePending
			} else {
				ctr.Status = LifecycleActive
			}
		}
	}

	sortByUrgency(out)
	return c.JSON(fiber.Map{"data": out})
}

// sortByUrgency: soonest expiry first, contractors with no dated doc on file
// last (they need outreach too, but there's no date to rank them by).
func sortByUrgency(list []*SubDocContractor) {
	for i := 1; i < len(list); i++ {
		j := i
		for j > 0 && expiryLess(list[j], list[j-1]) {
			list[j], list[j-1] = list[j-1], list[j]
			j--
		}
	}
}

func expiryLess(a, b *SubDocContractor) bool {
	if a.NextExpiry == nil {
		return false
	}
	if b.NextExpiry == nil {
		return true
	}
	return *a.NextExpiry < *b.NextExpiry
}

type contractorBody struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Phone string `json:"phone"`
	Notes string `json:"notes"`
	// The divisions this sub serves. Several are allowed — Cruz Solutions Inc is
	// framing and pcg. `company` is still accepted so the older single-value
	// clients keep working.
	Divisions []string `json:"divisions"`
	Company   string   `json:"company"`
}

var validSubDocCompanies = map[string]bool{"hvac": true, "framing": true, "pcg": true}

// The company column is the shared enum and only knows the three operating
// companies, so a sub whose divisions are all new ones (Fisher Lane, Pleasant
// Park) stores NULL there and lives entirely in the divisions table.
func companyFor(b contractorBody) any {
	if validSubDocCompanies[b.Company] {
		return b.Company
	}
	for _, d := range b.Divisions {
		if validSubDocCompanies[d] {
			return d
		}
	}
	return nil
}

func (h *SubcontractorDocsHandler) setDivisions(c *fiber.Ctx, contractorID int, divisions []string) error {
	if _, err := h.db.Exec(c.Context(),
		`DELETE FROM sub_doc_contractor_divisions WHERE contractor_id = $1`, contractorID); err != nil {
		return err
	}
	for _, division := range divisions {
		if division == "" {
			continue
		}
		if _, err := h.db.Exec(c.Context(), `
			INSERT INTO sub_doc_contractor_divisions (contractor_id, division)
			VALUES ($1,$2) ON CONFLICT DO NOTHING
		`, contractorID, division); err != nil {
			return err
		}
	}
	return nil
}

// POST /subcontractor-docs/contractors
func (h *SubcontractorDocsHandler) CreateContractor(c *fiber.Ctx) error {
	var b contractorBody
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	if len(b.Divisions) == 0 && !validSubDocCompanies[b.Company] {
		return fiber.NewError(fiber.StatusBadRequest, "at least one division is required")
	}
	var id int
	err := h.db.QueryRow(c.Context(), `
		INSERT INTO sub_doc_contractors (name, email, phone, notes, company)
		VALUES ($1,$2,$3,$4,$5) RETURNING id
	`, b.Name, b.Email, b.Phone, b.Notes, companyFor(b)).Scan(&id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	divisions := b.Divisions
	if len(divisions) == 0 {
		divisions = []string{b.Company}
	}
	if err := h.setDivisions(c, id, divisions); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"id": id}})
}

// PUT /subcontractor-docs/contractors/:id
func (h *SubcontractorDocsHandler) UpdateContractor(c *fiber.Ctx) error {
	id := c.Params("id")
	var b contractorBody
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.Name == "" {
		return fiber.NewError(fiber.StatusBadRequest, "name is required")
	}
	if len(b.Divisions) == 0 && !validSubDocCompanies[b.Company] {
		return fiber.NewError(fiber.StatusBadRequest, "at least one division is required")
	}
	_, err := h.db.Exec(c.Context(), `
		UPDATE sub_doc_contractors SET name=$1, email=$2, phone=$3, notes=$4, company=$5, updated_at=now()
		WHERE id=$6
	`, b.Name, b.Email, b.Phone, b.Notes, companyFor(b), id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	contractorID, convErr := strconv.Atoi(id)
	if convErr != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	divisions := b.Divisions
	if len(divisions) == 0 {
		divisions = []string{b.Company}
	}
	if err := h.setDivisions(c, contractorID, divisions); err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// DELETE /subcontractor-docs/contractors/:id
func (h *SubcontractorDocsHandler) DeleteContractor(c *fiber.Ctx) error {
	id := c.Params("id")
	_, err := h.db.Exec(c.Context(), `DELETE FROM sub_doc_contractors WHERE id=$1`, id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// PATCH /subcontractor-docs/contractors/:id/archive
// body {archived: bool} — archiving keeps the contractor and its document
// history, just hides it from the default list (unlike Delete).
func (h *SubcontractorDocsHandler) ArchiveContractor(c *fiber.Ctx) error {
	id := c.Params("id")
	var b struct {
		Archived bool `json:"archived"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	_, err := h.db.Exec(c.Context(), `UPDATE sub_doc_contractors SET archived=$1, updated_at=now() WHERE id=$2`, b.Archived, id)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}

// PUT /subcontractor-docs/records
// body {contractor_id, doc_type, status, start_date?, expiry_date?, requested_date?, notes?, url?}
// Dates are "YYYY-MM-DD" or "" to clear.
func (h *SubcontractorDocsHandler) SetRecord(c *fiber.Ctx) error {
	var b struct {
		ContractorID  int    `json:"contractor_id"`
		DocType       string `json:"doc_type"`
		Division      string `json:"division"`
		Status        string `json:"status"`
		StartDate     string `json:"start_date"`
		ExpiryDate    string `json:"expiry_date"`
		RequestedDate string `json:"requested_date"`
		Notes         string `json:"notes"`
		URL           string `json:"url"`
	}
	if err := c.BodyParser(&b); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid body")
	}
	if b.ContractorID == 0 || b.DocType == "" || b.Status == "" {
		return fiber.NewError(fiber.StatusBadRequest, "contractor_id, doc_type and status are required")
	}
	var start, expiry, requested any
	if b.StartDate != "" {
		start = b.StartDate
	}
	if b.ExpiryDate != "" {
		expiry = b.ExpiryDate
	}
	if b.RequestedDate != "" {
		requested = b.RequestedDate
	}
	_, err := h.db.Exec(c.Context(), `
		INSERT INTO sub_doc_records (contractor_id, doc_type, division, status, start_date, expiry_date, requested_date, notes, url, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
		ON CONFLICT (contractor_id, division, doc_type) DO UPDATE SET
			status=EXCLUDED.status, start_date=EXCLUDED.start_date, expiry_date=EXCLUDED.expiry_date,
			requested_date=EXCLUDED.requested_date, notes=EXCLUDED.notes, url=EXCLUDED.url, updated_at=now()
	`, b.ContractorID, b.DocType, b.Division, b.Status, start, expiry, requested, b.Notes, b.URL)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(fiber.Map{"ok": true})
}
