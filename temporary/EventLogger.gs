// EventLogger.gs — registra eventos na planilha "Event"
//
// Estrutura esperada (colunas):
// EventID | Description | ObraID | UserEmail | DatetimeZ

function appendEvent(description, obraId) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Event");
  if (!sheet) {
    throw new Error("Sheet 'Event' não encontrada.");
  }

  const eventId = Utilities.getUuid().replace(/-/g, "").substring(0, 12).toUpperCase();
  const email = Session.getActiveUser().getEmail() || "unknown@user";
  const when = isoNow();

  sheet.appendRow([
    eventId,             // EventID
    description || "",   // Description
    obraId || "",        // ObraID
    email,               // UserEmail
    when                 // DatetimeZ (UTC ISO)
  ]);

  return { eventId, email, datetime: when };
}

function appendEventChange(obraId, label, before, after) {
  const desc = `Alteração ${label}: "${before ?? ""}" -> "${after ?? ""}"`;
  return appendEvent(desc, obraId);
}

