/**
 * Deterministic verification checks (Component 8).
 *
 * These run before anything else and are authoritative for the requirements
 * they cover. They operate on a parsed dataset, not on a model's opinion, so a
 * FAIL is a fact, not a judgment call. A check that cannot be evaluated (an
 * unknown check name, a missing column) returns UNCERTAIN rather than PASS:
 * uncertainty must escalate, never authorize.
 */
export interface Dataset {
  columns: string[];
  rows: Record<string, string>[];
}

export interface DeterministicCheckResult {
  outcome: "PASS" | "FAIL" | "UNCERTAIN";
  /** Deterministic results are 1 (pass) or 0 (fail); uncertainty is 0. */
  confidence: number;
  rationale: string;
  detail?: Record<string, unknown>;
}

/**
 * Minimal RFC 4180 CSV parser: handles quoted fields, escaped quotes, CRLF and
 * LF, and a header row. It is deliberately small and dependency-free so the
 * verification path has no surprises.
 */
export function parseCsv(text: string): Dataset {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  // Flush the final field/row when the file does not end in a newline.
  if (field.length > 0 || row.length > 0) pushRow();

  const header = rows.shift() ?? [];
  const columns = header.map((h) => h.trim());
  const dataRows: Record<string, string>[] = [];
  for (const rawRow of rows) {
    // Skip fully empty trailing rows.
    if (rawRow.length === 1 && rawRow[0] === "") continue;
    const record: Record<string, string> = {};
    columns.forEach((col, idx) => {
      record[col] = (rawRow[idx] ?? "").trim();
    });
    dataRows.push(record);
  }
  return { columns, rows: dataRows };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isBlank(value: string): boolean {
  return value === "";
}

function uniqueColumn(column: string, dataset: Dataset): DeterministicCheckResult {
  if (!dataset.columns.includes(column)) {
    return uncertain(`Column "${column}" is not present in the deliverable`);
  }
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  dataset.rows.forEach((row, index) => {
    const value = row[column] ?? "";
    if (isBlank(value)) return;
    if (seen.has(value)) {
      if (duplicates.length < 10) duplicates.push(value);
    } else {
      seen.set(value, index);
    }
  });
  if (duplicates.length > 0) {
    return fail(`Column "${column}" contains ${duplicates.length}+ duplicate value(s)`, {
      column,
      duplicates,
    });
  }
  return pass(`Column "${column}" is unique across ${dataset.rows.length} rows`);
}

function noNullColumn(column: string, dataset: Dataset): DeterministicCheckResult {
  if (!dataset.columns.includes(column)) {
    return uncertain(`Column "${column}" is not present in the deliverable`);
  }
  const nullRows: number[] = [];
  dataset.rows.forEach((row, index) => {
    if (isBlank(row[column] ?? "")) nullRows.push(index);
  });
  if (nullRows.length > 0) {
    return fail(`Column "${column}" has ${nullRows.length} empty value(s)`, {
      column,
      rowIndexes: nullRows.slice(0, 25),
    });
  }
  return pass(`Column "${column}" has no empty values`);
}

function requiredColumns(columns: string[], dataset: Dataset): DeterministicCheckResult {
  const missing = columns.filter((c) => !dataset.columns.includes(c));
  if (missing.length > 0) {
    return fail(`Missing required column(s): ${missing.join(", ")}`, { missing });
  }
  return pass(`All required columns present: ${columns.join(", ")}`);
}

function nonEmptyColumns(columns: string[], dataset: Dataset): DeterministicCheckResult {
  const missing = columns.filter((c) => !dataset.columns.includes(c));
  if (missing.length > 0) {
    return uncertain(`Column(s) not present: ${missing.join(", ")}`);
  }
  const empties: Array<{ column: string; row: number }> = [];
  for (const column of columns) {
    dataset.rows.forEach((row, index) => {
      if (isBlank(row[column] ?? "")) empties.push({ column, row: index });
    });
  }
  if (empties.length > 0) {
    return fail(`${empties.length} empty value(s) across required columns`, {
      columns,
      examples: empties.slice(0, 25),
    });
  }
  return pass(`Columns are non-empty: ${columns.join(", ")}`);
}

function iso8601Dates(columns: string[], dataset: Dataset): DeterministicCheckResult {
  const missing = columns.filter((c) => !dataset.columns.includes(c));
  if (missing.length > 0) {
    return uncertain(`Date column(s) not present: ${missing.join(", ")}`);
  }
  const bad: Array<{ column: string; row: number; value: string }> = [];
  for (const column of columns) {
    dataset.rows.forEach((row, index) => {
      const value = row[column] ?? "";
      if (isBlank(value)) return;
      if (!ISO8601_RE.test(value)) bad.push({ column, row: index, value });
    });
  }
  if (bad.length > 0) {
    return fail(`${bad.length} value(s) are not ISO-8601 dates`, { examples: bad.slice(0, 10) });
  }
  return pass(`Date column(s) are ISO-8601: ${columns.join(", ")}`);
}

function emailFormat(column: string, dataset: Dataset): DeterministicCheckResult {
  if (!dataset.columns.includes(column)) {
    return uncertain(`Column "${column}" is not present in the deliverable`);
  }
  const bad: Array<{ row: number; value: string }> = [];
  dataset.rows.forEach((row, index) => {
    const value = row[column] ?? "";
    if (isBlank(value)) return;
    if (!EMAIL_RE.test(value)) bad.push({ row: index, value });
  });
  if (bad.length > 0) {
    return fail(`${bad.length} value(s) in "${column}" are not valid email addresses`, {
      examples: bad.slice(0, 10),
    });
  }
  return pass(`All values in "${column}" look like email addresses`);
}

function rowCountMin(min: number, dataset: Dataset): DeterministicCheckResult {
  if (dataset.rows.length < min) {
    return fail(`Expected at least ${min} data rows, found ${dataset.rows.length}`, {
      expected: min,
      actual: dataset.rows.length,
    });
  }
  return pass(`Found ${dataset.rows.length} data rows (minimum ${min})`);
}

function columnValueInSet(
  column: string,
  allowed: string[],
  dataset: Dataset,
): DeterministicCheckResult {
  if (!dataset.columns.includes(column)) {
    return uncertain(`Column "${column}" is not present in the deliverable`);
  }
  const offenders: Array<{ row: number; value: string }> = [];
  dataset.rows.forEach((row, index) => {
    const value = row[column] ?? "";
    if (isBlank(value)) return;
    if (!allowed.includes(value)) offenders.push({ row: index, value });
  });
  if (offenders.length > 0) {
    return fail(`${offenders.length} value(s) in "${column}" are outside the allowed set`, {
      allowed,
      examples: offenders.slice(0, 10),
    });
  }
  return pass(`All values in "${column}" are within the allowed set`);
}

function numericRange(
  column: string,
  min: number | undefined,
  max: number | undefined,
  dataset: Dataset,
): DeterministicCheckResult {
  if (!dataset.columns.includes(column)) {
    return uncertain(`Column "${column}" is not present in the deliverable`);
  }
  const offenders: Array<{ row: number; value: string }> = [];
  dataset.rows.forEach((row, index) => {
    const raw = row[column] ?? "";
    if (isBlank(raw)) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      offenders.push({ row: index, value: raw });
      return;
    }
    if (min !== undefined && value < min) offenders.push({ row: index, value: raw });
    else if (max !== undefined && value > max) offenders.push({ row: index, value: raw });
  });
  if (offenders.length > 0) {
    return fail(`${offenders.length} value(s) in "${column}" are out of range`, {
      min,
      max,
      examples: offenders.slice(0, 10),
    });
  }
  return pass(`All values in "${column}" are within [${min ?? "-inf"}, ${max ?? "inf"}]`);
}

function pass(rationale: string, detail?: Record<string, unknown>): DeterministicCheckResult {
  return { outcome: "PASS", confidence: 1, rationale, ...(detail ? { detail } : {}) };
}
function fail(rationale: string, detail?: Record<string, unknown>): DeterministicCheckResult {
  return { outcome: "FAIL", confidence: 0, rationale, ...(detail ? { detail } : {}) };
}
function uncertain(rationale: string, detail?: Record<string, unknown>): DeterministicCheckResult {
  return { outcome: "UNCERTAIN", confidence: 0, rationale, ...(detail ? { detail } : {}) };
}

/**
 * Dispatch a deterministic check by name. Unknown checks and malformed params
 * return UNCERTAIN so they escalate rather than silently pass.
 */
export function runDeterministicCheck(
  check: string,
  params: Record<string, unknown>,
  dataset: Dataset,
): DeterministicCheckResult {
  switch (check) {
    case "unique_column":
      return typeof params.column === "string"
        ? uniqueColumn(params.column, dataset)
        : uncertain("unique_column requires a column");
    case "no_null_column":
      return typeof params.column === "string"
        ? noNullColumn(params.column, dataset)
        : uncertain("no_null_column requires a column");
    case "required_columns":
      return Array.isArray(params.columns) && params.columns.every((c) => typeof c === "string")
        ? requiredColumns(params.columns as string[], dataset)
        : uncertain("required_columns requires a columns array");
    case "non_empty_columns":
      return Array.isArray(params.columns) && params.columns.every((c) => typeof c === "string")
        ? nonEmptyColumns(params.columns as string[], dataset)
        : uncertain("non_empty_columns requires a columns array");
    case "iso8601_dates":
      return Array.isArray(params.columns) && params.columns.every((c) => typeof c === "string")
        ? iso8601Dates(params.columns as string[], dataset)
        : uncertain("iso8601_dates requires a columns array");
    case "email_format":
      return typeof params.column === "string"
        ? emailFormat(params.column, dataset)
        : uncertain("email_format requires a column");
    case "row_count_min":
      return typeof params.min === "number"
        ? rowCountMin(params.min, dataset)
        : uncertain("row_count_min requires a min");
    case "column_value_in_set":
      return typeof params.column === "string" && Array.isArray(params.allowed)
        ? columnValueInSet(params.column, params.allowed as string[], dataset)
        : uncertain("column_value_in_set requires column and allowed");
    case "numeric_range":
      return typeof params.column === "string"
        ? numericRange(
            params.column,
            typeof params.min === "number" ? params.min : undefined,
            typeof params.max === "number" ? params.max : undefined,
            dataset,
          )
        : uncertain("numeric_range requires a column");
    default:
      return uncertain(`Unknown deterministic check "${check}"`);
  }
}
