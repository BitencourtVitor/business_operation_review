// ServidorGestao.gs — versão final
const SHEET_ID = "188IqXMBS6UaVzG-FWRI9REVCFsqLV_tOkv0F3PxX83I";

// Helper para usar o mapeamento
function getCategorizationRange(tableName) {
  const cfg = CATEGORIZATION_MAP[tableName];
  if (!cfg) throw new Error("Tabela não mapeada: " + tableName);
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(cfg.sheet);
  if (!sheet) throw new Error(`Sheet '${cfg.sheet}' não encontrada.`);
  const lastRow = sheet.getLastRow();
  if (lastRow < cfg.headerRow + 1) return null;
  const numCols = cfg.endCol - cfg.startCol + 1;
  return sheet.getRange(cfg.headerRow + 1, cfg.startCol, lastRow - cfg.headerRow, numCols);
}

// ------------------- VIEW -------------------
function doGet() {
  return HtmlService.createTemplateFromFile("PaginaGestao")
    .evaluate()
    .setTitle("Forecast Control")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ------------------- HELPERS -------------------
function uniqueFromRange(sheet, colIndex) {
  // sheet: Sheet object
  // colIndex: 1-based column index
  if (!sheet || !colIndex) return [];

  // pega toda a coluna a partir da linha 2 até o fim físico da folha
  const maxRows = sheet.getMaxRows();
  const values = sheet.getRange(2, colIndex, Math.max(0, maxRows - 1), 1).getValues().flat();

  // limpa e mantém ordem sem duplicados
  const out = [];
  const seen = Object.create(null);
  for (let i = 0; i < values.length; i++) {
    const raw = values[i];
    if (raw === null || raw === undefined) continue;
    const s = String(raw).trim();
    if (s === "") continue;
    if (!seen[s]) {
      seen[s] = true;
      out.push(s);
    }
  }
  return out;
}

function toYesNo(bool) {
  return bool ? "YES" : "NO";
}

function isoNow() {
  return Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
}

function formatMDY(dateStr) {
  // input: "yyyy-mm-dd" (from input[type=date]) or other forms
  if (!dateStr) return "";
  // try Date parse
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // fallback: try splitting by non-digit
    const parts = String(dateStr).split(/\D+/).filter(Boolean);
    if (parts.length >= 3) {
      // assume yyyy mm dd or dd mm yyyy ambiguous — best-effort:
      const year = parts[0].length === 4 ? parts[0] : parts[2];
      const month = parts[1];
      const day = parts[2] && parts[0].length === 4 ? parts[2] : parts[1];
      return `${parseInt(month,10)}/${parseInt(day,10)}/${year}`;
    }
    return String(dateStr);
  }
  const M = d.getUTCMonth() + 1;
  const D = d.getUTCDate();
  const Y = d.getUTCFullYear();
  return `${M}/${D}/${Y}`;
}

// ------------------- API PARA FRONT-END -------------------
function getInitialOptions() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  const cat = ss.getSheetByName("Categorization");

  if (!dataSheet) {
    throw new Error("Sheet 'Data' não encontrada.");
  }
  if (!cat) {
    throw new Error("Sheet 'Categorization' não encontrada.");
  }

  // Clients = coluna B (2)
  const clients = uniqueFromRange(dataSheet, 2);

  // JobSites = coluna C (3)
  const jobSites = uniqueFromRange(dataSheet, 3);

  // Workforce = coluna A (1) da Categorization - usando mapeamento
  const workforceRange = getCategorizationRange("Workforce");
  const workforce = workforceRange ? uniqueFromRange(cat, CATEGORIZATION_MAP.Workforce.startCol) : [];

  // MachineProviders = coluna O (15) da Categorization - usando mapeamento
  const machineProviderRange = getCategorizationRange("MachineProvider");
  const machineProviders = machineProviderRange ? uniqueFromRange(cat, CATEGORIZATION_MAP.MachineProvider.startCol) : [];

  return {
    clients: clients,
    jobSites: jobSites,
    workforce: workforce,
    machineProviders: machineProviders
  };
}

// Esta função é a que o frontend chama (nome esperado)
function addNewWorkAndDerivatives(payload) {
  // payload expected keys (from frontend):
  // client, jobsite, jobsiteNew, type, lotOrBld, address,
  // workforce (select), workforceNew, previousBeamsDate, previousStartDate, previousEndDate,
  // obs, hvac (bool), buildertrend (bool), machineProvider (select), machineProviderNew
  const result = createNewWork(payload);
  return { success: true, id: result.id };
}

// ------------------- CORE: criar obra -------------------
function createNewWork(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  const categ = ss.getSheetByName("Categorization");

  const id = Utilities.getUuid().replace(/-/g, "").substring(0, 8).toUpperCase();
  const nowIso = isoNow();
  const status = "not started";

  // Prioridade: NEW > selected
  const finalJobsite = (data.jobsiteNew && String(data.jobsiteNew).trim()) ? String(data.jobsiteNew).trim() : (data.jobsite || "");
  const finalWorkforce = (data.workforceNew && String(data.workforceNew).trim()) ? String(data.workforceNew).trim() : (data.workforce || "");
  const finalMachineProvider = (data.machineProviderNew && String(data.machineProviderNew).trim()) ? String(data.machineProviderNew).trim() : (data.machineProvider || "");

  // Format dates to M/D/YYYY as requested
  const prevBeams = formatMDY(data.previousBeamsDate || "");
  const prevStart = formatMDY(data.previousStartDate || "");
  const prevEnd = formatMDY(data.previousEndDate || "");

  // HVAC / BuilderTrend strings
  const hvacStr = toYesNo(Boolean(data.hvac));
  const btStr = toYesNo(Boolean(data.buildertrend));

  const row = [
    id,                          // A ID
    data.client || "",           // B Cliente
    finalJobsite,                // C Job Site
    data.type || "",             // D Type
    data.lotOrBld || "",         // E Lote / Bld
    status,                      // F Status
    data.address || "",          // G Address
    finalWorkforce,              // H Workforce
    prevBeams,                   // I Previous Beams Date (M/D/YYYY)
    prevStart,                   // J Previous Start Date
    prevEnd,                     // K Previous End Date
    data.obs || "",              // L Obs
    hvacStr,                     // M HVAC (YES/NO)
    btStr,                       // N Buildertrend (YES/NO)
    finalMachineProvider,        // O MachineProvider
    nowIso,                      // P Create DateTime (ISO Z)
    nowIso                       // Q LastUpdate DatetimeZ
  ];

  dataSheet.appendRow(row);

  // Atualiza Categorization se houver novos workforce / machineProvider - usando mapeamento
  if (data.workforceNew && String(data.workforceNew).trim()) {
    appendIfNotExists(categ, CATEGORIZATION_MAP.Workforce.startCol, String(data.workforceNew).trim());
  }
  if (data.machineProviderNew && String(data.machineProviderNew).trim()) {
    appendIfNotExists(categ, CATEGORIZATION_MAP.MachineProvider.startCol, String(data.machineProviderNew).trim());
  }

  // Execução das ingestões individuais (APENAS PARA ESTA OBRA)
  ingestFieldwireForId(id, data.client, data.type, nowIso);
  ingestMachinesForId(id, data.client, data.type, nowIso);
  ingestContractStepsForId(id, nowIso);

  // Log de evento
  appendEvent(`Cadastro da obra ${id}`, id);

  return { id };
}

// ------------------- CONSULTA E DELETE -------------------
function getWorkSummary(workId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  if (!dataSheet) throw new Error("Sheet 'Data' não encontrada.");
  if (!workId) throw new Error("ID não informado.");

  const last = dataSheet.getLastRow();
  if (last < 2) throw new Error("Nenhuma obra cadastrada.");

  const ids = dataSheet.getRange(2, 1, last - 1, 1).getValues().flat();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i]).trim() === String(workId).trim()) {
      const rowIdx = i + 2; // offset header
      const jobSite = dataSheet.getRange(rowIdx, 3).getValue(); // C
      const type = dataSheet.getRange(rowIdx, 4).getValue();    // D
      const lotBld = dataSheet.getRange(rowIdx, 5).getValue();  // E
      return {
        jobSite: jobSite || "",
        type: type || "",
        lotOrBld: lotBld || ""
      };
    }
  }
  throw new Error("Obra não encontrada.");
}

function deleteWorkById(workId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  const fieldwireSheet = ss.getSheetByName("Fieldwire");
  const machinesSheet = ss.getSheetByName("Machines");
  const stepsSheet = ss.getSheetByName("ContractSteps");

  if (!dataSheet) throw new Error("Sheet 'Data' não encontrada.");
  if (!workId) throw new Error("ID não informado.");

  const idStr = String(workId).trim();
  const lastData = dataSheet.getLastRow();
  if (lastData < 2) throw new Error("Nenhuma obra cadastrada.");

  // Remove linha única na Data
  let removed = false;
  const ids = dataSheet.getRange(2, 1, lastData - 1, 1).getValues().flat();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i]).trim() === idStr) {
      dataSheet.deleteRow(i + 2); // adjust header offset
      removed = true;
      break;
    }
  }
  if (!removed) throw new Error("Obra não encontrada.");

  // Helper para deletar todas as linhas com id na coluna 1
  function deleteAllWithId(sheet) {
    if (!sheet) return;
    const last = sheet.getLastRow();
    if (last < 2) return;
    const vals = sheet.getRange(2, 1, last - 1, 1).getValues().flat();
    for (let i = vals.length - 1; i >= 0; i--) {
      if (String(vals[i]).trim() === idStr) {
        sheet.deleteRow(i + 2);
      }
    }
  }

  deleteAllWithId(fieldwireSheet);
  deleteAllWithId(machinesSheet);
  deleteAllWithId(stepsSheet);

  appendEvent(`Exclusão da obra ${idStr}`, idStr);
  return { success: true };
}

// ------------------- EDIÇÃO / CONSULTA OBRAS EXISTENTES -------------------
function toInputDate(value) {
  if (!value) return "";
  // If Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "UTC", "yyyy-MM-dd");
  }
  // Try parse as date string
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
  }
  // Try split numbers (handles "M/D/YYYY" or similar)
  const parts = String(value).split(/\D+/).filter(Boolean);
  if (parts.length >= 3) {
    let y, m, day;
    if (parts[0].length === 4) {
      y = parts[0]; m = parts[1]; day = parts[2];
    } else {
      m = parts[0]; day = parts[1]; y = parts[2];
    }
    const mm = String(parseInt(m, 10)).padStart(2, "0");
    const dd = String(parseInt(day, 10)).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }
  return "";
}

function getWorksByClientJobsite(client, jobsite) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  if (!dataSheet) throw new Error("Sheet 'Data' não encontrada.");

  const last = dataSheet.getLastRow();
  if (last < 2) return [];
  const range = dataSheet.getRange(2, 1, last - 1, 15).getValues();
  const matches = [];
  for (let i = 0; i < range.length; i++) {
    const row = range[i];
    const rowClient = String(row[1] || "").trim();
    const rowJobsite = String(row[2] || "").trim();
    if ((client && rowClient !== client) || (jobsite && rowJobsite !== jobsite)) continue;
    matches.push({
      id: String(row[0] || ""),
      client: rowClient,
      jobsite: rowJobsite,
      type: String(row[3] || ""),
      lotOrBld: String(row[4] || ""),
      status: String(row[5] || ""),
      address: String(row[6] || ""),
      workforce: String(row[7] || ""),
      previousBeamsDate: toInputDate(row[8]),
      previousStartDate: toInputDate(row[9]),
      previousEndDate: toInputDate(row[10]),
      obs: String(row[11] || ""),
      hvac: String(row[12] || "").toUpperCase() === "YES",
      buildertrend: String(row[13] || "").toUpperCase() === "YES",
      machineProvider: String(row[14] || "")
    });
  }
  return matches;
}

function getJobsitesByClient(client) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  if (!dataSheet) throw new Error("Sheet 'Data' não encontrada.");
  if (!client) return [];

  const last = dataSheet.getLastRow();
  if (last < 2) return [];
  const range = dataSheet.getRange(2, 2, last - 1, 2).getValues(); // B client, C jobsite
  const seen = Object.create(null);
  const result = [];
  for (let i = 0; i < range.length; i++) {
    const rowClient = String(range[i][0] || "").trim();
    const rowJob = String(range[i][1] || "").trim();
    if (rowClient !== client) continue;
    if (!rowJob) continue;
    if (!seen[rowJob]) {
      seen[rowJob] = true;
      result.push(rowJob);
    }
  }
  return result;
}

function getFieldwireByWork(workId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Fieldwire");
  if (!sheet) throw new Error("Sheet 'Fieldwire' não encontrada.");
  if (!workId) throw new Error("ID não informado.");
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues(); // ID, Category, Document, Status, TS
  const idStr = String(workId).trim();
  return rows
    .filter(r => String(r[0]).trim() === idStr)
    .map(r => ({
      id: idStr,
      category: String(r[1] || ""),
      document: String(r[2] || ""),
      status: String(r[3] || "").toUpperCase() === "YES"
    }));
}

function getMachinesByWork(workId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Machines");
  if (!sheet) throw new Error("Sheet 'Machines' não encontrada.");
  if (!workId) throw new Error("ID não informado.");
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const colCount = sheet.getLastColumn();
  const width = Math.min(colCount, 8); // até Unit + LastUpdate
  const rows = sheet.getRange(2, 1, last - 1, width).getValues();
  return rows
    .filter(r => String(r[0]).trim() === String(workId).trim())
    .map(r => ({
      id: workId,
      category: String(r[1] || ""),
      subcategory: String(r[2] || ""),
      equipmentCategory: String(r[3] || ""),
      title: String(r[4] || ""),
      status: String(r[5] || "").toUpperCase() === "YES",
      unit: String(r[6] || "")
    }));
}

function getContractStepsByWork(workId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("ContractSteps");
  if (!sheet) throw new Error("Sheet 'ContractSteps' não encontrada.");
  if (!workId) throw new Error("ID não informado.");
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const rows = sheet.getRange(2, 1, last - 1, 4).getValues(); // ID, Step, Status, TS
  const idStr = String(workId).trim();
  return rows
    .filter(r => String(r[0]).trim() === idStr)
    .map(r => ({
      id: idStr,
      step: String(r[1] || ""),
      status: String(r[2] || "").toUpperCase() === "YES"
    }));
}

function updateContractSteps(workId, items) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("ContractSteps");
  if (!sheet) throw new Error("Sheet 'ContractSteps' não encontrada.");
  if (!workId) throw new Error("ID não informado.");
  if (!Array.isArray(items)) return { success: true };

  const idStr = String(workId).trim();
  const last = sheet.getLastRow();
  if (last < 2) return { success: true };
  const rows = sheet.getRange(2, 1, last - 1, 4).getValues(); // ID, Step, Status, TS
  const nowIso = isoNow();

  const stepMap = {};
  items.forEach(it => {
    if (!it || !it.step) return;
    stepMap[String(it.step).trim()] = it.status ? "YES" : "NO";
  });

  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim() !== idStr) continue;
    const step = String(r[1] || "").trim();
    if (stepMap.hasOwnProperty(step)) {
      const before = String(r[2] || "").toUpperCase();
      const after = stepMap[step];
      if (before !== after) {
        sheet.getRange(i + 2, 3).setValue(after); // Status column C
        sheet.getRange(i + 2, 4).setValue(nowIso); // LastUpdate DatetimeZ column D
        appendEventChange(idStr, `Contract Step (${step})`, before, after);
        changed = true;
      }
    }
  }

  if (changed) {
    appendEvent(`Atualização Contract Steps da obra ${idStr}`, idStr);
  }
  return { success: true };
}

function updateWork(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const dataSheet = ss.getSheetByName("Data");
  const categ = ss.getSheetByName("Categorization");
  if (!dataSheet) throw new Error("Sheet 'Data' não encontrada.");
  if (!data.id) throw new Error("ID não informado.");

  const idStr = String(data.id).trim();
  const last = dataSheet.getLastRow();
  if (last < 2) throw new Error("Nenhuma obra cadastrada.");
  const ids = dataSheet.getRange(2, 1, last - 1, 1).getValues().flat();
  let rowIdx = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i]).trim() === idStr) {
      rowIdx = i + 2;
      break;
    }
  }
  if (rowIdx === -1) throw new Error("Obra não encontrada.");

  // Valores anteriores (para log)
  const prevValues = dataSheet.getRange(rowIdx, 1, 1, 15).getValues()[0]; // A-O
  const oldStatus = prevValues[5] || "";
  const oldAddress = prevValues[6] || "";
  const oldWorkforce = prevValues[7] || "";
  const oldPrevBeams = prevValues[8] || "";
  const oldPrevStart = prevValues[9] || "";
  const oldPrevEnd = prevValues[10] || "";
  const oldObs = prevValues[11] || "";
  const oldHvac = String(prevValues[12] || "");
  const oldBt = String(prevValues[13] || "");
  const oldMachineProvider = prevValues[14] || "";

  // Prepare values (dates expected in yyyy-mm-dd)
  const prevBeams = formatMDY(data.previousBeamsDate || "");
  const prevStart = formatMDY(data.previousStartDate || "");
  const prevEnd = formatMDY(data.previousEndDate || "");
  const hvacStr = toYesNo(Boolean(data.hvac));
  const btStr = toYesNo(Boolean(data.buildertrend));
  const nowIso = isoNow();

  // Columns: A ID, B Client, C JobSite, D Type, E Lot/Bld, F Status, G Address, H Workforce, I prevBeams, J prevStart, K prevEnd, L Obs, M HVAC, N BT, O MachineProvider, P CreateTS, Q LastUpdate
  let changed = false;
  const oldStatusN = String(oldStatus || "");
  const oldAddressN = String(oldAddress || "");
  const oldWorkforceN = String(oldWorkforce || "");
  const oldPrevBeamsN = formatMDY(oldPrevBeams || "");
  const oldPrevStartN = formatMDY(oldPrevStart || "");
  const oldPrevEndN = formatMDY(oldPrevEnd || "");
  const oldObsN = String(oldObs || "");
  const oldHvacN = String(oldHvac || "");
  const oldBtN = String(oldBt || "");
  const oldMachineProviderN = String(oldMachineProvider || "");

  if (oldStatusN !== (data.status || "")) {
    dataSheet.getRange(rowIdx, 6).setValue(data.status || "");
    appendEventChange(idStr, "Status", oldStatusN, data.status || "");
    changed = true;
  }
  if (oldAddressN !== (data.address || "")) {
    dataSheet.getRange(rowIdx, 7).setValue(data.address || "");
    appendEventChange(idStr, "Address", oldAddressN, data.address || "");
    changed = true;
  }
  // Prioridade: NEW > selected (mesma lógica do createNewWork)
  const finalWorkforce = (data.workforceNew && String(data.workforceNew).trim()) ? String(data.workforceNew).trim() : (data.workforce || "");
  if (oldWorkforceN !== finalWorkforce) {
    dataSheet.getRange(rowIdx, 8).setValue(finalWorkforce);
    appendEventChange(idStr, "Workforce", oldWorkforceN, finalWorkforce);
    // Adiciona à Categorization se não existir - usando mapeamento
    if (data.workforceNew && String(data.workforceNew).trim() && categ) {
      appendIfNotExists(categ, CATEGORIZATION_MAP.Workforce.startCol, String(data.workforceNew).trim());
    }
    changed = true;
  }
  if (oldPrevBeamsN !== prevBeams) {
    dataSheet.getRange(rowIdx, 9).setValue(prevBeams);
    appendEventChange(idStr, "PreviousBeamsDate", oldPrevBeamsN, prevBeams);
    changed = true;
  }
  if (oldPrevStartN !== prevStart) {
    dataSheet.getRange(rowIdx, 10).setValue(prevStart);
    appendEventChange(idStr, "PreviousStartDate", oldPrevStartN, prevStart);
    changed = true;
  }
  if (oldPrevEndN !== prevEnd) {
    dataSheet.getRange(rowIdx, 11).setValue(prevEnd);
    appendEventChange(idStr, "PreviousEndDate", oldPrevEndN, prevEnd);
    changed = true;
  }
  if (oldObsN !== (data.obs || "")) {
    dataSheet.getRange(rowIdx, 12).setValue(data.obs || "");
    appendEventChange(idStr, "Observações", oldObsN, data.obs || "");
    changed = true;
  }
  if (oldHvacN !== hvacStr) {
    dataSheet.getRange(rowIdx, 13).setValue(hvacStr);
    appendEventChange(idStr, "HVAC", oldHvacN, hvacStr);
    changed = true;
  }
  if (oldBtN !== btStr) {
    dataSheet.getRange(rowIdx, 14).setValue(btStr);
    appendEventChange(idStr, "BuilderTrend", oldBtN, btStr);
    changed = true;
  }
  // Prioridade: NEW > selected (mesma lógica do createNewWork)
  const finalMachineProvider = (data.machineProviderNew && String(data.machineProviderNew).trim()) ? String(data.machineProviderNew).trim() : (data.machineProvider || "");
  if (oldMachineProviderN !== finalMachineProvider) {
    dataSheet.getRange(rowIdx, 15).setValue(finalMachineProvider);
    appendEventChange(idStr, "MachineProvider", oldMachineProviderN, finalMachineProvider);
    // Adiciona à Categorization se não existir - usando mapeamento
    if (data.machineProviderNew && String(data.machineProviderNew).trim() && categ) {
      appendIfNotExists(categ, CATEGORIZATION_MAP.MachineProvider.startCol, String(data.machineProviderNew).trim());
    }
    changed = true;
  }

  if (changed) {
    dataSheet.getRange(rowIdx, 17).setValue(nowIso); // LastUpdate (col Q = 17)
    appendEvent(`Atualização da obra ${idStr}`, idStr);
  }
  return { success: true, id: idStr, changed };
}

function updateFieldwireStatuses(workId, items) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Fieldwire");
  if (!sheet) throw new Error("Sheet 'Fieldwire' não encontrada.");
  if (!workId) throw new Error("ID não informado.");
  if (!Array.isArray(items)) return { success: true };

  const idStr = String(workId).trim();
  const last = sheet.getLastRow();
  if (last < 2) return { success: true };
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  const mapDocToStatus = {};
  items.forEach(it => {
    if (!it || !it.document) return;
    mapDocToStatus[it.document] = it.status ? "YES" : "NO";
  });

  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim() !== idStr) continue;
    const doc = String(r[2] || "");
    if (mapDocToStatus.hasOwnProperty(doc)) {
      const before = String(r[3] || "");
      const after = mapDocToStatus[doc];
      if (before !== after) {
        sheet.getRange(i + 2, 4).setValue(after); // Status column D
        appendEventChange(idStr, `Fieldwire (${doc})`, before, after);
        changed = true;
      }
    }
  }
  if (changed) {
    appendEvent(`Atualização Fieldwire da obra ${idStr}`, idStr);
  }
  return { success: true };
}

function updateMachines(workId, items) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Machines");
  if (!sheet) throw new Error("Sheet 'Machines' não encontrada.");
  if (!workId) throw new Error("ID não informado.");
  if (!Array.isArray(items)) return { success: true };

  const idStr = String(workId).trim();
  const last = sheet.getLastRow();
  if (last < 2) return { success: true };

  // Determine if Unit column exists; if not, create at col 7 (after Status)
  const unitCol = sheet.getLastColumn() >= 7 ? 7 : 7;
  // Ensure at least 7 columns for unit
  if (sheet.getLastColumn() < 7) {
    sheet.insertColumnAfter(6); // after Status
  }

  const rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  const nowIso = isoNow();

  // Map by composite key (title + category + subcategory + equipmentCategory) to identify row
  const key = (it) => [
    String(it.title || "").trim(),
    String(it.category || "").trim(),
    String(it.subcategory || "").trim(),
    String(it.equipmentCategory || "").trim()
  ].join("||");

  const targetMap = {};
  items.forEach(it => {
    if (!it) return;
    targetMap[key(it)] = it;
  });

  let changed = false;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[0]).trim() !== idStr) continue;
    const current = {
      category: String(r[1] || ""),
      subcategory: String(r[2] || ""),
      equipmentCategory: String(r[3] || ""),
      title: String(r[4] || "")
    };
    const k = key(current);
    if (!targetMap[k]) continue;
    const statusStr = targetMap[k].status ? "YES" : "NO";
    const unitVal = targetMap[k].unit || "";
    const beforeStatus = String(r[5] || "");
    const beforeUnit = String(r[6] || "");
    if (beforeStatus !== statusStr) {
      appendEventChange(idStr, `Machine Status (${current.title || "item"})`, beforeStatus, statusStr);
      sheet.getRange(i + 2, 6).setValue(statusStr); // Status col F
      changed = true;
    }
    if (beforeUnit !== unitVal) {
      appendEventChange(idStr, `Machine Unit (${current.title || "item"})`, beforeUnit, unitVal);
      sheet.getRange(i + 2, 7).setValue(unitVal);   // Unit col G
      changed = true;
    }
    if (changed) {
      sheet.getRange(i + 2, 8).setValue(nowIso);    // LastUpdate DatetimeZ
    }
  }

  if (changed) {
    appendEvent(`Atualização Machines da obra ${idStr}`, idStr);
  }
  return { success: true };
}

function appendIfNotExists(sheet, colIndex, value) {
  if (!sheet || !colIndex || !value) return;
  const trimmedValue = String(value).trim();
  if (!trimmedValue) return;
  
  // Encontrar qual tabela estamos usando baseado na coluna
  let tableName = null;
  if (colIndex === CATEGORIZATION_MAP.Workforce.startCol) {
    tableName = "Workforce";
  } else if (colIndex === CATEGORIZATION_MAP.MachineProvider.startCol) {
    tableName = "MachineProvider";
  }
  
  // Se não for uma tabela mapeada, usar comportamento antigo
  if (!tableName) {
    const last = sheet.getLastRow();
    if (last < 2) {
      sheet.getRange(2, colIndex).setValue(trimmedValue);
      return;
    }
    const existing = sheet.getRange(2, colIndex, last - 1, 1).getValues().flat().map(v => String(v || "").trim());
    if (existing.indexOf(trimmedValue) === -1) {
      sheet.getRange(last + 1, colIndex).setValue(trimmedValue);
    }
    return;
  }
  
  // Usar mapeamento para encontrar última linha da tabela
  const cfg = CATEGORIZATION_MAP[tableName];
  const maxRows = sheet.getMaxRows();
  // Buscar a partir da linha 1 até maxRows para encontrar a última linha com conteúdo
  const range = sheet.getRange(1, cfg.startCol, maxRows, cfg.endCol - cfg.startCol + 1);
  const values = range.getValues();
  
  // Encontrar última linha com conteúdo dentro da área da tabela (começando do headerRow)
  // headerRow é 2 (linha 2), então no array é índice 1
  let lastTableRow = cfg.headerRow; // Começa no headerRow (linha 2)
  for (let r = values.length - 1; r >= cfg.headerRow - 1; r--) { // -1 porque array é 0-indexed
    if (values[r].some(v => String(v || "").trim() !== "")) {
      lastTableRow = r + 1; // +1 porque getValues é 0-indexed, mas getRange é 1-indexed
      break;
    }
  }
  
  // Verificar se já existe na tabela
  if (lastTableRow >= cfg.headerRow) {
    const existing = sheet.getRange(cfg.headerRow + 1, colIndex, lastTableRow - cfg.headerRow, 1)
      .getValues().flat().map(v => String(v || "").trim());
    if (existing.indexOf(trimmedValue) !== -1) {
      return; // Já existe, não adiciona
    }
  }
  
  // Adicionar logo abaixo da última linha da tabela
  sheet.getRange(lastTableRow + 1, colIndex).setValue(trimmedValue);
}

// ------------------- INGESTÕES INDIVIDUAIS (replicam ingestões completas) -------------------

// Fieldwire: usa Categorization C:F (Category, Document, Where, Notes) - usando mapeamento
function ingestFieldwireForId(workId, cliente, type, timestampIso) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const fieldwireSheet = ss.getSheetByName("Fieldwire");
  const categ = ss.getSheetByName("Categorization");

  // carregar matrix usando mapeamento (C:F, mas só usamos C:D para Category e Document)
  const fieldwireRange = getCategorizationRange("Fieldwire");
  if (!fieldwireRange) return;
  const matrix = fieldwireRange.getValues(); // [ [Category, Document, Where, Notes], ... ]

  // determinar categoryFinal pelo mesmo algoritmo
  let categoryFinal = null;
  if (cliente === "Toll Brothers") {
    categoryFinal = "Toll Brothers";
  } else if (cliente === "Pulte Homes") {
    categoryFinal = (type === "Lot") ? "Pulte Homes - House" : "Pulte Homes - Building";
  } else if (cliente === "Callahan") {
    categoryFinal = "Callahan";
  } else if (cliente === "Private") {
    categoryFinal = "Private";
  } else {
    // não mapeado → aborta sem throw para não quebrar UX
    return;
  }

  // filtrar documentos correspondentes
  const documentos = matrix.filter(row => String(row[0]).trim() === categoryFinal);

  if (documentos.length === 0) {
    // nada a inserir
    return;
  }

  const rows = documentos.map(doc => [ workId, categoryFinal, doc[1] || "", "NO", timestampIso ]);
  // append muitos de uma vez
  fieldwireSheet.getRange(fieldwireSheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

// Machines: usa Categorization H:K (Category, Subcategory, Equipment Category, Title) - usando mapeamento
function ingestMachinesForId(workId, cliente, type, timestampIso) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const machinesSheet = ss.getSheetByName("Machines");
  const categ = ss.getSheetByName("Categorization");

  const machinesRange = getCategorizationRange("Machines");
  if (!machinesRange) return;
  const matrix = machinesRange.getValues();
  // matrix rows: [Category, Subcategory, Equipment Category, Title]

  // definir category/subcategory
  let category = null;
  let subcategory = null;

  if (cliente === "Toll Brothers") {
    category = "Toll Brothers";
    subcategory = "House"; // conforme regra
  } else if (cliente === "Pulte Homes") {
    category = "Pulte Homes";
    subcategory = (type === "Lot") ? "House" : "Building";
  } else if (cliente === "Callahan" || cliente === "Private") {
    // exceções → não gera máquinas
    return;
  } else {
    return;
  }

  // filtrar linhas
  const docs = matrix.filter(row => String(row[0]).trim() === category && String(row[1]).trim() === subcategory);
  if (docs.length === 0) return;

  const rows = docs.map(r => [
    workId,
    category,
    subcategory,
    r[2] || "",   // Equipment Category
    r[3] || "",   // Title
    "NO",
    timestampIso
  ]);

  machinesSheet.getRange(machinesSheet.getLastRow() + 1, 1, rows.length, 7).setValues(rows);
}

// Contract steps: pega todas as linhas da coluna M (13) - usando mapeamento
function ingestContractStepsForId(workId, timestampIso) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const stepsSheet = ss.getSheetByName("ContractSteps");
  const categ = ss.getSheetByName("Categorization");

  const stepsRange = getCategorizationRange("ContractSteps");
  if (!stepsRange) return;
  const stepsMatrix = stepsRange.getValues().flat().map(v => String(v).trim()).filter(Boolean);
  if (stepsMatrix.length === 0) return;

  const rows = stepsMatrix.map(step => [ workId, step, "NO", timestampIso ]);
  stepsSheet.getRange(stepsSheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
}
