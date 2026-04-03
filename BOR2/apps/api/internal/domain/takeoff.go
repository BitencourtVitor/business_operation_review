package domain

import "time"

// TakeoffWork maps to the takeoff_works table.
type TakeoffWork struct {
	ID                   string     `json:"id"`
	Project              string     `json:"project"`
	DataSolicitacao      *time.Time `json:"dataSolicitacao,omitempty"`
	DataInicio           *time.Time `json:"dataInicio,omitempty"`
	DataEstimadaEntrega  *time.Time `json:"dataEstimadaEntrega,omitempty"`
	EntregaReal          *time.Time `json:"entregaReal,omitempty"`
	Description          string     `json:"description"`
	DocLinks             string     `json:"docLinks"`
	ModeloDaCasa         string     `json:"modeloDaCasa"`
	StageDwg             string     `json:"stageDwg"`
	StageMitek3d         string     `json:"stageMitek3d"`
	StageMaterialsList   string     `json:"stageMaterialsList"`
	StagePanelDivision   string     `json:"stagePanelDivision"`
	StageValidation      string     `json:"stageValidation"`
	StageCutList         string     `json:"stageCutList"`
	StageProduction      string     `json:"stageProduction"`
	StageDelivery        string     `json:"stageDelivery"`
	StageAssembly        string     `json:"stageAssembly"`
	CreatedAt            time.Time  `json:"createdAt"`
}

type TakeoffWorkFilters struct {
	Project string
}
