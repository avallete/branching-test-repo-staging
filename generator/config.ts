export interface GeneratorConfig {
  /** Random seed for reproducibility */
  seed: number;

  /** Root directory of the Supabase project */
  projectRoot: string;

  // --- Migrations ---
  /** Total number of migrations to generate */
  migrationCount: number;
  /** Weighted distribution of migration types (must sum to 1.0) */
  migrationWeights: {
    createTable: number;
    alterTable: number;
    createIndex: number;
    rlsPolicy: number;
    triggerFunction: number;
    view: number;
    extension: number;
  };
  /** Min/max columns per new table */
  columnsPerTable: { min: number; max: number };
  /** Whether to generate a final heavy schema dump migration */
  generateSchemaDump: boolean;
  /** Target size in bytes for the schema dump */
  schemaDumpSizeBytes: number;

  // --- Edge Functions ---
  /** Number of individual edge functions to generate */
  edgeFunctionCount: number;
  /** Number of shared modules to generate */
  sharedModuleCount: number;
  /** Min/max local helper modules per function */
  localModulesPerFunction: { min: number; max: number };
  /** Min/max static assets per function */
  assetsPerFunction: { min: number; max: number };

  // --- Seed Data ---
  /** Approximate rows per table in seed.sql */
  seedRowsPerTable: number;
  /** Number of storage buckets to create */
  storageBucketCount: number;

  // --- Git History ---
  /** Whether to create git history (branches, blobs, submodules) */
  enableGitHistory: boolean;
  /** Number of large binary blobs to add and remove */
  binaryBlobCount: number;
  /** Min/max size in bytes for binary blobs */
  binaryBlobSize: { min: number; max: number };
  /** Number of feature branches to create */
  branchCount: number;
  /** Min/max commits per branch */
  commitsPerBranch: { min: number; max: number };
  /** Public repos to add as submodules */
  submodules: string[];
  /** Force run on main branch */
  forceMain: boolean;
}

export const DEFAULT_CONFIG: GeneratorConfig = {
  seed: 42,
  projectRoot: "..",

  // Migrations
  migrationCount: 400,
  migrationWeights: {
    createTable: 0.30,
    alterTable: 0.20,
    createIndex: 0.15,
    rlsPolicy: 0.15,
    triggerFunction: 0.10,
    view: 0.05,
    extension: 0.05,
  },
  columnsPerTable: { min: 3, max: 15 },
  generateSchemaDump: true,
  schemaDumpSizeBytes: 500_000,

  // Edge Functions
  edgeFunctionCount: 55,
  sharedModuleCount: 15,
  localModulesPerFunction: { min: 1, max: 3 },
  assetsPerFunction: { min: 1, max: 5 },

  // Seed Data
  seedRowsPerTable: 100,
  storageBucketCount: 5,

  // Git History
  enableGitHistory: true,
  binaryBlobCount: 10,
  binaryBlobSize: { min: 100_000, max: 5_000_000 },
  branchCount: 20,
  commitsPerBranch: { min: 5, max: 15 },
  submodules: [
    "https://github.com/supabase/supabase-js.git",
    "https://github.com/supabase/auth-helpers.git",
    "https://github.com/supabase/realtime-js.git",
  ],
  forceMain: false,
};
