package domain

import "time"

// ── Destaque ────────────────────────────────────────────────────────────────────

type DestaqueItem struct {
	ID         string `json:"id"`
	DestaqueID string `json:"destaqueId"`
	Texto      string `json:"texto"`
}

type Destaque struct {
	ID             string         `json:"id"`
	UsuarioID      string         `json:"usuarioId"`
	TelaID         string         `json:"telaId"`
	Mes            int            `json:"mes"`
	Ano            int            `json:"ano"`
	CriadoEm       time.Time      `json:"criadoEm"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	UpdatedByID    string         `json:"updatedById"`
	CriadoPorNome  string         `json:"criadoPorNome"`
	EditadoPorNome string         `json:"editadoPorNome"`
	Positivos      []DestaqueItem `json:"positivos"`
	Negativos      []DestaqueItem `json:"negativos"`
}

type DestaqueFilters struct {
	UsuarioID string
	TelaID    string
	Mes       int
	Ano       int
}

// ── Oportunidade ────────────────────────────────────────────────────────────────

type OportunidadeItem struct {
	ID              string `json:"id"`
	OportunidadeID  string `json:"oportunidadeId"`
	Texto           string `json:"texto"`
}

type Oportunidade struct {
	ID             string             `json:"id"`
	UsuarioID      string             `json:"usuarioId"`
	TelaID         string             `json:"telaId"`
	Mes            int                `json:"mes"`
	Ano            int                `json:"ano"`
	Titulo         string             `json:"titulo"`
	CriadoEm       time.Time          `json:"criadoEm"`
	UpdatedAt      time.Time          `json:"updatedAt"`
	UpdatedByID    string             `json:"updatedById"`
	CriadoPorNome  string             `json:"criadoPorNome"`
	EditadoPorNome string             `json:"editadoPorNome"`
	Desafios       []OportunidadeItem `json:"desafios"`
	Melhorias      []OportunidadeItem `json:"melhorias"`
}

type OportunidadeFilters struct {
	UsuarioID string
	TelaID    string
	Mes       int
	Ano       int
}

// ── PlanoDeAcao ─────────────────────────────────────────────────────────────────

type Acao struct {
	ID          string     `json:"id"`
	PlanoID     string     `json:"planoId"`
	Titulo      string     `json:"titulo"`
	Responsavel string     `json:"responsavel"`
	Status      string     `json:"status"`
	DataLimite  *time.Time `json:"dataLimite,omitempty"`
	CriadoEm    time.Time  `json:"criadoEm"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type PlanoDeAcao struct {
	ID             string     `json:"id"`
	UsuarioID      string     `json:"usuarioId"`
	TelaID         string     `json:"telaId"`
	Titulo         string     `json:"titulo"`
	Descricao      string     `json:"descricao"`
	DataInicio     *time.Time `json:"dataInicio,omitempty"`
	DataFim        *time.Time `json:"dataFim,omitempty"`
	Status         string     `json:"status"`
	Deletado       bool       `json:"deletado"`
	CriadoEm       time.Time  `json:"criadoEm"`
	UpdatedAt      time.Time  `json:"updatedAt"`
	UpdatedByID    string     `json:"updatedById"`
	CriadoPorNome  string     `json:"criadoPorNome"`
	EditadoPorNome string     `json:"editadoPorNome"`
	Acoes          []Acao     `json:"acoes"`
}

type PlanoDeAcaoFilters struct {
	UsuarioID string
	TelaID    string
	Status    string
}
