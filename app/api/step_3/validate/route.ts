import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { parseStep3ExcelSources } from "@/app/step_3/lib/step3-excel-parser";
import { processValidation } from "@/lib/validation-processor";
import { getCountryConfig } from "@/lib/country-config";
import { validateExcelWorkbook } from "@/lib/excel-schema-validator";

interface ValidateSheetPayload {
  filePath?: string;
  sheetName?: string;
  countryCode?: string;
  country?: string;
  province?: string;
}

export async function POST(request: NextRequest) {
  try {
    let body: ValidateSheetPayload = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const {
      filePath = "app/step_3/lib/RXBE_Wizard_Step3_Sources_UI_Only.xlsx",
      sheetName,
      countryCode: reqCountryCode,
      country: reqCountry,
      province: reqProvince,
    } = body;

    const resolvedPath = path.resolve(process.cwd(), filePath);
    const allowedStep3Uploads = path.resolve(process.cwd(), "app/step_3/upload");
    const allowedStep3Lib = path.resolve(process.cwd(), "app/step_3/lib");

    const isInsideAllowed =
      resolvedPath.startsWith(allowedStep3Uploads) ||
      resolvedPath.startsWith(allowedStep3Lib);

    if (!isInsideAllowed) {
      return NextResponse.json(
        { error: "Access denied. Target file is outside allowed directories." },
        { status: 403 }
      );
    }

    if (!fs.existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: `File not found at: ${filePath}` },
        { status: 404 }
      );
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext !== ".xlsx" && ext !== ".xls") {
      return NextResponse.json(
        { error: "Target file is not a supported Excel workbook (.xlsx, .xls)." },
        { status: 400 }
      );
    }

    // ── Pre-check Sheet Mapping & Schema for Step 3 ──────────────────────
    const schemaReport = validateExcelWorkbook(resolvedPath, path.basename(filePath), 3);
    const targetSheetSchema = sheetName
      ? schemaReport.sheets.find((s) => s.sheetName === sheetName)
      : schemaReport.sheets[0];

    if (targetSheetSchema && !targetSheetSchema.isValid) {
      return NextResponse.json(
        {
          error: "Invalid Excel sheet or mapping not found.",
          message: targetSheetSchema.errorMessage,
          details: targetSheetSchema.details,
          sheetName: targetSheetSchema.sheetName,
          fileName: path.basename(filePath),
        },
        { status: 400 }
      );
    }

    let metaCountry: string | undefined;
    let metaCountryCode: string | undefined;
    let metaProvince: string | undefined;

    const metaPath = `${resolvedPath}.meta.json`;
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        metaCountry = meta.country;
        metaCountryCode = meta.countryCode;
        metaProvince = meta.province;
      } catch {
        // ignore
      }
    } else if (resolvedPath.startsWith(allowedStep3Uploads)) {
      const rel = path.relative(allowedStep3Uploads, resolvedPath);
      const segments = rel.split(path.sep);
      if (segments.length >= 3) {
        metaCountry = segments[0].replace(/_/g, " ");
        metaProvince = segments[1].replace(/_/g, " ");
      }
    }

    const resolvedCountryCodeOrName =
      reqCountryCode || reqCountry || metaCountryCode || metaCountry || "PG";
    const countryCfg = getCountryConfig(resolvedCountryCodeOrName);

    const resolvedProvince =
      reqProvince || metaProvince || countryCfg.default_province;

    const indicators = parseStep3ExcelSources({
      excelPath: resolvedPath,
      sheetName: sheetName || undefined,
      countryCode: countryCfg.country_code,
      province: resolvedProvince,
    });

    if (!indicators || indicators.length === 0) {
      return NextResponse.json(
        {
          error: "Invalid Excel sheet or mapping not found.",
          message: `No extractable indicators found in sheet "${sheetName || "Default"}" of ${path.basename(filePath)}.`,
          sheetName,
          fileName: path.basename(filePath),
          country: countryCfg.country,
          province: resolvedProvince,
        },
        { status: 404 }
      );
    }

    const response = await processValidation(
      indicators,
      countryCfg.country,
      countryCfg.country_code,
      sheetName || "Step3"
    );

    return NextResponse.json(
      {
        ...response,
        province: resolvedProvince,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    console.error("Step 3 sheet validation route error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal sheet validation error." },
      { status: 500 }
    );
  }
}
