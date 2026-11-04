package domain

import "time"

// GoalGroup é um ou mais job sites que dividem a meta mensal de casas
// terminadas. Job site fora de grupo não entra no Monthly Execution.
type GoalGroup struct {
	ID          string           `json:"id"`
	Name        string           `json:"name"`
	Sites       []GoalSite       `json:"sites"`
	Checkpoints []GoalCheckpoint `json:"checkpoints"`
	// Goals é a meta de cada mês do ano pedido (índice 0 = janeiro), já
	// resolvida pelos checkpoints. Só na leitura.
	Goals []int `json:"goals,omitempty"`
}

type GoalSite struct {
	Cliente string `json:"cliente"`
	JobSite string `json:"jobSite"`
}

// GoalCheckpoint diz "a partir deste mês, a meta é Goal".
type GoalCheckpoint struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Goal  int `json:"goal"`
}

// GoalFor é a meta do mês: a do último checkpoint até ele, ou zero se o grupo
// ainda não tinha meta. Mudar a meta cria checkpoint novo e o passado fica como era.
func (g *GoalGroup) GoalFor(year, month int) int {
	goal, best := 0, 0
	for _, c := range g.Checkpoints {
		at := c.Year*12 + c.Month
		if at <= year*12+month && at >= best {
			goal, best = c.Goal, at
		}
	}
	return goal
}

// FinishedProject é obra da Framing com fim real: o dia em que passou para closed.
type FinishedProject struct {
	ID          string `json:"id"`
	Cliente     string `json:"cliente"`
	JobSite     string `json:"jobSite"`
	ProjectName string `json:"projectName"`
	Address     string `json:"address"`
	FinishedOn  string `json:"finishedOn"`
}

type PointStatus string

const (
	PointPending  PointStatus = "pending"
	PointResolved PointStatus = "resolved"
)

// ImprovementPoint é um problema trazido num mês, que pode citar grupos de meta.
type ImprovementPoint struct {
	ID         string       `json:"id"`
	Year       int          `json:"year"`
	Month      int          `json:"month"`
	Body       string       `json:"body"`
	Status     PointStatus  `json:"status"`
	GroupIDs   []string     `json:"groupIds"`
	AuthorID   string       `json:"authorId"`
	AuthorName string       `json:"authorName"`
	AuthorRole string       `json:"authorRole"`
	CreatedAt  time.Time    `json:"createdAt"`
	Replies    []PointReply `json:"replies"`
}

// PointReply é uma resposta ao ponto. Autor e cargo saem da sessão.
type PointReply struct {
	ID         int64     `json:"id"`
	Body       string    `json:"body"`
	AuthorID   string    `json:"authorId"`
	AuthorName string    `json:"authorName"`
	AuthorRole string    `json:"authorRole"`
	CreatedAt  time.Time `json:"createdAt"`
}
