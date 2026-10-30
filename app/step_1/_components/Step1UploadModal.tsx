"use client";

import React, { useState, useEffect, useRef } from "react";
import type { CountryOption } from "@/lib/country-config";
import { validateBrowserExcelFile, type WorkbookValidationReport } from "@/lib/excel-schema-validator";

interface Step1UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  countryOptions: CountryOption[];
  onUploadSuccess: () => void;
}

export function Step1UploadModal({
  isOpen,
  onClose,
  countryOptions,
  onUploadSuccess,
}: Step1UploadModalProps) {
  const [selectedCountryCode, setSelectedCountryCode] = useState("PG");
  const [selectedProvince, setSelectedProvince] = useState(
    "National Capital District"
  );
  const [customCountryName, setCustomCountryName] = useState("");
  const [customProvinceName, setCustomProvinceName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preFlightReport, setPreFlightReport] = useState<WorkbookValidationReport | null>(null);
  const [validatingPreFlight, setValidatingPreFlight] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    onClose();
    setSelectedFile(null);
    setPreFlightReport(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleResetFile = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setSelectedFile(null);
    setPreFlightReport(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      setTimeout(() => fileInputRef.current?.click(), 50);
    }
  };

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Run pre-flight schema check as soon as a file is selected
  useEffect(() => {
    if (!selectedFile) {
      setPreFlightReport(null);
      return;
    }

    let isMounted = true;
    setValidatingPreFlight(true);
    setUploadError(null);

    validateBrowserExcelFile(selectedFile, 1)
      .then((report) => {
        if (isMounted) {
          setPreFlightReport(report);
          setValidatingPreFlight(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setPreFlightReport({
            isValid: false,
            fileName: selectedFile.name,
            targetStep: 1,
            sheets: [],
            validSheetsCount: 0,
            totalSheetsCount: 0,
            overallMessage: `Failed to inspect Excel workbook: ${err instanceof Error ? err.message : String(err)}`,
          });
          setValidatingPreFlight(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFile]);

  if (!isOpen) return null;

  const currentCountryConfig = countryOptions.find(
    (c) => c.code === selectedCountryCode
  );
  const currentProvinces = currentCountryConfig?.provinces || [];

  const handleCountryChange = (code: string) => {
    setSelectedCountryCode(code);
    if (code === "CUSTOM") {
      setSelectedProvince("CUSTOM");
    } else {
      const matched = countryOptions.find((c) => c.code === code);
      if (matched && matched.provinces.length > 0) {
        setSelectedProvince(matched.defaultProvince || matched.provinces[0]);
      }
    }
  };

  const effectiveCountry =
    selectedCountryCode === "CUSTOM"
      ? customCountryName.trim() || "Custom_Country"
      : currentCountryConfig?.name || "Papua_New_Guinea";

  const effectiveProvince =
    selectedProvince === "CUSTOM"
      ? customProvinceName.trim() || "Custom_State"
      : selectedProvince;

  const effectiveCountryDir = effectiveCountry
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_");

  const effectiveStateDir = effectiveProvince
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_");

  async function handleUploadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError("Please select an Excel file (.xlsx or .xls) to upload.");
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("country", effectiveCountry);
      formData.append(
        "countryCode",
        selectedCountryCode === "CUSTOM" ? "CUSTOM" : selectedCountryCode
      );
      formData.append("province", effectiveProvince);

      const res = await fetch("/api/step_1/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with HTTP ${res.status}`);
      }

      onUploadSuccess();
      onClose();
      setSelectedFile(null);
      setCustomCountryName("");
      setCustomProvinceName("");
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Upload Step 1 Excel Sheet</h3>
            <p className="text-xs text-zinc-400">
              Select country and state to save sheet in{" "}
              <code className="text-zinc-300 font-mono">
                app/step_1/upload/&lt;country&gt;/&lt;state&gt;/
              </code>
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            title="Close Window (Esc)"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
          {uploadError && (
            <div className="p-3.5 rounded-xl bg-red-950/50 border border-red-900/60 text-red-200 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-xs text-red-300">Upload Issue</div>
                <div className="text-[11px] text-red-300/90 leading-relaxed">{uploadError}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-900/40 hover:bg-red-900/70 text-red-200 border border-red-800/50 transition-colors"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-200"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Country Selection */}
          <div className="space-y-1.5">
            <label className="block font-medium text-zinc-300">Country</label>
            <select
              value={selectedCountryCode}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600 text-xs"
            >
              {countryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
              <option value="CUSTOM">Custom / Other Country...</option>
            </select>

            {selectedCountryCode === "CUSTOM" && (
              <input
                type="text"
                placeholder="Enter Country Name"
                value={customCountryName}
                onChange={(e) => setCustomCountryName(e.target.value)}
                className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                required
              />
            )}
          </div>

          {/* State / Province Selection */}
          <div className="space-y-1.5">
            <label className="block font-medium text-zinc-300">State / Province</label>
            {selectedCountryCode !== "CUSTOM" ? (
              <select
                value={selectedProvince}
                onChange={(e) => setSelectedProvince(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 focus:outline-none focus:border-zinc-600 text-xs"
              >
                {currentProvinces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
                <option value="CUSTOM">Custom / Other State...</option>
              </select>
            ) : null}

            {(selectedCountryCode === "CUSTOM" || selectedProvince === "CUSTOM") && (
              <input
                type="text"
                placeholder="Enter State / Province / District"
                value={customProvinceName}
                onChange={(e) => setCustomProvinceName(e.target.value)}
                className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
                required
              />
            )}
          </div>

          {/* File Picker */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-medium text-zinc-300">Excel File (.xlsx, .xls)</label>
              {selectedFile && (
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline"
                >
                  Choose another file
                </button>
              )}
            </div>
            <div className="border border-dashed border-zinc-800 rounded-xl p-4 text-center hover:border-zinc-700 bg-zinc-950/40 transition-colors">
              <input
                ref={fileInputRef}
                type="file"
                id="step1-modal-file-input"
                accept=".xlsx,.xls"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              <label
                htmlFor="step1-modal-file-input"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                {selectedFile ? (
                  <div className="flex items-center justify-between gap-3 w-full p-1">
                    <div className="flex items-center gap-2.5 overflow-hidden text-left">
                      <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400 font-mono text-[10px] font-bold shrink-0">
                        XLS
                      </div>
                      <div className="overflow-hidden">
                        <p className="font-semibold text-zinc-200 truncate">{selectedFile.name}</p>
                        <p className="text-[11px] text-zinc-500 font-mono">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetFile}
                      className="px-2.5 py-1 text-xs rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors shrink-0 border border-zinc-700"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <>
                    <svg className="w-7 h-7 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <div>
                      <p className="text-zinc-300 font-medium">Click to browse or drop Excel file</p>
                      <p className="text-[11px] text-zinc-500">Supports .xlsx and .xls workbooks</p>
                    </div>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Pre-flight Schema Validation Feedback */}
          {validatingPreFlight && (
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center gap-2.5 text-zinc-400 text-xs">
              <svg className="w-4 h-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Checking schema & indicator mappings...</span>
            </div>
          )}

          {preFlightReport && !validatingPreFlight && (
            preFlightReport.isValid ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-900/60 text-emerald-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="font-semibold text-xs text-emerald-300">
                      Step 1 Schema Verified
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/50 text-emerald-300 border border-emerald-800/60">
                    Confidence: {Math.round((preFlightReport.sheets[0]?.confidence || 1) * 100)}%
                  </span>
                </div>
                <p className="text-[11px] text-emerald-300/80">
                  {preFlightReport.overallMessage}
                </p>
                {preFlightReport.sheets[0]?.matchedColumns?.length ? (
                  <div className="pt-1 flex flex-wrap gap-1">
                    {preFlightReport.sheets[0].matchedColumns.map((col) => (
                      <span key={col} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-300 border border-emerald-800/40">
                        ✓ {col}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-900/70 text-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="font-semibold text-xs text-amber-300">
                      Invalid Excel Sheet: Mapping Not Found
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-900/50 text-amber-300 border border-amber-800/60">
                    Schema Incompatible
                  </span>
                </div>
                <p className="text-[11px] text-amber-300/90 leading-relaxed">
                  {preFlightReport.overallMessage}
                </p>
                {preFlightReport.sheets[0]?.missingColumns?.length ? (
                  <div className="space-y-1 text-[11px]">
                    <div className="text-amber-400/90 font-medium">Missing required columns:</div>
                    <div className="flex flex-wrap gap-1">
                      {preFlightReport.sheets[0].missingColumns.map((col) => (
                        <span key={col} className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-900/60 font-mono">
                          ✕ {col}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="text-[10px] text-amber-400/70 border-t border-amber-900/40 pt-2">
                  Suggested Fix: Make sure your sheet contains columns for indicator names (e.g. &quot;Wizard Field&quot;) and source URLs (e.g. &quot;Source URL&quot;).
                </div>
                {/* Immediate Action Buttons inside Rejection Banner */}
                <div className="pt-2 flex items-center gap-2 border-t border-amber-900/40">
                  <button
                    type="button"
                    onClick={handleResetFile}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors flex items-center gap-1.5 shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Upload Another Excel</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors border border-zinc-700"
                  >
                    Close Window
                  </button>
                </div>
              </div>
            )
          )}

          {/* Test Templates / Samples Section */}
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-center justify-between text-[11px]">
            <span className="text-zinc-400">Download test workbooks:</span>
            <div className="flex items-center gap-2">
              <a
                href="/samples/Valid_Test_Step1_Sources.xlsx"
                download="Valid_Test_Step1_Sources.xlsx"
                className="text-emerald-400 hover:text-emerald-300 hover:underline flex items-center gap-1 font-medium"
              >
                <span>Valid Sample</span>
                <span className="text-[9px]">↓</span>
              </a>
              <span className="text-zinc-700">·</span>
              <a
                href="/samples/Invalid_Test_Unmapped_Data.xlsx"
                download="Invalid_Test_Unmapped_Data.xlsx"
                className="text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-1 font-medium"
              >
                <span>Invalid Sample</span>
                <span className="text-[9px]">↓</span>
              </a>
            </div>
          </div>

          {/* Directory Destination Preview */}
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 space-y-1 font-mono text-[11px]">
            <span className="text-zinc-500 block text-[10px] uppercase tracking-wider font-sans font-medium">
              Saving destination:
            </span>
            <div className="text-emerald-400 break-all flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>
                app/step_1/upload/{effectiveCountryDir}/{effectiveStateDir}/
                {selectedFile ? selectedFile.name : "<sheet.xlsx>"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={handleClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Close Window
            </button>

            <div className="flex items-center gap-2">
              {preFlightReport && !preFlightReport.isValid ? (
                <button
                  type="button"
                  onClick={handleResetFile}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-colors flex items-center gap-2 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Upload Another File</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={uploading || !selectedFile || validatingPreFlight}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {uploading && (
                    <svg className="w-3.5 h-3.5 animate-spin text-zinc-900" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  <span>{uploading ? "Saving..." : "Upload & Save Sheet"}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
