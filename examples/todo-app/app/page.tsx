"use client";

import { useState } from "react";
import { TodoInput } from "@/components/TodoInput";
import { TodoList } from "@/components/TodoList";
import { TodoFilter } from "@/components/TodoFilter";
import { addTask, toggleTask, deleteTask, filterTasks } from "@/lib/tasks";
import type { TaskItem, FilterMode } from "@/lib/types";

export default function Home() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");

  const handleAdd = (title: string) => {
    const result = addTask(tasks, title);
    if (result) setTasks(result);
  };

  const handleToggle = (id: string) => {
    setTasks(toggleTask(tasks, id));
  };

  const handleDelete = (id: string) => {
    setTasks(deleteTask(tasks, id));
  };

  const visible = filterTasks(tasks, filter);
  const activeCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col gap-6 py-16 px-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          To-Do List
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {activeCount} {activeCount === 1 ? "task" : "tasks"} remaining
        </p>

        <TodoInput onAdd={handleAdd} />
        <TodoFilter current={filter} onChange={setFilter} />
        <TodoList
          tasks={visible}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}
