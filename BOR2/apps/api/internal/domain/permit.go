package domain

import "time"

// PermitRow maps to the permit_control table.
type PermitRow struct {
	ID          string     `json:"id"`
	Model       string     `json:"model"`
	Jobsite     string     `json:"jobsite"`
	LotAddress  string     `json:"lotAddress"`
	Situacao    string     `json:"situacao"`
	Solicitacao *time.Time `json:"solicitacao,omitempty"`
	Aplicacao   *time.Time `json:"aplicacao,omitempty"`
	Emissao     *time.Time `json:"emissao,omitempty"`
	Observacao  string     `json:"observacao"`
	Arquivo     string     `json:"arquivo"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type PermitRowFilters struct {
	Jobsite  string
	Situacao string
}
