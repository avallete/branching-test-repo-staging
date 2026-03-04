import { getFaker, pick, randInt, snakeId } from "./random.js";

// --- Column Types ---

export const COLUMN_TYPES = [
  "TEXT",
  "VARCHAR(255)",
  "INTEGER",
  "BIGINT",
  "SMALLINT",
  "BOOLEAN",
  "TIMESTAMPTZ",
  "TIMESTAMP",
  "DATE",
  "UUID",
  "JSONB",
  "JSON",
  "NUMERIC(10,2)",
  "DOUBLE PRECISION",
  "REAL",
  "BYTEA",
  "INET",
  "CIDR",
  "MACADDR",
  "INT[]",
  "TEXT[]",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export const SIMPLE_DEFAULTS: Record<string, string> = {
  TEXT: "'default_text'",
  "VARCHAR(255)": "'default'",
  INTEGER: "0",
  BIGINT: "0",
  SMALLINT: "0",
  BOOLEAN: "false",
  TIMESTAMPTZ: "NOW()",
  TIMESTAMP: "NOW()",
  DATE: "CURRENT_DATE",
  UUID: "gen_random_uuid()",
  JSONB: "'{}'::jsonb",
  JSON: "'{}'::json",
  "NUMERIC(10,2)": "0.00",
  "DOUBLE PRECISION": "0.0",
  REAL: "0.0",
  BYTEA: "'\\x00'::bytea",
  INET: "'0.0.0.0'::inet",
  CIDR: "'0.0.0.0/0'::cidr",
  MACADDR: "'00:00:00:00:00:00'::macaddr",
  "INT[]": "ARRAY[]::INT[]",
  "TEXT[]": "ARRAY[]::TEXT[]",
};

export const EXTENSIONS = [
  "uuid-ossp",
  "pgcrypto",
  "pg_trgm",
  "hstore",
  "citext",
  "tablefunc",
  "fuzzystrmatch",
  "unaccent",
  "btree_gist",
  "btree_gin",
] as const;

// --- Identifier Generation ---

export function tableName(): string {
  return snakeId(2) + "_" + randInt(1, 999);
}

export function columnName(): string {
  return snakeId(randInt(1, 3));
}

export function indexName(table: string, cols: string[]): string {
  return `idx_${table}_${cols.join("_")}`.slice(0, 63);
}

export function policyName(table: string, action: string): string {
  return `policy_${action}_${table}`.slice(0, 63);
}

export function functionName(): string {
  return `fn_${snakeId(2)}_${randInt(1, 999)}`;
}

export function viewName(): string {
  return `vw_${snakeId(2)}_${randInt(1, 999)}`;
}

export function triggerName(table: string, event: string): string {
  return `trg_${event}_${table}`.slice(0, 63);
}

// --- Column Generation ---

export function randomColumnType(): ColumnType {
  return pick([...COLUMN_TYPES]);
}

export interface ColumnDef {
  name: string;
  type: ColumnType;
  nullable: boolean;
  hasDefault: boolean;
  isUnique: boolean;
}

export function generateColumn(existingNames: Set<string>): ColumnDef {
  let name: string;
  do {
    name = columnName();
  } while (existingNames.has(name));

  const type = randomColumnType();
  const faker = getFaker();
  return {
    name,
    type,
    nullable: faker.datatype.boolean(0.6),
    hasDefault: faker.datatype.boolean(0.3),
    isUnique: faker.datatype.boolean(0.1),
  };
}

export function columnToSQL(col: ColumnDef): string {
  let sql = `  ${col.name} ${col.type}`;
  if (!col.nullable) sql += " NOT NULL";
  if (col.hasDefault) sql += ` DEFAULT ${SIMPLE_DEFAULTS[col.type] ?? "NULL"}`;
  if (col.isUnique) sql += " UNIQUE";
  return sql;
}

// --- Constraint Builders ---

export function foreignKeySQL(
  table: string,
  column: string,
  refTable: string,
  refColumn: string = "id"
): string {
  const name = `fk_${table}_${column}_${refTable}`.slice(0, 63);
  return `ALTER TABLE ${table} ADD CONSTRAINT ${name} FOREIGN KEY (${column}) REFERENCES ${refTable}(${refColumn});`;
}

export function checkConstraintSQL(table: string, column: string, condition: string): string {
  const name = `chk_${table}_${column}`.slice(0, 63);
  return `ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${condition});`;
}

// --- Value Generation per SQL Type ---

export function randomValueForType(type: ColumnType): string {
  const f = getFaker();
  switch (type) {
    case "TEXT":
    case "VARCHAR(255)":
      return `'${f.lorem.sentence().replace(/'/g, "''")}'`;
    case "INTEGER":
    case "SMALLINT":
      return f.number.int({ min: -10000, max: 10000 }).toString();
    case "BIGINT":
      return f.number.int({ min: -1000000, max: 1000000 }).toString();
    case "BOOLEAN":
      return f.datatype.boolean() ? "true" : "false";
    case "TIMESTAMPTZ":
    case "TIMESTAMP":
      return `'${f.date.past({ years: 3 }).toISOString()}'`;
    case "DATE":
      return `'${f.date.past({ years: 3 }).toISOString().split("T")[0]}'`;
    case "UUID":
      return `'${f.string.uuid()}'`;
    case "JSONB":
    case "JSON":
      return `'${JSON.stringify({ key: f.lorem.word(), value: f.number.int(100) }).replace(/'/g, "''")}'`;
    case "NUMERIC(10,2)":
    case "DOUBLE PRECISION":
    case "REAL":
      return f.number.float({ min: 0, max: 99999, fractionDigits: 2 }).toString();
    case "BYTEA":
      return `'\\x${f.string.hexadecimal({ length: 16, prefix: false })}'`;
    case "INET":
      return `'${f.internet.ip()}'`;
    case "CIDR":
      return `'${f.internet.ip()}/24'`;
    case "MACADDR":
      return `'${f.internet.mac()}'`;
    case "INT[]":
      return `ARRAY[${Array.from({ length: 3 }, () => f.number.int(100)).join(",")}]`;
    case "TEXT[]":
      return `ARRAY[${Array.from({ length: 3 }, () => `'${f.lorem.word()}'`).join(",")}]`;
    default:
      return "NULL";
  }
}

// --- Misc ---

export function descriptiveMigrationName(type: string): string {
  const slug = snakeId(3);
  return `${type}_${slug}`;
}
