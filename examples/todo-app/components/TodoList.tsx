import type { TaskItem } from "@/lib/types";

export function TodoList({
  tasks,
  onToggle,
  onDelete,
}: {
  tasks: TaskItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (tasks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
        No tasks yet. Add one above!
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 py-3">
          <button
            onClick={() => onToggle(task.id)}
            className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors ${
              task.completed
                ? "border-emerald-500 bg-emerald-500"
                : "border-zinc-300 dark:border-zinc-600"
            }`}
            aria-label={task.completed ? "Mark incomplete" : "Mark complete"}
          >
            {task.completed && (
              <svg viewBox="0 0 20 20" className="text-white" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
          <span
            className={`flex-1 text-sm ${
              task.completed
                ? "text-zinc-400 line-through dark:text-zinc-500"
                : "text-zinc-900 dark:text-zinc-100"
            }`}
          >
            {task.title}
          </span>
          <button
            onClick={() => onDelete(task.id)}
            className="text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400"
            aria-label="Delete task"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  );
}
