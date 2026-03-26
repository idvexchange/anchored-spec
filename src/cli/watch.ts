/**
 * Anchored Spec — File Watcher
 *
 * Shared watch utility for verify --watch and generate --watch.
 */

import { watch } from "chokidar";
import chalk from "chalk";

export function watchSpecs(
  specDir: string,
  onChange: () => void | Promise<void>,
  label: string
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
      } catch {
        // Errors are handled by the callback
      }
      running = false;
    }, 300);
  };

  const watcher = watch(specDir, {
    ignoreInitial: true,
    ignored: ["**/generated/**", "**/.DS_Store"],
    persistent: true,
  });

  watcher.on("change", debouncedRun);
  watcher.on("add", debouncedRun);
  watcher.on("unlink", debouncedRun);

  console.log(chalk.blue(`👀 Watching ${specDir} for changes... (Ctrl+C to stop)\n`));

  // Run once immediately
  onChange();
}
