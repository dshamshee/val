import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import {
  inspectWorkbookSheets,
  validateExcelBufferAgainstMaster,
} from "@/lib/excel-utils";
import { getCountryConfig } from "@/lib/country-config";

const STEP1_UPLOAD_DIR = path.resolve(process.cwd(), "app/step_1/upload");
const MASTER_STEP1_EXCEL = path.resolve(
  process.cwd(),
  "app/step_1/lib/RXBE_Wizard_Step1_Sources_Keys.xlsx"
);

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

    // Build directory structure: app/step_1/upload/<country>/<states>/<sheet>
    const countryDir = sanitizeDirSegment(country);
    const stateDir = sanitizeDirSegment(province);
    const targetDir = path.join(STEP1_UPLOAD_DIR, countryDir, stateDir);

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate uploaded workbook format against master template
    const validation = validateExcelBufferAgainstMaster(buffer, MASTER_STEP1_EXCEL);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: validation.error || "Excel sheet format does not match the master template.",
          missingColumns: validation.missingColumns,
          expectedColumns: validation.expectedColumns,
          foundColumns: validation.foundColumns,
        },
        { status: 400 }
      );
    }

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const baseClean = path
      .basename(originalName, ext)
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .trim()
      .replace(/\s+/g, "_");

    const safeName = `${baseClean || "step1_workbook"}_${Date.now()}${ext}`;
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
    };
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    const sheets = inspectWorkbookSheets(destinationPath);

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
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error("Step 1 upload error:", error);
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
    if (!resolvedPath.startsWith(STEP1_UPLOAD_DIR)) {
      return NextResponse.json(
        { error: "Access denied. Target file is outside Step 1 upload directory." },
        { status: 403 }
      );
    }

    if (fs.existsSync(resolvedPath)) {
      fs.unlinkSync(resolvedPath);

      const metaPath = `${resolvedPath}.meta.json`;
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }

      // Cleanup empty parent dirs
      const parentDir = path.dirname(resolvedPath);
      if (fs.existsSync(parentDir) && fs.readdirSync(parentDir).length === 0) {
        fs.rmdirSync(parentDir);
        const grandParentDir = path.dirname(parentDir);
        if (
          grandParentDir !== STEP1_UPLOAD_DIR &&
          fs.existsSync(grandParentDir) &&
          fs.readdirSync(grandParentDir).length === 0
        ) {
          fs.rmdirSync(grandParentDir);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Deleted ${path.basename(resolvedPath)}`,
      });
    }

    return NextResponse.json({ error: "File not found." }, { status: 404 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete file." },
      { status: 500 }
    );
  }
}
