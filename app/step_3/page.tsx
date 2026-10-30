"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { WorkbookInfo, SheetMetadata, ValidationResponse } from "@/lib/types";
import { getAvailableCountryOptions, type CountryOption } from "@/lib/country-config";
import { Step3WorkbookTable } from "./_components/Step3WorkbookTable";
import { Step3UploadModal } from "./_components/Step3UploadModal";
import { Step3ResultsView } from "./_components/Step3ResultsView";

export default function Step3Page() {
  const [workbooks, setWorkbooks] = useState<WorkbookInfo[]>([]);
  const [loadingWorkbooks, setLoadingWorkbooks] = useState(true);
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>(() =>
    getAvailableCountryOptions()
  );

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [validatingKey, setValidatingKey] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResponse | null>(null);
  const [activeSheetDisplayName, setActiveSheetDisplayName] = useState<string>("");
  const [activeWorkbook, setActiveWorkbook] = useState<WorkbookInfo | null>(null);
  const [activeSheet, setActiveSheet] = useState<SheetMetadata | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const loadWorkbooks = useCallback(async () => {
    setLoadingWorkbooks(true);
    try {
      const res = await fetch("/api/step_3/sheets");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setWorkbooks(json.workbooks || []);
      if (Array.isArray(json.availableCountries) && json.availableCountries.length > 0) {
        setCountryOptions(json.availableCountries);
      }
    } catch (err: unknown) {
      console.error("Failed to load Step 3 workbooks:", err);
    } finally {
      setLoadingWorkbooks(false);
    }
  }, []);

  useEffect(() => {
    loadWorkbooks();
  }, [loadWorkbooks]);

  async function handleValidateSheet(workbook: WorkbookInfo, sheet: SheetMetadata) {
    if (sheet.isValidMapping === false) {
      setValidationError(sheet.mappingError || `Invalid Excel sheet or mapping not found in sheet "${sheet.name}".`);
      return;
    }
    const key = `${workbook.filePath}::${sheet.name}`;
    setValidatingKey(key);
    setValidationError(null);
    setActiveKey(key);
    setActiveWorkbook(workbook);
    setActiveSheet(sheet);
    setActiveSheetDisplayName(`${workbook.displayName} — ${sheet.name}`);

    try {
      const res = await fetch("/api/step_3/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: workbook.filePath,
          sheetName: sheet.name,
          country: workbook.country,
          countryCode: workbook.countryCode,
          province: workbook.province,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || `Validation failed (HTTP ${res.status})`);
      }

      setValidationResult(json);
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : "Validation execution failed.");
    } finally {
      setValidatingKey(null);
    }
  }

  async function revalidateActiveSheet() {
    if (!activeWorkbook || !activeSheet) return;
    await handleValidateSheet(activeWorkbook, activeSheet);
  }

  async function handleDeleteWorkbook(filePath: string, displayName: string) {
    if (!confirm(`Delete workbook "${displayName}" from its directory?`)) {
      return;
    }

    try {
      const res = await fetch(
        `/api/step_3/upload?filePath=${encodeURIComponent(filePath)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete workbook");
      }
      await loadWorkbooks();
      if (activeKey?.startsWith(`${filePath}::`)) {
        setActiveKey(null);
        setValidationResult(null);
      }
    } catch (err: unknown) {
      setValidationError(err instanceof Error ? err.message : "Failed to delete file.");
    }
  }

  const isCurrentlyValidating = validatingKey !== null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Top Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white">
                Step 3: Resource & Risk Index
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                {validationResult
                  ? `${validationResult.country} · ${validationResult.province}`
                  : "Multi-Country & State"}
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Country-organized Excel workbook sheets, live source audit, benchmark tolerance validation, and URL reachability checks
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeKey && (
              <button
                onClick={revalidateActiveSheet}
                disabled={isCurrentlyValidating}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isCurrentlyValidating ? "animate-spin" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>{isCurrentlyValidating ? "Validating..." : "Re-validate Sheet"}</span>
              </button>
            )}
          </div>
        </header>

        {/* Global Error Banner */}
        {validationError && (
          <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-900/50 text-red-300 text-xs flex items-center justify-between">
            <span>{validationError}</span>
            <button
              onClick={() => setValidationError(null)}
              className="text-red-400 hover:text-red-200 ml-3 text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* Workbooks Table */}
        <Step3WorkbookTable
          workbooks={workbooks}
          loading={loadingWorkbooks}
          validatingKey={validatingKey}
          activeKey={activeKey}
          onValidateSheet={handleValidateSheet}
          onDeleteWorkbook={handleDeleteWorkbook}
          onOpenUpload={() => setShowUploadModal(true)}
        />

        {/* Validation Results Section */}
        {validationResult ? (
          <Step3ResultsView
            data={validationResult}
            sheetDisplayName={activeSheetDisplayName}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/20 py-16 px-4 text-center space-y-2">
            <svg
              className="w-8 h-8 text-zinc-600 mx-auto"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-xs font-semibold text-zinc-300">No Step 3 Sheet Validated Yet</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              Select any sheet from the table above and click <span className="text-zinc-300 font-medium">Validate Sheet</span> to extract indicators and audit against live sources for that country and state.
            </p>
          </div>
        )}

        {/* Upload Modal */}
        <Step3UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          countryOptions={countryOptions}
          onUploadSuccess={loadWorkbooks}
        />
      </div>
    </div>
  );
}
