// Fills the Subcontractor Docs roster from the QuickBooks vendor contact list.
//
// The system's own data wins: a contact already registered is never overwritten,
// only an empty field is filled. Reads the JSON produced from the QuickBooks
// export (see -in) and prints what it would change; -apply writes.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type vendor struct {
	Vendor   string `json:"vendor"`
	Company  string `json:"company"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
}

type contractor struct {
	ID        int
	Name      string
	OwnerName string
	Email     string
	Phone     string
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// Company names are typed by hand on both sides: "Abad Construction, Inc." and
// "Abad Construction Inc" are the same vendor. Punctuation, case and the legal
// suffix are dropped so the two meet.
var legalSuffix = regexp.MustCompile(`\b(inc|llc|ltd|corp|co|company|incorporated|lp|llp)\b`)

// The roster keeps reminders inside the name field: "RG Construction LLC (last
// bill was 4/3/25", "Railing Pro Need number/ email". They are notes, not part
// of the company name, and no vendor row carries them.
var rosterNote = regexp.MustCompile(`(?i)\s*[(]?\s*(last bill|check insurance|need ).*$`)

func key(name string) string {
	s := strings.ToLower(rosterNote.ReplaceAllString(strings.TrimSpace(name), ""))
	s = legalSuffix.ReplaceAllString(s, " ")
	s = nonAlnum.ReplaceAllString(s, " ")
	return strings.TrimSpace(strings.Join(strings.Fields(s), " "))
}

// Both lists are typed by hand, so "Elite Stone Works" and "Elite Stoneworks",
// or "DMAC Ccnstruction" and "DMAC Construction", are the same vendor. Compared
// without spaces: one a prefix of the other, or two edits apart.
func similar(a, b string) bool {
	x, y := strings.ReplaceAll(a, " ", ""), strings.ReplaceAll(b, " ", "")
	if len(x) < 8 || len(y) < 8 {
		return false
	}
	if strings.HasPrefix(x, y) || strings.HasPrefix(y, x) {
		return true
	}
	return editDistance(x, y) <= 2
}

func editDistance(a, b string) int {
	prev := make([]int, len(b)+1)
	cur := make([]int, len(b)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		cur[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, min(cur[j-1]+1, prev[j-1]+cost))
		}
		prev, cur = cur, prev
	}
	return prev[len(b)]
}

// Which of two candidates is the better reading of the same name.
func closer(target, a, b string) bool {
	da, db := editDistance(target, a), editDistance(target, b)
	if da != db {
		return da < db
	}
	return a < b
}

func main() {
	in := flag.String("in", "vendors.json", "JSON array exported from the QuickBooks vendor list")
	apply := flag.Bool("apply", false, "write the changes (default: dry run)")
	flag.Parse()
	_ = godotenv.Load()

	raw, err := os.ReadFile(*in)
	if err != nil {
		panic(err)
	}
	var vendors []vendor
	if err := json.Unmarshal(raw, &vendors); err != nil {
		panic(err)
	}
	byKey := map[string]vendor{}
	for _, v := range vendors {
		for _, name := range []string{v.Vendor, v.Company} {
			if k := key(name); k != "" {
				if _, seen := byKey[k]; !seen {
					byKey[k] = v
				}
			}
		}
	}

	ctx := context.Background()
	db, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer db.Close()

	rows, err := db.Query(ctx, `SELECT id, name, owner_name, email, phone FROM sub_doc_contractors ORDER BY name`)
	if err != nil {
		panic(err)
	}
	roster := []contractor{}
	for rows.Next() {
		var c contractor
		if err := rows.Scan(&c.ID, &c.Name, &c.OwnerName, &c.Email, &c.Phone); err != nil {
			panic(err)
		}
		roster = append(roster, c)
	}
	rows.Close()

	unmatched, changed := 0, 0
	for _, c := range roster {
		k := key(c.Name)
		v, ok := byKey[k]
		near := false
		if !ok {
			// Map order is random, so the candidate is chosen rather than
			// stumbled on: closest first, name order to break a tie.
			best := ""
			for candidate := range byKey {
				if !similar(k, candidate) {
					continue
				}
				if best == "" || closer(k, candidate, best) {
					best = candidate
				}
			}
			if best != "" {
				v, ok, near = byKey[best], true, true
			}
		}
		if !ok {
			unmatched++
			fmt.Printf("- no vendor row   %s\n", c.Name)
			continue
		}

		owner, email, phone := c.OwnerName, c.Email, c.Phone
		// The vendor list repeats the company under "Full name" when nobody was
		// ever typed in — that is not a person, so it is not an owner.
		if owner == "" && v.FullName != "" && key(v.FullName) != key(c.Name) {
			owner = v.FullName
		}
		if email == "" {
			email = v.Email
		}
		if phone == "" {
			phone = v.Phone
		}
		if owner == c.OwnerName && email == c.Email && phone == c.Phone {
			continue
		}

		changed++
		if near {
			fmt.Printf("~ %s   (matched to %q)\n", c.Name, v.Vendor)
		} else {
			fmt.Printf("> %s\n", c.Name)
		}
		if owner != c.OwnerName {
			fmt.Printf("    owner  %q -> %q\n", c.OwnerName, owner)
		}
		if email != c.Email {
			fmt.Printf("    email  %q -> %q\n", c.Email, email)
		}
		if phone != c.Phone {
			fmt.Printf("    phone  %q -> %q\n", c.Phone, phone)
		}
		if *apply {
			if _, err := db.Exec(ctx, `
				UPDATE sub_doc_contractors
				SET owner_name=$1, email=$2, phone=$3, updated_at=now()
				WHERE id=$4
			`, owner, email, phone, c.ID); err != nil {
				panic(err)
			}
		}
	}

	mode := "dry run"
	if *apply {
		mode = "applied"
	}
	fmt.Printf("\n%s: %d of %d contractors change, %d have no vendor row\n",
		mode, changed, len(roster), unmatched)
}
