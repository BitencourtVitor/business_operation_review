package domain

import "time"

type ForecastStatus string

const (
	ForecastStatusPlanned   ForecastStatus = "planned"
	ForecastStatusActive    ForecastStatus = "active"
	ForecastStatusCompleted ForecastStatus = "completed"
)

// Lightweight sub-resource types (from BOR1 migration tables)

type ForecastFieldwireDoc struct {
	ID       int64   `json:"id"`
	Status   *string `json:"status"`
	Category string  `json:"category"`
	Document string  `json:"document"`
}

// ForecastPermitStep é uma etapa do Permit da obra da HVAC. Não tem data: o
// que se controla é se a etapa foi cumprida, dispensada ou continua pendente.
type ForecastPermitStep struct {
	ID     int64   `json:"id"`
	Step   string  `json:"step"`
	Status *string `json:"status"`
}

type ForecastMachineDoc struct {
	ID     int64   `json:"id"`
	Title  *string `json:"title"`
	Unit   *string `json:"unit"`
	Status *string `json:"status"`
}

type ForecastContractStepDoc struct {
	ID     int64   `json:"id"`
	Team   *string `json:"team"`
	Step   *string `json:"step"`
	Status *string `json:"status"`
}

// ForecastAtlasSlot é uma vaga dentro da categoria. Categoria sem eixo tem uma
// só, de rótulo vazio; categoria por andar ou por unidade tem uma por andar ou
// por unidade, e é por isso que a categoria mostra vários booleanos em vez de um.
type ForecastAtlasSlot struct {
	Label    string `json:"label"`
	Imported bool   `json:"imported"`
}

// ForecastAtlasCategory é uma categoria que se espera ver documentada na obra.
// A lista sai do tipo de obra, e por isso não tem relação com a do Fieldwire.
type ForecastAtlasCategory struct {
	ID    int32               `json:"id"`
	Name  string              `json:"name"`
	Axis  string              `json:"axis"`
	Slots []ForecastAtlasSlot `json:"slots"`
}

// ForecastAtlas é o que o Atlas tem a dizer sobre a obra. A lista de categorias
// vem sempre: obra fora do Atlas mostra o que se espera dela, tudo pendente, que
// é a informação útil. JobsiteID nulo é justamente "ainda não está lá".
type ForecastAtlas struct {
	JobsiteID  *string                 `json:"jobsiteId"`
	Categories []ForecastAtlasCategory `json:"categories"`
}

type ForecastProject struct {
	ID                string         `json:"id"`
	Company           string         `json:"company"`
	Name              string         `json:"name"`
	Status            ForecastStatus `json:"status"`
	StartDate         time.Time      `json:"startDate"`
	EndDate           time.Time      `json:"endDate"`
	ContractValue     float64        `json:"contractValue"`
	Team              string         `json:"team"`
	QBTime            bool           `json:"qbTime"`
	Cliente           string         `json:"cliente"`
	JobSite           string         `json:"jobSite"`
	Type              string         `json:"type"`
	LoteBld           string         `json:"loteBld"`
	Address           string         `json:"address"`
	Obs               string         `json:"obs"`
	ObsAuthor         string         `json:"obsAuthor"`
	ObsRole           string         `json:"obsRole"`
	ObsAt             *time.Time     `json:"obsAt,omitempty"`
	Hvac              bool           `json:"hvac"`
	// SiteID aponta para a obra física (forecast_sites). Nulo enquanto a obra
	// não tiver endereço que permita identificá-la.
	SiteID *string `json:"siteId,omitempty"`
	// LinkedCompanies são as outras empresas que atuam na mesma obra. Deriva o
	// selo "HVAC work included" — antes um booleano marcado à mão.
	LinkedCompanies []string `json:"linkedCompanies"`
	Buildertrend      bool           `json:"buildertrend"`
	Storage           bool           `json:"storage"`
	HasOrders         bool           `json:"hasOrders"`
	MachineProvider   string         `json:"machineProvider"`
	// Etapas do ciclo de HVAC. Só a company 'hvac' as usa; para a Framing o
	// ciclo continua sendo beams/start/end.
	HvacRoughDate       *time.Time `json:"hvacRoughDate,omitempty"`
	HvacAirHandlerDate  *time.Time `json:"hvacAirHandlerDate,omitempty"`
	HvacCondenserDate   *time.Time `json:"hvacCondenserDate,omitempty"`
	HvacFinishDate      *time.Time `json:"hvacFinishDate,omitempty"`
	// Fim de cada etapa. As Orders trazem RS e RE por task; sem o fim, a última
	// etapa não teria como dizer quando a obra acaba.
	HvacRoughEndDate      *time.Time `json:"hvacRoughEndDate,omitempty"`
	HvacAirHandlerEndDate *time.Time `json:"hvacAirHandlerEndDate,omitempty"`
	HvacCondenserEndDate  *time.Time `json:"hvacCondenserEndDate,omitempty"`
	HvacFinishEndDate     *time.Time `json:"hvacFinishEndDate,omitempty"`
	// Quando o job foi aberto na conta do cliente. Não é cronograma: a primeira
	// Order costuma vir meses depois. Serve de referência para obra que ainda
	// não tem pedido e, por isso, não tem data nenhuma.
	JobOpenedDate *time.Time `json:"jobOpenedDate,omitempty"`
	PreviousBeamsDate *time.Time     `json:"previousBeamsDate,omitempty"`
	PreviousStartDate *time.Time     `json:"previousStartDate,omitempty"`
	PreviousEndDate   *time.Time     `json:"previousEndDate,omitempty"`
	Fieldwire         []ForecastFieldwireDoc   `json:"fieldwire,omitempty"`
	Machines          []ForecastMachineDoc     `json:"machines,omitempty"`
	ContractSteps     []ForecastContractStepDoc `json:"contractSteps,omitempty"`
	Permit            []ForecastPermitStep     `json:"permit,omitempty"`
	Atlas             *ForecastAtlas           `json:"atlas,omitempty"`
	CreatedAt         time.Time      `json:"createdAt"`
	UpdatedAt         time.Time      `json:"updatedAt"`
}

// ForecastObsEntry is one append-only observation written against a project.
type ForecastObsEntry struct {
	ID         int64     `json:"id"`
	ProjectID  string    `json:"projectId"`
	Body       string    `json:"body"`
	AuthorID   string    `json:"authorId"`
	AuthorName string    `json:"authorName"`
	AuthorRole string    `json:"authorRole"`
	CreatedAt  time.Time `json:"createdAt"`
}

type ForecastFilters struct {
	Company string
	Status  ForecastStatus
	Year    int
}

type ForecastFieldwire struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	Priority  string    `json:"priority"`
	DueDate   *time.Time `json:"dueDate,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

type ForecastMachine struct {
	ID              string    `json:"id"`
	ProjectID       string    `json:"projectId"`
	MachineName     string    `json:"machineName"`
	Provider        string    `json:"provider"`
	Status          string    `json:"status"`
	IsDispensed     bool      `json:"isDispensed"`
	StartDate       *time.Time `json:"startDate,omitempty"`
	EndDate         *time.Time `json:"endDate,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type ForecastContractStep struct {
	ID            string    `json:"id"`
	ProjectID     string    `json:"projectId"`
	StepName      string    `json:"stepName"`
	StepOrder     int       `json:"stepOrder"`
	Status        string    `json:"status"`
	PlannedDate   *time.Time `json:"plannedDate,omitempty"`
	CompletedDate *time.Time `json:"completedDate,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// ForecastDateEntry é uma mudança de data registrada pelo banco. O histórico
// existe porque as datas andam a cada ciclo de atualização do portal, e saber
// de onde veio cada valor é o que decide se ele pode ser sobrescrito.
type ForecastDateEntry struct {
	ID        int64      `json:"id"`
	ProjectID string     `json:"projectId"`
	Company   string     `json:"company"`
	Field     string     `json:"field"`
	OldValue  *time.Time `json:"oldValue,omitempty"`
	NewValue  *time.Time `json:"newValue,omitempty"`
	Source    string     `json:"source"`
	ChangedBy string     `json:"changedBy"`
	// Por que a data mudou. Só a edição à mão exige; a rotina grava vazio.
	Note      string     `json:"note"`
	ChangedAt time.Time  `json:"changedAt"`
}
