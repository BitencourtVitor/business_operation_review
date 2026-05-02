"use client"

import * as XLSX from "xlsx"
import { toast } from "sonner"
import type { WexReport } from "@/services/wex-categorization.service"
import { COMPANY_LABEL, fmtDate } from "./wex-algorithm"
import type { Company, ResultRow } from "./wex-algorithm"

export function formatPeriod(report: WexReport): string {
  const from = report.filterFrom
  const to   = report.filterTo
  if (!from && !to) return "All dates"
  const f = fmtDate(from), t = fmtDate(to)
  return from === to || !to ? f : `${f} – ${t}`
}

export function exportToExcel(rows: ResultRow[], company: Company) {
  const data = [
    ["Transaction Date","Weekday","Transaction Time","Card Number","Units","Unit of Measure","Unit Cost","Total Fuel Cost","Merchant City","Driver Full Name (Padrão do Wex)","full_name (Padrão do Quickbooks)","Obras Trabalhadas","Qty_Obras","Cost_Per_Jobcode"],
    ...rows.map(r => [r.txDate,r.weekday,r.txTime,r.cardNumber,r.units,r.unitOfMeasure,r.unitCost,r.totalFuelCost,r.merchantCity,r.driverWexName,r.driverQbName,r.obrasTrabalhadas,r.qtyObras,r.costPerJobcode]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, company.toUpperCase())
  XLSX.writeFile(wb, `wex_${company}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export function exportToPdf(report: WexReport, results: ResultRow[]) {
  const label  = COMPANY_LABEL[report.company as Company] ?? report.company
  const period = formatPeriod(report)
  const genAt  = new Date(report.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
  const total  = results.reduce((s, r) => s + r.totalFuelCost, 0)

  const obraMap = new Map<string, number>()
  for (const r of results)
    for (const o of r.obrasTrabalhadas.split(" | "))
      if (o.trim() && o.trim() !== "Office") obraMap.set(o.trim(), (obraMap.get(o.trim()) ?? 0) + r.costPerJobcode)
  const obraList = [...obraMap.entries()].sort((a, b) => b[1] - a[1])

  const rowsHtml = results.map(r => `
    <tr class="${r.isOffice ? "office" : ""}">
      <td>${r.txDate}</td><td>${r.weekday.slice(0,3)}</td>
      <td>${r.driverWexName}</td><td>${r.driverQbName}</td>
      <td class="num">$${r.totalFuelCost.toFixed(2)}</td>
      <td class="${r.isOffice ? "amber" : ""}">${r.obrasTrabalhadas}</td>
      <td class="num">${r.qtyObras || "—"}</td>
      <td class="num">${r.qtyObras > 0 ? `$${r.costPerJobcode.toFixed(2)}` : "—"}</td>
      <td>${r.merchantCity}</td>
    </tr>`).join("")

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>WEX Report – ${label} – ${period}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Arial,sans-serif;font-size:11px;color:#111;padding:24px}
h1{font-size:20px;font-weight:700;margin-bottom:3px}
.sub{color:#666;font-size:11px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
.card .lbl{font-size:9px;font-weight:700;text-transform:uppercase;color:#888;letter-spacing:.5px;margin-bottom:8px}
.card .row{display:flex;gap:20px;flex-wrap:wrap}
.card .stat .v{font-size:17px;font-weight:700}
.card .stat .l{font-size:9px;color:#888}
.summary{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;margin-bottom:16px;display:flex;gap:24px;flex-wrap:wrap}
.summary span{font-size:11px}.summary b{font-size:14px;font-weight:700}
.obras{margin-bottom:16px}
.obras h2{font-size:12px;font-weight:700;margin-bottom:8px;color:#333}
.orow{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.orow .oname{width:260px;font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.orow .obar-wrap{flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden}
.orow .obar{height:100%;background:#6366f1;border-radius:3px}
.orow .opct{width:36px;text-align:right;font-size:9px;color:#888}
.orow .oval{width:60px;text-align:right;font-size:10px;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:9.5px}
thead tr{background:#f3f4f6}
th{padding:6px 8px;text-align:left;font-weight:700;border:1px solid #e5e7eb;color:#555;font-size:9px;text-transform:uppercase}
td{padding:5px 8px;border:1px solid #e5e7eb}
.num{text-align:right;font-weight:600}
.amber{color:#b45309}
tr.office td{background:#fffbeb}
@media print{body{padding:0}@page{margin:1cm}}
</style></head><body>
<h1>WEX Fuel Cost Report — ${label}</h1>
<div class="sub">Period: ${period} &nbsp;·&nbsp; Generated: ${genAt}</div>

<div class="grid">
  <div class="card">
    <div class="lbl">WEX Report</div>
    <div class="row">
      <div class="stat"><div class="v">${report.meta.wexTxCount}</div><div class="l">Transactions</div></div>
      <div class="stat"><div class="v">$${report.meta.wexTotal.toFixed(2)}</div><div class="l">Total Cost</div></div>
      <div class="stat"><div class="v">${report.meta.wexDrivers}</div><div class="l">Drivers</div></div>
    </div>
  </div>
  <div class="card">
    <div class="lbl">QuickBooks Time</div>
    <div class="row">
      <div class="stat"><div class="v">${report.meta.qbEntries}</div><div class="l">Entries</div></div>
      <div class="stat"><div class="v">${report.meta.qbEmployees}</div><div class="l">Employees</div></div>
    </div>
  </div>
</div>

<div class="summary">
  <span><b>${report.meta.matched}</b> matched</span>
  ${report.meta.officeCount > 0 ? `<span><b style="color:#b45309">${report.meta.officeCount}</b> → Office</span>` : ""}
  <span><b>${report.meta.uniqueObras}</b> unique obras</span>
  <span><b>$${total.toFixed(2)}</b> total</span>
</div>

${obraList.length > 0 ? `
<div class="obras">
  <h2>Cost by Obra (top ${Math.min(obraList.length, 15)})</h2>
  ${obraList.slice(0, 15).map(([obra, cost]) => {
    const pct = total > 0 ? (cost / total * 100) : 0
    return `<div class="orow">
      <div class="oname" title="${obra}">${obra}</div>
      <div class="obar-wrap"><div class="obar" style="width:${pct.toFixed(1)}%"></div></div>
      <div class="opct">${pct.toFixed(1)}%</div>
      <div class="oval">$${cost.toFixed(2)}</div>
    </div>`
  }).join("")}
</div>` : ""}

<table>
  <thead><tr>
    <th>Date</th><th>Day</th><th>Driver (WEX)</th><th>QB Time Name</th>
    <th>Total Cost</th><th>Obras Trabalhadas</th><th>Qty</th><th>Cost/Obra</th><th>City</th>
  </tr></thead>
  <tbody>${rowsHtml}</tbody>
</table>
</body></html>`

  const win = window.open("", "_blank", "width=1000,height=800")
  if (!win) { toast.error("Popup blocked — allow popups to export PDF."); return }
  win.document.write(html)
  win.document.close()
  win.onload = () => win.print()
}
