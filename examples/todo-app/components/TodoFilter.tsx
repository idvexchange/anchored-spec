"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { TodoFilter as TodoFilterType, DEFAULT_CATEGORIES } from "@/lib/types";

interface TodoFilterProps {
  filter: TodoFilterType;
  onChange: (filter: TodoFilterType) => void;
}

export default function TodoFilter({ filter, onChange }: TodoFilterProps) {
  const [searchInput, setSearchInput] = useState(filter.search ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitSearch = useCallback(
    (value: string) => {
      onChange({ ...filter, search: value || undefined });
    },
    [filter, onChange]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => emitSearch(searchInput), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput, emitSearch]);

  const hasFilters =
    filter.status || filter.priority || filter.category || filter.search;

  function clearAll() {
    setSearchInput("");
    onChange({});
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="flex-1 min-w-[200px]">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search todos..."
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm
            placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500
            dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500"
        />
      </div>

      {/* Status */}
      <select
        value={filter.status ?? ""}
        onChange={(e) =>
          onChange({
            ...filter,
            status: (e.target.value as TodoFilterType["status"]) || undefined,
          })
        }
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500
          dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="in-progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="archived">Archived</option>
      </select>

      {/* Priority */}
      <select
        value={filter.priority ?? ""}
        onChange={(e) =>
          onChange({
            ...filter,
            priority:
              (e.target.value as TodoFilterType["priority"]) || undefined,
          })
        }
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500
          dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="">All Priorities</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      {/* Category */}
      <select
        value={filter.category ?? ""}
        onChange={(e) =>
          onChange({ ...filter, category: e.target.value || undefined })
        }
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500
          dark:border-zinc-700 dark:bg-zinc-800"
      >
        <option value="">All Categories</option>
        {DEFAULT_CATEGORIES.map((cat) => (
          <option key={cat.id} value={cat.id}>
            {cat.name}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {hasFilters && (
        <button
          onClick={clearAll}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500
            hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
