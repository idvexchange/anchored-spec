"use client";

import { TodoStats as TodoStatsType } from "@/lib/types";

interface TodoStatsProps {
  stats: TodoStatsType;
}

export default function TodoStats({ stats }: TodoStatsProps) {
  const completionRate =
    stats.total > 0
      ? Math.round(((stats.completed + stats.archived) / stats.total) * 100)
      : 0;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/50">
      {/* Total */}
      <div className="flex items-center gap-1.5">
        <span className="font-semibold">{stats.total}</span>
        <span className="text-zinc-500 dark:text-zinc-400">total</span>
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />

      {/* Status breakdown */}
      <div className="flex items-center gap-3">
        <StatChip color="bg-zinc-400" label="Pending" count={stats.pending} />
        <StatChip
          color="bg-blue-500"
          label="In Progress"
          count={stats.inProgress}
        />
        <StatChip
          color="bg-green-500"
          label="Done"
          count={stats.completed}
        />
        <StatChip
          color="bg-zinc-300 dark:bg-zinc-600"
          label="Archived"
          count={stats.archived}
        />
      </div>

      {/* Divider */}
      <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />

      {/* Completion rate */}
      <div className="flex items-center gap-1.5">
        <span className="font-semibold">{completionRate}%</span>
        <span className="text-zinc-500 dark:text-zinc-400">complete</span>
      </div>

      {/* Overdue */}
      {stats.overdue > 0 && (
        <>
          <div className="h-4 w-px bg-zinc-300 dark:bg-zinc-600" />
          <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
            <span className="font-semibold">{stats.overdue}</span>
            <span>overdue</span>
          </div>
        </>
      )}

      {/* Priority distribution */}
      <div className="ml-auto flex items-center gap-1">
        <span className="mr-1 text-xs text-zinc-400">Priority:</span>
        <span
          className="inline-block h-3 rounded-sm bg-red-500"
          style={{ width: `${Math.max(stats.byPriority.urgent * 8, 2)}px` }}
          title={`Urgent: ${stats.byPriority.urgent}`}
        />
        <span
          className="inline-block h-3 rounded-sm bg-orange-500"
          style={{ width: `${Math.max(stats.byPriority.high * 8, 2)}px` }}
          title={`High: ${stats.byPriority.high}`}
        />
        <span
          className="inline-block h-3 rounded-sm bg-yellow-500"
          style={{ width: `${Math.max(stats.byPriority.medium * 8, 2)}px` }}
          title={`Medium: ${stats.byPriority.medium}`}
        />
        <span
          className="inline-block h-3 rounded-sm bg-green-500"
          style={{ width: `${Math.max(stats.byPriority.low * 8, 2)}px` }}
          title={`Low: ${stats.byPriority.low}`}
        />
      </div>
    </div>
  );
}

function StatChip({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      <span className="text-zinc-500 dark:text-zinc-400">
        {count} {label}
      </span>
    </div>
  );
}
