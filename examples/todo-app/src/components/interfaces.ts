import type { TaskItem } from "../types";

/** Props for the TodoInput component. */
export interface TodoInput {
  onAdd: (title: string) => void;
}

/** Props for the TodoList component. */
export interface TodoList {
  tasks: TaskItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Props for the TodoFilter component. */
export interface TodoFilter {
  current: "all" | "active" | "completed";
  onChange: (mode: "all" | "active" | "completed") => void;
}
