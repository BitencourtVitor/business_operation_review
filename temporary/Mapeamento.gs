/** 
 * MAPA FIXO DAS TABELAS DA ABA "Categorization"
 * Cada entrada define a posição EXATA da tabela.
 * As colunas NÃO mudam. Se mudar, este arquivo deve ser revisado.
 */

const CATEGORIZATION_MAP = {
  
  // Tabela 1 — Workforce (A)
  Workforce: {
    sheet: "Categorization",
    titleRow: 1,
    headerRow: 2,
    startCol: 1,    // A
    endCol: 1
  },

  // Tabela 2 — Fieldwire (C:F)
  Fieldwire: {
    sheet: "Categorization",
    titleRow: 1,
    headerRow: 2,
    startCol: 3,    // C
    endCol: 6       // F
  },

  // Tabela 3 — Machines (H:K)
  Machines: {
    sheet: "Categorization",
    titleRow: 1,
    headerRow: 2,
    startCol: 8,    // H
    endCol: 11      // K
  },

  // Tabela 4 — Contract Steps (M)
  ContractSteps: {
    sheet: "Categorization",
    titleRow: 1,
    headerRow: 2,
    startCol: 13,   // M
    endCol: 13
  },

  // Tabela 5 — Machine Provider (O)
  MachineProvider: {
    sheet: "Categorization",
    titleRow: 1,
    headerRow: 2,
    startCol: 15,   // O
    endCol: 15
  }

};

function getTable(tableName) {
  const cfg = CATEGORIZATION_MAP[tableName];
  if (!cfg) throw new Error("Tabela não mapeada: " + tableName);

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(cfg.sheet);

  // só busca na área da tabela
  const colRange = sheet.getRange(1, cfg.startCol, sheet.getMaxRows(), cfg.endCol - cfg.startCol + 1);
  const values = colRange.getValues();

  // encontrar última linha com conteúdo dentro da área da tabela
  let last = 0;
  for (let r = values.length - 1; r >= 0; r--) {
    if (values[r].some(v => v !== "")) {
      last = r + 1;
      break;
    }
  }

  if (last === 0) return []; // tabela vazia

  // retornar apenas as linhas úteis
  return values.slice(0, last);
}
