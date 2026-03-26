import { describe, it, expect } from "vitest";
import { addTask, toggleTask, deleteTask, filterTasks } from "../tasks";
import type { TaskItem } from "../types";

// REQ-1: Add New Tasks
describe("REQ-1: Add New Tasks", () => {
  it("BS-1: adds a task with the given title and incomplete status", () => {
    const result = addTask([], "Buy groceries");
    expect(result).not.toBeNull();
    expect(result!).toHaveLength(1);
    expect(result![0]!.title).toBe("Buy groceries");
    expect(result![0]!.completed).toBe(false);
  });

  it("BS-2: rejects empty titles", () => {
    expect(addTask([], "")).toBeNull();
    expect(addTask([], "   ")).toBeNull();
  });
});

// REQ-2: Display Task List
describe("REQ-2: Display Task List", () => {
  it("BS-1: returns all tasks for display", () => {
    const tasks: TaskItem[] = [
      { id: "1", title: "Task A", completed: false },
      { id: "2", title: "Task B", completed: true },
    ];
    expect(filterTasks(tasks, "all")).toHaveLength(2);
  });

  it("BS-2: empty list returns empty array", () => {
    expect(filterTasks([], "all")).toHaveLength(0);
  });
});

// REQ-3: Toggle Task Completion
describe("REQ-3: Toggle Task Completion", () => {
  const tasks: TaskItem[] = [
    { id: "1", title: "Task", completed: false },
  ];

  it("BS-1: toggles incomplete to complete", () => {
    const result = toggleTask(tasks, "1");
    expect(result[0]!.completed).toBe(true);
  });

  it("BS-2: toggles complete back to incomplete", () => {
    const completed = toggleTask(tasks, "1");
    const result = toggleTask(completed, "1");
    expect(result[0]!.completed).toBe(false);
  });
});

// REQ-4: Delete Tasks
describe("REQ-4: Delete Tasks", () => {
  it("BS-1: removes the task from the list", () => {
    const tasks: TaskItem[] = [
      { id: "1", title: "Task A", completed: false },
      { id: "2", title: "Task B", completed: false },
    ];
    const result = deleteTask(tasks, "1");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("2");
  });

  it("BS-2: deleting the last task produces an empty list", () => {
    const tasks: TaskItem[] = [{ id: "1", title: "Only task", completed: false }];
    const result = deleteTask(tasks, "1");
    expect(result).toHaveLength(0);
  });
});

// REQ-5: Filter Tasks by Status
describe("REQ-5: Filter Tasks by Status", () => {
  const tasks: TaskItem[] = [
    { id: "1", title: "Active task", completed: false },
    { id: "2", title: "Done task", completed: true },
    { id: "3", title: "Another active", completed: false },
  ];

  it("BS-1: 'all' filter shows every task", () => {
    expect(filterTasks(tasks, "all")).toHaveLength(3);
  });

  it("BS-2: 'active' filter shows only incomplete tasks", () => {
    const result = filterTasks(tasks, "active");
    expect(result).toHaveLength(2);
    expect(result.every((t) => !t.completed)).toBe(true);
  });

  it("BS-3: 'completed' filter shows only complete tasks", () => {
    const result = filterTasks(tasks, "completed");
    expect(result).toHaveLength(1);
    expect(result[0]!.completed).toBe(true);
  });
});
