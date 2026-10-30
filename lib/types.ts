// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface ProjectMetadata {
  readonly country: string;
  readonly country_code: string;
  readonly iso3: string;
  readonly province: string;
  readonly coordinates: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly grid_connection_type: string;
  readonly distance_to_grid_km: number;
}

/**
 * Configuration for scraping HTML pages or extracting data from PDFs.
 */
export interface ScrapeConfig {
  /** CSS selector to locate the element (e.g. "#ticker-value", "td.rate"). */
  readonly css_selector?: string;

  /** Regex pattern (string) applied to page text or PDF text. */
  readonly regex?: string;

  /** Name attribute of a <meta> tag to read content from. */
  readonly meta_name?: string;

  /** Set to "pdf" when the source_url points to a PDF file. */
  readonly content_type?: "html" | "pdf";

  /** Optional static value returned if the selector/regex successfully matches. */
  readonly value_if_found?: string | number;

  /** If true, follow linked PDF documents from the HTML page. */
  readonly follow_pdf_links?: boolean;

  /** Attribute name to read from the matched element (e.g. "href", "content"). */
  readonly attribute?: string;
}

/**
 * Configuration for parsing XML / RSS / Atom feeds.
 */
export interface XmlConfig {
  /** XML selector or tag query (e.g. "channel > item > title"). */
  readonly xml_path?: string;

  /** Attribute name on matched element. */
  readonly attribute?: string;

  /** Regex applied to extracted XML content. */
  readonly regex?: string;

  /** Value if regex matches. */
  readonly value_if_found?: string | number;

  /** Extraction mode for XML feeds */
  readonly extraction_mode?: "item_count" | "latest_title" | "keyword";

  /** Keyword to search for within items */
  readonly keyword?: string;
}

export interface Indicator {
  readonly indicator_id: string;
  readonly category: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly json_path: string | null;
  readonly ui_value: number | string;
  readonly unit: string;
  readonly tolerance: number;
  /** Optional scraping configuration for HTML/PDF sources without JSON APIs. */
  readonly scrape_config?: ScrapeConfig | null;
  /** Optional XML configuration for RSS/Atom sources. */
  readonly xml_config?: XmlConfig | null;
  /** Optional Step 1/3 section metadata. */
  readonly screen_section?: string;
  readonly source_type?: string;
  readonly where_it_shows?: string;
  readonly is_reachability?: boolean;
}

export interface ValidationRequest {
  readonly request_id: string;
  readonly timestamp?: string;
  readonly project_metadata: ProjectMetadata;
  readonly indicators: Indicator[];
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export type IndicatorStatus = "SUCCESS" | "SKIPPED" | "ERROR";

export interface IndicatorResult {
  readonly indicator_id: string;
  readonly display_name: string;
  readonly source_url: string;
  readonly source_value: number | string | null;
  readonly ui_value: number | string;
  readonly tolerance: number;
  readonly difference: number | null;
  readonly status: IndicatorStatus;
  readonly is_matched: boolean;
  readonly message: string | null;
  readonly screen_section?: string;
  readonly where_it_shows?: string;
  readonly is_reachability?: boolean;
}

export interface ValidationSummary {
  readonly total_indicators: number;
  readonly matched: number;
  readonly mismatched: number;
  readonly skipped: number;
  readonly errors: number;
  readonly overall_status: boolean;
}

export interface ValidationResponse {
  readonly test_run_id: string;
  readonly executed_at: string;
  readonly country: string;
  readonly country_code: string;
  readonly province?: string;
  readonly summary: ValidationSummary;
  readonly results: IndicatorResult[];
}

export interface SheetMetadata {
  readonly name: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly columns: readonly string[];
  readonly hasIndicators: boolean;
  readonly isValidMapping?: boolean;
  readonly detectedSchema?: string;
  readonly mappingError?: string;
}

export interface WorkbookInfo {
  readonly fileName: string;
  readonly displayName: string;
  readonly filePath: string;
  readonly isDefault: boolean;
  readonly country?: string;
  readonly countryCode?: string;
  readonly province?: string;
  readonly uploadedAt?: string;
  readonly sheets: SheetMetadata[];
}
