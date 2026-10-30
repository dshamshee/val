import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { SheetMetadata } from "./types";
import { validateWorksheetContent } from "./excel-schema-validator";

/**
 * Inspects an Excel workbook file and returns metadata and schema validity for all its sheets.
 */
export function inspectWorkbookSheets(excelPath: string, targetStep: 1 | 3 = 1): SheetMetadata[] {
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
      const validation = validateWorksheetContent(rows, name, targetStep);
      return {
        name,
        rowCount: rows.length,
        columnCount: columns.length,
        columns,
        hasIndicators: validation.isValid,
        isValidMapping: validation.isValid,
        detectedSchema: validation.detectedSchema,
        mappingError: validation.errorMessage,
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
