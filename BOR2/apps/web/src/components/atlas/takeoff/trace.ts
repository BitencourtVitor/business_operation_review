// O decalque: lê o recorte da prancha como imagem e devolve os traços que ele
// reconhece. Roda sobre pixels, e não sobre os vetores do PDF, de propósito: set
// escaneado não tem vetor nenhum, e o que se quer é o gesto de quem põe o papel
// vegetal por cima e passa o lápis no que enxerga.
//
// É protótipo. As regras são heurísticas de planta baixa (parede é traço grosso
// ou par de traços paralelos, vão é o buraco entre duas paredes alinhadas,
// janela é o vão atravessado por linhas finas, porta é o vão com o arco do giro
// ao lado) e vão errar em desenho que foge disso.

export type TraceKind = "wall" | "door" | "window" | "opening" | "slope" | "line"

export interface Stroke {
  id: number
  kind: TraceKind
  x1: number
  y1: number
  x2: number
  y2: number
  /** Espessura do traço no recorte, em pixels. */
  thick: number
}

export interface TraceInput {
  width: number
  height: number
  /** Luminância, um byte por pixel. Cor não entra na leitura, e RGBA quadruplica a memória. */
  gray: Uint8Array
  /** Pixels do recorte por ponto de PDF. */
  pxPerPt: number
  /** Pontos de PDF por pé real, quando a folha tem escala. */
  ptPerFt: number | null
}

interface Seg {
  /** Eixo: 0 deitado, 1 em pé. */
  axis: 0 | 1
  /** Posição do centro no eixo cruzado (y do deitado, x do em pé). */
  c: number
  a: number
  b: number
  t: number
  used?: boolean
}

const DARK = 150

export function trace(input: TraceInput): Stroke[] {
  const { width: w, height: h, gray, pxPerPt } = input
  const dark = new Uint8Array(w * h)
  for (let i = 0; i < dark.length; i++) dark[i] = gray[i] < DARK ? 1 : 0
  // Tolerâncias em pixel crescem com a resolução: o recorte vem na maior escala
  // que o navegador aguenta, e um respiro de 4 px nela é menos que um fio.
  const tol = Math.max(4, pxPerPt)

  // Abaixo de nove pontos no papel é letra, seta ou hachura: não é o que se decalca.
  const minRun = Math.max(12, Math.round(9 * pxPerPt))
  const segs = [...runs(dark, w, h, 0, minRun), ...runs(dark, w, h, 1, minRun)]
    .filter(s => s.b - s.a >= s.t * 3)
  const merged = mergeCollinear(segs, Math.max(3, 0.8 * pxPerPt))

  const thin = medianThickness(merged)
  const walls: Seg[] = []

  for (const s of merged) {
    if (s.t >= Math.max(3, thin * 2.2) && s.b - s.a >= 18 * pxPerPt) {
      walls.push({ ...s })
      s.used = true
    }
  }

  // Parede de duas linhas: o par paralelo, sobreposto na maior parte, com a
  // distância de uma espessura de parede no papel.
  const minGap = 2.5 * pxPerPt
  const maxGap = 16 * pxPerPt
  const byLen = merged.filter(s => !s.used).sort((p, q) => (q.b - q.a) - (p.b - p.a))
  for (const s of byLen) {
    if (s.used || s.b - s.a < 18 * pxPerPt) continue
    let best: Seg | null = null
    let bestD = Infinity
    for (const o of byLen) {
      if (o === s || o.used || o.axis !== s.axis) continue
      const d = Math.abs(o.c - s.c)
      if (d < minGap || d > maxGap || d >= bestD) continue
      const ov = Math.min(s.b, o.b) - Math.max(s.a, o.a)
      if (ov < 0.6 * Math.min(s.b - s.a, o.b - o.a)) continue
      best = o
      bestD = d
    }
    if (!best) continue
    s.used = true
    best.used = true
    walls.push({
      axis: s.axis,
      c: (s.c + best.c) / 2,
      a: Math.min(s.a, best.a),
      b: Math.max(s.b, best.b),
      t: bestD + Math.max(s.t, best.t),
    })
  }

  const windows = windowsInWalls(walls, tol)
  const solid = walls.filter(s => !windows.includes(s))
  const openings = findOpenings(solid, windows, merged, dark, w, h, input)
  const covered = coverage(merged, walls, w, h, tol / 2)
  const slopes = findSlopes(dark, covered, w, h, minRun * 2, pxPerPt)

  const out: Stroke[] = []
  const push = (kind: TraceKind, x1: number, y1: number, x2: number, y2: number, thick: number) =>
    out.push({ id: out.length, kind, x1, y1, x2, y2, thick })
  for (const s of solid) {
    const [x1, y1, x2, y2] = ends(s)
    push("wall", x1, y1, x2, y2, s.t)
  }
  for (const s of windows) {
    const [x1, y1, x2, y2] = ends(s)
    push("window", x1, y1, x2, y2, s.t)
  }
  for (const o of openings) push(o.kind, o.x1, o.y1, o.x2, o.y2, o.thick)
  for (const s of slopes) push("slope", s.x1, s.y1, s.x2, s.y2, 1)
  const lines = merged
    .filter(s => !s.used && s.b - s.a >= minRun * 3)
    .sort((p, q) => (q.b - q.a) - (p.b - p.a))
    .slice(0, 400)
  for (const s of lines) {
    const [x1, y1, x2, y2] = ends(s)
    push("line", x1, y1, x2, y2, s.t)
  }
  return out
}

function ends(s: Seg): [number, number, number, number] {
  return s.axis === 0 ? [s.a, s.c, s.b, s.c] : [s.c, s.a, s.c, s.b]
}

/**
 * Corridas de pixel escuro numa direção, costuradas com as das linhas vizinhas.
 * Uma linha de três pixels de espessura é três corridas empilhadas; aqui ela
 * volta a ser um traço só, com a espessura contada.
 */
function runs(dark: Uint8Array, w: number, h: number, axis: 0 | 1, minRun: number): Seg[] {
  const lines = axis === 0 ? h : w
  const span = axis === 0 ? w : h
  const at = axis === 0 ? (k: number, i: number) => dark[k * w + i] : (k: number, i: number) => dark[i * w + k]

  type Open = { a: number; b: number; k0: number; k1: number; sa: number; sb: number; n: number }
  let active: Open[] = []
  const done: Seg[] = []
  const close = (o: Open) => {
    done.push({ axis, c: (o.k0 + o.k1) / 2, a: o.sa / o.n, b: o.sb / o.n, t: o.k1 - o.k0 + 1 })
  }

  for (let k = 0; k < lines; k++) {
    const row: [number, number][] = []
    let i = 0
    while (i < span) {
      if (!at(k, i)) { i++; continue }
      const start = i
      while (i < span && at(k, i)) i++
      if (i - start >= minRun) row.push([start, i - 1])
    }

    const next: Open[] = []
    const taken = new Set<Open>()
    for (const [a, b] of row) {
      let join: Open | null = null
      for (const o of active) {
        if (taken.has(o)) continue
        const ov = Math.min(b, o.b) - Math.max(a, o.a)
        if (ov >= 0.6 * Math.min(b - a, o.b - o.a)) { join = o; break }
      }
      if (join) {
        taken.add(join)
        join.a = a
        join.b = b
        join.k1 = k
        join.sa += a
        join.sb += b
        join.n++
        next.push(join)
      } else {
        next.push({ a, b, k0: k, k1: k, sa: a, sb: b, n: 1 })
      }
    }
    for (const o of active) if (!taken.has(o)) close(o)
    active = next
  }
  for (const o of active) close(o)
  return done
}

/** Traços na mesma reta separados por um respiro pequeno viram um só. */
function mergeCollinear(segs: Seg[], gap: number): Seg[] {
  const out: Seg[] = []
  for (const axis of [0, 1] as const) {
    const list = segs.filter(s => s.axis === axis).sort((p, q) => p.c - q.c || p.a - q.a)
    const groups: Seg[][] = []
    for (const s of list) {
      const g = groups.find(g => Math.abs(g[0].c - s.c) <= Math.max(2, g[0].t / 2) && Math.abs(g[0].t - s.t) <= Math.max(2, g[0].t * 0.6))
      if (g) g.push(s)
      else groups.push([s])
    }
    for (const g of groups) {
      g.sort((p, q) => p.a - q.a)
      let cur = { ...g[0] }
      for (const s of g.slice(1)) {
        if (s.a - cur.b <= gap) {
          const lenCur = cur.b - cur.a
          const lenS = s.b - s.a
          cur.c = (cur.c * lenCur + s.c * lenS) / (lenCur + lenS)
          cur.t = Math.max(cur.t, s.t)
          cur.b = Math.max(cur.b, s.b)
        } else {
          out.push(cur)
          cur = { ...s }
        }
      }
      out.push(cur)
    }
  }
  return out
}

function medianThickness(segs: Seg[]): number {
  if (!segs.length) return 1
  const sorted = segs.map(s => ({ t: s.t, len: s.b - s.a })).sort((p, q) => p.t - q.t)
  const total = sorted.reduce((sum, s) => sum + s.len, 0)
  let acc = 0
  for (const s of sorted) {
    acc += s.len
    if (acc >= total / 2) return s.t
  }
  return sorted[sorted.length - 1].t
}

/**
 * A janela desenhada como caixilho: um trecho de parede mais fino, encostado
 * na mesma reta entre dois trechos cheios. O par de linhas finas do vidro passa
 * pelo teste de parede dupla, e é aqui que ele volta a ser janela.
 */
function windowsInWalls(walls: Seg[], tol: number): Seg[] {
  const out: Seg[] = []
  for (const s of walls) {
    const line = walls.filter(o =>
      o !== s && o.axis === s.axis && Math.abs(o.c - s.c) <= Math.max(o.t, s.t) / 2 + 1 && s.t < o.t * 0.7)
    const before = line.some(o => Math.abs(o.b - s.a) <= tol)
    const after = line.some(o => Math.abs(o.a - s.b) <= tol)
    if (before && after) out.push(s)
  }
  return out
}

interface Opening { kind: "door" | "window" | "opening"; x1: number; y1: number; x2: number; y2: number; thick: number }

/**
 * O vão é o buraco entre duas paredes alinhadas, da largura de uma porta ou de
 * uma janela. Com escala, a largura se cobra em pés; sem ela, em pontos no papel.
 */
function findOpenings(walls: Seg[], windows: Seg[], segs: Seg[], dark: Uint8Array, w: number, h: number, input: TraceInput): Opening[] {
  const { pxPerPt, ptPerFt } = input
  const [minPx, maxPx] = ptPerFt
    ? [1.8 * ptPerFt * pxPerPt, 16 * ptPerFt * pxPerPt]
    : [14 * pxPerPt, 160 * pxPerPt]
  const out: Opening[] = []

  for (const axis of [0, 1] as const) {
    const list = walls.filter(s => s.axis === axis).sort((p, q) => p.c - q.c || p.a - q.a)
    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      let next: Seg | null = null
      for (let j = 0; j < list.length; j++) {
        const o = list[j]
        if (o === s || Math.abs(o.c - s.c) > Math.max(s.t, o.t) / 2 + 1 || o.a < s.b) continue
        if (!next || o.a < next.a) next = o
      }
      if (!next) continue
      const gap = next.a - s.b
      if (gap < minPx || gap > maxPx) continue

      const c = (s.c + next.c) / 2
      const t = Math.max(s.t, next.t)
      const a = s.b
      const b = next.a
      if (windows.some(x => x.axis === axis && Math.abs(x.c - c) <= t / 2 + 1 && x.a <= a + pxPerPt * 2 + 4 && x.b >= b - pxPerPt * 2 - 4)) continue

      // Janela: linhas finas paralelas dentro da faixa da parede, cobrindo o vão.
      const inside = segs.filter(x =>
        !x.used && x.axis === axis && Math.abs(x.c - c) <= t / 2 + 2
        && Math.min(x.b, b) - Math.max(x.a, a) >= 0.7 * gap)
      let kind: Opening["kind"] = "opening"
      if (inside.length >= 1) {
        kind = "window"
        for (const x of inside) x.used = true
      } else if (hasSwing(dark, w, h, axis, c, a, b, t, Math.max(2, Math.round(pxPerPt * 0.6)))) {
        kind = "door"
      }

      const [x1, y1, x2, y2] = axis === 0 ? [a, c, b, c] : [c, a, c, b]
      out.push({ kind, x1, y1, x2, y2, thick: t })
    }
  }
  return out
}

/**
 * O arco do giro da porta: com a dobradiça numa ponta do vão, um quarto de
 * círculo do raio do vão, para um lado ou para o outro da parede.
 */
function hasSwing(dark: Uint8Array, w: number, h: number, axis: 0 | 1, c: number, a: number, b: number, t: number, band: number): boolean {
  const r = b - a
  const hit = (x: number, y: number) => {
    for (let dy = -band; dy <= band; dy += Math.max(1, band >> 2)) {
      for (let dx = -band; dx <= band; dx += Math.max(1, band >> 2)) {
        const xx = Math.round(x + dx)
        const yy = Math.round(y + dy)
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && dark[yy * w + xx]) return true
      }
    }
    return false
  }
  for (const hinge of [a, b]) {
    for (const side of [-1, 1]) {
      let hits = 0
      const samples = 14
      for (let k = 1; k <= samples; k++) {
        const ang = (k / (samples + 1)) * (Math.PI / 2)
        const along = hinge + (hinge === a ? 1 : -1) * r * Math.cos(ang)
        const across = c + side * (t / 2 + r * Math.sin(ang))
        const [x, y] = axis === 0 ? [along, across] : [across, along]
        if (hit(x, y)) hits++
      }
      if (hits >= samples * 0.6) return true
    }
  }
  return false
}

function coverage(segs: Seg[], walls: Seg[], w: number, h: number, pad: number): Uint8Array {
  const mask = new Uint8Array(w * h)
  for (const s of [...segs, ...walls]) {
    const half = s.t / 2 + pad
    const [x0, x1, y0, y1] = s.axis === 0
      ? [s.a - pad, s.b + pad, s.c - half, s.c + half]
      : [s.c - half, s.c + half, s.a - pad, s.b + pad]
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.ceil(x1)); x++) mask[y * w + x] = 1
    }
  }
  return mask
}

interface Line { x1: number; y1: number; x2: number; y2: number }

/**
 * Os traços inclinados (telhado em corte e fachada, escada, chanfro), por Hough
 * progressivo: o pico mais votado vira reta, a reta só vale onde o traço é
 * contínuo, e os pixels dela devolvem os votos antes do próximo pico.
 */
function findSlopes(dark: Uint8Array, covered: Uint8Array, w: number, h: number, minLen: number, pxPerPt: number): Line[] {
  const pts: number[] = []
  const residual = new Uint8Array(w * h)
  for (let i = 0; i < dark.length; i++) {
    if (dark[i] && !covered[i]) { residual[i] = 1; pts.push(i) }
  }
  if (pts.length < minLen) return []

  // Meio grau: com um grau inteiro a reta escolhida sai do traço de verdade
  // depois de uns duzentos pixels, e o telhado vinha partido.
  const ANG = 360
  const cos = new Float32Array(ANG)
  const sin = new Float32Array(ANG)
  for (let a = 0; a < ANG; a++) {
    cos[a] = Math.cos((a * Math.PI) / ANG)
    sin[a] = Math.sin((a * Math.PI) / ANG)
  }
  // Em alta resolução a reta de um fio tem vários pixels de largura: a faixa
  // de busca, o respiro e a distância de papel limpo acompanham a escala, e o
  // raio do acumulador é contado em passos, para ele não passar de 50 MB.
  const band = Math.max(2, Math.round(pxPerPt * 0.6))
  const around = Math.max(6, Math.round(pxPerPt * 2.5))
  const rhoStep = Math.max(1, pxPerPt * 0.5)
  const diag = Math.ceil(Math.hypot(w, h) / rhoStep)
  const R = diag * 2 + 1
  const acc = new Int32Array(ANG * R)
  // Perto do deitado e do em pé já foi tratado pelas corridas.
  const skip = (a: number) => a < 16 || a > 344 || Math.abs(a - 180) < 16
  const vote = (i: number, delta: number) => {
    const x = i % w
    const y = (i / w) | 0
    for (let a = 0; a < ANG; a++) {
      if (skip(a)) continue
      const r = Math.round((x * cos[a] + y * sin[a]) / rhoStep) + diag
      acc[a * R + r] += delta
    }
  }
  const step = Math.max(1, Math.ceil(pts.length / 400_000))
  // Quem votou fica marcado com 2, para devolver o voto exatamente de quem o deu.
  for (let k = 0; k < pts.length; k += step) { residual[pts[k]] = 2; vote(pts[k], 1) }

  const out: Line[] = []
  const gapTol = Math.max(4, Math.round(pxPerPt))
  for (let iter = 0; iter < 120; iter++) {
    let best = 0
    let bi = -1
    for (let i = 0; i < acc.length; i++) if (acc[i] > best) { best = acc[i]; bi = i }
    if (bi < 0 || best * step < minLen * 0.5) break

    const a = Math.floor(bi / R)
    const r = ((bi % R) - diag) * rhoStep
    // Direção da reta é perpendicular à normal (cos, sin).
    const dx = -sin[a]
    const dy = cos[a]
    const x0 = r * cos[a]
    const y0 = r * sin[a]

    let found = false
    // O parâmetro da reta anda por negativos: o sentinela não pode ser -1.
    let runStart: number | null = null
    let lastHit = 0
    const flush = (end: number) => {
      if (runStart === null) return
      const len = end - runStart
      // Traço de verdade tem papel limpo dos dois lados. Bloco de texto e
      // hachura também alinham pixels numa reta, mas são escuros em volta.
      let dirty = 0
      let samples = 0
      for (let s = runStart; s <= end; s += Math.max(3, band)) {
        for (const o of [-around, around]) {
          const x = Math.round(x0 + dx * s + cos[a] * o)
          const y = Math.round(y0 + dy * s + sin[a] * o)
          if (x < 0 || y < 0 || x >= w || y >= h) continue
          samples++
          if (dark[y * w + x]) dirty++
        }
      }
      if (len >= minLen && dirty <= samples * 0.25) {
        out.push({
          x1: x0 + dx * runStart, y1: y0 + dy * runStart,
          x2: x0 + dx * end, y2: y0 + dy * end,
        })
        found = true
        for (let s = runStart; s <= end; s++) {
          for (let o = -band; o <= band; o++) {
            const x = Math.round(x0 + dx * s + cos[a] * o)
            const y = Math.round(y0 + dy * s + sin[a] * o)
            if (x < 0 || y < 0 || x >= w || y >= h) continue
            const i = y * w + x
            if (residual[i] === 2) vote(i, -1)
            residual[i] = 0
          }
        }
      }
      runStart = null
    }
    const reach = Math.ceil(Math.hypot(w, h))
    for (let s = -reach; s <= reach; s++) {
      const x = x0 + dx * s
      const y = y0 + dy * s
      if (x < -1 || y < -1 || x > w || y > h) continue
      let on = false
      for (let o = -band; o <= band && !on; o += Math.max(1, band >> 1)) {
        const xx = Math.round(x + cos[a] * o)
        const yy = Math.round(y + sin[a] * o)
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && residual[yy * w + xx]) on = true
      }
      if (on) {
        if (runStart === null) runStart = s
        lastHit = s
      } else if (runStart !== null && s - lastHit > gapTol) {
        flush(lastHit)
      }
    }
    flush(lastHit)
    if (!found) acc[bi] = 0
    if (out.length >= 80) break
  }
  return out
}

/** Ordem de desenho: o lápis vai à ponta mais próxima de onde parou. */
export function drawingOrder(strokes: Stroke[]): Stroke[] {
  const rank: Record<TraceKind, number> = { wall: 0, slope: 1, window: 2, door: 2, opening: 2, line: 3 }
  const out: Stroke[] = []
  let px = 0
  let py = 0
  for (const group of [0, 1, 2, 3]) {
    const pool = strokes.filter(s => rank[s.kind] === group)
    while (pool.length) {
      let bi = 0
      let bd = Infinity
      let flip = false
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i]
        const d1 = (s.x1 - px) ** 2 + (s.y1 - py) ** 2
        const d2 = (s.x2 - px) ** 2 + (s.y2 - py) ** 2
        if (d1 < bd) { bd = d1; bi = i; flip = false }
        if (d2 < bd) { bd = d2; bi = i; flip = true }
      }
      const [s] = pool.splice(bi, 1)
      const o = flip ? { ...s, x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1 } : s
      out.push(o)
      px = o.x2
      py = o.y2
    }
  }
  return out
}
