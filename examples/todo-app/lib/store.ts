import {
  Todo,
  TodoStatus,
  Priority,
  Category,
  CreateTodoInput,
  UpdateTodoInput,
  TodoFilter,
  TodoStats,
  DEFAULT_CATEGORIES,
} from "./types";

class TodoStore {
  private static instance: TodoStore;
  private todos: Map<string, Todo> = new Map();
  private categories: Map<string, Category> = new Map();

  private constructor() {
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, cat);
    }
    this.seed();
  }

  static getInstance(): TodoStore {
    if (!TodoStore.instance) {
      TodoStore.instance = new TodoStore();
    }
    return TodoStore.instance;
  }

  private seed(): void {
    const now = new Date();

    const seeds: Array<Omit<Todo, "id" | "updatedAt"> & { id: string }> = [
      {
        id: crypto.randomUUID(),
        title: "Review quarterly report",
        description:
          "Go through the Q2 financial report and prepare summary for stakeholders",
        status: "in-progress",
        priority: "high",
        category: "work",
        dueDate: new Date(now.getTime() + 2 * 86400000)
          .toISOString()
          .split("T")[0],
        tags: ["finance", "review"],
        createdAt: new Date(now.getTime() - 3 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: "Buy groceries",
        description: "Milk, eggs, bread, vegetables, and fruit",
        status: "pending",
        priority: "medium",
        category: "shopping",
        dueDate: new Date(now.getTime() + 1 * 86400000)
          .toISOString()
          .split("T")[0],
        tags: ["errands"],
        createdAt: new Date(now.getTime() - 1 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: "Morning run",
        description: "5km run around the park",
        status: "completed",
        priority: "low",
        category: "health",
        tags: ["exercise", "routine"],
        createdAt: new Date(now.getTime() - 5 * 86400000).toISOString(),
        completedAt: new Date(now.getTime() - 4 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: "Fix production bug",
        description:
          "Users report login failures on the mobile app — investigate and patch",
        status: "pending",
        priority: "urgent",
        category: "work",
        dueDate: new Date(now.getTime() - 1 * 86400000)
          .toISOString()
          .split("T")[0], // overdue
        tags: ["bug", "mobile", "auth"],
        createdAt: new Date(now.getTime() - 2 * 86400000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        title: "Read TypeScript handbook",
        description: "Complete the advanced types chapter",
        status: "archived",
        priority: "low",
        category: "learning",
        tags: ["typescript", "study"],
        createdAt: new Date(now.getTime() - 14 * 86400000).toISOString(),
        completedAt: new Date(now.getTime() - 7 * 86400000).toISOString(),
      },
    ];

    for (const seed of seeds) {
      const todo: Todo = {
        ...seed,
        updatedAt: seed.completedAt ?? seed.createdAt,
      };
      this.todos.set(todo.id, todo);
    }
  }

  getAll(filter?: TodoFilter): Todo[] {
    let results = Array.from(this.todos.values());

    if (filter?.status) {
      results = results.filter((t) => t.status === filter.status);
    }
    if (filter?.priority) {
      results = results.filter((t) => t.priority === filter.priority);
    }
    if (filter?.category) {
      results = results.filter((t) => t.category === filter.category);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      results = results.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q))
      );
    }

    // Sort by createdAt descending (newest first)
    results.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return results;
  }

  getById(id: string): Todo | undefined {
    return this.todos.get(id);
  }

  create(input: CreateTodoInput): Todo {
    const now = new Date().toISOString();
    const todo: Todo = {
      id: crypto.randomUUID(),
      title: input.title,
      description: input.description,
      status: "pending",
      priority: input.priority ?? "medium",
      category: input.category,
      dueDate: input.dueDate,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.todos.set(todo.id, todo);
    return todo;
  }

  update(id: string, input: UpdateTodoInput): Todo | undefined {
    const todo = this.todos.get(id);
    if (!todo) return undefined;

    const now = new Date().toISOString();
    const updated: Todo = {
      ...todo,
      ...input,
      tags: input.tags ?? todo.tags,
      updatedAt: now,
    };

    // Track completion timestamp
    if (input.status === "completed" && todo.status !== "completed") {
      updated.completedAt = now;
    } else if (input.status && input.status !== "completed") {
      updated.completedAt = undefined;
    }

    this.todos.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    return this.todos.delete(id);
  }

  bulkUpdateStatus(ids: string[], status: TodoStatus): Todo[] {
    const updated: Todo[] = [];
    for (const id of ids) {
      const result = this.update(id, { status });
      if (result) updated.push(result);
    }
    return updated;
  }

  getStats(): TodoStats {
    const todos = Array.from(this.todos.values());
    const now = new Date();

    const stats: TodoStats = {
      total: todos.length,
      pending: 0,
      inProgress: 0,
      completed: 0,
      archived: 0,
      overdue: 0,
      byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
      byCategory: {},
    };

    for (const todo of todos) {
      // By status
      switch (todo.status) {
        case "pending":
          stats.pending++;
          break;
        case "in-progress":
          stats.inProgress++;
          break;
        case "completed":
          stats.completed++;
          break;
        case "archived":
          stats.archived++;
          break;
      }

      // Overdue: has a due date in the past and not completed/archived
      if (
        todo.dueDate &&
        new Date(todo.dueDate) < now &&
        todo.status !== "completed" &&
        todo.status !== "archived"
      ) {
        stats.overdue++;
      }

      // By priority
      stats.byPriority[todo.priority]++;

      // By category
      if (todo.category) {
        stats.byCategory[todo.category] =
          (stats.byCategory[todo.category] ?? 0) + 1;
      }
    }

    return stats;
  }

  getCategories(): Category[] {
    return Array.from(this.categories.values());
  }
}

export const store = TodoStore.getInstance();
