// The preview lives inside a dialog, and a dialog is rendered in the browser's
// top layer: its box is positioned by the UA and cannot be flattened back into
// normal flow with CSS. Printing it in place is what produced the empty first
// page and the clipping.
//
// So the document is cloned into a plain container at the end of <body> just for
// the print, and everything else is taken out of the flow — not merely hidden,
// since `visibility: hidden` keeps the boxes and their offsets.
export const PRINT_CSS = `
  @media print {
    html, body {
      height: auto !important;
      overflow: visible !important;
      background: #fff !important;
    }

    body > *:not(#print-portal) { display: none !important; }
    ::backdrop { display: none !important; }

    #print-portal {
      display: block !important;
      position: static !important;
    }

    #print-portal [data-print-root] {
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      /* The page margin below plays the part the preview's padding plays on
         screen — same number on both sides, so the two look alike. */
      padding: 0 !important;
      box-shadow: none !important;
    }

    /* No paper size on purpose. Forcing "letter" onto a printer set to A4 makes
       Chrome shrink the letter page to fit and centre it on the sheet, which is
       what added half an inch above and below the content on every page — while
       the side margins stayed put. Left alone, the page takes the paper the user
       picked and the margin below is the only spacing. */
    @page { margin: 0.5in; }
  }
`

const PORTAL_ID = "print-portal"

// Clone, print, clean up. The clone is inert — no React, no listeners — so there
// is nothing to keep in sync while the print dialog is open.
export function printDocument() {
  const source = document.querySelector("[data-print-root]")
  if (!source) return

  document.getElementById(PORTAL_ID)?.remove()

  const portal = document.createElement("div")
  portal.id = PORTAL_ID
  portal.appendChild(source.cloneNode(true))
  document.body.appendChild(portal)

  const cleanup = () => {
    portal.remove()
    window.removeEventListener("afterprint", cleanup)
  }
  window.addEventListener("afterprint", cleanup)

  window.print()
  // Safari and some Chromium builds never fire afterprint from a modal context.
  setTimeout(cleanup, 1000)
}
