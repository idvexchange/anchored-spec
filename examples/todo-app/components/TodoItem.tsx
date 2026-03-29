"use client";

import { useState } from "react";
import { Todo, TodoStatus, DEFAULT_CATEGORIES } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  onUpdate: () => void;
}

const STATUS_CYCLE: TodoStatus[] = [
  "pending",
  "in-progress",
  "completed",
  "archived",
];

const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300",
  "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  archived: "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: "Pending",
  "in-progress": "In Progress",
  completed: "Completed",
  archived: "Archived",
};

export default function TodoItem({ todo, onUpdate }: TodoItemProps) {
  const [deleting, setDeleting] = useState(false);

  const categoryObj = DEFAULT_CATEGORIES.find((c) => c.id === todo.category);

  const isOverdue =
    todo.dueDate &&
    new Date(todo.dueDate) < new Date() &&
    todo.status !== "completed" &&
    todo.status !== "archived";

  async function cycleStatus() {
    const currentIdx = STATUS_CYCLE.indexOf(todo.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];

    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    onUpdate();
  }

  async function handleDelete() {
    if (!confirm("Delete this todo?")) return;
    setDeleting(true);
    try {
      await fetch(`/api/todos/${todo.id}`, { method: "DELETE" });
      onUpdate();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <article
      className={`rounded-lg border p-4 transition-colors
        ${todo.status === "archived" ? "opacity-60" : ""}
        border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-800/50`}
    >
      <div className="flex items-start gap-3">
        {/* Priority indicator */}
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_COLORS[todo.priority]}`}
          title={`${todo.priority} priority`}
        />

        <div className="min-w-0 flex-1">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className={`text-sm font-medium ${
                todo.status === "completed"
                  ? "line-through text-zinc-400 dark:text-zinc-500"
                  : ""
              }`}
            >
              {todo.title}
            </h3>

            {/* Status badge (clickable) */}
            <button
              onClick={cycleStatus}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                cursor-pointer transition-colors hover:opacity-80 ${STATUS_COLORS[todo.status]}`}
              title="Click to cycle status"
            >
              {STATUS_LABELS[todo.status]}
            </button>

            {/* Category tag */}
            {categoryObj && (
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                {categoryObj.name}
              </span>
            )}
          </div>

          {/* Description */}
          {todo.description && (
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {todo.description}
            </p>
          )}

          {/* Meta row */}
          <div className="mt-2 flex items-center gap-3 flex-wrap text-xs text-zinc-400 dark:text-zinc-500">
            {/* Due date */}
            {todo.dueDate && (
              <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                {isOverdue ? "⚠ Overdue: " : "Due: "}
                {todo.dueDate}
              </span>
            )}

            {/* Tags */}
            {todo.tags.length > 0 && (
              <div className="flex gap-1">
                {todo.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500
            dark:hover:bg-red-900/20 disabled:opacity-50"
          title="Delete todo"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
          >
            <path
              fillRule="evenodd"
              d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </article>
  );
}
