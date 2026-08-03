import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"

type Row = Record<string, any>

const backupPath = process.argv[2]
const outputPath = process.argv[3]
const storageURL = process.env.PREMIUM_STORAGE_URL?.replace(/\/$/, "")
const storageKey = process.env.PREMIUM_STORAGE_KEY

if (!backupPath || !outputPath || !storageURL || !storageKey) {
  throw new Error("usage: build-inventory-backup <backup.json> <output.json> with PREMIUM_STORAGE_URL and PREMIUM_STORAGE_KEY")
}

async function fetchTable(table: string, select = "*"): Promise<Row[]> {
  const response = await fetch(`${storageURL}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=5000`, {
    headers: { apikey: storageKey!, Authorization: `Bearer ${storageKey}` },
  })
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`)
  return response.json()
}

const backup = JSON.parse(await readFile(resolve(backupPath), "utf8"))
const [projects, houseModels, limits, users] = await Promise.all([
  fetchTable("projects", "id,nome,house_model_id"),
  fetchTable("house_models", "id,nome"),
  fetchTable("house_model_products", "house_model_id,product_id,quantidade_limite"),
  fetchTable("users", "id,nome,role"),
])

const byID = (rows: Row[]) => new Map(rows.map(row => [row.id, row]))
const projectByID = byID(projects)
const modelByID = byID(houseModels)
const userByID = byID(users)
const productByID = byID(backup.products)
const limitByModelProduct = new Map(
  limits.map(row => [`${row.house_model_id}:${row.product_id}`, Number(row.quantidade_limite) || 0]),
)
const itemsByMovement = new Map<string, Row[]>()
for (const item of backup.stock_movement_items as Row[]) {
  const items = itemsByMovement.get(item.stock_movement_id) ?? []
  items.push(item)
  itemsByMovement.set(item.stock_movement_id, items)
}

const movements = [...backup.stock_movements].sort((a: Row, b: Row) =>
  String(a.movement_date).localeCompare(String(b.movement_date)) ||
  String(a.created_at).localeCompare(String(b.created_at)) ||
  String(a.id).localeCompare(String(b.id)),
)
const months = [...new Set(movements.map((movement: Row) => String(movement.movement_date).slice(0, 7)))].sort()

const balances = new Map<string, number>()
const history: Row[] = []
let movementIndex = 0
for (const month of months) {
  while (movementIndex < movements.length && String(movements[movementIndex].movement_date).slice(0, 7) === month) {
    const movement = movements[movementIndex++]
    for (const item of itemsByMovement.get(movement.id) ?? []) {
      const quantity = Number(item.quantidade) || 0
      const delta = movement.tipo === "saida" ? -quantity : quantity
      balances.set(item.product_id, (balances.get(item.product_id) ?? 0) + delta)
    }
  }
  for (const product of backup.products as Row[]) {
    if (product.visible === false) continue
    const balance = balances.get(product.id) ?? 0
    const minimum = Number(product.saldo_minimo) || 0
    history.push({
      mes: `${month}-01`,
      product_id: product.id,
      product_nome: product.nome,
      saldo_minimo: minimum,
      saldo_acumulado: balance,
      abaixo_minimo: balance < minimum,
      source: "backup",
    })
  }
}

const cumulativeByProjectProduct = new Map<string, number>()
const details: Row[] = []
for (const movement of movements) {
  if (movement.tipo !== "saida" || !movement.project_id) continue
  const project = projectByID.get(movement.project_id)
  if (!project) continue
  const model = modelByID.get(project.house_model_id)
  const user = userByID.get(movement.usuario_id)
  for (const item of itemsByMovement.get(movement.id) ?? []) {
    const product = productByID.get(item.product_id)
    if (!product) continue
    const key = `${movement.project_id}:${item.product_id}`
    const consumed = (cumulativeByProjectProduct.get(key) ?? 0) + (Number(item.quantidade) || 0)
    cumulativeByProjectProduct.set(key, consumed)
    const limit = limitByModelProduct.get(`${project.house_model_id}:${item.product_id}`) ?? 0
    details.push({
      id: item.id,
      movement_id: movement.id,
      project_id: movement.project_id,
      project_nome: project.nome ?? movement.project_id,
      house_model_nome: model?.nome ?? "No template",
      product_id: item.product_id,
      product_nome: product.nome,
      usuario_responsavel: user?.nome ?? "Historical user",
      destinatario_id: movement.destinatario_id,
      movement_date: movement.movement_date,
      quantidade_retirada: Number(item.quantidade) || 0,
      quantidade_limite: limit,
      consumo_acumulado_momento: consumed,
      excedeu_neste_momento: consumed > limit,
      valor_unitario: Number(item.valor_unitario ?? item.custo_medio_aplicado) || 0,
      source: "backup",
    })
  }
}

const output = {
  reset_date: "2026-07-16",
  backup_through: "2026-07-15",
  movement_count: movements.length,
  item_count: backup.stock_movement_items.length,
  historico_saldo: history,
  detalhes_excesso: details,
}

await mkdir(dirname(resolve(outputPath)), { recursive: true })
await writeFile(resolve(outputPath), JSON.stringify(output))
console.log(JSON.stringify({
  months,
  movementCount: movements.length,
  itemCount: backup.stock_movement_items.length,
  historyRows: history.length,
  detailRows: details.length,
}))
