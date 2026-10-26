package domain

import "time"

// MaintenanceContract é um cliente do plano de manutenção da HVAC. Datas vêm
// como "YYYY-MM-DD": comparar texto nesse formato é comparar datas, sem fuso.
type MaintenanceContract struct {
	ID            string               `json:"id"`
	ClientName    string               `json:"clientName"`
	Address       string               `json:"address"`
	City          string               `json:"city"`
	Phone         string               `json:"phone"`
	Email         string               `json:"email"`
	PlanSentOn    *string              `json:"planSentOn"`
	ContractStart *string              `json:"contractStart"`
	ContractValue *float64             `json:"contractValue"`
	Invoices      []string             `json:"invoices"`
	FirstService  *string              `json:"firstService"`
	SecondService *string              `json:"secondService"`
	Archived      bool                 `json:"archived"`
	InvoiceStatus []MaintenanceInvoice `json:"invoiceStatus"`
	Stage         MaintenanceStage     `json:"stage"`
	Unpaid        bool                 `json:"unpaid"`
}

// MaintenanceInvoice é a invoice como o QuickBooks a vê. Found=false quando o
// número ainda não chegou pelo sync (ou foi digitado errado). Total zero é
// invoice anulada.
type MaintenanceInvoice struct {
	Number   string                   `json:"number"`
	Found    bool                     `json:"found"`
	Customer *string                  `json:"customer,omitempty"`
	Date     *string                  `json:"date,omitempty"`
	DueDate  *string                  `json:"dueDate,omitempty"`
	PaidOn   *string                  `json:"paidOn,omitempty"`
	Total    *float64                 `json:"total,omitempty"`
	Balance  *float64                 `json:"balance,omitempty"`
	Lines    []MaintenanceInvoiceLine `json:"lines,omitempty"`
	LinkedTo *string                  `json:"linkedTo,omitempty"`
}

type MaintenanceInvoiceLine struct {
	Description *string  `json:"description"`
	Amount      *float64 `json:"amount"`
}

// MaintenanceComment é uma fala na conversa do contrato. Autor e cargo saem da
// sessão de quem escreveu, nunca do corpo do pedido.
type MaintenanceComment struct {
	ID         int64     `json:"id"`
	Body       string    `json:"body"`
	AuthorID   string    `json:"authorId"`
	AuthorName string    `json:"authorName"`
	AuthorRole string    `json:"authorRole"`
	CreatedAt  time.Time `json:"createdAt"`
}

type MaintenanceStage string

const (
	StageArchived   MaintenanceStage = "archived"
	StageProspect   MaintenanceStage = "prospect"    // sem contrato: plano enviado ou só contato
	StageToSchedule MaintenanceStage = "to_schedule" // contrato ativo, próxima visita sem data
	StageScheduled  MaintenanceStage = "scheduled"   // próxima visita com data futura
	StageRenew      MaintenanceStage = "renew"       // as duas visitas feitas
)

// Classify fecha Stage e Unpaid a partir dos dados e de hoje.
func (m *MaintenanceContract) Classify(today string) {
	m.Unpaid = false
	for _, inv := range m.InvoiceStatus {
		if inv.Balance != nil && *inv.Balance > 0 {
			m.Unpaid = true
		}
	}
	done := func(d *string) bool { return d != nil && *d <= today }
	switch {
	case m.Archived:
		m.Stage = StageArchived
	case m.ContractStart == nil:
		m.Stage = StageProspect
	case done(m.FirstService) && done(m.SecondService):
		m.Stage = StageRenew
	case m.FirstService == nil || (done(m.FirstService) && m.SecondService == nil):
		m.Stage = StageToSchedule
	default:
		m.Stage = StageScheduled
	}
}
