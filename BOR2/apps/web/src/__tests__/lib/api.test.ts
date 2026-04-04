import { ApiError } from "@/lib/api"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

describe("ApiError", () => {
  it("should create an ApiError with correct properties", () => {
    const error = new ApiError(401, "UNAUTHORIZED", "invalid credentials")

    expect(error.statusCode).toBe(401)
    expect(error.code).toBe("UNAUTHORIZED")
    expect(error.message).toBe("invalid credentials")
    expect(error.name).toBe("ApiError")
  })

  it("should be an instance of Error", () => {
    const error = new ApiError(500, "INTERNAL_ERROR", "server error")
    expect(error).toBeInstanceOf(Error)
  })
})

describe("api client", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it("should throw ApiError on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized", code: "UNAUTHORIZED" }),
    } as Response)

    const { api } = await import("@/lib/api")

    await expect(api.get("/api/v1/auth/me")).rejects.toThrow(ApiError)
  })
})
