import * as XLSX from "xlsx";

export interface SchemaValidationResult {
  isValid: boolean;
  detectedSchema: "STEP_1" | "STEP_3" | "REGISTRY_211" | "UNKNOWN";
  confidence: number; // 0 to 1
  matchedColumns: string[];
  missingColumns: string[];
  totalRows: number;
  validIndicatorRows: number;
  sheetName: string;
  errorMessage?: string;
  details?: {
    expectedSchema: string;
    detectedHeaders: string[];
    missingRequiredHeaders: string[];
    suggestedFix: string;
  };
}

export interface WorkbookValidationReport {
  isValid: boolean;
  fileName: string;
  targetStep: 1 | 3;
  sheets: SchemaValidationResult[];
  validSheetsCount: number;
  totalSheetsCount: number;
  overallMessage: string;
}

// ---------------------------------------------------------------------------
// Canonical Schemas derived from Original Sources
// ---------------------------------------------------------------------------

// 1. Step 1 Original Schema (from RXBE_Wizard_Step1_Sources_Keys.xlsx)
const STEP1_REQUIRED_COLUMNS = [
  ["wizard field", "field", "indicator", "metric", "indicator name", "data point"],
  ["source url", "url", "source_url", "link", "api url"],
];

const STEP1_OPTIONAL_COLUMNS = [
  ["screen section", "section", "category", "source category"],
  ["source type", "type", "access type", "format"],
];

// 2. Step 3 Original Schema (from RXBE_Wizard_Step3_Sources_UI_Only.xlsx)
const STEP3_REQUIRED_COLUMNS = [
  ["wizard field", "field", "indicator", "metric", "resource / risk field"],
  ["source url", "url", "source_url", "endpoint"],
  ["platform indicator key", "platform key", "indicator key", "key", "parameter"],
];

const STEP3_OPTIONAL_COLUMNS = [
  ["screen section", "section", "category", "source category"],
  ["value in platform db", "platform value", "ui value", "baseline value", "target value"],
  ["where it shows", "notes", "display location"],
];

// 3. Master 211 Registry Schema (from RXBE_All_Data_Platform_Sources_211.xlsx)
const REGISTRY_211_COLUMNS = [
  ["url", "source url"],
  ["data points to capture", "data point", "metric"],
  ["category", "ai layer"],
];

// Helper: Normalize header string
function normalizeHeader(header: string): string {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ");
}

/**
 * Checks whether a list of sheet columns satisfies a required column group
 */
function matchColumnGroup(headers: string[], synonymsGroup: string[][]): {
  matched: string[];
  missing: string[];
} {
  const normHeaders = headers.map(normalizeHeader);
  const matched: string[] = [];
  const missing: string[] = [];

  for (const group of synonymsGroup) {
    const primaryName = group[0];
    const foundHeaderIndex = normHeaders.findIndex((h) =>
      group.some((synonym) => h === synonym || h.includes(synonym))
    );

    if (foundHeaderIndex !== -1) {
      matched.push(headers[foundHeaderIndex]);
    } else {
      missing.push(primaryName);
    }
  }

  return { matched, missing };
}

/**
 * Validates a single Excel worksheet against validator schemas
 */
export function validateWorksheetContent(
  rows: Record<string, unknown>[],
  sheetName: string,
  targetStep: 1 | 3 = 1
): SchemaValidationResult {
  if (!rows || rows.length === 0) {
    return {
      isValid: false,
      detectedSchema: "UNKNOWN",
      confidence: 0,
      matchedColumns: [],
      missingColumns: ["Any Data Rows"],
      totalRows: 0,
      validIndicatorRows: 0,
      sheetName,
      errorMessage: `Sheet "${sheetName}" is empty or has no data rows.`,
      details: {
        expectedSchema: `Step ${targetStep} Schema`,
        detectedHeaders: [],
        missingRequiredHeaders: ["All columns (empty sheet)"],
        suggestedFix: "Ensure the sheet contains data rows below the header row.",
      },
    };
  }

  const detectedHeaders = Object.keys(rows[0] || {});

  // 1. Check Step 1 compatibility
  const step1Check = matchColumnGroup(detectedHeaders, STEP1_REQUIRED_COLUMNS);
  const step1Optional = matchColumnGroup(detectedHeaders, STEP1_OPTIONAL_COLUMNS);
  const isStep1 = step1Check.missing.length === 0;

  // 2. Check Step 3 compatibility
  const step3Check = matchColumnGroup(detectedHeaders, STEP3_REQUIRED_COLUMNS);
  const step3Optional = matchColumnGroup(detectedHeaders, STEP3_OPTIONAL_COLUMNS);
  const isStep3 = step3Check.missing.length === 0;

  // 3. Check 211 Registry compatibility
  const regCheck = matchColumnGroup(detectedHeaders, REGISTRY_211_COLUMNS);
  const isRegistry = regCheck.missing.length === 0;

  // Determine detected schema
  let detectedSchema: "STEP_1" | "STEP_3" | "REGISTRY_211" | "UNKNOWN" = "UNKNOWN";
  if (isStep3) {
    detectedSchema = "STEP_3";
  } else if (isStep1) {
    detectedSchema = "STEP_1";
  } else if (isRegistry) {
    detectedSchema = "REGISTRY_211";
  }

  // Determine requirement satisfaction based on target step
  const targetRequired = targetStep === 3 ? step3Check : step1Check;
  const isTargetValid = targetStep === 3 ? isStep3 : isStep1 || isRegistry;

  // Count valid indicators (rows where URL or Field is populated and not dummy)
  let validIndicatorRows = 0;
  for (const row of rows) {
    const rowVals = Object.values(row).map((v) => String(v ?? "").trim());
    const hasUrl = rowVals.some(
      (v) => v.startsWith("http://") || v.startsWith("https://") || v.startsWith("internal://") || v === "-"
    );
    const hasText = rowVals.some((v) => v.length > 2 && v !== "-");
    if (hasUrl || hasText) {
      validIndicatorRows++;
    }
  }

  // Calculate confidence score
  const headerMatchRatio = targetRequired.matched.length / (targetStep === 3 ? STEP3_REQUIRED_COLUMNS.length : STEP1_REQUIRED_COLUMNS.length);
  const rowValidityRatio = rows.length > 0 ? validIndicatorRows / rows.length : 0;
  const confidence = parseFloat(((headerMatchRatio * 0.7) + (rowValidityRatio * 0.3)).toFixed(2));

  if (!isTargetValid) {
    const missingNames = targetRequired.missing.map((c) => `"${c}"`).join(", ");
    const foundNames = detectedHeaders.length > 0 ? detectedHeaders.map((c) => `"${c}"`).join(", ") : "None";

    return {
      isValid: false,
      detectedSchema,
      confidence,
      matchedColumns: targetRequired.matched,
      missingColumns: targetRequired.missing,
      totalRows: rows.length,
      validIndicatorRows,
      sheetName,
      errorMessage: `Invalid Excel sheet: Content mapping not found for Step ${targetStep}. Missing required columns: [${missingNames}]. Found headers: [${foundNames}].`,
      details: {
        expectedSchema: `Step ${targetStep} Schema (${targetStep === 3 ? "RXBE_Wizard_Step3_Sources_UI_Only" : "RXBE_Wizard_Step1_Sources_Keys"})`,
        detectedHeaders,
        missingRequiredHeaders: targetRequired.missing,
        suggestedFix: `Please ensure your Excel file includes the canonical headers: ${targetStep === 3 ? '["Screen Section", "Wizard Field", "Source URL", "Platform indicator key"]' : '["Screen Section", "Wizard Field", "Source Category", "Source URL", "Source Type"]'}.`,
      },
    };
  }

  return {
    isValid: true,
    detectedSchema,
    confidence,
    matchedColumns: targetStep === 3 ? [...step3Check.matched, ...step3Optional.matched] : [...step1Check.matched, ...step1Optional.matched],
    missingColumns: [],
    totalRows: rows.length,
    validIndicatorRows,
    sheetName,
  };
}

/**
 * Validates an entire Excel workbook buffer or file path
 */
export function validateExcelWorkbook(
  input: Buffer | string,
  fileName: string,
  targetStep: 1 | 3 = 1
): WorkbookValidationReport {
  let wb: XLSX.WorkBook;
  try {
    const xlsxLib = (XLSX as unknown as { default?: typeof XLSX }).default || XLSX;
    let buffer: Buffer | ArrayBuffer = input as Buffer;
    if (typeof input === "string") {
      // Dynamic require on Node.js to stay browser-safe
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require("fs");
      buffer = fs.readFileSync(input);
    }
    wb = xlsxLib.read(buffer, { type: "buffer" });
  } catch (err) {
    return {
      isValid: false,
      fileName,
      targetStep,
      sheets: [],
      validSheetsCount: 0,
      totalSheetsCount: 0,
      overallMessage: `Failed to parse Excel workbook: ${err instanceof Error ? err.message : "Corrupted or unsupported format."}`,
    };
  }

  const sheets: SchemaValidationResult[] = [];
  let validSheetsCount = 0;
  const xlsxLib = (XLSX as unknown as { default?: typeof XLSX }).default || XLSX;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsxLib.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const result = validateWorksheetContent(rows, sheetName, targetStep);
    sheets.push(result);
    if (result.isValid) {
      validSheetsCount++;
    }
  }

  const isValid = validSheetsCount > 0;
  let overallMessage = "";

  if (isValid) {
    overallMessage = `Workbook verified successfully. ${validSheetsCount} of ${sheets.length} sheet(s) matched Step ${targetStep} schema.`;
  } else {
    const firstErr = sheets[0]?.errorMessage || "No sheets matched the required validator schema.";
    overallMessage = `Mapping failed: ${firstErr}`;
  }

  return {
    isValid,
    fileName,
    targetStep,
    sheets,
    validSheetsCount,
    totalSheetsCount: sheets.length,
    overallMessage,
  };
}

/**
 * Browser-friendly pre-flight validation of an Excel File object
 */
export async function validateBrowserExcelFile(
  file: File,
  targetStep: 1 | 3 = 1
): Promise<WorkbookValidationReport> {
  const arrayBuffer = await file.arrayBuffer();
  const xlsxLib = (XLSX as unknown as { default?: typeof XLSX }).default || XLSX;
  const wb = xlsxLib.read(new Uint8Array(arrayBuffer), { type: "array" });

  const sheets: SchemaValidationResult[] = [];
  let validSheetsCount = 0;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = xlsxLib.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const result = validateWorksheetContent(rows, sheetName, targetStep);
    sheets.push(result);
    if (result.isValid) {
      validSheetsCount++;
    }
  }

  const isValid = validSheetsCount > 0;
  let overallMessage = "";

  if (isValid) {
    overallMessage = `Valid Step ${targetStep} workbook: ${validSheetsCount} of ${sheets.length} sheet(s) matched schema.`;
  } else {
    const firstErr = sheets[0]?.errorMessage || "No sheets matched the required validator schema.";
    overallMessage = `Mapping failed: ${firstErr}`;
  }

  return {
    isValid,
    fileName: file.name,
    targetStep,
    sheets,
    validSheetsCount,
    totalSheetsCount: sheets.length,
    overallMessage,
  };
}
