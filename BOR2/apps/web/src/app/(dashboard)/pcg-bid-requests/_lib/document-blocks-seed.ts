import type { DocumentBlock } from "./types"

// The subcontract body, module by module, taken from PCG's own signed model:
// docs/reference/subcontract-framing-model.pdf (SC-004-2026, Framing). The model
// has 19 numbered sections; PCG kept 1, 2 (first two paragraphs), 3, 7, 15 and 16
// and dropped the rest, so what is here is the whole surviving text and nothing
// else. Numbering is positional — these print 1 through 6.
//
// Two references had to be rewritten because they pointed at sections that were
// dropped: "the provisions of Section 9" (Deficiencies) and "the dispute
// resolution procedures set forth in Section 10" (Disputes). The obligation is
// kept, the dead cross-reference is not.
//
// No em dashes anywhere: they do not reach the paper (see the undash migration
// in catalog-store).
export const DOCUMENT_BLOCKS_SEED: DocumentBlock[] = [
  {
    id: "block-the-work",
    title: "The Work",
    body: [
      "The Subcontractor shall furnish all labor, tools, supervision, and services necessary to prosecute and complete the scope of work identified and described in Exhibit A: Scope of Work, attached hereto and incorporated herein by reference (\"the Work\"). The Subcontractor shall not be responsible for furnishing any materials, equipment, or supplies, which shall be provided by the Contractor as specified in Exhibit A. This Work being a portion of the work required of Contractor under the General Contract between the specific project Owner and Contractor (\"the Prime Contract\"). The Work shall be performed by the Subcontractor in a good and workmanlike manner and in strict accordance with this Subcontract and the conditions of the Contract, Plans, Specifications, Addenda, and other documents making up the Prime Contract for that specific project (\"Contract Documents\"). All work shall be in accordance with local, state, and federal authorities and codes (including, but not limited to, building and safety codes, wage and hour laws, and OSHA, EEO, EPA, hazard communication, materials handling, and \"Right To Know\" regulations) which Subcontractor acknowledges he is familiar with; and to the full and reasonable satisfaction of the Project Architect, if any.",
      "The Subcontractor shall not commence any Work on the Project site until: (a) this Subcontract has been fully executed; (b) all required insurance certificates and endorsements have been delivered to and accepted by the Contractor; and (c) a written Notice to Proceed has been issued by the Contractor.",
      "The Subcontractor shall not substitute any means, methods, or procedures specified in the Contract Documents without the prior written approval of the Contractor.",
      "All Work that does not conform to the requirements of the Contract Documents shall be considered defective and shall be corrected by the Subcontractor at its sole expense.",
      "The Subcontractor shall protect all Work in place and all adjacent property, structures, utilities, and improvements from damage caused by its operations. The Subcontractor shall be solely responsible for any damage caused by its Work or personnel and shall promptly repair or replace damaged items at its sole expense.",
    ].join("\n\n"),
    scope: "contract",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    id: "block-the-schedule",
    title: "The Schedule",
    body: [
      "Subcontractor agrees to start the Work as soon as notified by Contractor and to complete the Work in accordance with Contractor's direction. Subcontractor shall diligently prosecute its work as expeditiously as possible and, at all times, shall have sufficient personnel at the job site so as to cause no delay to Subcontractor's work or the work of others. Timely performance by the Subcontractor is of the essence of this Subcontract. Subcontractor agrees to perform all work in accordance with the Construction Schedule identified in the Work Order or as otherwise reasonably directed by the Contractor.",
      "The Subcontractor shall provide written notice to the Contractor within 48 hours of any event that may cause delay to the Work. Failure to provide timely written notice shall constitute a waiver of any claim for time extension or additional compensation arising from such delay.",
    ].join("\n\n"),
    scope: "contract",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    id: "block-changes",
    title: "Changes",
    body: [
      "The Subcontractor may be ordered in writing by the Contractor, without invalidating this Subcontract, to make changes in the Work within the general scope of this Subcontract consisting of additions, deletions, or other revisions. No extra work or charges under the Subcontract will be recognized or paid unless agreed in advance and in writing by the Contractor. Any claim for extra work or extra compensation of any kind shall not be valid unless made within seven (7) days of the event giving rise to such claim.",
      "All Change Order work shall be compensated at a rate of $35.00 per labor hour, with no markup, overhead charge, or profit percentage added. The Subcontractor shall submit a written breakdown of hours worked for all Change Order work within 3 business days of completion of the changed work. The Contractor reserves the right to audit and verify all hours claimed.",
      "The Contractor may direct minor changes in the Work that do not affect the Subcontract Sum or Schedule without a formal Change Order. The Subcontractor shall comply with such directions promptly at the $35.00 per hour rate if additional labor is required.",
      "If the Contractor deletes any portion of the Work, the Subcontract Sum shall be reduced by the fair value of the deleted labor. The Subcontractor shall have no claim for lost profit on deleted Work.",
    ].join("\n\n"),
    scope: "contract",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    id: "block-price-and-payments",
    title: "The Price and Payments",
    body: [
      "Subcontractor shall fully perform and complete all of the Work in accordance with the terms of this Subcontract in exchange for payment of the Subcontract Sum stated above.",
      "No retainage shall be withheld from progress payments under this Subcontract.",
      "Upon completion of each milestone, the Subcontractor shall notify the Contractor in writing or by text message that the Work is ready for inspection. The Contractor shall inspect the Work within 3 business days of notification. Upon approval, the Contractor shall issue payment without requiring formal invoice submission from the Subcontractor.",
      "Prior to requesting any payment, the Subcontractor must ensure compliance with the following conditions:",
      "(a) Receipt by Contractor of a currently valid Certificate of Insurance naming Premium Contractors Group Inc as Additional Insured on Subcontractor's Commercial General Liability policy;",
      "(b) Execution by Subcontractor of a Payment Release Form provided by the Contractor, confirming receipt of payment and releasing any claims against the Project for Work covered by that payment;",
      "(c) Receipt of progress and/or final payment by the Contractor from its construction lender shall be in each instance an express condition precedent to the Subcontractor's right to receive payment from the Contractor. The Subcontractor acknowledges that it shall not be entitled to receive progress and/or final payment unless and until, and only to the extent that, payment for Subcontractor's Work is received by the Contractor from its lender;",
      "(d) The approval of an application for payment or other certificate given or payments made under this Subcontract shall not be evidence of the performance or partial performance hereunder by Subcontractor, nor shall such approvals, certificates, or payments be construed as acceptance of the Work;",
      "(e) Clean-Up. Subcontractor shall keep its work area clean, organized, and free of accumulated waste. Subcontractor shall be responsible to remove all trash and waste materials to dumpsters either provided by Subcontractor or by others as defined in the Work Order for each specific project. If the Subcontractor fails to maintain required cleanliness, the Contractor may, upon 24 hours' written notice, perform or arrange for clean-up and deduct all associated costs from amounts due to the Subcontractor.",
      "The Contractor may withhold payment, in whole or in part, to protect against: (a) defective Work not remedied; (b) damage caused by the Subcontractor to the Project or other trades; (c) failure to maintain required insurance; (d) any material breach of this Subcontract. The Contractor shall notify the Subcontractor in writing of the reason for withholding within 3 business days.",
      "The Subcontractor shall not stop or slow the Work due to any payment dispute. The Subcontractor's sole remedy for a disputed payment shall be to raise it in writing with the Contractor and pursue its resolution while continuing to perform the Work.",
    ].join("\n\n"),
    scope: "contract",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    // Prints straight after section 7 and belongs to it: the lead-in sentence
    // lives here rather than in the clause text, so the contract never announces
    // a schedule that was never agreed.
    id: "block-payment-schedule",
    title: "",
    body: "",
    scope: "contract",
    kind: "generated",
    numbered: false,
    generated: "payment_schedule",
  },
  {
    id: "block-safety",
    title: "Safety",
    body: [
      "The Subcontractor shall be solely responsible for initiating, maintaining, and supervising all safety precautions and programs in connection with its Work. The Subcontractor shall comply with all applicable OSHA regulations and the Contractor's site safety program. The Subcontractor shall immediately report all accidents, injuries, and near-misses to the Contractor in writing. The Contractor reserves the right to stop any Work that poses an immediate safety risk without liability to the Subcontractor.",
      "The Subcontractor shall designate a qualified superintendent who shall be present on the Project site at all times when Work is being performed. The superintendent shall have full authority to act on behalf of the Subcontractor and shall be the primary point of contact with the Contractor's project manager. The Contractor reserves the right to require the Subcontractor to replace any superintendent whose performance is deemed unsatisfactory.",
    ].join("\n\n"),
    scope: "contract",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    id: "block-temporary-power",
    title: "Temporary Power",
    body: "The Subcontractor shall be solely responsible for providing all temporary power, lighting, and energy required to complete the Work, including but not limited to generators, temporary electrical connections, extension cords, and any other equipment necessary to maintain adequate lighting and power at the Project site during the performance of the Work. The cost of all temporary power and energy shall be included in the Subcontract Sum and shall not be subject to additional compensation.",
    scope: "contract",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    id: "block-scope-of-work",
    title: "Exhibit A: Scope of Work",
    body: "",
    scope: "contract",
    kind: "generated",
    numbered: false,
    generated: "scope_of_work",
  },
  {
    // Reads as a note on the scope, so it sits under it rather than opening the
    // contract — the responsibility matrix it refers to is right above.
    // Numbered like the rest of the body: it is a clause somebody wrote and the
    // contract refers to it, so it needs a number to be referred to by.
    id: "block-exhibit-a",
    title: "Materials and Supply",
    body: "Any item listed as \"GC or Sub\" in the responsibility matrix is to be defined at contract execution per Exhibit A.",
    scope: "both",
    kind: "text",
    numbered: true,
    generated: null,
  },
  {
    id: "block-scope-notice",
    title: "",
    body: "All of the above is included but not limited to all work reasonably necessary to complete the described trade in a good and workmanlike manner, in strict compliance with all applicable local building codes, manufacturer installation specifications, and approved project drawings and specifications.",
    scope: "contract",
    kind: "locked",
    numbered: false,
    generated: null,
  },
  {
    id: "block-signatures",
    title: "Signatures",
    body: "",
    scope: "contract",
    kind: "generated",
    numbered: false,
    generated: "signatures",
  },
]
