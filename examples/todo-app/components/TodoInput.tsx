"use client";

import { useState, FormEvent } from "react";
import { Priority, DEFAULT_CATEGORIES } from "@/lib/types";

interface TodoInputProps {
  onCreated: () => void;
}

export default function TodoInput({ onCreated }: TodoInputProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [category, setCategory] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          category: category || undefined,
          dueDate: dueDate || undefined,
          tags,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create todo");
      }

      // Reset form
      setTitle("");
      setDescription("");
      setPriority("medium");
      setCategory("");
      setDueDate("");
      setTagsInput("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="title" className="block text-sm font-medium mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm
            placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500
            dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500"
          required
        />
      </div>

      <div>
        <label
          htmlFor="description"
          className="block text-sm font-medium mb-1"
        >
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add some details..."
          rows={2}
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm
            placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500
            dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label
            htmlFor="priority"
            className="block text-sm font-medium mb-1"
          >
            Priority
          </label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500
              dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="category"
            className="block text-sm font-medium mb-1"
          >
            Category
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500
              dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">None</option>
            {DEFAULT_CATEGORIES.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="dueDate" className="block text-sm font-medium mb-1">
            Due Date
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500
              dark:border-zinc-700 dark:bg-zinc-800"
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium mb-1">
            Tags
          </label>
          <input
            id="tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="comma, separated"
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm
              placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500
              dark:border-zinc-700 dark:bg-zinc-800 dark:placeholder:text-zinc-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white
            hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            disabled:opacity-50 disabled:cursor-not-allowed
            dark:focus:ring-offset-zinc-900"
        >
          {submitting ? "Adding..." : "Add Todo"}
        </button>
      </div>
    </form>
  );
}
