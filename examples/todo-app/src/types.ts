/** A single to-do task. */
export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
}

/** Filter modes for the task list. */
export type FilterMode = "all" | "active" | "completed";
