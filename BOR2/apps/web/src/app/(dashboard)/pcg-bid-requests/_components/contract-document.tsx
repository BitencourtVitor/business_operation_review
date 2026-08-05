"use client"

import { SCOPE_SECTION_LABEL } from "../_lib/types"
import { formatDate, formatMoney } from "../_lib/format"
import { resolveScope } from "../_lib/rules"
import { resolveSpecs } from "../_lib/specs"
import { bidAmountOf, subcontractorOf } from "../_lib/events"
import { PRINT_CSS } from "../_lib/print"
import { useCatalogStore } from "../_lib/catalog-store"
import type { DocumentBlock, Project, ProjectTrade, ScopeSection, Trade } from "../_lib/types"

const SCOPE_ORDER: ScopeSection[] = ["workIncluded", "exclusions", "responsibilityMatrix"]

// Exhibit A is generated from the trade and the approved bid specs — which is
// exactly what resolveScope produces. Any standing legal text PCG wants in the
// subcontract comes from the document blocks, not from hardcoded clauses here.
export function ContractDocument({
  project, projectTrade, trade,
}: {
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
}) {
  const documentBlocks = useCatalogStore(s => s.documentBlocks)
  const blocks = documentBlocks.filter(b => b.scope === "contract" || b.scope === "both")
  const scope = resolveScope(trade, projectTrade.answers)
  const specs = resolveSpecs(trade, projectTrade.answers)

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div
        data-print-root
        className="mx-auto w-[8.5in] bg-white p-[0.5in] text-black print:w-full print:p-0"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        <div className="flex items-start justify-between border-b-2 border-black pb-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/sublogo_pcg.png" alt="" className="h-[4.125rem] w-auto object-contain" />
            <div>
              <p className="text-[15pt] font-bold leading-tight tracking-wide">
                PREMIUM CONTRACTORS GROUP INC
              </p>
              <p className="text-[9pt] uppercase tracking-[0.18em] text-neutral-600">
                General Contractor
              </p>
            </div>
          </div>
          <div className="shrink-0 whitespace-nowrap text-right text-[9pt] leading-snug text-neutral-700">
            <p>Contract: ____________</p>
            <p>Date: {formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        <h1 className="mt-5 text-center text-[17pt] font-bold uppercase tracking-wide">
          Subcontract: {trade.name}
        </h1>

        <table className="mt-5 w-full border-collapse text-[10.5pt]">
          <tbody>
            <Row label="Project Name" value={project.name} />
            <Row label="Project Address" value={project.address} />
            <Row label="General Contractor" value="Premium Contractors Group Inc" />
            <Row label="Subcontractor" value={subcontractorOf(projectTrade)} />
            <Row label="Contract Amount" value={formatMoney(bidAmountOf(projectTrade))} />
          </tbody>
        </table>

        {blocks.filter(b => b.placement === "before_sections").map(block => (
          <BlockSection key={block.id} block={block} />
        ))}

        {/* ── Exhibit A ──────────────────────────────────────────────── */}
        <h2 className="mt-6 text-center text-[13pt] font-bold uppercase tracking-wide">
          Exhibit A: Scope of Work
        </h2>
        <p className="mt-1 text-center text-[9.5pt] italic text-neutral-700">
          Generated from the {trade.name} standard scope and the approved bid specifications
        </p>

        {trade.standardNote && (
          <p className="mt-3 border-l-2 border-neutral-400 pl-3 text-[10pt] leading-relaxed">
            <span className="font-bold">PCG Standard (included in all projects): </span>
            {trade.standardNote}
          </p>
        )}

        {/* The specifications the price was given against. Without them the
            subcontract says what the trade always does, but not what this house
            was quoted for. */}
        {specs.length > 0 && (
          <section className="mt-5">
            <h3 className="break-after-avoid border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
              Approved Specifications
            </h3>
            {specs.map(group => (
              <div key={group.title} className="mt-3 break-inside-avoid">
                {group.title && (
                  <p className="text-[9.5pt] font-bold uppercase tracking-wide text-neutral-700">
                    {group.title}
                  </p>
                )}
                <table className="w-full border-collapse text-[10.5pt]">
                  <tbody>
                    {group.rows.map(row => (
                      <tr key={row.questionId} className="break-inside-avoid">
                        <td className="w-[2.6in] border-b border-neutral-300 py-1.5 pr-3 align-top">
                          {row.label}
                        </td>
                        <td className="border-b border-neutral-300 py-1.5 align-top font-bold">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        )}

        {SCOPE_ORDER.map(key => scope[key].length > 0 && (
          <section key={key} className="mt-5">
            <h3 className="break-after-avoid border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
              {SCOPE_SECTION_LABEL[key]}
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[10.5pt] leading-relaxed">
              {scope[key].map((clause, i) => (
                <li key={i} className="break-inside-avoid">{clause}</li>
              ))}
            </ol>
          </section>
        ))}

        {blocks.filter(b => b.placement === "after_sections").map(block => (
          <BlockSection key={block.id} block={block} />
        ))}

        {/* ── Signatures ─────────────────────────────────────────────── */}
        <section className="mt-8 break-inside-avoid">
          <div className="flex gap-10">
            <SignatureBlock role="General Contractor" name="Premium Contractors Group Inc" />
            <SignatureBlock role="Subcontractor" name={subcontractorOf(projectTrade)} />
          </div>
        </section>

        <p className="mt-8 border-t border-neutral-400 pt-2 text-center text-[8.5pt] text-neutral-600">
          Premium Contractors Group Inc · {trade.name} Subcontract · Confidential
        </p>
      </div>
    </>
  )
}

function SignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="flex-1">
      <div className="mt-10 border-b border-black" />
      <p className="mt-1 text-[9.5pt] font-bold uppercase tracking-wide">{role}</p>
      <p className="text-[10pt]">{name || " "}</p>
      <div className="mt-6 border-b border-black" />
      <p className="mt-1 text-[9.5pt] uppercase tracking-wide text-neutral-600">Date</p>
    </div>
  )
}

function BlockSection({ block }: { block: DocumentBlock }) {
  return (
    <section className="mt-5">
      <h2 className="break-after-avoid border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
        {block.title}
      </h2>
      <p className="mt-2 whitespace-pre-line text-justify text-[10.5pt] leading-relaxed">{block.body}</p>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="w-[1.9in] border border-neutral-400 bg-neutral-100 px-2 py-1 align-top text-[9.5pt] font-bold uppercase tracking-wide">
        {label}
      </td>
      <td className="border border-neutral-400 px-2 py-1 align-top">{value || " "}</td>
    </tr>
  )
}
