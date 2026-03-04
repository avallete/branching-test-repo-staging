import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_CONFIG, type GeneratorConfig } from "./config.js";
import { generateMigrations } from "./generators/migrations.js";
import { generateEdgeFunctions } from "./generators/edge-functions.js";
import { generateSeedData } from "./generators/seed-data.js";
import { generateGitHistory } from "./generators/git-history.js";

function parseArgs(): Partial<GeneratorConfig> {
  const args = process.argv.slice(2);
  const overrides: Partial<GeneratorConfig> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--skip-git":
        overrides.enableGitHistory = false;
        break;
      case "--force":
        overrides.forceMain = true;
        break;
      case "--seed":
        overrides.seed = parseInt(args[++i], 10);
        break;
      case "--migrations":
        overrides.migrationCount = parseInt(args[++i], 10);
        break;
      case "--functions":
        overrides.edgeFunctionCount = parseInt(args[++i], 10);
        break;
      case "--rows":
        overrides.seedRowsPerTable = parseInt(args[++i], 10);
        break;
      case "--branches":
        overrides.branchCount = parseInt(args[++i], 10);
        break;
    }
  }

  return overrides;
}

async function main() {
  const overrides = parseArgs();
  const config: GeneratorConfig = { ...DEFAULT_CONFIG, ...overrides };

  // Resolve project root relative to generator directory
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  config.projectRoot = path.resolve(__dirname, config.projectRoot);

  console.log("=== Stress Supabase Branching Benchmark Generator ===");
  console.log(`Project root: ${config.projectRoot}`);
  console.log(`Seed: ${config.seed}`);
  console.log(`Migrations: ${config.migrationCount}`);
  console.log(`Edge functions: ${config.edgeFunctionCount}`);
  console.log(`Seed rows/table: ${config.seedRowsPerTable}`);
  console.log(`Git history: ${config.enableGitHistory}`);
  console.log("");

  // Step 1: Generate migrations (produces SchemaState)
  console.log("[1/4] Generating migrations...");
  const schemaState = await generateMigrations(config);
  console.log(`  -> ${schemaState.tables.size} tables, generated migration files`);

  // Step 2: Generate edge functions (independent)
  console.log("[2/4] Generating edge functions...");
  const funcCount = await generateEdgeFunctions(config);
  console.log(`  -> ${funcCount} edge functions generated`);

  // Step 3: Generate seed data (needs SchemaState)
  console.log("[3/4] Generating seed data...");
  await generateSeedData(config, schemaState);
  console.log("  -> seed.sql generated");

  // Step 4: Generate git history (needs all files)
  if (config.enableGitHistory) {
    console.log("[4/4] Generating git history...");
    await generateGitHistory(config);
    console.log("  -> git history seeded");
  } else {
    console.log("[4/4] Skipping git history (--skip-git)");
  }

  console.log("");
  console.log("=== Generation complete! ===");
}

main().catch((err) => {
  console.error("Generation failed:", err);
  process.exit(1);
});
