import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    agents: [
      {
        id: "jarvis",
        name: "Jarvis",
        description: "CTO/COO Agent - all tasks",
        capabilities: ["code", "research", "files", "gateway", "chat", "tasks", "projects", "quick-reply"],
        status: "online",
      },
      {
        id: "harvey",
        name: "Harvey",
        description: "CSQO Agent - strategy and quality",
        capabilities: ["code", "research", "files", "gateway", "chat", "tasks", "projects", "quick-reply"],
        status: "online",
      },
    ],
  });
}
