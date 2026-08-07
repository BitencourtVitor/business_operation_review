"use client"

import {
  PROJECT_TYPE_LABEL, SCOPE_SECTION_LABEL, documentModules, milestoneAmount, moduleBody,
  moduleNumbers, scheduleTotal,
} from "../_lib/types"
import { formatDate, formatMoney } from "../_lib/format"
import { resolveScope } from "../_lib/rules"
import { resolveSpecs } from "../_lib/specs"
import { bidAmountOf, scheduleInForce, subcontractorOf } from "../_lib/events"
import { PRINT_CSS } from "../_lib/print"
import { useCatalogStore } from "../_lib/catalog-store"
import type { DocumentBlock, Project, ProjectTrade, ScopeSection, Trade } from "../_lib/types"

const SCOPE_ORDER: ScopeSection[] = ["workIncluded", "exclusions", "responsibilityMatrix"]

// The rounded container belongs to the party and project boxes and to nothing
// else: a section is a heading, a rule under it, and the text.
const HEADING = "break-after-avoid border-b border-neutral-400 pb-1 text-[11pt] font-bold uppercase tracking-wide"

// A note beside a vertical rule, which is how the model marks something the
// reader is meant to stop on.
const CALLOUT = "border-l-2 border-neutral-500 pl-3"

const BOX = "rounded-lg border border-neutral-400 px-4 py-3"

// The small letter-spaced grey caps the model uses for every field label.
const FIELD_LABEL = "text-[8pt] font-bold uppercase tracking-[0.12em] text-neutral-500"

// PCG's own details, fixed on every subcontract they issue.
const GC = {
  name:    "Premium Contractors Group Inc",
  address: "1b Landing Lane, Hopedale, MA, 01747",
  license: "License No.: 203050",
  phone:   "Phone: (774) 804-3190",
}

// The body is a sequence of modules, ordered and cadastrated in Document
// defaults. What stays here is the frame: letterhead, title, the project data
// table and the footer — the shape of the paper, not text anybody edits.
export function ContractDocument({
  project, projectTrade, trade,
}: {
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
}) {
  const documentBlocks = useCatalogStore(s => s.documentBlocks)
  const modules = documentModules(documentBlocks, "contract")
  const numbers = moduleNumbers(modules)

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div
        data-print-root
        className="mx-auto w-[8.27in] bg-white p-[0.5in] text-black print:w-full print:p-0"
        style={{ fontFamily: '"Times New Roman", Times, serif' }}
      >
        {/* Everything down to the intro paragraph is centred in the model: the
            mark, the company, the title, then who is agreeing to what. */}
        <Letterhead />

        <h1 className="mt-5 text-center text-[16pt] font-bold uppercase tracking-wide">
          Subcontract Agreement
        </h1>
        <p className="mt-1 text-center text-[9.5pt] text-neutral-700">
          Trade: <span className="font-bold">{trade.name}</span> | Document No.: ____________
        </p>
        <p className="mt-2 text-center text-[10.5pt]">
          This Agreement is entered into as of {formatDate(new Date().toISOString())}
        </p>
        <p className="mx-auto mt-2 max-w-[6in] text-center text-[10.5pt] leading-relaxed">
          <span className="font-bold">{GC.name}</span>{" "}(&ldquo;Contractor&rdquo;) and the
          Subcontractor identified below (&ldquo;Subcontractor&rdquo;) agree to enter the
          following relationship for work performed on Contractor&rsquo;s project identified
          herein.
        </p>

        {/* The two parties side by side, then the project — the model's two
            rounded boxes, and the only rounded containers in the document. */}
        <div className="mt-5 flex gap-4">
          <Party role="Contractor (GC)" name={GC.name} lines={[GC.address, GC.license, GC.phone]} />
          <Party role="Subcontractor" name={subcontractorOf(projectTrade)} lines={[]} />
        </div>

        <dl className={`${BOX} mt-4 text-[10.5pt]`}>
          <Field label="Project Name" value={project.name} />
          <Field label="Project Address" value={project.address} />
          <Field label="Project Type" value={PROJECT_TYPE_LABEL[project.type]} />
          <Field label="Owner / Developer" value={GC.name} />
          <Field label="Trade / Scope" value={trade.name} />
          <Field label="Contract Sum" value={formatMoney(bidAmountOf(projectTrade))} bold />
        </dl>

        {modules.map(block => (
          <Module
            key={block.id}
            block={block}
            number={numbers.get(block.id)}
            project={project}
            projectTrade={projectTrade}
            trade={trade}
          />
        ))}

        <p className="mt-8 border-t border-neutral-300 pt-2 text-center text-[8.5pt] text-neutral-600">
          Subcontract Agreement · {trade.name} · {GC.name}
        </p>
      </div>
    </>
  )
}

function Module({
  block, number, project, projectTrade, trade,
}: {
  block: DocumentBlock
  number: number | undefined
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
}) {
  if (block.generated === "scope_of_work") {
    return <ScopeOfWork project={project} projectTrade={projectTrade} trade={trade} />
  }
  if (block.generated === "signatures") {
    return <Signatures projectTrade={projectTrade} />
  }
  if (block.generated === "payment_schedule") {
    return <PaymentSchedule projectTrade={projectTrade} />
  }
  // What this contract says, which is the catalog's text unless this trade
  // rewrote it — see moduleBody.
  const body = moduleBody(block, projectTrade.moduleOverrides)

  // A locked module with no heading is a standing notice: it reads as an aside,
  // so it prints in italic beside a rule instead of as another section.
  if (block.kind === "locked" && !block.title.trim()) {
    return (
      <p className={`${CALLOUT} mt-6 break-inside-avoid text-[10.5pt] italic leading-relaxed`}>
        {body}
      </p>
    )
  }
  return (
    <section className="mt-5">
      <h2 className={HEADING}>{number ? `${number}. ` : ""}{block.title}</h2>
      <p className="mt-2 whitespace-pre-line text-justify text-[10.5pt] leading-relaxed">{body}</p>
    </section>
  )
}

// Exhibit A is generated from the trade and the approved bid specs — which is
// exactly what resolveScope produces. Any standing legal text PCG wants in the
// subcontract comes from the other modules, not from hardcoded clauses here.
function ScopeOfWork({
  project, projectTrade, trade,
}: {
  project: Project
  projectTrade: ProjectTrade
  trade: Trade
}) {
  const scope = resolveScope(trade, projectTrade.answers)
  const specs = resolveSpecs(trade, projectTrade.answers)

  return (
    <>
      {/* An annex, so it opens its own page and repeats the letterhead — the
          model prints Exhibit A as a separate document stapled to the back. On
          paper the page break says that; on screen the preview is one strip, so
          a dashed rule marks where one document ends and the next begins. */}
      <section className="mt-8 break-before-page">
        {/* Edge to edge: it separates two documents, so it runs past the page
            margin instead of sitting inside the text column. Screen only — see
            the print stylesheet, which hides it a second time on purpose. */}
        <div
          data-doc-separator
          className="-mx-[0.5in] mb-8 border-t border-dashed border-red-500 print:hidden"
        />
        <Letterhead />
        <h2 className="mt-5 text-center text-[12pt] font-bold uppercase tracking-[0.2em] text-neutral-600">
          Exhibit A — Scope of Work
        </h2>
        <p className="mt-3 text-center text-[9.5pt]">
          Incorporated into and made part of Subcontract Agreement dated{" "}
          {formatDate(new Date().toISOString())}
        </p>
        <p className="mt-1 text-center text-[9.5pt]">
          Trade: <span className="font-bold">{trade.name}</span> · Project: {project.name} ·
          Subcontractor: {subcontractorOf(projectTrade) || "____________"}
        </p>
      </section>

      {trade.standardNote && (
        <p className={`${CALLOUT} mt-3 text-[10pt] leading-relaxed`}>
          <span className="font-bold">PCG Standard (included in all projects): </span>
          {trade.standardNote}
        </p>
      )}

      {/* The specifications the price was given against. Without them the
          subcontract says what the trade always does, but not what this house
          was quoted for. */}
      {specs.length > 0 && (
        <section className="mt-5">
          <h3 className={HEADING}>Approved Specifications</h3>
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

      {/* Numbered over what actually prints: a trade with nothing excluded would
          otherwise jump from 1 straight to 3. */}
      {SCOPE_ORDER.filter(key => scope[key].length > 0).map((key, i) => (
        <section key={key} className="mt-5">
          <h3 className="break-after-avoid border-b border-neutral-400 pb-1 text-[9.5pt] font-bold uppercase tracking-[0.08em]">
            {i + 1}. {SCOPE_SECTION_LABEL[key]}
          </h3>
          <div className="mt-2 flex flex-col gap-2 text-[10.5pt] leading-relaxed">
            {scope[key].map((clause, j) => (
              <div key={j} className="flex gap-3 break-inside-avoid">
                <span className="w-5 shrink-0 text-right font-bold tabular-nums">{j + 1}.</span>
                <span className="min-w-0 flex-1">{clause}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

// Nothing is printed until there is a schedule: a contract that announces
// milestones and then shows an empty table is worse than one that says nothing.
function PaymentSchedule({ projectTrade }: { projectTrade: ProjectTrade }) {
  // The last one agreed, which is the adjustment when there was one.
  const schedule = scheduleInForce(projectTrade)
  if (!schedule.length) return null

  const total = bidAmountOf(projectTrade)

  return (
    <section className="mt-4 break-inside-avoid">
      <p className="text-[10.5pt] leading-relaxed">
        The Contractor shall make progress payments to the Subcontractor based on milestone
        completion in accordance with the following Payment Schedule:
      </p>
      <table className="mt-3 w-full border-collapse text-[10.5pt]">
        <thead>
          <tr>
            <Th className="w-[0.5in] text-center">#</Th>
            <Th>Payment Milestone</Th>
            <Th className="w-[0.9in] text-right">%</Th>
            <Th className="w-[1.3in] text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((milestone, i) => (
            <tr key={milestone.id}>
              <Td className="text-center">{i + 1}</Td>
              <Td>{milestone.milestone}</Td>
              <Td className="text-right tabular-nums">{milestone.percent}%</Td>
              <Td className="text-right tabular-nums">
                {formatMoney(milestoneAmount(milestone.percent, total))}
              </Td>
            </tr>
          ))}
          <tr>
            <Td className="text-center" />
            <Td className="font-bold uppercase tracking-wide">Total Subcontract Sum</Td>
            <Td className="text-right font-bold tabular-nums">{scheduleTotal(schedule)}%</Td>
            <Td className="text-right font-bold tabular-nums">{formatMoney(total)}</Td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

// No grid: the model rules the header and the rows and leaves the columns to
// alignment, which is what stops the schedule from reading as a spreadsheet.
function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b border-neutral-400 px-2 pb-1 text-left text-[8pt] font-bold uppercase tracking-[0.12em] text-neutral-500 ${className}`}>
      {children}
    </th>
  )
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`border-b border-neutral-200 px-2 py-1.5 align-top ${className}`}>{children}</td>
}

function Signatures({ projectTrade }: { projectTrade: ProjectTrade }) {
  return (
    <section className="mt-8 break-inside-avoid">
      <p className="border-t border-neutral-300 pt-3 text-center text-[10pt] italic leading-relaxed">
        IN WITNESS WHEREOF, the parties have executed this Subcontract Agreement as of the
        date first written above.
      </p>
      <div className="mt-4 flex gap-10">
        <SignatureBlock role="Contractor" name={GC.name} />
        <SignatureBlock role="Subcontractor" name={subcontractorOf(projectTrade)} />
      </div>
    </section>
  )
}

function SignatureBlock({ role, name }: { role: string; name: string }) {
  return (
    <div className="flex-1">
      <p className={FIELD_LABEL}>{role}</p>
      <p className="mt-1 text-[10.5pt] font-bold">{name || " "}</p>
      <SignatureLine label="Authorized Signature" />
      <SignatureLine label="Print Name & Title" />
      <SignatureLine label="Date" />
    </div>
  )
}

function SignatureLine({ label }: { label: string }) {
  return (
    <>
      <div className="mt-9 border-b border-neutral-500" />
      <p className="mt-1 text-[8.5pt] text-neutral-600">{label}</p>
    </>
  )
}

// The mark, centred, over a rule — repeated at the top of the agreement and
// again on Exhibit A. The logo already carries the company name, so printing it
// again underneath only said the same thing twice.
function Letterhead() {
  return (
    <div className="break-inside-avoid text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/sublogo_pcg.png" alt="" className="mx-auto h-[2.6rem] w-auto object-contain" />
      <div className="mt-3 border-t border-neutral-500" />
    </div>
  )
}

function Party({ role, name, lines }: { role: string; name: string; lines: string[] }) {
  return (
    <div className={`${BOX} flex-1`}>
      <p className={FIELD_LABEL}>{role}</p>
      <p className="mt-1 text-[10.5pt] font-bold">{name || " "}</p>
      {lines.map(line => (
        <p key={line} className="text-[9.5pt] leading-snug text-neutral-700">{line}</p>
      ))}
    </div>
  )
}

// Label and value on one line, no rules between them: the box is the container,
// and a grid inside it is what made the old table look like a spreadsheet.
function Field({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex gap-4 py-1">
      <dt className={`${FIELD_LABEL} w-[1.8in] shrink-0 pt-[3px]`}>{label}</dt>
      <dd className={`min-w-0 flex-1 ${bold ? "font-bold" : ""}`}>{value || " "}</dd>
    </div>
  )
}
