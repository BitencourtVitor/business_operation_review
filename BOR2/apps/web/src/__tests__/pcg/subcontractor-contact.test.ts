import { describe, expect, it } from "vitest"
import {
  asEmail, asPhone,
} from "@/app/bor/pcg-bid-requests/_lib/use-subcontractor-contact"

// The cadastro's contact boxes double as a notepad, and whatever is in them is
// what the subcontract prints. "need to request" reached a real contract once.
describe("contact read off the roster", () => {
  it("keeps an address that is one", () => {
    expect(asEmail("asgeneralconstruction@hotmail.com")).toBe("asgeneralconstruction@hotmail.com")
    expect(asEmail("  info@binsulation.com  ")).toBe("info@binsulation.com")
  })

  it("drops a note left in the email box", () => {
    expect(asEmail("need to request")).toBe("")
    expect(asEmail("TBD")).toBe("")
    expect(asEmail("")).toBe("")
  })

  it("keeps a number that can be dialled, in any format", () => {
    expect(asPhone("(973) 474-6684")).toBe("(973) 474-6684")
    expect(asPhone("978.962.9247")).toBe("978.962.9247")
  })

  it("drops a note left in the phone box", () => {
    expect(asPhone("need number")).toBe("")
    expect(asPhone("x201")).toBe("")
    expect(asPhone("")).toBe("")
  })
})
