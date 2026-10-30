"use client";

import React, { useState } from "react";
import type { CountryOption } from "@/lib/country-config";

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
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function validateAndSetFile(file: File | null) {
    setFileWarning(null);
    setUploadError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validExtensions = [".xlsx", ".xls"];
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    const validMimes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/msexcel",
      "application/x-msexcel",
      "application/x-ms-excel",
      "application/x-excel",
      "application/x-dos_ms_excel",
      "application/xls",
      "application/x-xls",
    ];

    const isExcel = validExtensions.includes(ext) || validMimes.includes(file.type);

    if (!isExcel) {
      setFileWarning(
        `Invalid file format: "${file.name}". Only Excel files (.xlsx or .xls) are allowed. Please select a valid Excel file.`
      );
      setSelectedFile(null);
      const inputEl = document.getElementById("step1-modal-file-input") as HTMLInputElement | null;
      if (inputEl) inputEl.value = "";
      return;
    }

    setSelectedFile(file);
  }

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
        const errMsg = errJson.error || `Upload failed with HTTP ${res.status}`;
        setUploadError(errMsg);
        setSelectedFile(null);
        const inputEl = document.getElementById("step1-modal-file-input") as HTMLInputElement | null;
        if (inputEl) inputEl.value = "";
        return;
      }

      onUploadSuccess();
      onClose();
      setSelectedFile(null);
      setCustomCountryName("");
      setCustomProvinceName("");
      setFileWarning(null);
      setUploadError(null);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
      setSelectedFile(null);
      const inputEl = document.getElementById("step1-modal-file-input") as HTMLInputElement | null;
      if (inputEl) inputEl.value = "";
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl p-6 space-y-5">
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
            onClick={() => {
              onClose();
              setUploadError(null);
              setFileWarning(null);
            }}
            className="text-zinc-500 hover:text-zinc-300 text-lg leading-none p-1"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
          {fileWarning && (
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-900/50 text-amber-200 flex items-start gap-2.5 animate-in fade-in duration-150">
              <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="space-y-1">
                <p className="font-semibold text-amber-300">Invalid File Type</p>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">{fileWarning}</p>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/50 text-red-200 flex items-start gap-2.5 animate-in fade-in duration-150">
              <svg className="w-4 h-4 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="space-y-1">
                <p className="font-semibold text-red-300">Sheet Format Mismatch</p>
                <p className="text-[11px] text-red-200/90 leading-relaxed whitespace-pre-line">{uploadError}</p>
                <p className="text-[10px] text-red-400/80 pt-0.5">Please re-upload a correct Excel file matching the master template format.</p>
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
            <label className="block font-medium text-zinc-300">Excel File (.xlsx, .xls)</label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0] || null;
                validateAndSetFile(file);
              }}
              className={`border border-dashed rounded-xl p-4 text-center transition-all ${
                isDragging
                  ? "border-emerald-500/80 bg-emerald-950/20"
                  : selectedFile
                    ? "border-emerald-700/50 bg-emerald-950/10"
                    : "border-zinc-800 hover:border-zinc-700 bg-zinc-950/40"
              }`}
            >
              <input
                type="file"
                id="step1-modal-file-input"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  validateAndSetFile(file);
                }}
                className="hidden"
              />
              <label
                htmlFor="step1-modal-file-input"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <svg
                  className={`w-7 h-7 transition-colors ${
                    selectedFile ? "text-emerald-400" : isDragging ? "text-emerald-400" : "text-zinc-500"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                {selectedFile ? (
                  <div className="space-y-0.5">
                    <p className="font-semibold text-emerald-300">{selectedFile.name}</p>
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB (Ready to upload)
                    </p>
                    <p className="text-[10px] text-zinc-500 underline pt-1 hover:text-zinc-300">
                      Click or drop to choose a different file
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-zinc-300 font-medium">Click to browse or drop Excel file</p>
                    <p className="text-[11px] text-zinc-500">Supports .xlsx and .xls workbooks only</p>
                  </div>
                )}
              </label>
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

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                setUploadError(null);
                setFileWarning(null);
              }}
              className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
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
          </div>
        </form>
      </div>
    </div>
  );
}
