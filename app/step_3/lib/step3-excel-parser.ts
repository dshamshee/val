import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import type { Indicator } from "@/lib/types";
import { generateScrapeConfig, generateXmlConfig } from "@/lib/scrape-config-generator";
import { getCountryConfig, type CountryConfig } from "@/lib/country-config";
import {
  loadLiveSnap,
  getCountryIndicator,
  getProvinceResource,
  type LiveSnapData,
} from "@/lib/livesnap-resolver";

export interface WizardStep3ExcelRow {
  "Screen Section"?: string;
  "Wizard Field"?: string;
  "Source Category"?: string;
  "Source URL"?: string;
  "Source Type"?: string;
  // Legacy or DB columns if uploaded
  "Platform indicator key"?: string;
  "Value in platform DB now (PNG)"?: string | number;
  "Where it shows"?: string;
  [key: string]: unknown;
}

export interface ParseStep3Options {
  excelPath?: string;
  sheetName?: string;
  countryCode?: string;
  province?: string;
  htmlPath?: string;
  includeInternal?: boolean;
}

/**
 * Standardize World Bank indicator code from URL
 */
function extractWdiIndicatorCode(url: string): string | null {
  const match = url.match(/\/indicator\/([A-Za-z0-9_.]+)/i);
  return match ? match[1] : null;
}

/**
 * Normalizes Step 3 URL for country, province, and site coordinates
 */
function templateStep3SourceUrl(
  rawUrl: string,
  countryCfg: CountryConfig,
  lat: number,
  lon: number,
  province: string
): string {
  let url = (rawUrl || "").trim();
  if (url === "-" || !url) return url;

  // 1. World Bank API: country replacement
  url = url.replace(
    /api\.worldbank\.org\/v2\/country\/[A-Z]{2}\/indicator/i,
    `api.worldbank.org/v2/country/${countryCfg.wb_country_code}/indicator`
  );

  // 2. OpenStreetMap Nominatim: geocoding query replacement
  if (url.includes("nominatim.openstreetmap.org")) {
    const query = encodeURIComponent(`${province},${countryCfg.country}`);
    url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
  }

  // 3. Global Solar Atlas: coordinate replacement
  if (url.includes("globalsolaratlas.info")) {
    url = `https://api.globalsolaratlas.info/data/lta?loc=${lat.toFixed(4)},${lon.toFixed(4)}`;
  }

  // 4. Global Wind Atlas: coordinate and area replacement
  if (url.includes("globalwindatlas.info")) {
    const encCountry = encodeURIComponent(countryCfg.country);
    const encProvince = encodeURIComponent(province);
    url = `https://globalwindatlas.info/en/area/${encCountry}/${encProvince}?point=${lon.toFixed(4)},${lat.toFixed(4)}#wind-speed`;
  }

  // 5. TradingEconomics slug replacement
  if (url.includes("tradingeconomics.com/papua-new-guinea/")) {
    url = url.replace("tradingeconomics.com/papua-new-guinea/", `tradingeconomics.com/${countryCfg.slug}/`);
  }

  return url;
}

/**
 * Parses Wizard Step 3 Excel rows into standardized Indicators.
 * - Dynamic validation matching Step 1
 * - Preserves all rows (no deduplication, Option A)
 * - Assigns unique indicator IDs per row index
 */
export function parseWizardStep3Rows(
  rows: WizardStep3ExcelRow[],
  liveSnap: LiveSnapData,
  countryCfg: CountryConfig,
  province: string,
  lat: number,
  lon: number,
  includeInternal = false
): Indicator[] {
  const indicators: Indicator[] = [];
  const iso3 = countryCfg.iso3;

  const snapLat = getProvinceResource(liveSnap, iso3, province, "lat", countryCfg.country);
  const snapLon = getProvinceResource(liveSnap, iso3, province, "lon", countryCfg.country);
  const snapGhi = getProvinceResource(liveSnap, iso3, province, "ghi", countryCfg.country);
  const snapPvout = getProvinceResource(liveSnap, iso3, province, "pvout", countryCfg.country);
  const snapWind = getProvinceResource(liveSnap, iso3, province, "wind", countryCfg.country);

  rows.forEach((row, index) => {
    const screenSection = String(row["Screen Section"] || "").trim();
    const wizardField = String(row["Wizard Field"] || "").trim();
    const sourceCategory = String(row["Source Category"] || "").trim();
    const rawUrl = String(row["Source URL"] || "").trim();
    const rawSourceType = String(row["Source Type"] || "").trim();
    const rawPlatformKey = row["Platform indicator key"] !== undefined && row["Platform indicator key"] !== null
      ? String(row["Platform indicator key"]).trim()
      : "";
    const rawValueInDb = row["Value in platform DB now (PNG)"];
    const whereItShows = row["Where it shows"] ? String(row["Where it shows"]).trim() : "";

    const rowNum = index + 1;
    const isInternal = rawSourceType === "Not from a source" || rawUrl === "-";

    if (isInternal && !includeInternal) {
      return;
    }

    const templatedUrl = isInternal
      ? "internal://user_input"
      : templateStep3SourceUrl(rawUrl, countryCfg, lat, lon, province);

    let indicatorId = "";
    let category = sourceCategory !== "-" && sourceCategory !== "" ? sourceCategory : screenSection;
    let displayName = wizardField || `Step 3 Field (Row ${rowNum})`;
    let jsonPath: string | null = null;
    let uiValue: number | string = 0;
    let unit = "";
    let tolerance = 0.05;
    let scrapeConfig = null;
    let xmlConfig = null;
    let isReachability = false;

    const wdiCode = extractWdiIndicatorCode(rawUrl);

    const isXml =
      rawSourceType === "XML" ||
      rawSourceType === "RSS Feed" ||
      rawUrl.includes("/rss") ||
      rawUrl.toLowerCase().endsWith(".xml") ||
      rawUrl.includes(".xml?") ||
      sourceCategory.toLowerCase().includes("rss") ||
      sourceCategory.toLowerCase().includes("xml");

    if (isXml) {
      xmlConfig = generateXmlConfig({
        field: wizardField,
        category: sourceCategory,
        url: rawUrl,
        countryName: countryCfg.country,
      });
      uiValue = "Active";
      unit = "status";
    }

    const fieldLower = wizardField.toLowerCase();
    const sectionLower = screenSection.toLowerCase();
    const urlLower = rawUrl.toLowerCase();

    // ── 1. Resource data (province) ──────────────────────────────────────────
    if (sectionLower.includes("resource") || fieldLower.includes("ghi") || fieldLower.includes("pvout") || fieldLower.includes("wind")) {
      if (fieldLower.includes("daily ghi") || (rawPlatformKey === "ghi" && fieldLower.includes("daily"))) {
        indicatorId = `solar_daily_ghi_row_${rowNum}`;
        displayName = `Daily GHI (${province}) (Row ${rowNum})`;
        jsonPath = "annual.data.GHI || ghi";
        uiValue = snapGhi !== null
          ? `${Number(snapGhi).toFixed(2)} kWh/m2/yr, shown as ${(Number(snapGhi) / 365).toFixed(2)} kWh/m2/day`
          : "1,982.09 kWh/m2/yr, shown as 5.43 kWh/m2/day";
        unit = "kWh/m²/day";
        tolerance = 5.0;
      } else if (fieldLower.includes("annual ghi") || (rawPlatformKey === "ghi" && fieldLower.includes("annual"))) {
        indicatorId = `solar_annual_ghi_row_${rowNum}`;
        displayName = `Annual GHI (${province}) (Row ${rowNum})`;
        jsonPath = "annual.data.GHI || ghi";
        uiValue = snapGhi !== null ? parseFloat(Number(snapGhi).toFixed(2)) : 1982.09;
        unit = "kWh/m²/yr";
        tolerance = 5.0;
      } else if (fieldLower.includes("pvout") || rawPlatformKey === "pvout") {
        indicatorId = `solar_pvout_row_${rowNum}`;
        displayName = `PVOUT (${province}) (Row ${rowNum})`;
        jsonPath = "annual.data.PVOUT_csi || pvout";
        uiValue = snapPvout !== null
          ? `${Number(snapPvout).toFixed(2)} kWh/kWp/yr, shown as ${(Number(snapPvout) / 365).toFixed(2)} kWh/kWp/day`
          : "1,591.96 kWh/kWp/yr, shown as 4.36 kWh/kWp/day";
        unit = "kWh/kWp/yr";
        tolerance = 5.0;
      } else if (fieldLower.includes("wind") || rawPlatformKey.includes("wind")) {
        indicatorId = `wind_speed_row_${rowNum}`;
        displayName = `Wind Speed (${province}) (Row ${rowNum})`;
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = rawValueInDb !== undefined && rawValueInDb !== null && String(rawValueInDb).trim() !== ""
          ? String(rawValueInDb).trim()
          : "6.54 m/s";
        unit = "m/s";
        tolerance = 0.1;
      }
    }

    // ── 2. Site risk register ────────────────────────────────────────────────
    if (!indicatorId && (sectionLower.includes("site risk") || sectionLower.includes("register") || wdiCode)) {
      if (fieldLower.includes("grid stability") || wdiCode === "EG.ELC.ACCS.ZS") {
        indicatorId = `grid_stability_curtailment_row_${rowNum}`;
        displayName = `Grid stability / curtailment (Electrification %) (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["access_to_electricity_of_population"]);
        uiValue = val !== null ? Number(val) : 43.3;
        unit = "%";
        tolerance = 0.1;
      } else if (fieldLower.includes("regulatory quality") || wdiCode === "GOV_WGI_RQ_EST") {
        indicatorId = `wgi_regulatory_quality_row_${rowNum}`;
        displayName = `Regulatory Quality (Score -2.5 to 2.5) (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["regulatory_quality_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.61;
        unit = "score";
        tolerance = 0.2;
      } else if (fieldLower.includes("rule of law") || wdiCode === "GOV_WGI_RL_EST") {
        indicatorId = `wgi_rule_of_law_row_${rowNum}`;
        displayName = `Rule of Law (Score -2.5 to 2.5) (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["rule_of_law_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.57;
        unit = "score";
        tolerance = 0.2;
      } else if (fieldLower.includes("political stability") || wdiCode === "GOV_WGI_PV_EST") {
        indicatorId = `wgi_political_stability_row_${rowNum}`;
        displayName = `Political Stability & Absence of Violence (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["political_stability_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.55;
        unit = "score";
        tolerance = 0.2;
      } else if (fieldLower.includes("government effectiveness") || wdiCode === "GOV_WGI_GE_EST") {
        indicatorId = `wgi_government_effectiveness_row_${rowNum}`;
        displayName = `Government Effectiveness (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["government_effectiveness_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.71;
        unit = "score";
        tolerance = 0.25;
      } else if (fieldLower.includes("control of corruption") || wdiCode === "GOV_WGI_CC_EST") {
        indicatorId = `wgi_control_of_corruption_row_${rowNum}`;
        displayName = `Control of Corruption (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["control_of_corruption_governance_estimate_approx_2_5_to_2_5"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : -0.78;
        unit = "score";
        tolerance = 0.2;
      }
    }

    // ── 3. Risk index ────────────────────────────────────────────────────────
    if (!indicatorId) {
      if (fieldLower.includes("forest cover") || wdiCode === "AG.LND.FRST.ZS") {
        indicatorId = `biomass_forest_cover_row_${rowNum}`;
        displayName = `Biomass Supply Chain: Forest Area (% of Land) (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["forest_area_of_land_area", "forest_area"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : 75.15;
        unit = "% of land";
        tolerance = 0.1;
      } else if (fieldLower.includes("farmland") || wdiCode === "AG.LND.AGRI.ZS") {
        indicatorId = `biomass_farmland_row_${rowNum}`;
        displayName = `Biomass Supply Chain: Farmland Area (% of Land) (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        const val = getCountryIndicator(liveSnap, iso3, ["agricultural_land_of_land_area"]);
        uiValue = val !== null ? parseFloat(Number(val).toFixed(2)) : 3.10;
        unit = "% of land";
        tolerance = 0.1;
      } else if (fieldLower.includes("equity risk premium") || (urlLower.includes("ctryprem") && fieldLower.includes("erp"))) {
        indicatorId = `damodaran_erp_row_${rowNum}`;
        displayName = `Damodaran Equity Risk Premium (ERP) (Row ${rowNum})`;
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = 11.35;
        unit = "%";
        tolerance = 0.5;
      } else if (fieldLower.includes("risk-free rate") || urlLower.includes("daily-treasury-rates.csv")) {
        indicatorId = `us_treasury_risk_free_rate_row_${rowNum}`;
        displayName = `US 10-Year Treasury Yield (Risk-Free Rate) (Row ${rowNum})`;
        uiValue = 4.24;
        unit = "%";
        tolerance = 1.5;
      } else if (fieldLower.includes("sovereign rating") || (urlLower.includes("ctryprem") && fieldLower.includes("rating"))) {
        indicatorId = `damodaran_sovereign_rating_row_${rowNum}`;
        displayName = `Sovereign Credit Rating (Moody's Equivalent) (Row ${rowNum})`;
        scrapeConfig = generateScrapeConfig({
          field: wizardField,
          category: sourceCategory,
          url: rawUrl,
          countryName: countryCfg.country,
        });
        uiValue = "B2";
        unit = "rating";
        tolerance = 0;
      } else if (fieldLower.includes("b-ready regulatory") || (urlLower.includes("b-ready") && fieldLower.includes("regulatory"))) {
        indicatorId = `bready_regulatory_framework_row_${rowNum}`;
        displayName = `B-READY Regulatory Framework Pillar (Row ${rowNum})`;
        uiValue = "55 / 100";
        tolerance = 0.5;
      } else if (fieldLower.includes("b-ready public") || (urlLower.includes("b-ready") && fieldLower.includes("services"))) {
        indicatorId = `bready_public_services_row_${rowNum}`;
        displayName = `B-READY Public Services Pillar (Row ${rowNum})`;
        uiValue = "33 / 100";
        tolerance = 0.5;
      } else if (fieldLower.includes("customary land") && !fieldLower.includes("evidence")) {
        indicatorId = `customary_land_pct_row_${rowNum}`;
        displayName = `Customary Land Tenure Share (Row ${rowNum})`;
        uiValue = "97 %";
        tolerance = 0.5;
      } else if (fieldLower.includes("port and freight") || wdiCode === "LP.LPI.INFR.XQ") {
        indicatorId = `logistics_performance_index_row_${rowNum}`;
        displayName = `Logistics Performance Index (LPI Infrastructure) (Row ${rowNum})`;
        jsonPath = "[1][0].value";
        uiValue = 2.4;
        unit = "score";
        tolerance = 0.1;
      } else if (fieldLower.includes("material delivery") || urlLower.includes("nominatim.openstreetmap.org")) {
        indicatorId = `site_coordinates_row_${rowNum}`;
        displayName = `Site Coordinates & Port Distance (Row ${rowNum})`;
        jsonPath = "[0].lat";
        uiValue = snapLat !== null ? Number(Number(snapLat).toFixed(4)) : lat;
        unit = "deg";
        tolerance = 0.05;
      } else if (
        fieldLower.includes("evidence") ||
        urlLower.includes("lands.gov.pg") ||
        urlLower.includes("dplga.gov.pg") ||
        urlLower.includes("faolex.fao.org")
      ) {
        indicatorId = `reachability_step3_row_${rowNum}`;
        displayName = `${wizardField || "Land Tenure Evidence"} (Row ${rowNum})`;
        category = sourceCategory || "Land Tenure & Legal Risk";
        uiValue = "Reachable URL";
        unit = "status";
        isReachability = true;
      }
    }

    // ── 4. Fallback for custom or legacy rows with Platform DB values ─────────
    if (!indicatorId) {
      if (rawPlatformKey && rawValueInDb !== undefined && rawValueInDb !== null && String(rawValueInDb).trim() !== "") {
        indicatorId = `${rawPlatformKey.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_row_${rowNum}`;
        uiValue = String(rawValueInDb).trim();
        if (templatedUrl.includes("worldbank.org")) {
          jsonPath = "[1][0].value";
          tolerance = 0.1;
        } else if (templatedUrl.includes("globalsolaratlas.info")) {
          if (rawPlatformKey === "ghi") {
            jsonPath = "annual.data.GHI || ghi";
            tolerance = 5.0;
            unit = "kWh/m²";
          } else if (rawPlatformKey === "pvout") {
            jsonPath = "annual.data.PVOUT_csi || pvout";
            tolerance = 5.0;
            unit = "kWh/kWp";
          }
        }
      } else if (wdiCode) {
        indicatorId = `wb_${wdiCode.toLowerCase().replace(/[^a-z0-9_]/g, "_")}_row_${rowNum}`;
        jsonPath = "[1][0].value";
        tolerance = 0.1;
      } else {
        indicatorId = `step3_evidence_row_${rowNum}`;
        uiValue = "Reachable URL";
        unit = "status";
        isReachability = true;
      }
    }

    let sourceTypeDesc: "API" | "PDF" | "SCRAPE" | "XML" | "CSV" | "INTERNAL" | "REACHABILITY" = "API";
    if (isInternal) {
      sourceTypeDesc = "INTERNAL";
    } else if (isReachability) {
      sourceTypeDesc = "REACHABILITY";
    } else if (templatedUrl.toLowerCase().endsWith(".pdf") || scrapeConfig?.content_type === "pdf" || rawSourceType.toLowerCase().includes("pdf")) {
      sourceTypeDesc = "PDF";
    } else if (isXml || xmlConfig) {
      sourceTypeDesc = "XML";
    } else if (scrapeConfig || rawSourceType.toLowerCase().includes("scrape")) {
      sourceTypeDesc = "SCRAPE";
    } else if (templatedUrl.toLowerCase().endsWith(".csv") || templatedUrl.includes("format=csv")) {
      sourceTypeDesc = "CSV";
    }

    indicators.push({
      indicator_id: indicatorId,
      category,
      display_name: displayName,
      source_url: templatedUrl,
      json_path: jsonPath,
      ui_value: uiValue,
      unit,
      tolerance,
      ...(scrapeConfig ? { scrape_config: scrapeConfig } : {}),
      ...(xmlConfig ? { xml_config: xmlConfig } : {}),
      source_type: sourceTypeDesc,
      screen_section: screenSection,
      where_it_shows: whereItShows,
      is_reachability: isReachability,
    });
  });

  return indicators;
}

/**
 * Main parser entry point for Step 3 workbooks.
 */
export function parseStep3ExcelSources(options?: ParseStep3Options): Indicator[] {
  const defaultBaseline = path.resolve(process.cwd(), "app/step_3/lib/RXBE_Wizard_Step3_Sources_UI_Only.xlsx");
  const excelPath = options?.excelPath || defaultBaseline;

  const defaultHtml = path.resolve(process.cwd(), "lib/RXBE_live_Template.html");
  const htmlPath = options?.htmlPath || defaultHtml;
  const countryCode = options?.countryCode || "PG";
  const countryCfg = getCountryConfig(countryCode);
  const province = options?.province || countryCfg.default_province;
  const includeInternal = options?.includeInternal ?? false;

  const liveSnap = loadLiveSnap(htmlPath);
  const snapLat = getProvinceResource(liveSnap, countryCfg.iso3, province, "lat", countryCfg.country);
  const snapLon = getProvinceResource(liveSnap, countryCfg.iso3, province, "lon", countryCfg.country);
  const lat = typeof snapLat === "number" ? snapLat : countryCfg.coordinates.latitude;
  const lon = typeof snapLon === "number" ? snapLon : countryCfg.coordinates.longitude;

  if (!fs.existsSync(excelPath)) {
    throw new Error(`Step 3 Excel source file not found at: ${excelPath}`);
  }

  const fileBuffer = fs.readFileSync(excelPath);
  const wb = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName =
    options?.sheetName && wb.SheetNames.includes(options.sheetName)
      ? options.sheetName
      : wb.SheetNames[0];

  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json<WizardStep3ExcelRow>(sheet);
  return parseWizardStep3Rows(rows, liveSnap, countryCfg, province, lat, lon, includeInternal);
}
