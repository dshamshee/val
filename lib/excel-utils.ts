import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { SheetMetadata } from "./types";

export interface MasterExcelSchema {
  sheetName: string;
  columns: string[];
}

export interface ExcelFormatValidationResult {
  isValid: boolean;
  error?: string;
  matchedSheet?: string;
  expectedColumns?: string[];
  missingColumns?: string[];
  foundColumns?: string[];
}

/**
 * Extracts schema from a master Excel workbook template.
 */
export function getMasterExcelSchema(masterFilePath: string): MasterExcelSchema {
  const fallbackColumns = [
    "Screen Section",
    "Wizard Field",
    "Source Category",
    "Source URL",
    "Source Type",
  ];

  if (!fs.existsSync(masterFilePath)) {
    return {
      sheetName: "Wizard Step",
      columns: fallbackColumns,
    };
  }

  try {
    const fileBuffer = fs.readFileSync(masterFilePath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetName = wb.SheetNames[0] || "Wizard Step";
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      return { sheetName, columns: fallbackColumns };
    }

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    for (const row of rawRows) {
      if (Array.isArray(row) && row.length > 0) {
        const cols = row.map((c) => String(c || "").trim()).filter(Boolean);
        if (cols.length > 0) {
          return { sheetName, columns: cols };
        }
      }
    }
  } catch (err) {
    console.error(`Failed to read master schema from ${masterFilePath}:`, err);
  }

  return {
    sheetName: "Wizard Step",
    columns: fallbackColumns,
  };
}

/**
 * Validates an uploaded Excel buffer against a master Excel workbook.
 * Ensures the workbook is readable and contains all required columns.
 */
export function validateExcelBufferAgainstMaster(
  uploadedBuffer: Buffer,
  masterFilePath: string
): ExcelFormatValidationResult {
  const master = getMasterExcelSchema(masterFilePath);

  let uploadedWb: XLSX.WorkBook;
  try {
    uploadedWb = XLSX.read(uploadedBuffer, { type: "buffer" });
  } catch {
    return {
      isValid: false,
      error: "The uploaded file is not a valid Excel workbook (.xlsx or .xls) or is corrupted. Please re-upload a valid Excel file.",
    };
  }

  if (!uploadedWb.SheetNames || uploadedWb.SheetNames.length === 0) {
    return {
      isValid: false,
      error: "The uploaded Excel workbook contains no worksheets. Please re-upload a valid Excel file.",
    };
  }

  const normalizeCol = (c: string) => String(c).trim().toLowerCase();
  const masterNormalized = master.columns.map(normalizeCol);

  let matchedSheet: string | null = null;
  let bestMissingCols: string[] = [];
  let foundColsInFirstSheet: string[] = [];

  for (const sName of uploadedWb.SheetNames) {
    const sheet = uploadedWb.Sheets[sName];
    if (!sheet) continue;

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    let sheetCols: string[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (Array.isArray(row) && row.length > 0) {
        const cols = row.map((c) => String(c || "").trim()).filter(Boolean);
        if (cols.length > 0) {
          sheetCols = cols;
          break;
        }
      }
    }

    if (sheetCols.length === 0) continue;

    if (foundColsInFirstSheet.length === 0) {
      foundColsInFirstSheet = sheetCols;
    }

    const sheetNormalized = sheetCols.map(normalizeCol);
    const missing = master.columns.filter(
      (mc, idx) => !sheetNormalized.includes(masterNormalized[idx])
    );

    if (missing.length === 0) {
      matchedSheet = sName;
      break;
    } else {
      if (bestMissingCols.length === 0 || missing.length < bestMissingCols.length) {
        bestMissingCols = missing;
      }
    }
  }

  if (!matchedSheet) {
    const missingStr =
      bestMissingCols.length > 0
        ? bestMissingCols.map((c) => `"${c}"`).join(", ")
        : master.columns.map((c) => `"${c}"`).join(", ");

    const foundStr =
      foundColsInFirstSheet.length > 0
        ? foundColsInFirstSheet.map((c) => `"${c}"`).join(", ")
        : "None (empty sheet)";

    return {
      isValid: false,
      error: `Excel sheet format does not match the master template.\nMissing required column(s): ${missingStr}.\nFound columns: ${foundStr}.\nPlease re-upload the correct Excel file.`,
      expectedColumns: master.columns,
      missingColumns: bestMissingCols,
      foundColumns: foundColsInFirstSheet,
    };
  }

  return {
    isValid: true,
    matchedSheet,
    expectedColumns: master.columns,
  };
}

/**
 * Inspects an Excel workbook file and returns metadata for all its sheets.
 */
export function inspectWorkbookSheets(excelPath: string): SheetMetadata[] {
  if (!fs.existsSync(excelPath)) {
    return [];
  }
  try {
    const fileBuffer = fs.readFileSync(excelPath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });
    return wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      const hasIndicators =
        columns.some((c) =>
          /wizard field|data points|indicator|url|source|platform indicator/i.test(c)
        ) || rows.length > 0;
      return {
        name,
        rowCount: rows.length,
        columnCount: columns.length,
        columns,
        hasIndicators,
      };
    });
  } catch (error) {
    console.error(`Error reading Excel file ${excelPath}:`, error);
    return [];
  }
}

/**
 * Recursively find all Excel files (.xlsx, .xls) within a directory.
 */
export function findExcelFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of list) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results = results.concat(findExcelFiles(fullPath));
    } else if (dirent.isFile()) {
      const ext = path.extname(dirent.name).toLowerCase();
      if ((ext === ".xlsx" || ext === ".xls") && !dirent.name.endsWith(".meta.json")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}
