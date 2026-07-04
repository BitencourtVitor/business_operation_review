# BOR — Business Operation Review

## Estrutura do Projeto

```
/
├── BOR1/   — Sistema legado (em operação, NÃO reescrever)
└── BOR2/   — Rewrite completo (em desenvolvimento ativo)
```

**Regra crítica:** Nunca modificar ou commitar arquivos de `BOR2/` sem instrução explícita. O BOR2 tem seu próprio ciclo de desenvolvimento separado.

---

## BOR1 — Sistema Legado

### Stack
- **Frontend:** Vite + React + TypeScript (em `BOR1/frontend/`)
- **Database:** Supabase PostgreSQL (`zsqbejfmbyuanetoxewt.supabase.co`)
- **Pipelines:** Node.js ESM (quickbooks-pipeline, fuel-pipeline)

### Credenciais BOR1
- Supabase URL + anon key: `BOR1/quickbooks-pipeline/.env` e `BOR1/frontend/.env`
- Supabase project ID: `zsqbejfmbyuanetoxewt`

### Como rodar migration no Supabase (BOR1)
Sem psql instalado localmente e sem Supabase CLI, usar o **Supabase Dashboard SQL Editor**:
1. Acessa `https://supabase.com/dashboard/project/zsqbejfmbyuanetoxewt`
2. SQL Editor → cola e executa o arquivo de migration

### QB Pipeline (`BOR1/quickbooks-pipeline/`)
- `run_all.js` — orquestra todos os scripts para as 3 empresas: `hvac`, `pcg`, `framing`
- Empresas: HVAC (`HVAC_REALM_ID`), PCG (`PCG_REALM_ID`), Framing (`FRAMING_REALM_ID`)
- Scripts: `bills.js`, `bill_payments.js`, `estimates.js`, `invoices.js`, `payments.js`, `purchase.js`, `vendor_credit.js`, `deposit.js`
- Cada script loga execução em `qb_sync_log` (migration: `BOR1/frontend/backend/migrations/20260501_create_qb_sync_log.sql`)
- `run_all.js` gera um `RUN_ID` UUID e passa via env `QB_RUN_ID` para todos os scripts filhos

### Edge Functions (Supabase)
- `ofi_calculator` — roda às 23:59 UTC todo fim de mês (transição mensal)

---

## BOR2 — Rewrite

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
- `DATABASE_URL=postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway`
- `DATABASE_INTERNAL_URL=postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@postgres.railway.internal:5432/railway`

### Como rodar migration no BOR2 (Railway PostgreSQL)
```bash
psql "postgresql://postgres:aTOqkxMEqJXUoEbqTHPbMjzunUgNQKBE@junction.proxy.rlwy.net:34093/railway" -f caminho/para/migration.sql
```
Se psql não estiver instalado localmente, usar Railway CLI:
```bash
railway login
railway link   # vincular ao projeto BOR
railway connect postgres
```

### Railway CLI — Token de acesso
Token salvo em `BOR2/.env` como `RAILWAY_TOKEN=362db99a-4f60-431e-85f0-264744a9cb86` (token de projeto, também replicado nas Shared Variables do projeto no Railway pelo usuário — evita ter que recriar)
Para autenticar o CLI sem login interativo:
```bash
RAILWAY_TOKEN=362db99a-4f60-431e-85f0-264744a9cb86 railway <comando>
```
Ou exportar antes de usar: `export RAILWAY_TOKEN=362db99a-4f60-431e-85f0-264744a9cb86`

### Decisões de produto BOR2
- Routing: App Router do Next.js (NÃO SPA)
- Mobile Forecast: descontinuado — tela de Forecast já responsiva
- Permissões: por usuário, gerenciável em Settings (Admin/Developer only)
- DataControl: edição de dados do Forecast pelo admin

### Páginas BOR2

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
- `/bor1-explorer` — Browser read-only das tabelas Supabase do BOR1. Split layout: lista de tabelas filtráveis à esquerda, visualização paginada com tipos de células (datas, booleans, JSON) e export CSV por tabela.

---

## GitHub
- Repo: `https://github.com/BitencourtVitor/business_operation_review`
- Branch principal: `main`
- Git user: `BitencourtVitor`
- Token configurado no remote (HTTPS com credencial embutida)

---

## Missão

**Descontinuar o BOR1 gradualmente.** O BOR1 está em produção e é usado hoje — correções e melhorias nele são válidas e necessárias. A meta é ir transferindo funcionalidades para o BOR2 ao longo do tempo até o BOR1 poder ser desligado.

**Supabase e Vercel serão aposentados** — substituídos inteiramente pelo Railway. O banco de dados final é o Railway PostgreSQL.

---

## Regras Gerais

1. **Nunca tocar BOR2 sem instrução explícita** — staging seletivo sempre
2. **NUNCA commitar nem fazer push sem ordem explícita** — esperar o usuário dizer "commita", "sobe", "faz o commit", "push" ou equivalente. Finalizar uma tarefa NÃO é autorização para commitar. Proibido commitar "automaticamente" ao final de qualquer fluxo de trabalho.
3. **Sem comentários desnecessários no código** — só quando o WHY não é óbvio
4. **Sem abstrações prematuras** — resolver o problema atual, não o hipotético futuro
5. **psql não está instalado localmente** — migrations BOR1 via Supabase dashboard, BOR2 via Railway CLI ou psql se instalado
6. **Supabase anon key não tem permissão DDL** — não tenta criar tabelas via API REST
7. **Todo seletor de data usa ShadcnUI `Calendar` + `Popover`** — nunca `<input type="date">` nativo
8. **BOR2 NUNCA depende do BOR1** — o BOR1 será desligado. É proibido criar qualquer vínculo de BOR2 com BOR1: sem chamadas à API do Supabase, sem rotas Next.js que consultam o BOR1, sem lógica de fallback para dados do BOR1. Todo dado que BOR2 precisa deve vir do Railway PostgreSQL ou ser migrado para lá.
