import { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { TodoFilter, TodoStatus, Priority } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const filter: TodoFilter = {};
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    if (status) filter.status = status as TodoStatus;
    if (priority) filter.priority = priority as Priority;
    if (category) filter.category = category;
    if (search) filter.search = search;

    const todos = store.getAll(filter);
    const stats = store.getStats();

    return NextResponse.json({ todos, stats });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch todos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const todo = store.create({
      title: body.title.trim(),
      description: body.description?.trim() || undefined,
      priority: body.priority || undefined,
      category: body.category || undefined,
      dueDate: body.dueDate || undefined,
      tags: body.tags || [],
    });

    return NextResponse.json(todo, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create todo" },
      { status: 500 }
    );
  }
}
