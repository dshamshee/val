"use client";

import React, { useState } from "react";
import type { WorkbookInfo, SheetMetadata } from "@/lib/types";

interface Step3WorkbookTableProps {
  workbooks: WorkbookInfo[];
  loading: boolean;
  validatingKey: string | null;
  activeKey?: string | null;
  onValidateSheet: (workbook: WorkbookInfo, sheet: SheetMetadata) => void;
  onDeleteWorkbook: (filePath: string, displayName: string) => void;
  onOpenUpload: () => void;
}

export function Step3WorkbookTable({
  workbooks,
  loading,
  validatingKey,
  activeKey,
  onValidateSheet,
  onDeleteWorkbook,
  onOpenUpload,
}: Step3WorkbookTableProps) {
  const [sheetSearch, setSheetSearch] = useState("");
  const [countryFilter, setCountryFilter] = useState("ALL");
  const [provinceFilter, setProvinceFilter] = useState("ALL");

  const distinctCountries = Array.from(
    new Set(workbooks.map((wb) => wb.country || "Papua New Guinea"))
  );
  const distinctProvinces = Array.from(
    new Set(workbooks.map((wb) => wb.province || "National Capital District"))
  );

  const filteredWorkbooks = workbooks
    .filter((wb) => {
      if (countryFilter !== "ALL") {
        if (
          (wb.countryCode || "").toUpperCase() !== countryFilter.toUpperCase() &&
          (wb.country || "").toLowerCase() !== countryFilter.toLowerCase()
        ) {
          return false;
        }
      }
      if (provinceFilter !== "ALL") {
        if ((wb.province || "").toLowerCase() !== provinceFilter.toLowerCase()) {
          return false;
        }
      }
      return true;
    })
    .map((wb) => {
      const q = sheetSearch.trim().toLowerCase();
      if (!q) return wb;
      const matchesWb =
        wb.displayName.toLowerCase().includes(q) ||
        wb.fileName.toLowerCase().includes(q) ||
        (wb.country || "").toLowerCase().includes(q) ||
        (wb.province || "").toLowerCase().includes(q);

      if (matchesWb) return wb;

      const matchedSheets = wb.sheets.filter((s) =>
        s.name.toLowerCase().includes(q)
      );
      return { ...wb, sheets: matchedSheets };
    })
    .filter((wb) => wb.sheets.length > 0);

  const totalSheets = workbooks.reduce((acc, wb) => acc + wb.sheets.length, 0);

  return (
    <section className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 sm:p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <span>Excel Workbooks & Sheets</span>
            <span className="text-[11px] font-normal text-zinc-400">
              ({totalSheets} sheets found)
            </span>
          </h2>
          <p className="text-xs text-zinc-500">
            Step 3 Resource & Risk Index workbooks organized by country and states.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenUpload}
            disabled={loading || validatingKey !== null}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-100 hover:bg-white text-zinc-900 transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Upload Excel</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={countryFilter}
            onChange={(e) => {
              setCountryFilter(e.target.value);
              setProvinceFilter("ALL");
            }}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="ALL">All Countries ({distinctCountries.length})</option>
            {distinctCountries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700"
          >
            <option value="ALL">All States/Provinces ({distinctProvinces.length})</option>
            {distinctProvinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {(countryFilter !== "ALL" || provinceFilter !== "ALL") && (
            <button
              onClick={() => {
                setCountryFilter("ALL");
                setProvinceFilter("ALL");
              }}
              className="text-[11px] text-zinc-400 hover:text-zinc-200"
            >
              Reset location
            </button>
          )}
        </div>

        {/* Quick search inside sheets table */}
        <div className="relative min-w-[200px]">
          <input
            type="text"
            placeholder="Search sheets or workbooks..."
            value={sheetSearch}
            onChange={(e) => setSheetSearch(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700"
          />
          <svg
            className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {sheetSearch && (
            <button
              onClick={() => setSheetSearch("")}
              className="absolute right-2.5 top-2 text-zinc-500 hover:text-zinc-300 text-xs"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sheets List Table */}
      <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/80 text-zinc-400 font-medium border-b border-zinc-800/80">
              <tr>
                <th className="py-2.5 px-3.5 w-48">Country & State</th>
                <th className="py-2.5 px-3.5">Workbook File</th>
                <th className="py-2.5 px-3.5">Sheet Name</th>
                <th className="py-2.5 px-3.5 w-24">Rows / Cols</th>
                <th className="py-2.5 px-3.5 w-28">Status</th>
                <th className="py-2.5 px-3.5 w-32 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    <div className="inline-flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin text-zinc-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Discovering workbooks & sheets in country directories...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredWorkbooks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500">
                    No workbooks match the selected filters. Click &quot;Upload Excel&quot; to add a new sheet.
                  </td>
                </tr>
              ) : (
                filteredWorkbooks.flatMap((wb) =>
                  wb.sheets.map((sheet) => {
                    const key = `${wb.filePath}::${sheet.name}`;
                    const isThisValidating = validatingKey === key;
                    const isActive = activeKey === key;

                    return (
                      <tr
                        key={key}
                        className={`hover:bg-zinc-800/20 transition-colors ${
                          isActive ? "bg-zinc-800/30" : ""
                        }`}
                      >
                        {/* Country & State */}
                        <td className="py-2.5 px-3.5">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] px-1 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono font-medium">
                                {wb.countryCode || "PG"}
                              </span>
                              <span className="font-medium text-zinc-200 truncate">
                                {wb.country || "Papua New Guinea"}
                              </span>
                            </div>
                            <span className="text-[11px] text-zinc-400 block truncate">
                              📍 {wb.province || "National Capital District"}
                            </span>
                          </div>
                        </td>

                        {/* Workbook File Info */}
                        <td className="py-2.5 px-3.5 max-w-[220px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-zinc-200 truncate" title={wb.displayName}>
                              {wb.displayName}
                            </span>
                            {wb.isDefault ? (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 shrink-0">
                                Default
                              </span>
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 shrink-0">
                                Uploaded
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-500 font-mono block truncate" title={wb.filePath}>
                            {wb.filePath}
                          </span>
                        </td>

                        {/* Sheet Name */}
                        <td className="py-2.5 px-3.5 font-medium text-zinc-300">
                          <span className="inline-flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {sheet.name}
                          </span>
                        </td>

                        {/* Rows & Columns */}
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                          {sheet.rowCount} rows · {sheet.columnCount} cols
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          {isThisValidating ? (
                            <span className="inline-flex items-center gap-1.5 text-sky-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                              Validating...
                            </span>
                          ) : isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Active Sheet
                            </span>
                          ) : sheet.isValidMapping === false ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium" title={sheet.mappingError || "Mapping not found"}>
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              Mapping Missing
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-zinc-400">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                              Ready
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onValidateSheet(wb, sheet)}
                              disabled={validatingKey !== null}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                isActive
                                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/60"
                              } disabled:opacity-50`}
                            >
                              {isThisValidating ? (
                                <span className="flex items-center gap-1">
                                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                  Running
                                </span>
                              ) : (
                                "Validate Sheet"
                              )}
                            </button>

                            {!wb.isDefault && (
                              <button
                                onClick={() => onDeleteWorkbook(wb.filePath, wb.displayName)}
                                title="Delete uploaded file"
                                disabled={validatingKey !== null}
                                className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-950/20 transition-colors disabled:opacity-50"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
