package middleware

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/pkg/logger"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

// AuditWriter is what the middleware needs from the audit service: somewhere to
// put a finished entry. Declared here so the middleware does not drag the whole
// service package in.
type AuditWriter interface {
	Write(entry *domain.AuditLog)
}

// Bodies larger than this are recorded truncated. A CSV upload or a schedule
// import can be megabytes, and the audit trail is meant to say what changed, not
// to become a second copy of the data.
const maxAuditPayload = 16 * 1024

// Field names whose value never reaches the audit trail, matched case
// insensitively anywhere in the key: "password", "newPassword", "access_token".
var sensitiveKeys = []string{
	"password", "senha", "token", "secret", "client_secret",
	"refresh_token", "access_token", "authorization", "api_key", "apikey",
}

// Path segments that look like ids, so /forecast/9f3a-… and /forecast/1b2c-…
// group into the same resource instead of thousands of distinct ones.
var idSegment = regexp.MustCompile(`^([0-9a-fA-F-]{8,}|\d+)$`)

// Audit records every state-changing request that reaches the API: who, when,
// which route, what was sent, and how it ended.
//
// It exists because auditing used to be a manual call inside each handler, so
// only half of them recorded anything and every new page started out invisible.
// Anything routed through the group this middleware is mounted on is audited by
// default now — including endpoints written after it.
//
// Reads (GET/HEAD/OPTIONS) are skipped: they change nothing, and logging them
// would bury the writes.
func Audit(writer AuditWriter) fiber.Handler {
	return func(c *fiber.Ctx) error {
		switch c.Method() {
		case fiber.MethodGet, fiber.MethodHead, fiber.MethodOptions:
			return c.Next()
		}

		started := time.Now()
		// Copied before Next: handlers are free to consume or rewrite the body.
		body := append([]byte(nil), c.Body()...)

		err := c.Next()

		status := c.Response().StatusCode()
		if err != nil {
			if fiberErr, ok := err.(*fiber.Error); ok {
				status = fiberErr.Code
			} else {
				status = fiber.StatusInternalServerError
			}
		}

		userID, _ := c.Locals("userID").(string)
		userName, _ := c.Locals("userName").(string)
		resource, resourceID := resourceFromPath(c.Path())

		writer.Write(&domain.AuditLog{
			ID:         uuid.NewString(),
			UserID:     userID,
			UserName:   userName,
			Action:     actionFor(c.Method()),
			Resource:   resource,
			ResourceID: resourceID,
			CreatedAt:  started,
			Method:     c.Method(),
			Path:       c.Path(),
			StatusCode: status,
			Query:      string(c.Request().URI().QueryString()),
			Payload:    redact(body, string(c.Request().Header.ContentType())),
			IP:         c.IP(),
			UserAgent:  string(c.Request().Header.UserAgent()),
			DurationMS: int(time.Since(started).Milliseconds()),
			Source:     "middleware",
		})

		return err
	}
}

func actionFor(method string) string {
	switch method {
	case fiber.MethodPost:
		return "create"
	case fiber.MethodPut, fiber.MethodPatch:
		return "update"
	case fiber.MethodDelete:
		return "delete"
	default:
		return strings.ToLower(method)
	}
}

// The resource is the route without its ids: /api/v1/forecast/9f3a/obs becomes
// "forecast/obs", and the last id found becomes the resource id. Grouping this
// way is what makes "everything that happened to this record" answerable.
func resourceFromPath(path string) (resource, resourceID string) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(path, "/api/v1"), "/"), "/")
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			continue
		}
		if idSegment.MatchString(part) {
			resourceID = part
			continue
		}
		kept = append(kept, part)
	}
	return strings.Join(kept, "/"), resourceID
}

// redact returns the body as JSON with sensitive values replaced. A body that is
// not JSON is recorded by its content type alone: the audit trail should say a
// file was uploaded, not carry the file.
func redact(body []byte, contentType string) string {
	if len(body) == 0 {
		return ""
	}
	if !strings.Contains(strings.ToLower(contentType), "json") {
		return string(mustJSON(map[string]any{
			"_note":         "body not recorded",
			"_content_type": contentType,
			"_bytes":        len(body),
		}))
	}

	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return string(mustJSON(map[string]any{"_note": "body is not valid JSON", "_bytes": len(body)}))
	}
	cleaned := mustJSON(scrub(parsed))
	if len(cleaned) > maxAuditPayload {
		return string(mustJSON(map[string]any{
			"_note":  "payload truncated",
			"_bytes": len(cleaned),
		}))
	}
	return string(cleaned)
}

func scrub(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, inner := range v {
			if isSensitive(key) {
				out[key] = "[redacted]"
				continue
			}
			out[key] = scrub(inner)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, inner := range v {
			out[i] = scrub(inner)
		}
		return out
	default:
		return v
	}
}

func isSensitive(key string) bool {
	lower := strings.ToLower(key)
	for _, needle := range sensitiveKeys {
		if strings.Contains(lower, needle) {
			return true
		}
	}
	return false
}

func mustJSON(value any) []byte {
	out, err := json.Marshal(value)
	if err != nil {
		logger.Warn("audit payload marshal failed", "error", err)
		return []byte(`{"_note":"payload could not be encoded"}`)
	}
	return out
}
