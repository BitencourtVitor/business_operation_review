"use client"

import { FORM_LAYOUT } from "../_lib/form-layout"
import { quantityKey } from "../_lib/types"
import { formatDate } from "../_lib/format"
import type { Project, ProjectTrade, Question, Trade } from "../_lib/types"

// Mirrors PCG_BidForms_All_Trades.pdf: same title block, same "To the
// subcontractor" paragraph, same section order, same checkbox rows, same
// confidential footer. Times New Roman because that's the form PCG sends today.
export function BidRequestDocument({
  project, projectTrade, trade,
}: {
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
}) {
  const layout = FORM_LAYOUT[trade.name]
  const byId = new Map(trade.questions.map(q => [q.id, q]))

  const sections = layout
    ? layout.sections.map(s => ({
        title: s.title,
        questions: s.questionIds.map(id => byId.get(id)).filter((q): q is Question => !!q),
      })).filter(s => s.questions.length)
    : [{ title: "SPECIFICATIONS", questions: trade.questions }]

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          [data-print-root], [data-print-root] * { visibility: visible !important; }
          [data-print-root] {
            position: absolute !important;
            left: 0 !important; top: 0 !important;
            width: 100% !important; max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
          }
          @page { size: letter; margin: 16mm 14mm; }
        }
      `}</style>

      <div
        data-print-root
        className="mx-auto w-[8.5in] bg-white px-[0.6in] py-[0.5in] text-black"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        {/* ── Letterhead ─────────────────────────────────────────────── */}
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
            {/* Direct-contract trades have no BRF code — no doc number to print. */}
            {trade.code && <p>Doc: {trade.code}-{project.id.slice(-4).toUpperCase()}</p>}
            <p>Date: {formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        <h1 className="mt-5 text-center text-[17pt] font-bold uppercase tracking-wide">
          Bid Request — {trade.name}
        </h1>
        <p className="mt-1 text-center text-[10pt] italic text-neutral-700">
          Project specifications for subcontractor pricing
        </p>

        {/* ── Parties and project ────────────────────────────────────── */}
        <table className="mt-5 w-full border-collapse text-[10.5pt]">
          <tbody>
            <Row label="Project Name" value={project.name} />
            <Row label="Project Address" value={project.address} />
            <Row label="General Contractor" value="Premium Contractors Group Inc" />
            <Row label="Subcontractor" value={projectTrade.subcontractor} />
            <Row label="Bid Due Date" value="" />
          </tbody>
        </table>

        {layout?.intro && (
          <p className="mt-4 text-justify text-[10.5pt] leading-relaxed">{layout.intro}</p>
        )}

        {trade.standardNote && (
          <p className="mt-3 border-l-2 border-neutral-400 pl-3 text-[10pt] leading-relaxed">
            <span className="font-bold">PCG Standard — included in all projects: </span>
            {trade.standardNote}
          </p>
        )}

        {/* ── Specifications ─────────────────────────────────────────── */}
        {sections.map(section => (
          <section key={section.title} className="mt-5 break-inside-avoid">
            <h2 className="border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
              {section.title}
            </h2>
            <table className="w-full border-collapse text-[10.5pt]">
              <tbody>
                {section.questions.map(q => (
                  <SpecRow key={q.id} question={q} answers={projectTrade.answers} />
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {/* ── Notes ──────────────────────────────────────────────────── */}
        <section className="mt-5 break-inside-avoid">
          <h2 className="border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
            Additional Notes
          </h2>
          <div className="mt-3 space-y-4">
            <div className="border-b border-dotted border-neutral-500" />
            <div className="border-b border-dotted border-neutral-500" />
            <div className="border-b border-dotted border-neutral-500" />
          </div>
        </section>

        <p className="mt-8 border-t border-neutral-400 pt-2 text-center text-[8.5pt] text-neutral-600">
          Premium Contractors Group Inc · {trade.name} Bid Request · Confidential — For Pricing Purposes Only
        </p>
      </div>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td className="w-[1.9in] border border-neutral-400 bg-neutral-100 px-2 py-1 align-top text-[9.5pt] font-bold uppercase tracking-wide">
        {label}
      </td>
      <td className="border border-neutral-400 px-2 py-1 align-top">{value || " "}</td>
    </tr>
  )
}

function SpecRow({ question, answers }: { question: Question; answers: ProjectTrade["answers"] }) {
  const value = answers[question.id]
  const qty = answers[quantityKey(question.id)]

  return (
    <tr className="break-inside-avoid">
      <td className="w-[2.6in] border-b border-neutral-300 py-1.5 pr-3 align-top">
        {question.label}
        {question.tag === "optional" && (
          <span className="ml-1 text-[8.5pt] uppercase tracking-wide text-neutral-500">(optional)</span>
        )}
      </td>
      <td className="border-b border-neutral-300 py-1.5 align-top">
        {question.type === "text" ? (
          typeof value === "string" && value.trim()
            ? <span>{value}</span>
            : <span className="inline-block w-full border-b border-dotted border-neutral-500">&nbsp;</span>
        ) : (
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {question.options.map(opt => {
              const checked = Array.isArray(value) ? value.includes(opt) : value === opt
              return (
                <span key={opt} className="whitespace-nowrap">
                  <span className="mr-1 font-bold">{checked ? "☒" : "☐"}</span>
                  <span className={checked ? "font-bold" : ""}>{opt}</span>
                </span>
              )
            })}
            {question.needsQuantity && typeof qty === "string" && qty && (
              <span className="whitespace-nowrap font-bold">Qty: {qty}{question.hint ? ` ${question.hint}` : ""}</span>
            )}
          </span>
        )}
      </td>
    </tr>
  )
}
