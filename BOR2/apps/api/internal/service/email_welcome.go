package service

import (
	"fmt"
	"html"
	"strings"
)

// Welcome is the account itself: who it is, how to sign in, and with what.
type Welcome struct {
	PersonName string
	Login      string
	Password   string
	URL        string
}

// BuildWelcomeEmail composes the message that carries the provisional
// credentials of a brand new account.
//
// Until this existed the password was shown on the screen of whoever created
// the account and had to be relayed by hand, over the phone or WhatsApp. That
// is how a credential gets mistyped, and how it ends up sitting in a chat
// thread forever.
//
// Login and password get a block of their own, labelled, monospaced and large,
// so the two lines that matter are not buried inside a paragraph.
func BuildWelcomeEmail(w Welcome) EmailBody {
	subject := "BOR · your access to the Premium Group system"

	greeting := "Hello"
	if name := strings.TrimSpace(w.PersonName); name != "" {
		greeting = "Hello " + strings.Fields(name)[0]
	}

	intro := "An account was created for you in the BOR, the Premium Group business operation review."

	text := fmt.Sprintf(
		"%s,\n\n%s\n\nYOUR LOGIN:    %s\nYOUR PASSWORD: %s\n\nSign in here: %s\n\n"+
			"This password is provisional and only you should know it. "+
			"Change it after you get in.\n\nPremium Group",
		greeting, intro, w.Login, w.Password, w.URL,
	)

	htmlBody := fmt.Sprintf(
		`<p>%s,</p><p>%s</p>`+
			`<table style="border-collapse:collapse;margin:16px 0;background:#f6f7f9;border:1px solid #e3e5e8;border-radius:8px">`+
			`<tr><td style="padding:12px 16px 4px 16px;font-size:11px;letter-spacing:.08em;color:#666;text-transform:uppercase">Your login</td></tr>`+
			`<tr><td style="padding:0 16px 12px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:700;color:#111">%s</td></tr>`+
			`<tr><td style="padding:0 16px 4px 16px;font-size:11px;letter-spacing:.08em;color:#666;text-transform:uppercase">Your password</td></tr>`+
			`<tr><td style="padding:0 16px 12px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;font-weight:700;color:#111">%s</td></tr>`+
			`</table>`+
			`<p><a href="%s" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>`+
			`<p style="color:#666;font-size:13px">This password is provisional and only you should know it. Change it after you get in.</p>`+
			`<p style="color:#666;font-size:13px">Premium Group</p>`,
		html.EscapeString(greeting), html.EscapeString(intro),
		html.EscapeString(w.Login), html.EscapeString(w.Password),
		html.EscapeString(w.URL),
	)

	return EmailBody{Subject: subject, Text: text, HTML: htmlBody}
}
