package domain

import (
	"math"
	"sort"
	"strings"
	"time"
)

const (
	overtimeMultiplier = 1.5
	dateLayout         = "2006-01-02"
)

func sortedKeys(m map[string]float64) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// RatePoint é o rate de um funcionário num pay period (fim do período).
type RatePoint struct {
	PeriodEnd string
	Rate      float64
}

// RateAt é o rate em vigor no dia: o do primeiro pay period que termina nele ou
// depois. Antes do registro mais antigo, vale o mais antigo (congelado para
// trás, decisão do Vitor em 04/11/2026); depois do mais novo, o mais novo.
// points em ordem de PeriodEnd.
func RateAt(points []RatePoint, date string) float64 {
	if len(points) == 0 {
		return 0
	}
	for _, p := range points {
		if p.PeriodEnd >= date {
			return p.Rate
		}
	}
	return points[len(points)-1].Rate
}

// SupervisorHours é o que um supervisor já fez num prédio.
type SupervisorHours struct {
	Employee string
	Regular  float64
	Overtime float64
	Cost     float64 // custo já gasto, com overtime a 1,5×
	Rate     float64 // rate de hoje
	Days     []WorkerDay // horas por dia no prédio, em ordem, para o acumulado até cada ponto do gráfico
}

// WorkerDay são as horas de uma pessoa num dia, num prédio.
type WorkerDay struct {
	Date     string  `json:"date"`
	Regular  float64 `json:"regular"`
	Overtime float64 `json:"overtime"`
}

// BuildingPoint é um ponto diário do gráfico da meta, em horas.
type BuildingPoint struct {
	Date      string   `json:"date"`
	Planned   float64  `json:"planned"`
	Actual    *float64 `json:"actual"`
	Projected *float64 `json:"projected"`
}

// WorkerHours é quanto cada pessoa já trabalhou no prédio.
type WorkerHours struct {
	Employee string      `json:"employee"`
	Regular  float64     `json:"regular"`
	Overtime float64     `json:"overtime"`
	Days     []WorkerDay `json:"days"` // dia a dia, para somar até a data do tooltip
}

// BuildingForecast é o EVM do prédio em horas. Dinheiro não sai daqui: o
// orçamento é convertido em horas pelo rate de quem trabalhou no prédio.
type BuildingForecast struct {
	Start           string                `json:"start"`
	End             string                `json:"end"`
	BudgetHours     float64               `json:"budgetHours"`     // BAC em horas regulares
	ConsumedHours   float64               `json:"consumedHours"`   // AC em horas regulares equivalentes
	ProjectedHours  float64               `json:"projectedHours"`  // EAC no fim do prédio
	RegularHours    float64               `json:"regularHours"`    // horas registradas
	OvertimeHours   float64               `json:"overtimeHours"`
	RemainingHours  float64               `json:"remainingHours"`  // ETC: horas reais que ainda cabem
	ExceedsOn       *string               `json:"exceedsOn"`       // dia em que o ritmo atual estoura o orçamento
	Series          []BuildingPoint       `json:"series"`
	Workers         []WorkerHours         `json:"workers"` // mais horas primeiro
}

// maxLateHorizonDays limita quantos dias a estimativa avança depois de hoje num prédio atrasado.
const maxLateHorizonDays = 60

// ForecastBuilding monta o EVM: a meta (PV) é o orçamento distribuído em linha
// reta, só em horas regulares, do primeiro dia com hora até o end date do
// Forecast; o real (AC) é o custo gasto convertido pelo rate médio; a projeção
// (EAC) segue o ritmo diário até hoje. Para o que falta, valem as proporções
// observadas: a fatia de cada supervisor e a fatia de overtime de cada um.
// dailyCost é o custo gasto em cada dia, para o acumulado real da série.
func ForecastBuilding(budget float64, start, end, today string, sups []SupervisorHours, dailyCost map[string]float64) *BuildingForecast {
	var hours, cost, blendedRegular, blendedHour float64
	for _, s := range sups {
		hours += s.Regular + s.Overtime
		cost += s.Cost
	}
	if hours == 0 || start == "" || end == "" {
		return nil
	}
	f := &BuildingForecast{Start: start, End: end}
	for _, s := range sups {
		h := s.Regular + s.Overtime
		share := h / hours
		otShare := s.Overtime / h
		blendedRegular += share * s.Rate
		blendedHour += share * s.Rate * (1 + (overtimeMultiplier-1)*otShare)
		f.RegularHours += s.Regular
		f.OvertimeHours += s.Overtime
	}
	if blendedRegular == 0 {
		return nil
	}

	f.BudgetHours = budget / blendedRegular
	f.ConsumedHours = cost / blendedRegular
	if left := budget - cost; left > 0 && blendedHour > 0 {
		f.RemainingHours = left / blendedHour
	}
	for _, s := range sups {
		f.Workers = append(f.Workers, WorkerHours{Employee: s.Employee, Regular: s.Regular, Overtime: s.Overtime, Days: s.Days})
	}
	sort.Slice(f.Workers, func(a, b int) bool {
		return f.Workers[a].Regular+f.Workers[a].Overtime > f.Workers[b].Regular+f.Workers[b].Overtime
	})

	t0, _ := time.Parse(dateLayout, start)
	t1, _ := time.Parse(dateLayout, end)
	now, _ := time.Parse(dateLayout, today)
	if t1.Before(t0) {
		t1 = t0
	}
	span := math.Max(1, t1.Sub(t0).Hours()/24)
	// Ritmo real: horas por dia desde o ponto zero até hoje (sem teto no prazo previsto).
	elapsed := math.Max(1, now.Sub(t0).Hours()/24)
	perDay := f.ConsumedHours / elapsed
	// Até onde vai a estimativa: no prazo, até o fim previsto; atrasado, avança o mesmo
	// número de dias do atraso, no máximo 60, para não esticar o eixo do tempo.
	horizon := t1
	if now.After(t1) {
		late := int(now.Sub(t1).Hours() / 24)
		horizon = now.AddDate(0, 0, min(late, maxLateHorizonDays))
	}
	f.ProjectedHours = f.ConsumedHours + perDay*math.Max(0, horizon.Sub(now).Hours()/24)
	if perDay > 0 && f.ConsumedHours < f.BudgetHours {
		on := now.AddDate(0, 0, int(math.Ceil((f.BudgetHours-f.ConsumedHours)/perDay))).Format(dateLayout)
		if on <= end {
			f.ExceedsOn = &on
		}
	} else if f.ConsumedHours >= f.BudgetHours {
		// Já estourou: o dia em que o acumulado real passou do orçamento.
		var sum float64
		for _, d := range sortedKeys(dailyCost) {
			if sum += dailyCost[d]; sum >= budget {
				on := d
				f.ExceedsOn = &on
				break
			}
		}
	}

	// Série diária do início até o horizonte da estimativa (o fim previsto, ou hoje + atraso, até 60 dias).
	days := sortedKeys(dailyCost)
	spentBy := func(day string) float64 {
		var sum float64
		for _, d := range days {
			if d > day {
				break
			}
			sum += dailyCost[d]
		}
		return sum / blendedRegular
	}
	last := horizon
	// Todo dia, mais hoje (onde o real vira projeção) e o último dia: cada ponto cai no seu dia.
	marks := map[string]time.Time{last.Format(dateLayout): last}
	for d := t0; !d.After(last); d = d.AddDate(0, 0, 1) {
		marks[d.Format(dateLayout)] = d
	}
	if !now.Before(t0) && !now.After(last) {
		marks[today] = now
	}
	keys := make([]string, 0, len(marks))
	for k := range marks {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, day := range keys {
		d := marks[day]
		p := BuildingPoint{Date: day, Planned: f.BudgetHours * math.Min(1, d.Sub(t0).Hours()/24/span)}
		if !d.After(now) {
			v := spentBy(day)
			p.Actual = &v
		}
		if !d.Before(now) {
			v := f.ConsumedHours + perDay*d.Sub(now).Hours()/24
			p.Projected = &v
		}
		f.Series = append(f.Series, p)
	}
	return f
}

// InsightsSettings é o settings da Workforce Productivity.
type InsightsSettings struct {
	BuildingBudget       float64        `json:"buildingBudget"`
	IgnoredWorktypes     []string       `json:"ignoredWorktypes"`
	NonCountingWorktypes []string       `json:"nonCountingWorktypes"`
	Supervisors          []string       `json:"supervisors"`
	Links                []BuildingLink `json:"links"`
}

// BuildingLink liga um prédio do Forecast à obra do QB Time: o job site e o
// número do Building, que junta todos os andares.
type BuildingLink struct {
	ForecastID string `json:"forecastId"`
	Jobsite    string `json:"jobsite"`
	Building   string `json:"building"`
	// EndOverride é o expected end indicado à mão; vazio, vale o do Forecast.
	EndOverride *string `json:"endOverride,omitempty"`
	// IgnoredWorktypes são os work types fora do orçamento deste prédio (WF-39);
	// nil, vale a lista geral do settings.
	IgnoredWorktypes []string `json:"ignoredWorktypes"`
}

// ForecastBuildingRef é um prédio do Forecast (type Building) da Framing.
type ForecastBuildingRef struct {
	ID      string  `json:"id"`
	Cliente string  `json:"cliente"`
	JobSite string  `json:"jobSite"`
	Lot     string  `json:"lot"`
	Status  string  `json:"status"`
	Type    string  `json:"type"` // Building, Lot ou House, como no Forecast
	Start   *string `json:"start"`
	End     *string `json:"end"`
}

// QBTBuilding é um prédio como aparece no QB Time.
type QBTBuilding struct {
	Jobsite  string  `json:"jobsite"`
	Building string  `json:"building"`
	Hours    float64 `json:"hours"`
}

// KeyOf normaliza nome de obra ou de pessoa para comparar: minúsculas, sem o
// estado no fim (", RI"), espaços colapsados.
func KeyOf(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	if i := strings.LastIndex(s, ","); i >= 0 && len(strings.TrimSpace(s[i+1:])) == 2 {
		s = s[:i]
	}
	return strings.Join(strings.Fields(s), " ")
}

// PersonKey põe "Corado, Juan Carlos" (payroll) e "Juan Carlos Corado"
// (importação) na mesma chave.
func PersonKey(name string) string {
	if last, first, ok := strings.Cut(name, ","); ok {
		name = strings.TrimSpace(first) + " " + strings.TrimSpace(last)
	}
	return KeyOf(name)
}

// SuggestLink acha, para um prédio do Forecast sem vínculo, a obra do QB Time
// mais parecida: mesmo número de Building e mais palavras em comum no nome.
// ponytail: sobreposição de palavras, não distância de edição; o Vitor confere.
func SuggestLink(b ForecastBuildingRef, options []QBTBuilding) *QBTBuilding {
	stop := map[string]bool{"at": true, "the": true, "of": true, "ma": true, "nh": true, "ri": true}
	words := func(s string) map[string]bool {
		out := map[string]bool{}
		for _, w := range strings.FieldsFunc(strings.ToLower(s), func(r rune) bool {
			return !(r >= 'a' && r <= 'z')
		}) {
			if len(w) > 2 && !stop[w] {
				out[w] = true
			}
		}
		return out
	}
	mine := words(b.JobSite)
	var best *QBTBuilding
	bestScore := 0
	for i, o := range options {
		if o.Building != "Building "+strings.TrimSpace(b.Lot) {
			continue
		}
		score := 0
		for w := range words(o.Jobsite) {
			if mine[w] {
				score++
			}
		}
		if score > bestScore || (score == bestScore && best != nil && o.Hours > best.Hours) {
			if score > 0 {
				best, bestScore = &options[i], score
			}
		}
	}
	return best
}

// HoursRow é a soma de horas de um funcionário numa obra, num dia e num work
// type, já com regular e overtime (mv_wp_hours).
type HoursRow struct {
	Employee string
	Date     string
	Client   string
	Jobsite  string
	Lot      string
	Building string
	Worktype string
	Regular  float64
	Overtime float64
}

// EmployeeWeek são as horas de uma pessoa numa semana (segunda a domingo, o corte das 40 h).
type EmployeeWeek struct {
	WeekStart string  `json:"weekStart"`
	Regular   float64 `json:"regular"`
	Overtime  float64 `json:"overtime"`
}

// OvertimeNote é o "o que aconteceu?" de uma semana com overtime (WF-16).
type OvertimeNote struct {
	Employee  string `json:"employee"`
	WeekStart string `json:"weekStart"`
	Note      string `json:"note"`
	Author    string `json:"author"`
	UpdatedAt string `json:"updatedAt"`
}
