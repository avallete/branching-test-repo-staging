import fs from "fs";
import path from "path";
import type { GeneratorConfig } from "../config.js";
import type { SchemaState, TableInfo } from "./migrations.js";
import { initRandom, getFaker, pick, randInt } from "../utils/random.js";
import { randomValueForType, type ColumnType } from "../utils/sql.js";

// --- Topological Sort ---

/** Build dependency graph from FK columns (columns ending in _id referencing other tables) */
function buildDependencyGraph(tables: Map<string, TableInfo>): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();

  for (const [name, table] of tables) {
    deps.set(name, new Set());
    for (const [colName] of table.columns) {
      if (colName.endsWith("_id")) {
        const refTable = colName.slice(0, -3); // strip _id
        if (tables.has(refTable) && refTable !== name) {
          deps.get(name)!.add(refTable);
        }
      }
    }
  }

  return deps;
}

function topologicalSort(deps: Map<string, Set<string>>): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(node: string) {
    if (visited.has(node)) return;
    if (visiting.has(node)) return; // cycle, skip
    visiting.add(node);

    const nodeDeps = deps.get(node);
    if (nodeDeps) {
      for (const dep of nodeDeps) {
        visit(dep);
      }
    }

    visiting.delete(node);
    visited.add(node);
    sorted.push(node);
  }

  for (const node of deps.keys()) {
    visit(node);
  }

  return sorted;
}

// --- INSERT Generation ---

function generateInsertForTable(
  table: TableInfo,
  rowCount: number,
  existingIds: Map<string, number[]>
): string {
  const lines: string[] = [];
  const f = getFaker();

  // Columns to insert (skip id if SERIAL, skip auto-generated)
  const insertCols = Array.from(table.columns.entries()).filter(
    ([name, col]) => name !== "id" && name !== "created_at" && name !== "updated_at"
  );

  if (insertCols.length === 0) return `-- Table ${table.name}: no insertable columns\n`;

  const colNames = insertCols.map(([name]) => name);
  const ids: number[] = [];

  lines.push(`-- Seed data for ${table.name}`);

  for (let i = 0; i < rowCount; i++) {
    const values = insertCols.map(([name, col]) => {
      // FK reference
      if (name.endsWith("_id")) {
        const refTable = name.slice(0, -3);
        const refIds = existingIds.get(refTable);
        if (refIds && refIds.length > 0) {
          return pick(refIds).toString();
        }
        return "NULL";
      }

      // Nullable columns have a chance of being NULL
      if (col.nullable && f.datatype.boolean(0.1)) {
        return "NULL";
      }

      return randomValueForType(col.type);
    });

    lines.push(`INSERT INTO ${table.name} (${colNames.join(", ")}) VALUES (${values.join(", ")});`);
    ids.push(i + 1); // Assume SERIAL generates sequential IDs
  }

  existingIds.set(table.name, ids);
  lines.push("");

  return lines.join("\n");
}

// --- Storage Buckets ---

function generateStorageBuckets(bucketCount: number): string {
  const bucketNames = ["avatars", "documents", "uploads", "backups", "media", "exports", "imports", "temp"];
  const lines: string[] = ["-- Storage buckets"];

  for (let i = 0; i < bucketCount && i < bucketNames.length; i++) {
    const name = bucketNames[i];
    const isPublic = i < 2; // avatars and documents are public
    lines.push(`INSERT INTO storage.buckets (id, name, public) VALUES ('${name}', '${name}', ${isPublic}) ON CONFLICT (id) DO NOTHING;`);
  }

  lines.push("");
  return lines.join("\n");
}

function generateStorageObjects(bucketCount: number): string {
  const f = getFaker();
  const bucketNames = ["avatars", "documents", "uploads", "backups", "media"];
  const lines: string[] = ["-- Storage object metadata"];

  const mimeTypes = [
    "image/jpeg", "image/png", "application/pdf",
    "text/plain", "application/json", "text/csv",
  ];

  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "application/json": ".json",
    "text/csv": ".csv",
  };

  for (let b = 0; b < Math.min(bucketCount, bucketNames.length); b++) {
    const bucket = bucketNames[b];
    const objectCount = randInt(10, 30);

    for (let i = 0; i < objectCount; i++) {
      const mime = pick(mimeTypes);
      const ext = extensions[mime] ?? ".bin";
      const name = `${f.string.uuid()}${ext}`;
      const size = randInt(1024, 10_000_000);
      const owner = f.string.uuid();

      lines.push(
        `INSERT INTO storage.objects (bucket_id, name, owner, metadata) VALUES ('${bucket}', '${name}', '${owner}', '${JSON.stringify({ size, mimetype: mime, cacheControl: "max-age=3600" })}') ON CONFLICT DO NOTHING;`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

// --- Main ---

export async function generateSeedData(
  config: GeneratorConfig,
  schemaState: SchemaState
): Promise<void> {
  initRandom(config.seed + 2000);

  const seedPath = path.join(config.projectRoot, "supabase", "seed.sql");

  const parts: string[] = [
    "-- Seed data generated by stress-generator",
    `-- Tables: ${schemaState.tables.size}`,
    `-- Rows per table: ~${config.seedRowsPerTable}`,
    "",
    "BEGIN;",
    "",
  ];

  // Topological sort tables for FK integrity
  const deps = buildDependencyGraph(schemaState.tables);
  const sortedNames = topologicalSort(deps);

  const existingIds = new Map<string, number[]>();

  // Pre-seed existing tables with their IDs
  existingIds.set("projects", [1, 2, 3]);
  existingIds.set("organisations", [1, 2, 3, 4]);

  let tableCount = 0;
  for (const tableName of sortedNames) {
    const table = schemaState.tables.get(tableName);
    if (!table) continue;

    // Skip existing tables (projects, organisations) - keep original seed data
    if (tableName === "projects" || tableName === "organisations") continue;

    const rowCount = config.seedRowsPerTable;
    parts.push(generateInsertForTable(table, rowCount, existingIds));

    tableCount++;
    if (tableCount % 20 === 0) {
      process.stdout.write(`  seed: ${tableCount} tables\r`);
    }
  }

  // Storage
  parts.push(generateStorageBuckets(config.storageBucketCount));
  parts.push(generateStorageObjects(config.storageBucketCount));

  parts.push("COMMIT;");
  parts.push("");

  fs.writeFileSync(seedPath, parts.join("\n"));
  console.log(`  seed: ${tableCount} tables seeded`);
}
