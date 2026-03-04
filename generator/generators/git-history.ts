import fs from "fs";
import path from "path";
import { simpleGit, type SimpleGit } from "simple-git";
import type { GeneratorConfig } from "../config.js";
import { initRandom, getFaker, pick, pickN, randInt, randomBytes, snakeId } from "../utils/random.js";
import { timestampToDate } from "../utils/timestamp.js";

// --- Safety Checks ---

async function checkSafety(git: SimpleGit, config: GeneratorConfig): Promise<void> {
  const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
  if ((branch.trim() === "main" || branch.trim() === "master") && !config.forceMain) {
    throw new Error(
      `Refusing to modify git history on '${branch.trim()}' branch. ` +
      `Use --force to override, or switch to a feature branch.`
    );
  }
}

// --- Binary Blobs ---

async function addBinaryBlobs(
  git: SimpleGit,
  config: GeneratorConfig,
  projectRoot: string
): Promise<string[]> {
  const blobDir = path.join(projectRoot, "assets", "blobs");
  fs.mkdirSync(blobDir, { recursive: true });

  const blobFiles: string[] = [];

  for (let i = 0; i < config.binaryBlobCount; i++) {
    const size = randInt(config.binaryBlobSize.min, config.binaryBlobSize.max);
    const ext = pick([".bin", ".dat", ".bak", ".dump", ".raw"]);
    const filename = `blob_${String(i).padStart(3, "0")}${ext}`;
    const filePath = path.join(blobDir, filename);

    // Generate random binary content
    const content = randomBytes(size);
    fs.writeFileSync(filePath, content);
    blobFiles.push(path.relative(projectRoot, filePath));

    const date = timestampToDate(i * 5);
    const dateStr = date.toISOString();

    await git.add(filePath);
    await git.commit(`chore: add binary asset ${filename} (${(size / 1024).toFixed(0)}KB)`, {
      "--date": dateStr,
    });

    process.stdout.write(`  blobs: ${i + 1}/${config.binaryBlobCount}\r`);
  }

  // Remove some blobs in later commits to bloat .git/objects
  const toRemove = pickN(blobFiles, Math.ceil(blobFiles.length / 2));
  for (const file of toRemove) {
    const fullPath = path.join(projectRoot, file);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      await git.add(fullPath);
    }
  }

  if (toRemove.length > 0) {
    await git.commit(`chore: remove unused binary assets`);
  }

  // Cleanup empty dir if all blobs removed
  try {
    const remaining = fs.readdirSync(blobDir);
    if (remaining.length === 0) {
      fs.rmdirSync(blobDir);
      fs.rmdirSync(path.join(projectRoot, "assets"));
    }
  } catch {
    // ignore
  }

  console.log(`  blobs: ${config.binaryBlobCount} added, ${toRemove.length} removed`);
  return blobFiles;
}

// --- Feature Branches ---

async function createFeatureBranches(
  git: SimpleGit,
  config: GeneratorConfig,
  projectRoot: string
): Promise<void> {
  const f = getFaker();
  const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

  // Get list of existing migration files for modifications
  const migrationsDir = path.join(projectRoot, "supabase", "migrations");
  const migrationFiles = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))
    : [];

  const functionsDir = path.join(projectRoot, "supabase", "functions");
  const funcDirs = fs.existsSync(functionsDir)
    ? fs.readdirSync(functionsDir).filter((f) => f.startsWith("func-"))
    : [];

  const branchPrefixes = ["feature", "fix", "refactor", "chore", "experiment", "perf", "docs"];

  for (let b = 0; b < config.branchCount; b++) {
    const prefix = pick(branchPrefixes);
    const branchName = `${prefix}/${snakeId(3)}-${randInt(100, 999)}`;
    const commitCount = randInt(config.commitsPerBranch.min, config.commitsPerBranch.max);

    // Create branch from current HEAD
    await git.checkoutLocalBranch(branchName);

    for (let c = 0; c < commitCount; c++) {
      const date = timestampToDate(b * 20 + c);
      const dateStr = date.toISOString();

      const action = randInt(0, 3);

      switch (action) {
        case 0: {
          // Modify a migration file (add comment)
          if (migrationFiles.length > 0) {
            const file = pick(migrationFiles);
            const filePath = path.join(migrationsDir, file);
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, "utf-8");
              fs.writeFileSync(filePath, content + `\n-- Branch ${branchName} modification ${c}\n`);
              await git.add(filePath);
            }
          }
          break;
        }
        case 1: {
          // Add a new file in the branch
          const newFile = path.join(projectRoot, "docs", `${branchName.replace(/\//g, "_")}_${c}.md`);
          fs.mkdirSync(path.dirname(newFile), { recursive: true });
          fs.writeFileSync(newFile, `# ${branchName}\n\n${f.lorem.paragraphs(3)}\n`);
          await git.add(newFile);
          break;
        }
        case 2: {
          // Modify an edge function
          if (funcDirs.length > 0) {
            const funcDir = pick(funcDirs);
            const indexPath = path.join(functionsDir, funcDir, "index.ts");
            if (fs.existsSync(indexPath)) {
              const content = fs.readFileSync(indexPath, "utf-8");
              fs.writeFileSync(indexPath, content + `\n// Modified in branch ${branchName}\n`);
              await git.add(indexPath);
            }
          }
          break;
        }
        case 3: {
          // Add a config file
          const configFile = path.join(projectRoot, ".config", `${snakeId(2)}.json`);
          fs.mkdirSync(path.dirname(configFile), { recursive: true });
          fs.writeFileSync(
            configFile,
            JSON.stringify({
              branch: branchName,
              commit: c,
              settings: { enabled: f.datatype.boolean(), threshold: f.number.int(100) },
            }, null, 2)
          );
          await git.add(configFile);
          break;
        }
      }

      await git.commit(`${prefix}: ${f.git.commitMessage().toLowerCase()} (#${randInt(100, 9999)})`, {
        "--date": dateStr,
        "--allow-empty": null,
      });
    }

    // Switch back to the original branch
    await git.checkout(currentBranch);

    if (b % 5 === 0) {
      process.stdout.write(`  branches: ${b + 1}/${config.branchCount}\r`);
    }
  }

  console.log(`  branches: ${config.branchCount} created`);
}

// --- Submodules ---

async function addSubmodules(
  git: SimpleGit,
  config: GeneratorConfig,
  projectRoot: string
): Promise<void> {
  const vendorDir = "vendor";

  for (const repo of config.submodules) {
    const repoName = repo.split("/").pop()?.replace(".git", "") ?? "submodule";
    const subPath = `${vendorDir}/${repoName}`;

    try {
      await git.subModule(["add", "--depth", "1", repo, subPath]);
      await git.commit(`chore: add submodule ${repoName}`);
      console.log(`  submodule: added ${repoName}`);
    } catch (err) {
      console.warn(`  submodule: failed to add ${repoName}: ${err}`);
    }
  }
}

// --- Main ---

export async function generateGitHistory(config: GeneratorConfig): Promise<void> {
  initRandom(config.seed + 3000);

  const git = simpleGit(config.projectRoot);

  await checkSafety(git, config);

  // First, commit all generated files
  console.log("  Committing generated files...");
  await git.add(".");
  try {
    await git.commit("chore: add stress benchmark generated content");
  } catch {
    // May already be committed
  }

  // Add binary blobs
  console.log("  Adding binary blobs...");
  await addBinaryBlobs(git, config, config.projectRoot);

  // Create feature branches
  console.log("  Creating feature branches...");
  await createFeatureBranches(git, config, config.projectRoot);

  // Add submodules
  console.log("  Adding submodules...");
  await addSubmodules(git, config, config.projectRoot);

  // Final commit
  try {
    await git.add(".");
    await git.commit("chore: finalize stress benchmark setup");
  } catch {
    // ignore if nothing to commit
  }
}
