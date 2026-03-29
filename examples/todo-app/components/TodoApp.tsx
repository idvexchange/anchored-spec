"use client";

import { useState, useEffect, useCallback } from "react";
import { TodoFilter as TodoFilterType, TodoStats as TodoStatsType } from "@/lib/types";
import TodoStats from "./TodoStats";
import TodoFilter from "./TodoFilter";
import TodoInput from "./TodoInput";
import TodoList from "./TodoList";

export default function TodoApp() {
  const [filter, setFilter] = useState<TodoFilterType>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [stats, setStats] = useState<TodoStatsType | null>(null);
  const [showInput, setShowInput] = useState(false);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Fetch stats whenever refreshKey changes
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/todos");
        const data = await res.json();
        setStats(data.stats);
      } catch (err) {
        console.error("Failed to fetch stats:", err);
      }
    }
    fetchStats();
  }, [refreshKey]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Todo App</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          A full-stack Todo application — an{" "}
          <span className="font-medium text-blue-600 dark:text-blue-400">
            anchored-spec
          </span>{" "}
          EA example
        </p>
      </header>

      {/* Stats */}
      {stats && (
        <section aria-label="Statistics" className="mb-6">
          <TodoStats stats={stats} />
        </section>
      )}

      {/* Filters */}
      <section aria-label="Filters" className="mb-6">
        <TodoFilter filter={filter} onChange={setFilter} />
      </section>

      {/* Add Todo (collapsible) */}
      <section aria-label="Add todo" className="mb-6">
        <button
          onClick={() => setShowInput((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-dashed
            border-zinc-300 px-4 py-3 text-sm text-zinc-500 transition-colors
            hover:border-blue-400 hover:text-blue-600
            dark:border-zinc-600 dark:text-zinc-400
            dark:hover:border-blue-500 dark:hover:text-blue-400"
        >
          <span>{showInput ? "Hide form" : "+ Add a new todo"}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 transition-transform ${showInput ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {showInput && (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
            <TodoInput
              onCreated={() => {
                refresh();
                setShowInput(false);
              }}
            />
          </div>
        )}
      </section>

      {/* Todo List */}
      <section aria-label="Todos">
        <TodoList filter={filter} refreshKey={refreshKey} onRefresh={refresh} />
      </section>

      {/* Footer */}
      <footer className="mt-12 border-t border-zinc-200 pt-6 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
        Modeled with{" "}
        <span className="font-medium">anchored-spec EA</span>
      </footer>
    </div>
  );
}
