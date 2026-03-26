"use client";

import { useState } from "react";

export function TodoInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onAdd(value);
      setValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What needs to be done?"
        className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm
                   placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none
                   dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white
                   hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Add
      </button>
    </form>
  );
}
