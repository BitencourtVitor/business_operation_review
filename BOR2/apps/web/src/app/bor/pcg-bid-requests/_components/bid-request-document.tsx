"use client"

import { FORM_LAYOUT } from "../_lib/form-layout"
import { SUPPLY_QUESTION_ID } from "../_lib/trades-seed"
import { NOTES_KEY, NOTES_LABEL, PROJECT_TYPE_LABEL, documentModules, moduleNumbers, quantityKey } from "../_lib/types"
import { formatDate } from "../_lib/format"
import { PRINT_CSS } from "../_lib/print"
import { useCatalogStore } from "../_lib/catalog-store"
import type { DocumentBlock, Project, ProjectTrade, Question, Trade } from "../_lib/types"

// Mirrors PCG_BidForms_All_Trades.pdf: same title block, same "To the
// subcontractor" paragraph, same section order, same checkbox rows, same
// confidential footer. Times New Roman because that's the form PCG sends today.
// No scope sections on purpose — in the source form the bid is only the
// questionnaire; work included, exclusions and the matrix belong to the
// contract's Exhibit A.
export function BidRequestDocument({
  project, projectTrade, trade, blank = false,
}: {
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
  // O formulario em branco e este mesmo papel com as respostas zeradas, e nao
  // um segundo documento: dois arquivos para o mesmo formulario divergiriam na
  // primeira pergunta nova.
  blank?: boolean
}) {
  const answers = blank ? {} : projectTrade.answers
  const documentBlocks = useCatalogStore(s => s.documentBlocks)
  const layout = FORM_LAYOUT[trade.name]
  const byId = new Map(trade.questions.map(q => [q.id, q]))

  // A generated module draws the contract's own body (Exhibit A, signatures) and
  // has no place on a form somebody is only pricing.
  const blocks = documentModules(documentBlocks, "bid").filter(b => b.kind !== "generated")
  const numbers = moduleNumbers(blocks)

  // The layouts come from the printed forms and name their questions one by one,
  // so a question they predate would silently never reach the sub. Anything the
  // layout does not place is printed after it rather than dropped.
  const laidOut = layout
    ? layout.sections.map(s => ({
        title: s.title,
        questions: s.questionIds.map(id => byId.get(id)).filter((q): q is Question => !!q),
      })).filter(s => s.questions.length)
    : [{ title: "SPECIFICATIONS", questions: trade.questions }]

  const placed = new Set(laidOut.flatMap(s => s.questions.map(q => q.id)))
  const unplaced = trade.questions.filter(q => !placed.has(q.id))

  // "What is included" is the first question of the questionnaire and has to be
  // the first thing on the paper too: everything the sub prices after it depends
  // on whether they are quoting labour or labour and material.
  const leading = unplaced.filter(q => q.id === SUPPLY_QUESTION_ID)
  const trailing = unplaced.filter(q => q.id !== SUPPLY_QUESTION_ID)

  const noteAnswer = answers[NOTES_KEY]
  const notes = typeof noteAnswer === "string" ? noteAnswer.trim() : ""

  const sections = [
    ...(leading.length ? [{ title: "SCOPE OF PRICING", questions: leading }] : []),
    ...laidOut,
    ...(trailing.length ? [{ title: "ADDITIONAL SPECIFICATIONS", questions: trailing }] : []),
  ]

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div
        data-print-root
        className="mx-auto w-[8.27in] bg-white p-[0.5in] text-black print:w-full print:p-0"
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
            {/* No document number here: a bid request is a set of questions and
                answers, not an identifiable document. Only the contract is
                numbered — see the trade code + sequence on the Subcontract. */}
            <p>Trade: {trade.name}</p>
            <p>Date: {formatDate(new Date().toISOString())}</p>
          </div>
        </div>

        <h1 className="mt-5 text-center text-[17pt] font-bold uppercase tracking-wide">
          Bid Request: {trade.name}
        </h1>
        <p className="mt-1 text-center text-[10pt] italic text-neutral-700">
          Project specifications for subcontractor pricing
        </p>

        {/* ── Parties and project ────────────────────────────────────── */}
        <table className="mt-5 w-full border-collapse text-[10.5pt]">
          <tbody>
            <Row label="Project Name" value={project.name} />
            <Row label="Project Address" value={project.address} />
            <Row label="Project Type" value={PROJECT_TYPE_LABEL[project.type]} />
            {/* Nothing else belongs here: the GC is already the letterhead, the
                sub is only named when the bid is sent, and no due date exists. */}
          </tbody>
        </table>

        {layout?.intro && (
          <p className="mt-4 text-justify text-[10.5pt] leading-relaxed">{layout.intro}</p>
        )}

        {trade.standardNote && (
          <p className="mt-3 border-l-2 border-neutral-400 pl-3 text-[10pt] leading-relaxed">
            <span className="font-bold">PCG Standard (included in all projects): </span>
            {trade.standardNote}
          </p>
        )}

        {/* ── Specifications ─────────────────────────────────────────── */}
        {sections.map(section => (
          <section key={section.title} className="mt-5">
            <h2 className="break-after-avoid border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
              {section.title}
            </h2>
            <table className="w-full border-collapse text-[10.5pt]">
              <tbody>
                {section.questions.map(q => (
                  <SpecRow key={q.id} question={q} answers={answers} />
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {blocks.map(block => (
          <BlockSection key={block.id} block={block} number={numbers.get(block.id)} />
        ))}

        {/* ── Notes ──────────────────────────────────────────────────── */}
        {/* Typed on the questionnaire it prints as text; left empty it stays the
            ruled space of the printed form, for the sub to write on. */}
        <section className="mt-5 break-inside-avoid">
          <h2 className="border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
            {NOTES_LABEL}
          </h2>
          {notes ? (
            <p className="mt-2 whitespace-pre-line text-justify text-[10.5pt] leading-relaxed">{notes}</p>
          ) : (
            <div className="mt-3 space-y-4">
              <div className="border-b border-dotted border-neutral-500" />
              <div className="border-b border-dotted border-neutral-500" />
              <div className="border-b border-dotted border-neutral-500" />
            </div>
          )}
        </section>

        <p className="mt-8 border-t border-neutral-400 pt-2 text-center text-[8.5pt] text-neutral-600">
          Premium Contractors Group Inc · {trade.name} Bid Request · Confidential · For Pricing Purposes Only
        </p>
      </div>
    </>
  )
}

function BlockSection({ block, number }: { block: DocumentBlock; number: number | undefined }) {
  return (
    <section className="mt-5">
      <h2 className="break-after-avoid border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide">
        {number ? `${number}. ` : ""}{block.title}
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
