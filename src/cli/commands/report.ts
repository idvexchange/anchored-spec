/**
 * anchored-spec report — Traceability and coverage reporting
 *
 * Generates traceability matrices (REQ ↔ CHG ↔ ADR), coverage summaries,
 * status overviews, and dependency graphs.
 */

import { Command } from "commander";
import chalk from "chalk";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { SpecRoot, resolveConfig } from "../../core/loader.js";
import type { Requirement, Change, Decision } from "../../core/types.js";
import { CliError } from "../errors.js";

// ─── Report Data Structures ─────────────────────────────────────────────────────

interface TraceRow {
  reqId: string;
  reqTitle: string;
  reqStatus: string;
  reqPriority: string;
  linkedChanges: string[];
  linkedDecisions: string[];
  coverageStatus: string;
  testKinds: string[];
  dependsOn: string[];
}

interface ReportData {
  trace: TraceRow[];
  statusBreakdown: Record<string, number>;
  priorityBreakdown: Record<string, number>;
  coverageBreakdown: Record<string, number>;
  orphanChanges: string[];
  orphanDecisions: string[];
  totalRequirements: number;
  totalChanges: number;
  totalDecisions: number;
}

// ─── Report Building ────────────────────────────────────────────────────────────

function buildReport(
  requirements: Requirement[],
  changes: Change[],
  decisions: Decision[],
): ReportData {
  const statusBreakdown: Record<string, number> = {};
  const priorityBreakdown: Record<string, number> = {};
  const coverageBreakdown: Record<string, number> = {};
  const linkedChangeIds = new Set<string>();
  const linkedDecisionIds = new Set<string>();

  const trace: TraceRow[] = requirements.map((req) => {
    // Count statuses
    statusBreakdown[req.status] = (statusBreakdown[req.status] ?? 0) + 1;
    priorityBreakdown[req.priority] = (priorityBreakdown[req.priority] ?? 0) + 1;

    const coverage = req.verification?.coverageStatus ?? "none";
    coverageBreakdown[coverage] = (coverageBreakdown[coverage] ?? 0) + 1;

    // Find linked changes
    const reqChanges = changes
      .filter((c) => c.requirements?.includes(req.id))
      .map((c) => c.id);
    const fromActiveChanges = req.implementation?.activeChanges ?? [];
    const allChanges = [...new Set([...reqChanges, ...fromActiveChanges])];
    allChanges.forEach((id) => linkedChangeIds.add(id));

    // Find linked decisions
    const reqDecisions = decisions
      .filter((d) => d.relatedRequirements.includes(req.id))
      .map((d) => d.id);
    reqDecisions.forEach((id) => linkedDecisionIds.add(id));

    return {
      reqId: req.id,
      reqTitle: req.title,
      reqStatus: req.status,
      reqPriority: req.priority,
      linkedChanges: allChanges,
      linkedDecisions: reqDecisions,
      coverageStatus: coverage,
      testKinds: req.verification?.requiredTestKinds ?? [],
      dependsOn: req.dependsOn ?? [],
    };
  });

  const orphanChanges = changes
    .filter((c) => !linkedChangeIds.has(c.id) && c.status === "active")
    .map((c) => c.id);

  const orphanDecisions = decisions
    .filter((d) => !linkedDecisionIds.has(d.id))
    .map((d) => d.id);

  return {
    trace,
    statusBreakdown,
    priorityBreakdown,
    coverageBreakdown,
    orphanChanges,
    orphanDecisions,
    totalRequirements: requirements.length,
    totalChanges: changes.length,
    totalDecisions: decisions.length,
  };
}

// ─── Markdown Rendering ─────────────────────────────────────────────────────────

function renderMarkdown(data: ReportData): string {
  const lines: string[] = [];

  lines.push("# Anchored Spec — Traceability Report");
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`| :--- | ---: |`);
  lines.push(`| Requirements | ${data.totalRequirements} |`);
  lines.push(`| Changes | ${data.totalChanges} |`);
  lines.push(`| Decisions | ${data.totalDecisions} |`);
  lines.push("");

  // Status Breakdown
  lines.push("## Status Breakdown");
  lines.push("");
  lines.push(`| Status | Count |`);
  lines.push(`| :--- | ---: |`);
  for (const [status, count] of Object.entries(data.statusBreakdown).sort()) {
    lines.push(`| ${status} | ${count} |`);
  }
  lines.push("");

  // Priority Breakdown
  lines.push("## Priority Breakdown");
  lines.push("");
  lines.push(`| Priority | Count |`);
  lines.push(`| :--- | ---: |`);
  for (const [priority, count] of Object.entries(data.priorityBreakdown).sort()) {
    lines.push(`| ${priority} | ${count} |`);
  }
  lines.push("");

  // Coverage
  lines.push("## Test Coverage");
  lines.push("");
  lines.push(`| Coverage | Count |`);
  lines.push(`| :--- | ---: |`);
  for (const [cov, count] of Object.entries(data.coverageBreakdown).sort()) {
    lines.push(`| ${cov} | ${count} |`);
  }
  lines.push("");

  // Traceability Matrix
  lines.push("## Traceability Matrix");
  lines.push("");
  lines.push("| REQ | Status | Priority | Changes | Decisions | Coverage | Depends On |");
  lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |");
  for (const row of data.trace) {
    lines.push(
      `| ${row.reqId} | ${row.reqStatus} | ${row.reqPriority} | ${row.linkedChanges.join(", ") || "—"} | ${row.linkedDecisions.join(", ") || "—"} | ${row.coverageStatus} | ${row.dependsOn.join(", ") || "—"} |`,
    );
  }
  lines.push("");

  // Orphans
  if (data.orphanChanges.length > 0 || data.orphanDecisions.length > 0) {
    lines.push("## Orphaned Artifacts");
    lines.push("");
    if (data.orphanChanges.length > 0) {
      lines.push(`**Changes not linked to any requirement:** ${data.orphanChanges.join(", ")}`);
      lines.push("");
    }
    if (data.orphanDecisions.length > 0) {
      lines.push(`**Decisions not linked to any requirement:** ${data.orphanDecisions.join(", ")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ─── Command ────────────────────────────────────────────────────────────────────

export function reportCommand(): Command {
  const cmd = new Command("report")
    .description("Generate traceability and coverage reports")
    .option("--json", "Output as JSON")
    .option("--out <file>", "Write markdown report to file (default: specs/generated/report.md)")
    .action((opts: { json?: boolean; out?: string }) => {
      const projectRoot = process.cwd();
      const config = resolveConfig(projectRoot);
      const spec = new SpecRoot(projectRoot, config);

      if (!spec.isInitialized()) {
        throw new CliError("Error: Spec infrastructure not initialized. Run 'anchored-spec init' first.");
      }

      const requirements = spec.loadRequirements();
      const changes = spec.loadChanges();
      const decisions = spec.loadDecisions();
      const report = buildReport(requirements, changes, decisions);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      // Generate markdown
      const markdown = renderMarkdown(report);

      const outPath = opts.out ?? join(spec.generatedDir, "report.md");
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, markdown);

      // Console summary
      console.log(chalk.bold("\n📊 Report Generated\n"));
      console.log(`  Requirements: ${chalk.cyan(String(report.totalRequirements))}`);
      console.log(`  Changes:      ${chalk.cyan(String(report.totalChanges))}`);
      console.log(`  Decisions:    ${chalk.cyan(String(report.totalDecisions))}`);

      const missing = report.coverageBreakdown["none"] ?? 0;
      if (missing > 0) {
        console.log(`  No coverage:  ${chalk.yellow(String(missing))}`);
      }
      if (report.orphanChanges.length > 0) {
        console.log(
          `  Orphan CHGs:  ${chalk.yellow(String(report.orphanChanges.length))}`,
        );
      }

      console.log(`\n  Written to: ${chalk.dim(outPath)}\n`);
    });

  return cmd;
}
