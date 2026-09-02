"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuthStore } from "@/store/auth.store"
import { CheckCircle, Loader2, Upload, X } from "lucide-react"
import { useRef, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"

const MONTHS = [
  "01", "02", "03", "04", "05", "06",
  "07", "08", "09", "10", "11", "12",
]

export default function UploadTimesheetPage() {
  const token = useAuthStore((s) => s.token)
  const [files, setFiles] = useState<File[]>([])
  const [company, setCompany] = useState("")
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [month, setMonth] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setFiles(Array.from(e.target.files))
      setResult(null)
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleUpload() {
    if (!company || !month || files.length === 0) return

    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append("company", company)
    formData.append("reference_month", `${year}-${month}`)
    files.forEach((f) => formData.append("files", f))

    try {
      const res = await fetch(`${API_URL}/api/v1/timesheets/upload-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const json = await res.json()
      if (res.ok) {
        setResult(json.data)
        setFiles([])
      } else {
        setResult({ inserted: 0, skipped: 0, errors: [json.error ?? "Upload failed"] })
      }
    } catch {
      setResult({ inserted: 0, skipped: 0, errors: ["Network error"] })
    }

    setLoading(false)
  }

  const canUpload = company && month && files.length > 0 && !loading

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Upload Timesheet Data</h1>
        <p className="text-sm text-muted-foreground">Upload QuickBooks Time CSV exports</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>CSV Upload</CardTitle>
          <CardDescription>
            Select the company, reference month, and upload one or more CSV files.
            PCG data is automatically filtered to client Callahan only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Company</label>
              <Select value={company} onValueChange={(v) => v && setCompany(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Framing">Framing</SelectItem>
                  <SelectItem value="PCG">PCG</SelectItem>
                  <SelectItem value="HVAC">HVAC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Year</label>
              <Input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                min={2024}
                max={2030}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Month</label>
              <Select value={month} onValueChange={(v) => v && setMonth(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {new Date(2026, parseInt(m, 10) - 1).toLocaleString("en", { month: "long" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File picker */}
          <div
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors hover:border-primary/50"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Click to select CSV files or drag & drop
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
          </div>

          {/* Selected files */}
          {files.length > 0 && (
            <div className="space-y-2">
              {files.map((f, i) => (
                <div key={f.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>{f.name} ({(f.size / 1024).toFixed(1)} KB)</span>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className={`rounded-md border p-4 text-sm ${result.errors.length > 0 && result.inserted === 0 ? "border-destructive bg-destructive/10" : "border-emerald-500 bg-emerald-500/10"}`}>
              {result.inserted > 0 && (
                <p className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  {result.inserted} rows inserted, {result.skipped} skipped
                </p>
              )}
              {result.errors.map((e, i) => (
                <p key={i} className="text-destructive">{e}</p>
              ))}
            </div>
          )}

          <Button onClick={handleUpload} disabled={!canUpload} className="w-full sm:w-auto">
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Upload & Process
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
