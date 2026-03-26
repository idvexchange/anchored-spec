/**
 * Anchored Spec — File Watcher
 *
 * Shared watch utility for verify --watch, generate --watch, and drift --watch.
 * Watches specRoot and optionally sourceRoots for changes.
 */

import { watch } from "chokidar";
import chalk from "chalk";

export function watchSpecs(
  specDir: string,
  onChange: () => void | Promise<void>,
  label: string,
  sourceRoots?: string[],
): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const debouncedRun = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (running) return;
      running = true;
      console.log(chalk.dim(`\n[${new Date().toLocaleTimeString()}] Change detected, re-running ${label}...\n`));
      try {
        await onChange();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg) console.error(chalk.red(`  Error: ${msg}`));
      }
      running = false;
    }, 300);
  };

  const watchPaths = [specDir, ...(sourceRoots ?? [])];

  const watcher = watch(watchPaths, {
    ignoreInitial: true,
    ignored: ["**/generated/**", "**/.DS_Store", "**/node_modules/**", "**/dist/**"],
    persistent: true,
  });

  watcher.on("change", debouncedRun);
  watcher.on("add", debouncedRun);
  watcher.on("unlink", debouncedRun);

  const pathDesc = watchPaths.length > 1
    ? `${specDir} + ${sourceRoots!.length} source root(s)`
    : specDir;
  console.log(chalk.blue(`👀 Watching ${pathDesc} for changes... (Ctrl+C to stop)\n`));

  // Run once immediately
  onChange();
}
