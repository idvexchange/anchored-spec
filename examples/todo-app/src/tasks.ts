import type { TaskItem, FilterMode } from "./types";

let nextId = 1;

/** Create a new task with the given title. Returns null if title is empty. */
export function addTask(
  tasks: TaskItem[],
  title: string,
): TaskItem[] | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  return [...tasks, { id: String(nextId++), title: trimmed, completed: false }];
}

/** Toggle the completion state of a task. */
export function toggleTask(tasks: TaskItem[], id: string): TaskItem[] {
  return tasks.map((t) =>
    t.id === id ? { ...t, completed: !t.completed } : t,
  );
}

/** Delete a task by ID. */
export function deleteTask(tasks: TaskItem[], id: string): TaskItem[] {
  return tasks.filter((t) => t.id !== id);
}

/** Filter tasks by the given mode. */
export function filterTasks(
  tasks: TaskItem[],
  mode: FilterMode,
): TaskItem[] {
  switch (mode) {
    case "active":
      return tasks.filter((t) => !t.completed);
    case "completed":
      return tasks.filter((t) => t.completed);
    default:
      return tasks;
  }
}
