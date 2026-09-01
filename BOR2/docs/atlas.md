# Atlas — gestão documental e diário de obra

Segundo braço da plataforma Premium. BOR de um lado (dados corporativos, forecast,
financeiro), Atlas do outro (documento, planta, campo). Missão: aposentar o **Fieldwire**
primeiro e o **Buildertrend** depois.

Este documento descreve o que **existe implementado** em 01/09/2026. As decisões de produto
e a justificativa de cada escolha estão no backlog do dia (`backlog/2026-09-01/AT-*.md`);
aqui está a forma como elas viraram código.

---

## A plataforma tem dois destinos

O login deixou de ser "o login do BOR". A tela não cita produto nenhum: autentica na
plataforma e cai em `/select`, onde escolhe entre **BOR** e **Atlas** — só os destinos que a
permissão libera, e quem tem um só entra direto nele.

| Peça | Arquivo |
|---|---|
| Regra de acesso a produto | `apps/web/src/lib/products.ts` |
| Tela de seleção | `apps/web/src/app/(platform)/select/page.tsx` |
| Login (sem marca de produto) | `apps/web/src/components/auth/login-form.tsx` |
| Salto BOR → Atlas | `apps/web/src/components/layout/header.tsx` |
| Salto Atlas → BOR | `apps/web/src/components/atlas/atlas-header.tsx` |

**Acesso a produto** é a chave `atlas` no `user_permissions` — um eixo acima das outras
chaves, que são features. Ter Atlas e não ter BOR é um estado válido. O BOR não tem chave
própria: tê-lo é ter qualquer permissão que não seja a do Atlas.

**Acesso por obra** é outra coisa, e mora em `atlas_jobsite_access`: `read` (abre),
`annotate` (marca a planta, abre evento, escreve no diário) e `manage` (sobe documento,
publica versão, concede acesso). Papéis que administram a plataforma — dev, owner, admin,
manager — enxergam todas as obras sem concessão.

---

## Storage: o arquivo nunca passa pela API

Cloudflare R2, bucket `atlas`, classe Standard. O cliente fala **direto** com o bucket por
URL assinada; o backend só decide se assina. Um set de plantas de 112 MB atravessando o
serviço Go seria banda e memória jogadas fora.

```
POST /atlas/documents/:id/versions   → cria a versão (status pending) + URL de PUT
PUT  <url assinada>                  → navegador → R2, sem passar pela API
POST /atlas/versions/:id/confirm     → backend confere no bucket e marca uploaded
POST /atlas/versions/:id/publish     → abre o documento aos externos
```

O `status` da versão existe para que um upload interrompido fique **visível** como falha em
vez de virar uma versão que aponta para meio arquivo.

Convenção de chave (`internal/service/r2.go`):

```
jobsites/<jobsite>/documents/<doc>/versions/<version>/<arquivo>
jobsites/<jobsite>/versions/<version>/thumbs/<0000>.jpg
jobsites/<jobsite>/versions/<version>/pages/<0000>@<dpi>.jpg   ← cache do render (AT-13)
jobsites/<jobsite>/media/<media>/<arquivo>
```

Versão entra na chave, revisão não: revisão é texto que a obra escolhe ("rev 2", "REV.2") e
não serve de endereço.

**Smoke test:** `go run ./cmd/atlas-r2check` sobe, confere, lê e apaga um objeto pela mesma
URL assinada que a aplicação usa. Rodado em 01/09 — passou nas quatro etapas, o que fecha a
pendência 3 do AT-8 (escrita nunca havia sido exercitada).

---

## Esquema (migração `000126_atlas`)

```
atlas_jobsite ─┬─ atlas_jobsite_access
               ├─ atlas_document ── atlas_document_version ── atlas_sheet ── atlas_annotation
               ├─ atlas_event ── atlas_event_reply
               ├─ atlas_daily_log
               └─ atlas_media  (→ event | daily_log)
```

Três decisões que o esquema carrega:

1. **A FK mora no filho.** O documento não guarda a lista de folhas; cada folha sabe de qual
   versão veio.
2. **A versão fica no meio.** É ela que impede uma anotação feita na rev 2 de aparecer
   flutuando sobre a rev 3.
3. **Anotação é uma linha por traço**, com `geometry` JSONB dos pontos normalizados daquele
   traço. Uma coluna JSONB coletiva na folha faria cada traço novo reescrever os 400
   anteriores, causaria lost update entre dois usuários e mataria autoria por anotação.

**Fragmento é linha, não arquivo.** Cortar o PDF em páginas infla ~5,5× (medição no AT-4), e
render raster por folha em resolução legível custa mais que o original inteiro. Guarda-se só
o PDF original; a folha é um índice de página com o metadado do carimbo.

**Auditoria** não tem tabela própria: a migração 000124 instala o trigger `zz_audit` em toda
tabela nova por event trigger, e o middleware `Audit` já registra a requisição. As dez
tabelas do Atlas nasceram auditadas — conferível em `SELECT * FROM audit_cobertura`.

---

## API

Tudo sob `/api/v1/atlas`, atrás da permissão `atlas`. O acesso por obra é cobrado dentro do
handler (`internal/handler/atlas.go`), porque só ele sabe de qual obra cada recurso é filho.

| Recurso | Rotas |
|---|---|
| Obras | `GET/POST /jobsites`, `GET/PATCH /jobsites/:id` |
| Acesso | `GET /jobsites/:id/access`, `PUT/DELETE /jobsites/:id/access/:userId` |
| Documentos | `GET/POST /jobsites/:id/documents`, `PATCH /documents/:id` |
| Versões | `GET/POST /documents/:id/versions`, `POST /versions/:id/confirm`, `POST /versions/:id/publish`, `GET /versions/:id/download` |
| Folhas | `GET/PUT /versions/:id/sheets`, `PATCH /sheets/:id` |
| Anotações | `GET/POST /sheets/:id/annotations`, `DELETE /annotations/:id` |
| Eventos | `GET/POST /jobsites/:id/events`, `PATCH /events/:id`, `GET/POST /events/:id/replies` |
| Diário | `GET/POST /jobsites/:id/daily-logs`, `PATCH /daily-logs/:id` |
| Mídia | `GET/POST /jobsites/:id/media`, `POST /media/:id/confirm`, `GET /media/:id/url` |

Duas rotas gravam com **id vindo do cliente** e são idempotentes — anotação e evento. É o que
permite anotar em obra sem sinal e sincronizar depois sem duplicar.

Revogar acesso é `UPDATE ... SET revoked_at`, nunca `DELETE`: a linha é a prova de que o
acesso existiu, e o AT-7 exige concessão e revogação na trilha.

---

## Frontend

Route group `(atlas)`, fora de `(dashboard)`: o Atlas não herda sidebar nem header do BOR.

| Rota | O que é |
|---|---|
| `/atlas` | Obras — busca, contadores de documento e evento aberto |
| `/atlas/[jobsiteId]` | Sala da obra: Documentos · Diário · Eventos · Acessos |
| `/atlas/[jobsiteId]/documents/[documentId]` | Versões, upload de revisão, folhas |

O leitor de folha (`components/atlas/sheet-viewer.tsx`) tem caneta, marca-texto, cor, zoom,
pin de evento e borracha, gravando traço a traço em coordenada normalizada.

---

## O que ainda não existe

**1. Fragmentação (AT-10/AT-11/AT-12).** O que conta como folha no padrão do Fieldwire ainda
não foi estudado, e é pré-requisito da Fase 1. O destino está pronto: `PUT
/atlas/versions/:id/sheets` recebe a lista e é idempotente — reprocessar a mesma versão
corrige o metadado sem duplicar folha e sem derrubar as anotações presas a ela. Falta quem
produz a lista, e onde roda (API, worker ou job pós-upload).

Também em aberto: qual biblioteca lê a estrutura do PDF em Go, ou se vale um sidecar com
poppler/pdfium. O material de referência é vetorial com texto extraível — `pdftotext` deu
conta —, então a leitura do carimbo é viável **sem OCR** neste set. Set escaneado vai exigir
OCR ou digitação.

**2. Render da folha (AT-13).** A decisão mais cara ainda aberta: renderizar no servidor
(Go + poppler/pdfium) ou no cliente (pdf.js). O original não é linearizado, o que dificulta
pedir uma página por byte-range — daí a pergunta de linearizar na ingestão. O leitor já
mantém a proporção real da prancha e grava as anotações; quando o render existir, ele entra
como um `<image>` atrás da camada de anotação, sem mexer em coordenada nenhuma.

**3. Miniaturas.** `atlas_sheet.thumb_key` existe e a convenção de chave está definida; nada
gera as imagens ainda.

**4. Usuários externos (AT-6).** O acesso por obra já cobre "quem entra e até onde vai", mas
convite por e-mail com expiração, e a decisão de o externo viver na mesma tabela `users` ou
em tabela separada, continuam em aberto.

**5. Variáveis do R2 em produção (AT-8).** Estão no `.env` local, **não** no Railway. Push
não resolve: é a única parte da configuração que o auto-deploy da `main` não carrega. Sem
elas, a API sobe normalmente e o Atlas responde `503 R2_NOT_CONFIGURED` em qualquer rota que
toque arquivo — o resto do Atlas funciona. Continua valendo rotacionar a credencial antes de
gravá-la em produção.

**6. Tempo real e offline (AT-14).** Dois usuários na mesma folha sincronizam por refresh. O
id de anotação já nasce no cliente, que é a metade difícil do offline; falta a fila local e a
política de reconciliação.
