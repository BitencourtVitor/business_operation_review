# BOR — Business Operation Review

## Estrutura do Projeto

```
/
└── BOR2/   — o sistema (API em Go, web em Next.js)
```

O sistema anterior foi descontinuado e retirado do repositório em 05/11/2026 (LG-1).
O nome da pasta `BOR2/` ficou por enquanto.

---

## BOR2

### Stack
- **Backend:** Go 1.23 + Fiber v2 (em `BOR2/apps/api/`)
- **Frontend:** Next.js 16 + TypeScript + Bun (em `BOR2/apps/web/`)
- **UI:** ShadcnUI + Tailwind + lucide-react (APENAS ícones nativos do lucide-react)
- **State:** TanStack Query (server) + Zustand (client)
- **Forms:** React Hook Form + Zod
- **DB Access:** sqlc + golang-migrate
- **Auth:** Better Auth
- **Infra:** Railway (backend + frontend + banco)
- **Monorepo:** Turborepo

### Database BOR2 — Railway PostgreSQL
- Credenciais em `BOR2/.env` e `BOR2/apps/api/.env`
- `DATABASE_URL` (acesso de fora) e `DATABASE_INTERNAL_URL` (dentro do Railway) ficam só nesses `.env`, nunca no repositório

### Como rodar migration no BOR2 (Railway PostgreSQL)
```bash
psql "$DATABASE_URL" -f caminho/para/migration.sql
```
Se psql não estiver instalado localmente, usar Railway CLI:
```bash
railway login
railway link   # vincular ao projeto BOR
railway connect postgres
```

### Railway CLI — Token de acesso
Token salvo em `BOR2/.env` como `RAILWAY_TOKEN` (token de projeto, também replicado nas Shared Variables do projeto no Railway pelo usuário — evita ter que recriar)
Para autenticar o CLI sem login interativo:
```bash
RAILWAY_TOKEN=$RAILWAY_TOKEN railway <comando>
```
Ou exportar antes de usar: `export RAILWAY_TOKEN=<valor do BOR2/.env>`

### Decisões de produto BOR2
- Routing: App Router do Next.js (NÃO SPA)
- Mobile Forecast: descontinuado — tela de Forecast já responsiva
- Permissões: por usuário, gerenciável em Settings (Admin/Developer only)
- DataControl: edição de dados do Forecast pelo admin

### Integrações do Forecast (Storage e Machines)
Vínculo com o Premium Storage (Supabase, repo separado), convenção de `house_model` por
comunidade, e a exceção de cliente Private no catálogo de Machines (nunca tem entrada,
e todo consumidor de `machines` precisa tratar isso como "não aplicável", não "pendente") —
documentado em [`BOR2/docs/forecast-integrations.md`](BOR2/docs/forecast-integrations.md).
Ler antes de cadastrar obra no Storage, corrigir a flag `storage`, ou tocar em
score/exibição de Machines. Rotina de atualização de datas (Toll Brothers/Pulte Homes)
é assunto separado — ver `Premium - Data Att Forecast/PROCESSO_ATUALIZACAO.md`.

### Endereços da plataforma

O BOR responde em **`pg-bor.up.railway.app`**, com as páginas em **`/bor/*`**; `/login` fica na
raiz, e depois do login a pessoa cai direto na primeira página do BOR que pode abrir (`/bor`).
A "Data Intelligence Platform" (`pg-dip`, de 02/09 a 23/09/2026) acabou: o Atlas virou o
BuilderLog, produto à parte em `builderlog.co`, e `/atlas/*` redireciona para lá (307, provisório).

O endereço `pg-dip.up.railway.app` é atendido pelo serviço `BOR2/apps/redirect`, que devolve 308
para `pg-bor` preservando caminho e query. O Railway só permite um domínio `*.up.railway.app` por
serviço, por isso o redirecionamento é um serviço à parte.

Caminho antigo (`/forecast`) redireciona para o novo (`/bor/forecast`) pelo `src/middleware.ts`.
**A lista de segmentos do BOR vive nesse arquivo** — página nova do BOR que nasça fora de `/bor`
precisa entrar lá, senão o link antigo dela nunca funciona.

### Páginas BOR2

As rotas abaixo são relativas a `/bor` — `/forecast` significa `/bor/forecast`.

**Forecast & Projetos**
- `/forecast` — Pipeline de projetos por empresa (ex: Framing Forecast). Cards de projeto com status, team, datas, notas. Filtros: ano/mês/empresa, ordenação por start/beams, agrupamento por mês.
- `/forecast/metrics` — Scores de preparação (Fieldwire, Machines, Contract, QB Time, Storage). Gráfico de readiness médio por mês; drill-down de mês mostra tabela por projeto. Dois back-buttons (page header + detail panel).
- `/data-control` — Hub de edição dos dados do Forecast (admin). Criação/edição de projetos, catálogos (clientes, fieldwire, machines), sidebar de navegação com filtros.
- `/forecast-improvement` — Placeholder "Under construction".

**Building Schedule**
- `/building-schedule` — Visualizador de Gantt gerado de PDFs do MS Project. Filtros por trade/recurso com badges coloridas, expand/collapse hierárquico, drag-to-scroll na timeline.
- `/building-schedule/manage` — CRUD de schedules: upload de PDF, extração do Gantt via `parseSchedulePDF`, cards com metadados por schedule.

**Workforce & Timesheets**
- `/workforce` — Análise de timesheets por ano/mês/cliente/jobsite/tipo de serviço. Gráfico de horas por mês, top-N projetos configurável, breakdown por tipo.
- `/workforce-productivity` — KPIs por empresa (horas totais, nº funcionários, nº jobsites, média horas/funcionário). Filtragem via query params na URL; breakdown por funcionário.
- `/weekly-hours-control` — Análise Seg–Qua vs Qui–Sex, excluindo categorias configuráveis (lunch, holidays, admin…). Export canvas/PDF.
- `/timesheet` — Métricas simples de discrepâncias de timesheet (horas, funcionários, custo) com tabela por funcionário.
- `/upload-timesheet` — Upload CSV do QB Time por empresa/ano/mês com drag-drop. Resultado mostra inserted/skipped/errors. Dados PCG filtrados para Callahan.
- `/qbtime/daily-report` — Relatório diário do QB Time via upload CSV. Sidebar de times, toggle de formato de hora, export XLSX/PNG/PDF via canvas.
- `/qbtime/job-costing` — Relatório de pay period com hierarquia de 4 níveis de jobcode. Upload CSV com parsing de campos entre aspas, agrupamento por time, export.
- `/autolog` — Processador de CSV do QB Time com políticas configuráveis de clock-in/out (tolerâncias, horários por dia da semana). Rendering PNG por dia mostrando funcionários fora do range.

**Financeiro / Contabilidade**
- `/accounting` — Cash flow do QB por empresa. KPIs (recebido, pago, net cash), gráfico de área received/paid, carrossel de projetos com profit/loss.
- `/ofi` — Operational Forecast Index. 4 métricas de preparação com sparklines de tendência, filtro de mês, tabela de scores por projeto ordenável.
- `/fuel` — Frota Samsara + WEX. Tabs events vs transactions, KPIs (custo total, distância, idle events), filtro por motorista.
- `/wex-categorization` — Categorização de custo de combustível WEX por obra. Cards de relatório por empresa com métricas WEX/QB Time unificadas; export Excel/PDF. CRUD de driver mapping (`wex_normalization`) e ignored addresses por empresa. Edição de empresa de relatório existente via Popover com confirm/cancel. Listas de WEX drivers / QB employees por relatório via Popover flutuante (lazy-load dos results). Backend: `PATCH /api/v1/wex/reports/:id` para mudar empresa.

**Operações**
- `/inventory` — Aderência de estoque mensal/anual. KPIs (service level, excesso de unidades, impacto financeiro), gráfico de tendência com threshold de segurança, violações por projeto.
- `/permits` — Situação de alvarás. Campo de data dinâmico (solicitação/aplicação/emissão), gráfico de área, filtros ano/mês/situação/cliente/jobsite, painel de insights.
- `/service-requests` — Rastreamento de serviços/garantia. Métricas (espera material, espera residente, visitas adicionais, tempo de resolução), gráfico, carrossel de cards individuais.
- `/subcontractors` — Scoring de subcontratados (Works, Execution, Contract) com ano/mês. Tabela de ranking com badges coloridos (≥80 verde, ≥60 âmbar, <60 vermelho).
- `/monthly-execution` — Kanban de projetos (Planned / Started / Finished) com filtro ano/mês. Cards de projeto com KPIs; lógica de overlap de datas.
- `/project-monitoring` — Rastreamento de estágios de projetos HVAC. KPIs (total, on-track ≥50%, delayed), tabela com 4 badges de estágio e % de completude.

**Settings**
- `/settings` — Hub de configuração (dev/owner/manager only). Links para Users, Permissions, Notifications, Reset Password. Padrão visual: lista de rows em container único com ícone + título + descrição + chevron.
- `/settings/users` — CRUD de usuários com hierarquia de roles (dev > owner > manager > user). Senhas provisórias, permissões granulares por feature (read/write) em 4 grupos.
- `/settings/notifications` — CRUD de notificações. Envio imediato ou agendado (`CalendarClock`), seleção de destinatários por checkbox. Lista mostra status (sent/scheduled/draft).
- `/settings/workforce` — Upload de arquivos de workforce por empresa (Framing/PCG/HVAC) e mês. Lista de uploads com delete; badges por empresa com cor distinta.

**Dev / Ferramentas**
- `/dashboard` — KPIs globais: projetos ativos, recebíveis YTD (verde), payables (vermelho), subcontratados ativos. Dados de forecast + accounting + subcontractor hooks.

---

## GitHub
- Repo: `https://github.com/BitencourtVitor/business_operation_review`
- Branch principal: `main`
- Git user: `BitencourtVitor`
- Token configurado no remote (HTTPS com credencial embutida)

---

## Infraestrutura

**Railway é a infraestrutura do sistema:** API, web e banco (Railway PostgreSQL). O Supabase do
Premium Storage é outro projeto, usado pelo Forecast e pelo Inventory, e continua.

---

## Regras Gerais

1. **Staging seletivo sempre**: só entra no commit o que foi pedido
2. **NUNCA commitar nem fazer push sem ordem explícita** — esperar o usuário dizer "commita", "sobe", "faz o commit", "push" ou equivalente. Finalizar uma tarefa NÃO é autorização para commitar. Proibido commitar "automaticamente" ao final de qualquer fluxo de trabalho.
3. **Sem comentários desnecessários no código** — só quando o WHY não é óbvio
4. **Sem abstrações prematuras** — resolver o problema atual, não o hipotético futuro
5. **psql não está instalado localmente**: migration vai pelo psql, se instalado, ou por script Python (psycopg2) com o `DATABASE_URL`
6. **Supabase do Premium Storage é lido pela API REST**: a chave não tem permissão DDL, então não se cria tabela lá por aqui
7. **Todo seletor de data usa ShadcnUI `Calendar` + `Popover`** — nunca `<input type="date">` nativo
8. **Todo dado do sistema vem do Railway PostgreSQL**: a única exceção é o Supabase do Premium Storage. Dado novo de outra fonte é migrado para o Railway, não consultado na origem.
