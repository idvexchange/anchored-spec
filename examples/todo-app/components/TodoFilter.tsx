import type { FilterMode } from "@/lib/types";

const filters: { label: string; value: FilterMode }[] = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Completed", value: "completed" },
];

export function TodoFilter({
  current,
  onChange,
}: {
  current: FilterMode;
  onChange: (mode: FilterMode) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
      {filters.map((f) => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            current === f.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
