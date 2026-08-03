// Section grouping and the "To the subcontractor" paragraph come from
// PCG_BidForms_All_Trades.pdf — the printed form the sub receives today. The
// spreadsheet only carries the questions, so this is what makes the generated
// document match the form PCG already uses.
export type FormSection = { title: string; questionIds: string[] }
export type FormLayout = { intro: string; sections: FormSection[] }

export const FORM_LAYOUT: Record<string, FormLayout> = {
  "Landscaping": {
    intro: "To the subcontractor: Review specifications below and submit your complete estimate including labor, materials, plant warranty, and timeline.",
    sections: [
      { title: "GRADING", questionIds: ["q1", "q7"] },
      { title: "LAWN", questionIds: ["q2", "q3", "q4"] },
      { title: "PLANTING & LANDSCAPING", questionIds: ["q5", "q6"] },
      { title: "LABOR & MATERIALS", questionIds: ["q9"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q8", "q10"] },
    ],
  },
  "Plumbing": {
    intro: "To the subcontractor: The specifications below define the plumbing scope for this project. Review all items, refer to attached plans and fixture portfolio, and submit your complete estimate.",
    sections: [
      { title: "UTILITIES & SERVICE", questionIds: ["q1", "q2", "q3", "q4", "q5"] },
      { title: "WATER HEATER", questionIds: ["q6", "q9", "q14"] },
      { title: "FURNACES / BOILERS", questionIds: ["q7", "q8", "q11"] },
      { title: "FIXTURES & APPLIANCES", questionIds: ["q12", "q13", "q15"] },
      { title: "GAS LINES — CONNECTIONS REQUIRED", questionIds: ["q16", "q17"] },
      { title: "FLOOR DRAINS", questionIds: ["q10"] },
      { title: "SPECIAL ITEMS", questionIds: ["q19", "q20", "q21", "q22", "q23", "q24", "q25"] },
      { title: "SCOPE", questionIds: ["q26", "q27"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q18"] },
    ],
  },
  "Electrical": {
    intro: "To the subcontractor: All work must be performed per local code. Review specifications, refer to attached plans and fixture portfolio, and submit your complete estimate.",
    sections: [
      { title: "SERVICE & PANELS", questionIds: ["q1", "q2", "q3"] },
      { title: "HVAC EQUIPMENT CIRCUITS", questionIds: ["q4", "q5", "q6"] },
      { title: "APPLIANCES & EQUIPMENT", questionIds: ["q7", "q8", "q9", "q10", "q11", "q12", "q13", "q14", "q15"] },
      { title: "LIGHTING", questionIds: ["q16", "q17", "q18", "q19", "q20", "q21", "q22", "q23"] },
      { title: "HEATED FLOORS", questionIds: ["q24", "q25", "q26"] },
      { title: "MEDIA & TECHNOLOGY", questionIds: ["q27", "q30", "q31", "q32", "q33"] },
      { title: "SPECIALTY OUTLETS", questionIds: ["q34", "q35", "q36"] },
      { title: "SAFETY & CODE", questionIds: ["q37", "q38", "q39", "q40", "q41"] },
      { title: "SCOPE", questionIds: ["q42", "q43", "q44"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q28", "q29"] },
    ],
  },
  "HVAC": {
    intro: "PCG Standard — included in all projects: Carrier 95% efficient, ERV, dryer box & vent pipe, exhaust fan pipes, finish grills, quick flash all penetrations, thermostats, ductwork, commissioning & startup. Labor and materials by sub. Gas lines by plumbing sub. Electrical by electrical sub. Equipment locations TBD on site.",
    sections: [
      { title: "FURNACES", questionIds: ["q1", "q2", "q3", "q4"] },
      { title: "CONDENSERS / HEAT PUMPS", questionIds: ["q5", "q6", "q7", "q8"] },
      { title: "ZONING", questionIds: ["q9", "q10"] },
      { title: "TIE-INS", questionIds: ["q11", "q12"] },
      { title: "INDOOR AIR QUALITY", questionIds: ["q13", "q14", "q15"] },
      { title: "ADDITIONAL AREAS", questionIds: ["q16", "q17", "q18"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q19"] },
    ],
  },
  "Insulation": {
    intro: "To the subcontractor: All insulation must meet or exceed HERS specifications and local energy code. Submit your complete estimate including labor and materials.",
    sections: [
      { title: "HERS & ENERGY CODE", questionIds: ["q1", "q2", "q3"] },
      { title: "WALL INSULATION", questionIds: ["q5", "q7"] },
      { title: "ATTIC & CEILING", questionIds: ["q6", "q8"] },
      { title: "FOUNDATION & RIM JOIST", questionIds: ["q9", "q10", "q11"] },
      { title: "ADDITIONAL AREAS", questionIds: ["q12", "q13", "q14"] },
      { title: "SCOPE", questionIds: ["q15"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q4"] },
    ],
  },
  "Roofing": {
    intro: "To the subcontractor: Labor and materials provided by subcontractor. Submit complete estimate including product specs, labor, warranty information, and timeline.",
    sections: [
      { title: "ROOFING MATERIAL", questionIds: ["q1", "q2", "q3", "q4"] },
      { title: "UNDERLAYMENT & PROTECTION", questionIds: ["q5", "q6", "q7"] },
      { title: "FLASHING", questionIds: ["q8", "q9", "q10", "q11", "q12"] },
      { title: "VENTILATION", questionIds: ["q13"] },
      { title: "SCOPE DETAILS", questionIds: ["q14", "q15", "q16", "q17"] },
    ],
  },
  "Gutters": {
    intro: "To the subcontractor: Labor and materials provided by subcontractor. Submit complete estimate including product specs, labor, and timeline.",
    sections: [
      { title: "GUTTER SYSTEM", questionIds: ["q1", "q2", "q3", "q4"] },
      { title: "DOWNSPOUTS", questionIds: ["q5", "q6", "q7"] },
      { title: "ACCESSORIES", questionIds: ["q8", "q9"] },
      { title: "SCOPE DETAILS", questionIds: ["q10", "q11", "q12"] },
    ],
  },
  "Siding": {
    intro: "",
    sections: [
      { title: "SIDING", questionIds: ["q1", "q2", "q3", "q4", "q5", "q6"] },
      { title: "TRIM", questionIds: ["q7", "q8", "q9", "q10", "q11", "q12", "q13", "q14", "q15"] },
      { title: "SOFFIT & FASCIA", questionIds: ["q16", "q17", "q18", "q19", "q20"] },
      { title: "HOUSE WRAP", questionIds: ["q21", "q23"] },
      { title: "SCOPE DETAILS", questionIds: ["q24", "q25", "q26", "q27"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q22"] },
    ],
  },
  "Masonry": {
    intro: "PCG Standard: Subcontractor provides all scaffolding and machinery. Labor and materials responsibility defined per project below. Lintels provided by PCG unless noted otherwise.",
    sections: [
      { title: "MATERIAL", questionIds: ["q1", "q2", "q3", "q4", "q5", "q6"] },
      { title: "SCOPE — ITEMS INCLUDED", questionIds: ["q7", "q8", "q9", "q10", "q11", "q12", "q13", "q14", "q15"] },
      { title: "LABOR & MATERIALS", questionIds: ["q16", "q17", "q18", "q19", "q20"] },
      { title: "PROJECT DETAILS", questionIds: ["q21", "q22"] },
    ],
  },
  "Drywall": {
    intro: "PCG Standard — all projects: 1/2\" main house, 5/8\" garage (fire rated assembly), smooth finish Level 5. Submit complete estimate based on specifications below.",
    sections: [
      { title: "SCOPE", questionIds: ["q1", "q2", "q3", "q4", "q5", "q6"] },
      { title: "LABOR & MATERIALS", questionIds: ["q7"] },
    ],
  },
  "Painting": {
    intro: "PCG Standard — all projects: Sub provides labor and materials. 5 different colors per project. Scaffolding and step ladder by sub. Scope includes: interior walls, ceilings, trim, doors, closets, exterior body, trim and doors. Caulking and primer included.",
    sections: [
      { title: "ADDITIONAL SCOPE", questionIds: ["q1", "q2", "q3", "q4"] },
      { title: "PRODUCT", questionIds: ["q5", "q6", "q7", "q8"] },
      { title: "NUMBER OF COATS", questionIds: ["q9", "q10", "q11", "q12"] },
    ],
  },
  "Tile": {
    intro: "To the subcontractor: Review specifications below and submit your complete estimate including labor, materials where applicable, timeline, and any clarifications.",
    sections: [
      { title: "SCOPE", questionIds: ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10"] },
      { title: "SHOWER DETAILS", questionIds: ["q11", "q12", "q13"] },
      { title: "HEATED FLOORS", questionIds: ["q14", "q16"] },
      { title: "LABOR & MATERIALS", questionIds: ["q19", "q17", "q18"] },
      { title: "PRODUCT", questionIds: ["q20"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q15"] },
    ],
  },
  "Flooring": {
    intro: "",
    sections: [
      { title: "SCOPE — AREAS INCLUDED", questionIds: ["q1", "q2", "q3", "q4", "q5"] },
      { title: "MATERIAL TYPE", questionIds: ["q6", "q7", "q8", "q9", "q10"] },
      { title: "SUBFLOOR PREP", questionIds: ["q11", "q12"] },
    ],
  },
  "Interior Trim": {
    intro: "PCG Standard: Labor only — PCG provides all materials and fixtures. Scaffolding and step ladder provided by sub. Sub installs all interior trim necessary.",
    sections: [
      { title: "TRIM & MOLDING", questionIds: ["q1", "q2", "q3", "q4", "q5", "q6"] },
      { title: "DOORS", questionIds: ["q7", "q8", "q9", "q10"] },
      { title: "STAIRS", questionIds: ["q11", "q12", "q13"] },
      { title: "CABINETS & VANITIES", questionIds: ["q14", "q15", "q16"] },
      { title: "CLOSETS", questionIds: ["q17", "q18"] },
      { title: "BATH HARDWARE & FIXTURES", questionIds: ["q19", "q20", "q21", "q22"] },
      { title: "SPECIALTY", questionIds: ["q23", "q24", "q25", "q26"] },
      { title: "ADDITIONAL SPECIFICATIONS", questionIds: ["q27", "q28"] },
    ],
  },
}
