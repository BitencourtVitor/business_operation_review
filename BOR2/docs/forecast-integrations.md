# Integrações do Forecast — Storage e Machines

Conhecimento de domínio sobre duas integrações do Framing Forecast (`forecast_core`,
Railway PostgreSQL) que não estavam documentadas em lugar nenhum antes de 2026-07-21:
o vínculo com o sistema **Premium Storage** (Supabase, repo separado) e a exceção de
cliente **Private** no catálogo de **Machines**. Ler antes de cadastrar obra nova,
corrigir a flag `storage`, ou tocar em qualquer lógica de score/exibição de Machines.

Não confundir com [`Premium - Data Att Forecast/PROCESSO_ATUALIZACAO.md`](../../Premium%20-%20Data%20Att%20Forecast/PROCESSO_ATUALIZACAO.md),
que documenta só a rotina de quarta/sexta de atualização de datas (Toll Brothers/Pulte
Homes). Este arquivo cobre as demais integrações e vale para qualquer cliente
(Private, HVAC, PCG, Toll Brothers, Pulte Homes).

---

## 1. Vínculo com o Premium Storage

O Storage (`Premium - Storage`, projeto Supabase `mmohmdhhoroupsjgakpg`, separado
deste repo) é o sistema de controle de estoque/materiais por obra. `forecast_core.storage`
(boolean) indica se a obra já foi cadastrada lá — **não é seedado automaticamente**
como `forecast_fieldwire`/`forecast_machines`; é cadastro manual.

### 1.1. Onde/como escrever no Storage

- **A anon key é somente leitura** — `grant_external_access.sql` só concede `GRANT SELECT`
  pra `anon`/`authenticated` nas tabelas `projects`, `house_models`, `house_model_products`,
  etc. (propositalmente: outros projetos, como o BOR2, só devem *consumir* esses dados,
  nunca escrever direto). Tentar `INSERT`/`UPDATE` via REST com a anon key falha por
  permissão.
- **Escrever só via migration + `supabase db push`**, autenticado com a senha do banco
  (`DATABASE_PASSWORD` no `.env.local` do Storage). É o mesmo canal que o próprio time
  usa pra mudança de schema — DML de cadastro em lote também é aceitável ali, não só DDL.
  ```bash
  cd "Premium - Storage"
  export SUPABASE_ACCESS_TOKEN=<sbp_... do .env.local>
  npx supabase link --project-ref mmohmdhhoroupsjgakpg -p <DATABASE_PASSWORD>
  # criar supabase/migrations/<timestamp>_<nome>.sql com o INSERT/UPDATE
  npx supabase db push --yes
  ```
- A tabela `projects` **não tem coluna de endereço** hoje — existiu (`endereco`,
  `add_project_address.sql`) e foi revertida (`revert_project_address.sql`). Não tentar
  inserir nela; só `nome` e `house_model_id`.

### 1.2. Convenção de nome e vínculo com `house_models`

Cada comunidade/subdivisão tem um `house_model` fixo ("modelo de retirada" — define
limite de material por produto, `house_model_products.quantidade_limite`) que **todos
os lotes daquela comunidade compartilham**. Nome do projeto no Storage segue o padrão
`"<Comunidade> Lot <N>"` (ex.: `"Willis Brook Lot 10"`, `"Emerald Run Lot 58"`), onde
`<Comunidade>` é derivado do `job_site` do `forecast_core` **descartando o sufixo
"at <cidade>, <estado>"** e, no caso de Toll Brothers/Owls Nest, também descartando o
prefixo "The Pinehills" (o Storage usa só `"Owls Nest"`).

Nome do `house_model` segue `"<TB|PH> - <Comunidade>[ - <Tipo>]"` (ex.: `"TB - Willis
Brook"`, `"PH - Bates - House"`, `"PH - Chauncy Lake - Building"`) — mas **o sufixo de
tipo não é consistente** (algumas comunidades Pulte têm, outras não); nunca inventar
uma variante com sufixo diferente do que já existe — sempre reusar o `house_model_id`
exato que os lotes-irmãos daquela comunidade já usam. Descobrir isso é uma query, não
uma convenção fixa:
```sql
select p.nome, p.house_model_id, hm.nome as modelo
from projects p left join house_models hm on hm.id = p.house_model_id
where p.nome ilike '<comunidade>%';
```

**Cliente Private (obra avulsa, sem comunidade)**: cadastrar sem `house_model_id`
(`NULL` — a coluna aceita null desde `allow_null_house_model.sql`, exatamente pra esse
caso). Não inventar modelo pra obra avulsa.

**Comunidade nova sem `house_model` ainda cadastrado**: cadastrar a obra mesmo assim
(`house_model_id = NULL`), nunca inventar limite de material sem o dado real — isso é
decisão de negócio do usuário, não do código. Pendências conhecidas em 2026-07-21:
`Union Point`, `Lexington` (= Fieldside at Lexington), `Glenford`, `Quincy` (comunidade
literalmente marcada "não confirmada" no Forecast).

**Dado que já se perdeu antes**: existem obras no Storage cadastradas sem
`house_model_id` que *deveriam* ter (comunidade já tem modelo, só não foi vinculado na
hora do cadastro — erro humano, não convenção). Ao corrigir uma comunidade, sempre
checar se há lotes-irmãos órfãos (`house_model_id is null`) e corrigi-los junto, não só
os novos.

### 1.3. Depois de cadastrar no Storage

Virar a flag no `forecast_core` (Railway):
```sql
update forecast_core set storage = true where id = '<uuid>';
```
Storage e Forecast não têm nenhuma FK ou sincronização automática entre si — o vínculo
é só pelo nome/comunidade, mantido manualmente por quem cadastra.

---

## 2. Machines — catálogo e a exceção Private

### 2.1. Como o seed funciona

`catalog_forecast_machines` é casado por `category` (= `forecast_core.cliente`) +
`subcategory` (= `forecast_core.type`) — ver `seedMachines` em
[`forecast_postgres.go`](../apps/api/internal/repository/forecast_postgres.go).
Roda tanto no `Create` quanto no `Update` do projeto (backfill se cliente/type mudar
depois de criada a obra).

**Cliente `Private` não tem nenhuma entrada no catálogo** — é assim de propósito, obra
avulsa não usa máquina de comunidade. Isso significa que toda obra Private sempre tem
`forecast_machines` vazio, permanentemente, e isso é o comportamento correto — **não é
bug, não é "obra incompleta"**.

### 2.2. A pegadinha: lista vazia ≠ "não aplicável" por padrão no resto do código

Todo consumidor de `machines`/`forecast_machines` que faz `total == 0 → score 0` ou
`length ? ... : false` está tratando "não aplicável" como "incompleto". Havia (corrigido
em 2026-07-21, commit `a8ba5cf`) três lugares fazendo exatamente isso — se algum novo
consumidor de `machines` for escrito, replicar o mesmo tratamento (`cliente === "private"`
→ tratar como 100%/completo, nunca 0%):

| Onde | O que fazer para Private |
|---|---|
| `calcMachineScore` em [`ofi.go`](../apps/api/internal/handler/ofi.go) (score mensal do OFI) | retorna `2` (peso máximo) direto, sem consultar `forecast_machines` |
| Ícone "Machines & Attachments" em [`forecast-card.tsx`](../apps/web/src/components/features/forecast/forecast-card.tsx) (card do `/forecast`) | `mComplete`/`done` forçados `true`, `mPct = 100` |
| `projectAspects` em [`metrics/page.tsx`](../apps/web/src/app/(dashboard)/forecast/metrics/page.tsx) (tabela de readiness do `/forecast/metrics`) | `machines: true` direto |

O sheet de detalhe (`forecast-project-sheet.tsx`) e a métrica agregada do card
(`getCompletionMetrics`) já faziam a coisa certa antes disso: só contam Machines no
total/pct **se existir pelo menos 1 item** — Private com lista vazia simplesmente não
entra na conta, não penaliza. Esse é o padrão a seguir sempre que possível (omitir do
cálculo em vez de forçar "completo") — só foi preciso forçar `true`/`100%` explícito nos
três lugares acima porque eles não tinham essa guarda condicional.

Nenhuma correção de dado histórico foi necessária junto com o fix de código — nenhuma
obra Private tinha registro em `forecast_machines` nem em `operational_forecast_index`
até 2026-07-21, então a correção do cálculo já resolveu retroativamente todas as obras
existentes sem precisar de migration.
