package service

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/bitencourtVitor/bor2-api/internal/domain"
	"github.com/bitencourtVitor/bor2-api/internal/repository"
)

type WorkforceInsightsService struct {
	repo repository.WorkforceInsightsRepository
}

func NewWorkforceInsightsService(repo repository.WorkforceInsightsRepository) *WorkforceInsightsService {
	return &WorkforceInsightsService{repo: repo}
}

// InsightsPeriod é um mês ou um pay period da empresa.
type InsightsPeriod struct {
	Key  string `json:"key"`
	From string `json:"from"`
	To   string `json:"to"`
}

type ObraHours struct {
	Period     string  `json:"period"`
	Jobsite    string  `json:"jobsite"`
	Lot        string  `json:"lot"`
	IsBuilding bool    `json:"isBuilding"`
	Regular    float64 `json:"regular"`
	Overtime   float64 `json:"overtime"`
}

type EmployeeHours struct {
	Period   string  `json:"period"`
	Employee string  `json:"employee"`
	Regular  float64 `json:"regular"`
	Overtime float64 `json:"overtime"`
}

type InsightsOverview struct {
	Periods   []InsightsPeriod `json:"periods"`
	Obras     []ObraHours      `json:"obras"`
	Employees []EmployeeHours  `json:"employees"`
}

func dbCompany(company string) (string, error) {
	switch strings.ToLower(company) {
	case "framing":
		return "Framing", nil
	case "hvac":
		return "HVAC", nil
	}
	return "", domain.ErrBadRequest
}

func today() string {
	loc, err := time.LoadLocation("America/New_York")
	if err != nil {
		loc = time.UTC
	}
	return time.Now().In(loc).Format("2006-01-02")
}

// periodsOf: os 12 meses do ano, ou os pay periods da empresa que tocam o ano
// (os mesmos do QB Time Reports).
func periodsOf(company string, year int, granularity string) []InsightsPeriod {
	out := []InsightsPeriod{}
	if granularity == "payperiod" {
		ranges := recentPayPeriods(company, 60)
		y := fmt.Sprint(year)
		for i := len(ranges) - 1; i >= 0; i-- {
			r := ranges[i]
			if strings.HasPrefix(r.start, y) || strings.HasPrefix(r.end, y) {
				out = append(out, InsightsPeriod{Key: r.start, From: r.start, To: r.end})
			}
		}
		return out
	}
	for m := 1; m <= 12; m++ {
		from := time.Date(year, time.Month(m), 1, 0, 0, 0, 0, time.UTC)
		out = append(out, InsightsPeriod{
			Key: from.Format("2006-01"), From: from.Format("2006-01-02"),
			To: from.AddDate(0, 1, -1).Format("2006-01-02"),
		})
	}
	return out
}

func periodOf(periods []InsightsPeriod, date string) string {
	for _, p := range periods {
		if date >= p.From && date <= p.To {
			return p.Key
		}
	}
	return ""
}

func set(list []string) map[string]bool {
	out := map[string]bool{}
	for _, s := range list {
		out[strings.ToLower(strings.TrimSpace(s))] = true
	}
	return out
}

func linkKey(jobsite, building string) string { return domain.KeyOf(jobsite) + "|" + strings.ToLower(building) }

// Overview: horas por obra (sem os work types ignorados) e por funcionário
// (todo o trabalho), em regular e overtime, por mês ou pay period.
func (s *WorkforceInsightsService) Overview(ctx context.Context, company string, year int, granularity string) (*InsightsOverview, error) {
	dbc, err := dbCompany(company)
	if err != nil {
		return nil, err
	}
	periods := periodsOf(strings.ToLower(company), year, granularity)
	if len(periods) == 0 {
		return &InsightsOverview{Periods: periods, Obras: []ObraHours{}, Employees: []EmployeeHours{}}, nil
	}
	settings, err := s.repo.Settings(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.repo.Hours(ctx, dbc, periods[0].From, periods[len(periods)-1].To)
	if err != nil {
		return nil, err
	}
	ignored := set(settings.IgnoredWorktypes)
	buildings := map[string]bool{}
	for _, l := range settings.Links {
		buildings[linkKey(l.Jobsite, l.Building)] = true
	}

	obras := map[string]*ObraHours{}
	people := map[string]*EmployeeHours{}
	for _, h := range rows {
		p := periodOf(periods, h.Date)
		if p == "" {
			continue
		}
		e := people[p+"|"+h.Employee]
		if e == nil {
			e = &EmployeeHours{Period: p, Employee: h.Employee}
			people[p+"|"+h.Employee] = e
		}
		e.Regular += h.Regular
		e.Overtime += h.Overtime

		if h.Jobsite == "" || ignored[strings.ToLower(h.Worktype)] {
			continue
		}
		lot := h.Lot
		if h.Building != "" {
			lot = h.Building
		}
		k := p + "|" + h.Jobsite + "|" + lot
		o := obras[k]
		if o == nil {
			o = &ObraHours{Period: p, Jobsite: h.Jobsite, Lot: lot, IsBuilding: h.Building != "" && buildings[linkKey(h.Jobsite, h.Building)]}
			obras[k] = o
		}
		o.Regular += h.Regular
		o.Overtime += h.Overtime
	}
	out := &InsightsOverview{Periods: periods, Obras: make([]ObraHours, 0, len(obras)), Employees: make([]EmployeeHours, 0, len(people))}
	for _, o := range obras {
		out.Obras = append(out.Obras, *o)
	}
	for _, e := range people {
		out.Employees = append(out.Employees, *e)
	}
	return out, nil
}

// BuildingView é um prédio do Forecast com o vínculo e o EVM em horas.
type BuildingView struct {
	Building domain.ForecastBuildingRef `json:"building"`
	Link     *domain.BuildingLink       `json:"link"`
	Forecast *domain.BuildingForecast   `json:"forecast"`
}

// Buildings monta o EVM de cada prédio ligado. Só entram supervisores do
// settings que trabalharam no prédio, e só work types que não são ignorados.
// ponytail: supervisor sem rate no payroll fica fora da conta (sem rate não há
// como converter o orçamento); aparece quando o QB Time trouxer o rate.
func (s *WorkforceInsightsService) Buildings(ctx context.Context) ([]BuildingView, error) {
	settings, err := s.repo.Settings(ctx)
	if err != nil {
		return nil, err
	}
	refs, err := s.repo.ForecastBuildings(ctx)
	if err != nil {
		return nil, err
	}
	now := today()
	rows, err := s.repo.Hours(ctx, "Framing", "2000-01-01", now)
	if err != nil {
		return nil, err
	}
	rates, err := s.repo.Rates(ctx, "framing")
	if err != nil {
		return nil, err
	}
	ignored := set(settings.IgnoredWorktypes)
	sups := map[string]bool{}
	for _, n := range settings.Supervisors {
		sups[domain.PersonKey(n)] = true
	}
	links := map[string]domain.BuildingLink{}
	for _, l := range settings.Links {
		links[l.ForecastID] = l
	}

	out := make([]BuildingView, 0, len(refs))
	for _, b := range refs {
		v := BuildingView{Building: b}
		l, ok := links[b.ID]
		if !ok {
			out = append(out, v)
			continue
		}
		v.Link = &l
		key := linkKey(l.Jobsite, l.Building)
		byEmp := map[string]*domain.SupervisorHours{}
		daily := map[string]float64{}
		start := ""
		for _, h := range rows {
			if linkKey(h.Jobsite, h.Building) != key || ignored[strings.ToLower(h.Worktype)] {
				continue
			}
			pk := domain.PersonKey(h.Employee)
			pts := rates[pk]
			if !sups[pk] || len(pts) == 0 {
				continue
			}
			rate := domain.RateAt(pts, h.Date)
			cost := rate * (h.Regular + 1.5*h.Overtime)
			sh := byEmp[pk]
			if sh == nil {
				sh = &domain.SupervisorHours{Employee: h.Employee, Rate: domain.RateAt(pts, now)}
				byEmp[pk] = sh
			}
			sh.Regular += h.Regular
			sh.Overtime += h.Overtime
			sh.Cost += cost
			daily[h.Date] += cost
			if start == "" || h.Date < start {
				start = h.Date
			}
		}
		list := make([]domain.SupervisorHours, 0, len(byEmp))
		for _, sh := range byEmp {
			list = append(list, *sh)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Employee < list[j].Employee })
		if b.End != nil {
			v.Forecast = domain.ForecastBuilding(settings.BuildingBudget, start, *b.End, now, list, daily)
		}
		out = append(out, v)
	}
	return out, nil
}

// SettingsView é o settings com o que a tela precisa para escolher.
type SettingsView struct {
	Settings    *domain.InsightsSettings     `json:"settings"`
	Employees   []string                     `json:"employees"`
	Worktypes   []string                     `json:"worktypes"`
	QBTBuilding []domain.QBTBuilding         `json:"qbtBuildings"`
	Buildings   []domain.ForecastBuildingRef `json:"buildings"`
	Suggestions map[string]domain.QBTBuilding `json:"suggestions"` // forecast id → obra do QB Time parecida
}

func (s *WorkforceInsightsService) Settings(ctx context.Context) (*SettingsView, error) {
	st, err := s.repo.Settings(ctx)
	if err != nil {
		return nil, err
	}
	v := &SettingsView{Settings: st, Suggestions: map[string]domain.QBTBuilding{}}
	if v.Employees, err = s.repo.Employees(ctx, "Framing"); err != nil {
		return nil, err
	}
	if v.Worktypes, err = s.repo.Worktypes(ctx); err != nil {
		return nil, err
	}
	if v.QBTBuilding, err = s.repo.QBTBuildings(ctx); err != nil {
		return nil, err
	}
	if v.Buildings, err = s.repo.ForecastBuildings(ctx); err != nil {
		return nil, err
	}
	linked := map[string]bool{}
	for _, l := range st.Links {
		linked[l.ForecastID] = true
	}
	for _, b := range v.Buildings {
		if !linked[b.ID] {
			if sg := domain.SuggestLink(b, v.QBTBuilding); sg != nil {
				v.Suggestions[b.ID] = *sg
			}
		}
	}
	return v, nil
}

func (s *WorkforceInsightsService) SaveSettings(ctx context.Context, st *domain.InsightsSettings) error {
	if st.BuildingBudget < 0 {
		return domain.ErrBadRequest
	}
	for _, p := range []*[]string{&st.IgnoredWorktypes, &st.NonCountingWorktypes, &st.Supervisors} {
		if *p == nil {
			*p = []string{}
		}
	}
	for _, l := range st.Links {
		if l.ForecastID == "" || strings.TrimSpace(l.Jobsite) == "" || strings.TrimSpace(l.Building) == "" {
			return domain.ErrBadRequest
		}
	}
	return s.repo.SaveSettings(ctx, st)
}
