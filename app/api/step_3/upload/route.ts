import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { inspectWorkbookSheets } from "@/lib/excel-utils";
import { getCountryConfig } from "@/lib/country-config";
import { validateExcelWorkbook } from "@/lib/excel-schema-validator";

const STEP3_UPLOAD_DIR = path.resolve(process.cwd(), "app/step_3/upload");

function sanitizeDirSegment(name: string): string {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_");
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "No file provided in form data under 'file' field." },
        { status: 400 }
      );
    }

    const blob = file as File;
    const originalName = blob.name || "uploaded.xlsx";
    const ext = path.extname(originalName).toLowerCase();

    if (ext !== ".xlsx" && ext !== ".xls") {
      return NextResponse.json(
        { error: "Invalid file format. Only .xlsx and .xls Excel files are supported." },
        { status: 400 }
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ── 1. Content Schema & Mapping Validator Check for Step 3 ────────────
    const schemaValidation = validateExcelWorkbook(buffer, originalName, 3);
    if (!schemaValidation.isValid) {
      return NextResponse.json(
        {
          error: "Invalid Excel sheet or mapping not found.",
          message: schemaValidation.overallMessage,
          details: schemaValidation.sheets[0]?.details || null,
          sheets: schemaValidation.sheets,
        },
        { status: 422 }
      );
    }

    const rawCountry = formData.get("country");
    const rawCountryCode = formData.get("countryCode");
    const rawProvince = formData.get("province");

    const countryConfig = getCountryConfig(
      typeof rawCountryCode === "string" && rawCountryCode
        ? rawCountryCode
        : typeof rawCountry === "string"
          ? rawCountry
          : "PG"
    );

    const country =
      typeof rawCountry === "string" && rawCountry.trim()
        ? rawCountry.trim()
        : countryConfig.country;

    const countryCode = countryConfig.country_code;

    const province =
      typeof rawProvince === "string" && rawProvince.trim()
        ? rawProvince.trim()
        : countryConfig.default_province;

    // Build directory structure: app/step_3/upload/<country>/<states>/<sheet>
    const countryDir = sanitizeDirSegment(country);
    const stateDir = sanitizeDirSegment(province);
    const targetDir = path.join(STEP3_UPLOAD_DIR, countryDir, stateDir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const baseClean = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    const safeName = `${baseClean || "step3_workbook"}_${Date.now()}${ext}`;
    const destinationPath = path.join(targetDir, safeName);

    fs.writeFileSync(destinationPath, buffer);

    const metaPath = `${destinationPath}.meta.json`;
    const metadata = {
      country,
      countryCode,
      province,
      displayName: originalName,
      fileName: safeName,
      uploadedAt: new Date().toISOString(),
      detectedSchema: schemaValidation.sheets[0]?.detectedSchema || "STEP_3",
      mappingScore: schemaValidation.sheets[0]?.confidence || 1.0,
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    const sheets = inspectWorkbookSheets(destinationPath, 3);

    return NextResponse.json(
      {
        success: true,
        fileName: safeName,
        displayName: originalName,
        country,
        countryCode,
        province,
        directory: path.relative(process.cwd(), targetDir),
        filePath: path.relative(process.cwd(), destinationPath),
        sheets,
        uploadedAt: metadata.uploadedAt,
        validation: schemaValidation,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Step 3 upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process upload." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePathParam = searchParams.get("filePath");
    const fileNameParam = searchParams.get("fileName");

    const targetParam = filePathParam || fileNameParam;
    if (!targetParam) {
      return NextResponse.json(
        { error: "filePath or fileName query parameter is required." },
        { status: 400 }
      );
    }

    const resolvedPath = path.resolve(process.cwd(), targetParam);

    // Path traversal check
    if (!resolvedPath.startsWith(STEP3_UPLOAD_DIR)) {
      return NextResponse.json(
        { error: "Access denied. Target file is outside Step 3 upload directory." },
        { status: 403 }
      );
    }

    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);

      const metaPath = `${resolvedPath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        try {
          fs.unlinkSync(metaPath);
        } catch {
          // ignore
        }
      }

      return NextResponse.json({ success: true, message: "File deleted successfully." });
    } else {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }
  } catch (error: unknown) {
    console.error("Step 3 delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete file." },
      { status: 500 }
    );
  }
}
