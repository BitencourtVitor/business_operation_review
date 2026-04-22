// One-shot cleanup: deletes all AI conversations for all companies.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const (
	apiURL = "http://localhost:8080"
	token  = "3638cf88-7536-429f-8b9d-c218ea1dfb30"
)

var companies = []string{"hvac", "framing", "pcg"}

type conv struct {
	ID string `json:"id"`
}
type listResp struct {
	Data []conv `json:"data"`
}

func main() {
	client := &http.Client{Timeout: 15 * time.Second}
	total := 0

	for _, company := range companies {
		req, _ := http.NewRequest(http.MethodGet, apiURL+"/api/v1/ai/conversations?company="+company, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			fmt.Printf("list %s: %v\n", company, err)
			continue
		}
		var lr listResp
		json.NewDecoder(resp.Body).Decode(&lr)
		resp.Body.Close()

		for _, c := range lr.Data {
			dr, _ := http.NewRequest(http.MethodDelete, apiURL+"/api/v1/ai/conversations/"+c.ID, nil)
			dr.Header.Set("Authorization", "Bearer "+token)
			dr2, err := client.Do(dr)
			if err != nil {
				fmt.Printf("  ✗ %s: %v\n", c.ID, err)
				continue
			}
			dr2.Body.Close()
			fmt.Printf("  ✓ deleted %s\n", c.ID)
			total++
		}
	}

	fmt.Printf("\nDeleted %d conversation(s).\n", total)
}
