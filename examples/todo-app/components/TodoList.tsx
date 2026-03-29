"use client";

import { useEffect, useState, useCallback } from "react";
import { Todo, TodoFilter } from "@/lib/types";
import TodoItem from "./TodoItem";

interface TodoListProps {
  filter: TodoFilter;
  refreshKey: number;
  onRefresh: () => void;
}

export default function TodoList({
  filter,
  refreshKey,
  onRefresh,
}: TodoListProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTodos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.status) params.set("status", filter.status);
      if (filter.priority) params.set("priority", filter.priority);
      if (filter.category) params.set("category", filter.category);
      if (filter.search) params.set("search", filter.search);

      const res = await fetch(`/api/todos?${params.toString()}`);
      const data = await res.json();
      setTodos(data.todos);
    } catch (err) {
      console.error("Failed to fetch todos:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos, refreshKey]);

  async function archiveCompleted() {
    const completedIds = todos
      .filter((t) => t.status === "completed")
      .map((t) => t.id);

    if (completedIds.length === 0) return;

    await Promise.all(
      completedIds.map((id) =>
        fetch(`/api/todos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "archived" }),
        })
      )
    );
    onRefresh();
  }

  async function completeAll() {
    const actionableIds = todos
      .filter((t) => t.status === "pending" || t.status === "in-progress")
      .map((t) => t.id);

    if (actionableIds.length === 0) return;

    await Promise.all(
      actionableIds.map((id) =>
        fetch(`/api/todos/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "completed" }),
        })
      )
    );
    onRefresh();
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-400">
        Loading todos...
      </div>
    );
  }

  if (todos.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
        <p className="text-lg mb-1">No todos found</p>
        <p>
          {filter.search || filter.status || filter.priority || filter.category
            ? "Try adjusting your filters"
            : "Add your first todo above"}
        </p>
      </div>
    );
  }

  const hasCompletable = todos.some(
    (t) => t.status === "pending" || t.status === "in-progress"
  );
  const hasCompleted = todos.some((t) => t.status === "completed");

  return (
    <div className="space-y-3">
      {/* Bulk actions */}
      {(hasCompletable || hasCompleted) && (
        <div className="flex gap-2 justify-end">
          {hasCompletable && (
            <button
              onClick={completeAll}
              className="rounded-md border border-green-300 px-3 py-1 text-xs font-medium
                text-green-700 hover:bg-green-50
                dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
            >
              Complete All
            </button>
          )}
          {hasCompleted && (
            <button
              onClick={archiveCompleted}
              className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium
                text-zinc-600 hover:bg-zinc-50
                dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Archive Completed
            </button>
          )}
        </div>
      )}

      {/* Todo items */}
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} onUpdate={onRefresh} />
      ))}
    </div>
  );
}
