import { describe, expect, it } from "vitest";

import { mcpHandlerFor } from "@/lib/mcp";

import {
  createProject,
  createTaskRow,
  createUser,
  type TestUser,
} from "./harness";

/**
 * Calls one tool on the MCP server as `who`, over the same Streamable HTTP
 * transport an agent uses. Authentication sits in front of this, in the
 * route (requireMcpAuth); here the user is already known.
 */
async function callTool(
  who: TestUser,
  name: string,
  args: Record<string, unknown> = {},
) {
  const response = await mcpHandlerFor(who.id)(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const body = await response.text();
  // The reply may come as a single server-sent event.
  const json = body.startsWith("{") ? body : body.match(/^data: (.*)$/m)?.[1];
  if (!json)
    throw new Error(`Unexpected MCP reply (${response.status}): ${body}`);
  const { result, error } = JSON.parse(json);
  if (error) throw new Error(error.message);
  const text: string = result.content[0].text;
  return result.isError ? { error: text } : { data: JSON.parse(text) };
}

describe("MCP tools", () => {
  it("only list a project's members and tasks to its members", async () => {
    const admin = await createUser("Admin");
    const outsider = await createUser("Outsider");
    const projectId = await createProject([[admin, "admin"]]);
    await createTaskRow(admin, { projectId });

    expect(
      (await callTool(admin, "list_project_members", { projectId })).data,
    ).toHaveLength(1);
    expect(
      (await callTool(admin, "list_tasks", { projectId })).data,
    ).toHaveLength(1);
    expect(
      await callTool(outsider, "list_project_members", { projectId }),
    ).toEqual({
      error: "You are not a member of this project",
    });
    expect(await callTool(outsider, "list_tasks", { projectId })).toEqual({
      error: "You are not a member of this project",
    });
    expect((await callTool(outsider, "list_tasks")).data).toEqual([]);
  });

  it("report refusals as tool errors an agent can read", async () => {
    const admin = await createUser("Admin");
    const outsider = await createUser("Outsider");
    const projectId = await createProject([[admin, "admin"]]);
    const taskId = await createTaskRow(admin, { projectId });

    expect(await callTool(outsider, "delete_task", { taskId })).toEqual({
      error: "Task not found",
    });
    expect(
      await callTool(admin, "create_task", {
        title: "x",
        projectId,
        assigneeIds: [outsider.id],
      }),
    ).toEqual({
      error: "Tasks can only be assigned to members of their project",
    });
  });

  it("speak calendar days for deadlines", async () => {
    const me = await createUser("Me");
    const created = await callTool(me, "create_task", {
      title: "Ship",
      deadline: "2026-09-15",
    });
    expect(created.data).toMatchObject({ title: "Ship" });

    const [task] = (await callTool(me, "list_tasks")).data;
    expect(task).toMatchObject({ title: "Ship", deadline: "2026-09-15" });
  });
});
