export type Priority = "low" | "medium" | "high" | "urgent";

export type TodoStatus = "pending" | "in-progress" | "completed" | "archived";

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface Todo {
  id: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: Priority;
  category?: string;
  dueDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type CreateTodoInput = {
  title: string;
  description?: string;
  priority?: Priority;
  category?: string;
  dueDate?: string;
  tags?: string[];
};

export type UpdateTodoInput = Partial<CreateTodoInput> & {
  status?: TodoStatus;
};

export interface TodoFilter {
  status?: TodoStatus;
  priority?: Priority;
  category?: string;
  search?: string;
}

export interface TodoStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  archived: number;
  overdue: number;
  byPriority: Record<Priority, number>;
  byCategory: Record<string, number>;
}

export const DEFAULT_CATEGORIES: Category[] = [
  { id: "work", name: "Work", color: "blue-500" },
  { id: "personal", name: "Personal", color: "green-500" },
  { id: "shopping", name: "Shopping", color: "amber-500" },
  { id: "health", name: "Health", color: "red-500" },
  { id: "learning", name: "Learning", color: "purple-500" },
];
