package service

import (
	"fmt"
	"html"
	"strings"
)

// ── Atlas: convite de obra para subcontratado ────────────────────────────────

// AtlasInvite is everything the person on the other side needs to know: which
// job it is, where it is, and how to get in.
type AtlasInvite struct {
	PersonName string
	JobSite    string
	Unit       string
	Client     string
	Address    string
	// What they can do once inside, in plain words.
	LevelLabel string
	URL        string
}

// BuildAtlasInviteEmail composes the message that goes out when a project is
// shared with a subcontractor.
//
// It is deliberately short. The recipient is a framer or an installer reading
// this on a phone at a jobsite, and everything that is not the job, the address
// and the link is noise between them and the drawing they came for.
func BuildAtlasInviteEmail(invite AtlasInvite) EmailBody {
	job := jobLabel(invite.JobSite, invite.Unit)
	subject := fmt.Sprintf("Atlas · %s is shared with you", job)

	greeting := "Hello"
	if name := strings.TrimSpace(invite.PersonName); name != "" {
		greeting = "Hello " + strings.Fields(name)[0]
	}

	intro := "A project was shared with you in the Atlas, the Premium Group system where the " +
		"drawings, the marks and the photos of a jobsite live together."

	lines := []string{"Job: " + job}
	if invite.Client != "" {
		lines = append(lines, "Client: "+invite.Client)
	}
	if invite.Address != "" {
		lines = append(lines, "Address: "+invite.Address)
	}
	if invite.LevelLabel != "" {
		lines = append(lines, "You can: "+invite.LevelLabel)
	}

	text := fmt.Sprintf(
		"%s,\n\n%s\n\n%s\n\nOpen it here: %s\n\n"+
			"Sign in with your e-mail. If this is your first time and you have no password yet, "+
			"ask the person who shared it to reset one for you.\n\nPremium Group",
		greeting, intro, strings.Join(lines, "\n"), invite.URL,
	)

	var rows strings.Builder
	for _, line := range lines {
		parts := strings.SplitN(line, ": ", 2)
		if len(parts) == 2 {
			rows.WriteString(fmt.Sprintf(
				`<tr><td style="padding:2px 12px 2px 0;color:#666">%s</td><td style="padding:2px 0"><strong>%s</strong></td></tr>`,
				html.EscapeString(parts[0]), html.EscapeString(parts[1])))
		}
	}

	htmlBody := fmt.Sprintf(
		`<p>%s,</p><p>%s</p>`+
			`<table style="font-size:14px;border-collapse:collapse;margin:12px 0">%s</table>`+
			`<p><a href="%s" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Open the project</a></p>`+
			`<p style="color:#666;font-size:13px">Sign in with your e-mail. If this is your first time and you have no password yet, ask the person who shared it to reset one for you.</p>`+
			`<p style="color:#666;font-size:13px">Premium Group</p>`,
		html.EscapeString(greeting), html.EscapeString(intro),
		rows.String(), html.EscapeString(invite.URL),
	)

	return EmailBody{Subject: subject, Text: text, HTML: htmlBody}
}
