package service

import (
	"context"
	"fmt"
	"sort"
	"strconv"
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

// EmployeeHours é a soma de uma pessoa num período, separada por tipo de obra (prédio ou não),
// para a página filtrar pelo mesmo Type das obras. Mesma base das obras: sem os work types ignorados.
type EmployeeHours struct {
	Period     string  `json:"period"`
	Employee   string  `json:"employee"`
	IsBuilding bool    `json:"isBuilding"`
	Regular    float64 `json:"regular"`
	Overtime   float64 `json:"overtime"`
}

type InsightsOverview struct {
	Periods   []InsightsPeriod `json:"periods"`
	Obras     []ObraHours      `json:"obras"`
	Employees []EmployeeHours  `json:"employees"`
	Sites     []SiteOption     `json:"sites"` // clientes e job sites do ano, para os filtros (antes de filtrar)
	Lots      []string         `json:"lots"`  // lotes do job site escolhido, para o filtro de obra (antes de filtrar o lote)
	Capacity  []PeriodCapacity `json:"capacity"`
}

// PeriodCapacity conta pessoa-dia útil com hora lançada no período (WF-23): cada pessoa entra só nos
// dias de segunda a sexta em que trabalhou. All, Building e House seguem o filtro Type da página.
type PeriodCapacity struct {
	Period   string `json:"period"`
	All      int    `json:"all"`
	Building int    `json:"building"`
	House    int    `json:"house"`
}

// SiteOption é um job site e o cliente dele, para os filtros da página.
type SiteOption struct {
	Client  string `json:"client"`
	Jobsite string `json:"jobsite"`
}

func dbCompany(company string) (string, error) {
	switch strings.ToLower(company) {
	case "framing":
		return "Framing", nil
	case "hvac":
		return "HVAC", nil
	case "pcg":
		return "PCG", nil
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

// Overview: horas por obra e por funcionário, todo work type, em regular e overtime, por mês ou pay period.
// Os work types ignorados no settings só valem no orçamento do prédio (WF-22).
// Overview soma as horas por período; client, jobsite e lot (vazios = todos) recortam tudo antes de somar.
func (s *WorkforceInsightsService) Overview(ctx context.Context, company string, year int, granularity, client, jobsite, lot string) (*InsightsOverview, error) {
	dbc, err := dbCompany(company)
	if err != nil {
		return nil, err
	}
	periods := periodsOf(strings.ToLower(company), year, granularity)
	if len(periods) == 0 {
		return &InsightsOverview{Periods: periods, Obras: []ObraHours{}, Employees: []EmployeeHours{}, Sites: []SiteOption{}, Lots: []string{}}, nil
	}
	settings, err := s.repo.Settings(ctx)
	if err != nil {
		return nil, err
	}
	rows, err := s.repo.Hours(ctx, dbc, periods[0].From, periods[len(periods)-1].To)
	if err != nil {
		return nil, err
	}
	buildings := map[string]bool{}
	for _, l := range settings.Links {
		buildings[linkKey(l.Jobsite, l.Building)] = true
	}

	obras := map[string]*ObraHours{}
	people := map[string]*EmployeeHours{}
	sites := map[SiteOption]bool{}
	lots := map[string]bool{}
	worked := map[string]bool{} // período|tipo|pessoa|dia, só dias úteis
	for _, h := range rows {
		p := periodOf(periods, h.Date)
		if p == "" {
			continue
		}
		if h.Jobsite != "" {
			sites[SiteOption{Client: h.Client, Jobsite: h.Jobsite}] = true
		}
		if (client != "" && h.Client != client) || (jobsite != "" && h.Jobsite != jobsite) {
			continue
		}
		obra := obraOf(h)
		if jobsite != "" && obra != "" {
			lots[obra] = true
		}
		if lot != "" && obra != lot {
			continue
		}
		isB := h.Jobsite != "" && buildings[linkKey(h.Jobsite, obra)]
		ek := p + "|" + h.Employee + "|" + strconv.FormatBool(isB)
		e := people[ek]
		if e == nil {
			e = &EmployeeHours{Period: p, Employee: h.Employee, IsBuilding: isB}
			people[ek] = e
		}
		e.Regular += h.Regular
		e.Overtime += h.Overtime
		if d, err := time.Parse("2006-01-02", h.Date[:min(10, len(h.Date))]); err == nil && d.Weekday() != time.Saturday && d.Weekday() != time.Sunday {
			kind := "house"
			if isB {
				kind = "building"
			}
			worked[p+"|all|"+h.Employee+"|"+h.Date[:10]] = true
			worked[p+"|"+kind+"|"+h.Employee+"|"+h.Date[:10]] = true
		}

		if h.Jobsite == "" {
			continue
		}
		k := p + "|" + h.Jobsite + "|" + obra
		o := obras[k]
		if o == nil {
			o = &ObraHours{Period: p, Jobsite: h.Jobsite, Lot: obra, IsBuilding: buildings[linkKey(h.Jobsite, obra)]}
			obras[k] = o
		}
		o.Regular += h.Regular
		o.Overtime += h.Overtime
	}
	out := &InsightsOverview{Periods: periods, Obras: make([]ObraHours, 0, len(obras)), Employees: make([]EmployeeHours, 0, len(people)), Sites: make([]SiteOption, 0, len(sites)), Lots: make([]string, 0, len(lots))}
	for l := range lots {
		out.Lots = append(out.Lots, l)
	}
	sort.Strings(out.Lots)
	capBy := map[string]*PeriodCapacity{}
	for k := range worked {
		parts := strings.SplitN(k, "|", 3)
		c := capBy[parts[0]]
		if c == nil {
			c = &PeriodCapacity{Period: parts[0]}
			capBy[parts[0]] = c
		}
		switch parts[1] {
		case "all":
			c.All++
		case "building":
			c.Building++
		default:
			c.House++
		}
	}
	out.Capacity = make([]PeriodCapacity, 0, len(capBy))
	for _, c := range capBy {
		out.Capacity = append(out.Capacity, *c)
	}
	for o := range sites {
		out.Sites = append(out.Sites, o)
	}
	sort.Slice(out.Sites, func(i, j int) bool {
		if out.Sites[i].Client != out.Sites[j].Client {
			return out.Sites[i].Client < out.Sites[j].Client
		}
		return out.Sites[i].Jobsite < out.Sites[j].Jobsite
	})
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
	// EndSource diz de onde veio o expected end usado: "forecast" ou "manual" (settings).
	EndSource string `json:"endSource"`
}

// Buildings monta o EVM de cada prédio ligado. Só entram supervisores do
// settings que trabalharam no prédio, e só work types que não são ignorados
// (allWorktypes = true conta todos, para o "Show panels hours").
// ponytail: supervisor sem rate no payroll fica fora da conta (sem rate não há
// como converter o orçamento); aparece quando o QB Time trouxer o rate.
func (s *WorkforceInsightsService) Buildings(ctx context.Context, allWorktypes bool) ([]BuildingView, error) {
	settings, err := s.repo.Settings(ctx)
	if err != nil {
		return nil, err
	}
	refs, err := s.repo.ForecastBuildings(ctx, false)
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
	if allWorktypes {
		ignored = map[string]bool{}
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
		unrated := map[string]*domain.SupervisorHours{}
		workerDays := map[string]map[string]*domain.WorkerDay{}
		unratedDaily := map[string]float64{}
		for _, h := range rows {
			if linkKey(h.Jobsite, obraOf(h)) != key || ignored[strings.ToLower(h.Worktype)] {
				continue
			}
			// Ponto zero da meta e do executado: o primeiro registro de horas no prédio, de qualquer pessoa.
			if start == "" || h.Date < start {
				start = h.Date
			}
			// Todo mundo que trabalhou no prédio consome o orçamento, não só os supervisores.
			// Quem não tem rate no payroll entra depois, com a média de quem tem.
			pk := domain.PersonKey(h.Employee)
			pd := workerDays[pk]
			if pd == nil {
				pd = map[string]*domain.WorkerDay{}
				workerDays[pk] = pd
			}
			wd := pd[h.Date]
			if wd == nil {
				wd = &domain.WorkerDay{Date: h.Date}
				pd[h.Date] = wd
			}
			wd.Regular += h.Regular
			wd.Overtime += h.Overtime
			pts := rates[pk]
			if len(pts) == 0 {
				u := unrated[pk]
				if u == nil {
					u = &domain.SupervisorHours{Employee: h.Employee}
					unrated[pk] = u
				}
				u.Regular += h.Regular
				u.Overtime += h.Overtime
				unratedDaily[h.Date] += h.Regular + 1.5*h.Overtime
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
		}
		var paid, weighted float64
		for _, sh := range byEmp {
			paid += sh.Cost
			weighted += sh.Regular + 1.5*sh.Overtime
		}
		if weighted > 0 {
			avg := paid / weighted
			for pk, u := range unrated {
				u.Rate = avg
				u.Cost = avg * (u.Regular + 1.5*u.Overtime)
				byEmp[pk] = u
			}
			for d, w := range unratedDaily {
				daily[d] += avg * w
			}
		}
		list := make([]domain.SupervisorHours, 0, len(byEmp))
		for pk, sh := range byEmp {
			for _, wd := range workerDays[pk] {
				sh.Days = append(sh.Days, *wd)
			}
			sort.Slice(sh.Days, func(i, j int) bool { return sh.Days[i].Date < sh.Days[j].Date })
			list = append(list, *sh)
		}
		sort.Slice(list, func(i, j int) bool { return list[i].Employee < list[j].Employee })
		end := b.End
		v.EndSource = "forecast"
		if l.EndOverride != nil && *l.EndOverride != "" {
			end, v.EndSource = l.EndOverride, "manual"
		}
		if end != nil {
			v.Forecast = domain.ForecastBuilding(settings.BuildingBudget, start, *end, now, list, daily)
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
	Buildings   []domain.ForecastBuildingRef `json:"buildings"` // toda obra da Framing no Forecast, para o vínculo
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
	if v.Buildings, err = s.repo.ForecastBuildings(ctx, true); err != nil {
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

// obraOf é o nome da obra no QB Time: o prédio quando houver, senão o lote.
func obraOf(h domain.HoursRow) string {
	if h.Building != "" {
		return h.Building
	}
	return h.Lot
}

// EmployeeWeeksView são as semanas de uma pessoa no ano e as anotações das semanas com overtime.
type EmployeeWeeksView struct {
	Weeks []domain.EmployeeWeek `json:"weeks"`
	Notes []domain.OvertimeNote `json:"notes"`
}

// EmployeeWeeks soma as horas da pessoa por semana (segunda a domingo), na mesma base da página:
// todo work type (os ignorados só valem no orçamento do prédio).
func (s *WorkforceInsightsService) EmployeeWeeks(ctx context.Context, company string, year int, employee string) (*EmployeeWeeksView, error) {
	dbc, err := dbCompany(company)
	if err != nil || strings.TrimSpace(employee) == "" {
		return nil, domain.ErrBadRequest
	}
	rows, err := s.repo.Hours(ctx, dbc, fmt.Sprintf("%d-01-01", year), fmt.Sprintf("%d-12-31", year))
	if err != nil {
		return nil, err
	}
	weeks := map[string]*domain.EmployeeWeek{}
	for _, h := range rows {
		if h.Employee != employee || len(h.Date) < 10 {
			continue
		}
		d, err := time.Parse("2006-01-02", h.Date[:10])
		if err != nil {
			continue
		}
		monday := d.AddDate(0, 0, -((int(d.Weekday())+6)%7)).Format("2006-01-02")
		w := weeks[monday]
		if w == nil {
			w = &domain.EmployeeWeek{WeekStart: monday}
			weeks[monday] = w
		}
		w.Regular += h.Regular
		w.Overtime += h.Overtime
	}
	out := &EmployeeWeeksView{Weeks: make([]domain.EmployeeWeek, 0, len(weeks))}
	for _, w := range weeks {
		out.Weeks = append(out.Weeks, *w)
	}
	sort.Slice(out.Weeks, func(i, j int) bool { return out.Weeks[i].WeekStart < out.Weeks[j].WeekStart })
	if out.Notes, err = s.repo.OvertimeNotes(ctx, dbc, employee); err != nil {
		return nil, err
	}
	return out, nil
}

// SaveOvertimeNote grava o "o que aconteceu?" de uma semana; texto vazio apaga.
func (s *WorkforceInsightsService) SaveOvertimeNote(ctx context.Context, company string, n domain.OvertimeNote) error {
	dbc, err := dbCompany(company)
	n.Note = strings.TrimSpace(n.Note)
	if err != nil || strings.TrimSpace(n.Employee) == "" || len(n.WeekStart) != 10 {
		return domain.ErrBadRequest
	}
	return s.repo.SaveOvertimeNote(ctx, dbc, n)
}
