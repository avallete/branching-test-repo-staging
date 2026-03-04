import fs from "fs";
import path from "path";
import type { GeneratorConfig } from "../config.js";
import { initRandom, pick, pickN, randInt, weightedPick, getFaker, snakeId } from "../utils/random.js";
import { nextTimestamp, resetTimestamp } from "../utils/timestamp.js";
import {
  tableName,
  columnName,
  indexName,
  policyName,
  functionName,
  viewName,
  triggerName,
  generateColumn,
  columnToSQL,
  foreignKeySQL,
  randomColumnType,
  descriptiveMigrationName,
  EXTENSIONS,
  COLUMN_TYPES,
  SIMPLE_DEFAULTS,
  type ColumnDef,
  type ColumnType,
} from "../utils/sql.js";

// --- Schema State ---

export interface TableInfo {
  name: string;
  columns: Map<string, ColumnDef>;
  hasRls: boolean;
  hasPrimaryKey: boolean;
}

export interface SchemaState {
  tables: Map<string, TableInfo>;
  indexes: Set<string>;
  policies: Set<string>;
  functions: Set<string>;
  views: Set<string>;
  extensions: Set<string>;
  triggers: Set<string>;
}

function createInitialSchemaState(): SchemaState {
  const state: SchemaState = {
    tables: new Map(),
    indexes: new Set(),
    policies: new Set(),
    functions: new Set(),
    views: new Set(),
    extensions: new Set(),
    triggers: new Set(),
  };

  // Pre-seed with existing tables
  state.tables.set("projects", {
    name: "projects",
    columns: new Map([
      ["id", { name: "id", type: "INTEGER", nullable: false, hasDefault: true, isUnique: true }],
      ["name", { name: "name", type: "VARCHAR(255)", nullable: false, hasDefault: false, isUnique: false }],
      ["description", { name: "description", type: "TEXT", nullable: true, hasDefault: false, isUnique: false }],
      ["created_at", { name: "created_at", type: "TIMESTAMP", nullable: true, hasDefault: true, isUnique: false }],
      ["updated_at", { name: "updated_at", type: "TIMESTAMP", nullable: true, hasDefault: true, isUnique: false }],
    ]),
    hasRls: false,
    hasPrimaryKey: true,
  });

  state.tables.set("organisations", {
    name: "organisations",
    columns: new Map([
      ["id", { name: "id", type: "INTEGER", nullable: false, hasDefault: true, isUnique: true }],
      ["name", { name: "name", type: "VARCHAR(255)", nullable: false, hasDefault: false, isUnique: false }],
      ["description", { name: "description", type: "TEXT", nullable: true, hasDefault: false, isUnique: false }],
      ["created_at", { name: "created_at", type: "TIMESTAMP", nullable: true, hasDefault: true, isUnique: false }],
      ["updated_at", { name: "updated_at", type: "TIMESTAMP", nullable: true, hasDefault: true, isUnique: false }],
    ]),
    hasRls: false,
    hasPrimaryKey: true,
  });

  return state;
}

// --- Migration Generators ---

function generateCreateTable(state: SchemaState, config: GeneratorConfig): string {
  const name = tableName();
  if (state.tables.has(name)) return generateCreateTable(state, config);

  const colCount = randInt(config.columnsPerTable.min, config.columnsPerTable.max);
  const columns = new Map<string, ColumnDef>();
  const colLines: string[] = [];

  // Always add an id and timestamps
  colLines.push("  id SERIAL PRIMARY KEY");
  columns.set("id", { name: "id", type: "INTEGER", nullable: false, hasDefault: true, isUnique: true });

  const usedNames = new Set<string>(["id"]);

  for (let i = 0; i < colCount; i++) {
    const col = generateColumn(usedNames);
    usedNames.add(col.name);
    columns.set(col.name, col);
    colLines.push(columnToSQL(col));
  }

  // Add timestamps
  colLines.push("  created_at TIMESTAMPTZ DEFAULT NOW()");
  colLines.push("  updated_at TIMESTAMPTZ DEFAULT NOW()");
  columns.set("created_at", { name: "created_at", type: "TIMESTAMPTZ", nullable: true, hasDefault: true, isUnique: false });
  columns.set("updated_at", { name: "updated_at", type: "TIMESTAMPTZ", nullable: true, hasDefault: true, isUnique: false });

  // Possibly add FK to an existing table
  let fkLine = "";
  const existingTables = Array.from(state.tables.keys());
  if (existingTables.length > 0 && getFaker().datatype.boolean(0.4)) {
    const refTable = pick(existingTables);
    const fkColName = `${refTable}_id`;
    if (!usedNames.has(fkColName)) {
      colLines.push(`  ${fkColName} INTEGER REFERENCES ${refTable}(id)`);
      columns.set(fkColName, { name: fkColName, type: "INTEGER", nullable: true, hasDefault: false, isUnique: false });
    }
  }

  state.tables.set(name, { name, columns, hasRls: false, hasPrimaryKey: true });

  return `CREATE TABLE ${name} (\n${colLines.join(",\n")}\n);${fkLine}`;
}

function generateAlterTable(state: SchemaState): string {
  const tables = Array.from(state.tables.values()).filter((t) => t.columns.size > 3);
  if (tables.length === 0) return generateCreateExtension(state);

  const table = pick(tables);
  const faker = getFaker();
  const action = weightedPick([0.5, 0.25, 0.25]);
  const lines: string[] = [];

  switch (action) {
    case 0: {
      // ADD COLUMN
      const col = generateColumn(new Set(table.columns.keys()));
      table.columns.set(col.name, col);
      lines.push(`ALTER TABLE ${table.name} ADD COLUMN ${col.name} ${col.type}${col.nullable ? "" : " NOT NULL"}${col.hasDefault ? ` DEFAULT ${SIMPLE_DEFAULTS[col.type] ?? "NULL"}` : ""};`);
      break;
    }
    case 1: {
      // DROP COLUMN (avoid id, created_at, updated_at, and FK columns)
      const droppable = Array.from(table.columns.keys()).filter(
        (c) => !["id", "created_at", "updated_at"].includes(c) && !c.endsWith("_id")
      );
      if (droppable.length === 0) {
        const col = generateColumn(new Set(table.columns.keys()));
        table.columns.set(col.name, col);
        lines.push(`ALTER TABLE ${table.name} ADD COLUMN ${col.name} ${col.type};`);
      } else {
        const colName = pick(droppable);
        table.columns.delete(colName);
        lines.push(`ALTER TABLE ${table.name} DROP COLUMN IF EXISTS ${colName};`);
      }
      break;
    }
    case 2: {
      // ALTER COLUMN type or default
      const alterable = Array.from(table.columns.entries()).filter(
        ([name]) => !["id", "created_at", "updated_at"].includes(name) && !name.endsWith("_id")
      );
      if (alterable.length === 0) {
        const col = generateColumn(new Set(table.columns.keys()));
        table.columns.set(col.name, col);
        lines.push(`ALTER TABLE ${table.name} ADD COLUMN ${col.name} ${col.type};`);
      } else {
        const [colName, colDef] = pick(alterable);
        if (faker.datatype.boolean()) {
          const newDefault = SIMPLE_DEFAULTS[colDef.type] ?? "NULL";
          lines.push(`ALTER TABLE ${table.name} ALTER COLUMN ${colName} SET DEFAULT ${newDefault};`);
        } else {
          lines.push(`ALTER TABLE ${table.name} ALTER COLUMN ${colName} ${colDef.nullable ? "SET NOT NULL" : "DROP NOT NULL"};`);
          colDef.nullable = !colDef.nullable;
        }
      }
      break;
    }
  }

  return lines.join("\n");
}

function generateCreateIndex(state: SchemaState): string {
  const tables = Array.from(state.tables.values()).filter((t) => t.columns.size > 3);
  if (tables.length === 0) return "-- skip: no tables for index";

  const table = pick(tables);
  const cols = Array.from(table.columns.keys()).filter(
    (c) => !["id", "created_at", "updated_at"].includes(c)
  );
  if (cols.length === 0) return "-- skip: no indexable columns";

  const indexCols = pickN(cols, randInt(1, Math.min(3, cols.length)));
  const idxName = indexName(table.name, indexCols);

  if (state.indexes.has(idxName)) return "-- skip: duplicate index";
  state.indexes.add(idxName);

  const faker = getFaker();
  const indexType = weightedPick([0.6, 0.2, 0.2]);

  switch (indexType) {
    case 1: {
      // GIN index (for jsonb columns)
      const jsonbCols = Array.from(table.columns.entries())
        .filter(([, c]) => c.type === "JSONB" || c.type === "JSON")
        .map(([n]) => n);
      if (jsonbCols.length > 0) {
        return `CREATE INDEX ${idxName} ON ${table.name} USING gin (${jsonbCols[0]});`;
      }
      // Fallthrough to btree
    }
    case 2: {
      // Partial index
      const col = indexCols[0];
      return `CREATE INDEX ${idxName} ON ${table.name} (${indexCols.join(", ")}) WHERE ${col} IS NOT NULL;`;
    }
    default: {
      // Standard B-tree
      return `CREATE INDEX ${idxName} ON ${table.name} (${indexCols.join(", ")});`;
    }
  }
}

function generateRlsPolicy(state: SchemaState): string {
  const tables = Array.from(state.tables.values());
  if (tables.length === 0) return "-- skip: no tables for RLS";

  const table = pick(tables);
  const actions = ["SELECT", "INSERT", "UPDATE", "DELETE"] as const;
  const lines: string[] = [];

  if (!table.hasRls) {
    lines.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`);
    table.hasRls = true;
  }

  for (const action of actions) {
    const polName = policyName(table.name, action.toLowerCase()) + `_${randInt(1, 999)}`;
    if (state.policies.has(polName)) continue;
    state.policies.add(polName);

    const using = action === "INSERT" ? "" : `USING (auth.uid() IS NOT NULL)`;
    const withCheck = action === "SELECT" || action === "DELETE" ? "" : `WITH CHECK (auth.uid() IS NOT NULL)`;

    lines.push(
      `CREATE POLICY "${polName}" ON ${table.name} FOR ${action} TO authenticated ${using} ${withCheck};`.replace(/\s+/g, " ")
    );
  }

  return lines.join("\n\n");
}

function generateTriggerFunction(state: SchemaState): string {
  const tables = Array.from(state.tables.values()).filter((t) => t.columns.has("updated_at"));
  if (tables.length === 0) return "-- skip: no tables with updated_at";

  const table = pick(tables);
  const fnName = functionName();
  const trgName = triggerName(table.name, "update") + `_${randInt(1, 999)}`;

  if (state.functions.has(fnName) || state.triggers.has(trgName)) {
    return "-- skip: duplicate function/trigger name";
  }

  state.functions.add(fnName);
  state.triggers.add(trgName);

  const faker = getFaker();
  const variant = weightedPick([0.5, 0.3, 0.2]);

  switch (variant) {
    case 1: {
      // Audit logging function
      return `
CREATE OR REPLACE FUNCTION ${fnName}()
RETURNS TRIGGER AS $$
BEGIN
  RAISE LOG 'Audit: % on ${table.name} id=%', TG_OP, COALESCE(NEW.id::text, OLD.id::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${trgName}
  AFTER INSERT OR UPDATE OR DELETE ON ${table.name}
  FOR EACH ROW EXECUTE FUNCTION ${fnName}();`;
    }
    case 2: {
      // Validation function
      const textCols = Array.from(table.columns.entries())
        .filter(([, c]) => c.type === "TEXT" || c.type === "VARCHAR(255)")
        .map(([n]) => n);
      const checkCol = textCols.length > 0 ? textCols[0] : "id";
      return `
CREATE OR REPLACE FUNCTION ${fnName}()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.${checkCol} IS NULL THEN
    RAISE EXCEPTION '${checkCol} cannot be null on ${table.name}';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${trgName}
  BEFORE INSERT OR UPDATE ON ${table.name}
  FOR EACH ROW EXECUTE FUNCTION ${fnName}();`;
    }
    default: {
      // Updated_at trigger
      return `
CREATE OR REPLACE FUNCTION ${fnName}()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ${trgName}
  BEFORE UPDATE ON ${table.name}
  FOR EACH ROW EXECUTE FUNCTION ${fnName}();`;
    }
  }
}

function generateView(state: SchemaState): string {
  const tables = Array.from(state.tables.values()).filter((t) => t.columns.size > 3);
  if (tables.length < 2) return "-- skip: need at least 2 tables for view";

  const [t1, t2] = pickN(tables, 2);
  const vwName = viewName();

  if (state.views.has(vwName)) return "-- skip: duplicate view name";
  state.views.add(vwName);

  const t1Cols = Array.from(t1.columns.keys()).slice(0, 3).map((c) => `a.${c}`);
  const t2Cols = Array.from(t2.columns.keys()).slice(0, 3).map((c) => `b.${c}`);

  const isMaterialized = getFaker().datatype.boolean(0.3);
  const keyword = isMaterialized ? "MATERIALIZED VIEW" : "VIEW";

  return `CREATE ${keyword} ${vwName} AS
SELECT ${[...t1Cols, ...t2Cols].join(", ")}
FROM ${t1.name} a
CROSS JOIN ${t2.name} b
LIMIT 1000;`;
}

function generateCreateExtension(state: SchemaState): string {
  const available = EXTENSIONS.filter((e) => !state.extensions.has(e));
  if (available.length === 0) return "-- skip: all extensions installed";

  const ext = pick(available);
  state.extensions.add(ext);
  return `CREATE EXTENSION IF NOT EXISTS "${ext}";`;
}

// --- Schema Dump ---

function generateSchemaDump(state: SchemaState, targetSize: number): string {
  const lines: string[] = ["-- Full schema dump", "-- Generated for stress benchmarking", ""];

  // Dump all tables
  for (const table of state.tables.values()) {
    lines.push(`-- Table: ${table.name}`);
    const colDefs = Array.from(table.columns.values()).map(columnToSQL);
    lines.push(`CREATE TABLE IF NOT EXISTS ${table.name} (\n${colDefs.join(",\n")}\n);`);
    lines.push("");
  }

  // Dump all indexes
  for (const idx of state.indexes) {
    lines.push(`-- Index: ${idx}`);
  }

  // Pad with comments to reach target size
  let content = lines.join("\n");
  while (content.length < targetSize) {
    const padding = `-- Schema documentation: ${snakeId(5)} - ${getFaker().lorem.paragraph()}\n`;
    content += padding;
  }

  return content;
}

// --- Main Generator ---

export async function generateMigrations(config: GeneratorConfig): Promise<SchemaState> {
  initRandom(config.seed);
  resetTimestamp();

  const migrationsDir = path.join(config.projectRoot, "supabase", "migrations");
  fs.mkdirSync(migrationsDir, { recursive: true });

  const state = createInitialSchemaState();

  const weights = [
    config.migrationWeights.createTable,
    config.migrationWeights.alterTable,
    config.migrationWeights.createIndex,
    config.migrationWeights.rlsPolicy,
    config.migrationWeights.triggerFunction,
    config.migrationWeights.view,
    config.migrationWeights.extension,
  ];

  const typeNames = [
    "create_table",
    "alter_table",
    "create_index",
    "rls_policy",
    "trigger_function",
    "create_view",
    "extension",
  ];

  const generators = [
    () => generateCreateTable(state, config),
    () => generateAlterTable(state),
    () => generateCreateIndex(state),
    () => generateRlsPolicy(state),
    () => generateTriggerFunction(state),
    () => generateView(state),
    () => generateCreateExtension(state),
  ];

  for (let i = 0; i < config.migrationCount; i++) {
    // Force extensions early
    let typeIndex: number;
    if (i < 10) {
      typeIndex = 6; // extension
    } else if (i < 50) {
      // Favor table creation early
      typeIndex = getFaker().datatype.boolean(0.6) ? 0 : weightedPick(weights);
    } else {
      typeIndex = weightedPick(weights);
    }

    const sql = generators[typeIndex]();
    if (sql.startsWith("-- skip")) continue;

    const ts = nextTimestamp();
    const name = descriptiveMigrationName(typeNames[typeIndex]);
    const filename = `${ts}_${name}.sql`;
    const filePath = path.join(migrationsDir, filename);

    // Add header comment
    const header = `-- Migration: ${name}\n-- Type: ${typeNames[typeIndex]}\n-- Generated by stress-generator\n\n`;
    fs.writeFileSync(filePath, header + sql + "\n");

    if (i % 50 === 0) {
      process.stdout.write(`  migrations: ${i}/${config.migrationCount}\r`);
    }
  }

  // Generate schema dump
  if (config.generateSchemaDump) {
    const ts = nextTimestamp();
    const dumpPath = path.join(migrationsDir, `${ts}_full_schema_dump.sql`);
    const dump = generateSchemaDump(state, config.schemaDumpSizeBytes);
    fs.writeFileSync(dumpPath, dump);
  }

  console.log(`  migrations: ${config.migrationCount}/${config.migrationCount} done`);

  return state;
}
