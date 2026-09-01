import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import { appBaseURL, auth } from "@/lib/auth";
import {
  getProjectMembers,
  getProjectTasks,
  getUserProjects,
  getVisibleTasks,
  requireMembership,
} from "@/lib/data";
import {
  createProjectFor,
  createTaskFor,
  deleteTaskFor,
  updateTaskFor,
} from "@/lib/operations";
import type { TaskWithMeta } from "@/lib/types";

export const maxDuration = 60;

function json(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function toolError(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Something went wrong",
      },
    ],
    isError: true,
  };
}

function serializeTask(task: TaskWithMeta) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    done: task.done,
    deadline: task.deadline ? task.deadline.toISOString() : null,
    projectId: task.projectId,
    projectName: task.projectName,
    assignees: task.assignees.map((person) => ({
      id: person.id,
      name: person.name,
      email: person.email,
    })),
  };
}

function buildHandler(userId: string) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "list_projects",
        {
          description:
            "List the projects the user belongs to, with their role in each.",
          inputSchema: z.object({}),
        },
        async () => {
          const projects = await getUserProjects(userId);
          return json(
            projects.map(({ id, name, description, role }) => ({
              id,
              name,
              description,
              role,
            })),
          );
        },
      );

      server.registerTool(
        "list_project_members",
        {
          description:
            "List the members of a project (useful to find assignee ids).",
          inputSchema: z.object({
            projectId: z.string().describe("Project id"),
          }),
        },
        async ({ projectId }) => {
          try {
            await requireMembership(projectId, userId);
            const members = await getProjectMembers(projectId);
            return json(
              members.map(({ id, name, email, role }) => ({
                id,
                name,
                email,
                role,
              })),
            );
          } catch (error) {
            return toolError(error);
          }
        },
      );

      server.registerTool(
        "list_tasks",
        {
          description:
            "List tasks visible to the user. Optionally scope to one project and include completed tasks.",
          inputSchema: z.object({
            projectId: z
              .string()
              .optional()
              .describe("Only tasks of this project"),
            includeDone: z
              .boolean()
              .optional()
              .describe("Include completed tasks (default false)"),
          }),
        },
        async ({ projectId, includeDone }) => {
          try {
            let tasks: TaskWithMeta[];
            if (projectId) {
              await requireMembership(projectId, userId);
              tasks = await getProjectTasks(projectId);
            } else {
              tasks = await getVisibleTasks(userId);
            }
            if (!includeDone) tasks = tasks.filter((task) => !task.done);
            return json(tasks.map(serializeTask));
          } catch (error) {
            return toolError(error);
          }
        },
      );

      server.registerTool(
        "create_project",
        {
          description: "Create a new project. The user becomes its admin.",
          inputSchema: z.object({
            name: z.string().min(1),
            description: z.string().optional(),
          }),
        },
        async ({ name, description }) => {
          try {
            const project = await createProjectFor(userId, {
              name,
              description,
            });
            return json({ id: project.id, name: project.name });
          } catch (error) {
            return toolError(error);
          }
        },
      );

      server.registerTool(
        "create_task",
        {
          description:
            "Create a task, optionally in a project, with a deadline (ISO 8601 date) and assignee user ids.",
          inputSchema: z.object({
            title: z.string().min(1),
            description: z.string().optional(),
            projectId: z.string().optional(),
            deadline: z
              .string()
              .optional()
              .describe("ISO 8601 date, e.g. 2026-09-15"),
            assigneeIds: z.array(z.string()).optional(),
          }),
        },
        async (input) => {
          try {
            const task = await createTaskFor(userId, input);
            return json({ id: task.id, title: task.title });
          } catch (error) {
            return toolError(error);
          }
        },
      );

      server.registerTool(
        "update_task",
        {
          description:
            "Update a task. Only provided fields change. Set done to complete/reopen, deadline to null to clear it, projectId to move it.",
          inputSchema: z.object({
            taskId: z.string(),
            title: z.string().optional(),
            description: z.string().nullable().optional(),
            done: z.boolean().optional(),
            deadline: z
              .string()
              .nullable()
              .optional()
              .describe("ISO 8601 date, or null to clear"),
            projectId: z
              .string()
              .nullable()
              .optional()
              .describe("Target project id, or null for no project"),
            assigneeIds: z.array(z.string()).optional(),
          }),
        },
        async ({ taskId, ...patch }) => {
          try {
            const task = await updateTaskFor(userId, taskId, patch);
            return json({ id: task.id, title: task.title, done: task.done });
          } catch (error) {
            return toolError(error);
          }
        },
      );

      server.registerTool(
        "delete_task",
        {
          description: "Delete a task permanently.",
          inputSchema: z.object({ taskId: z.string() }),
        },
        async ({ taskId }) => {
          try {
            await deleteTaskFor(userId, taskId);
            return json({ deleted: true });
          } catch (error) {
            return toolError(error);
          }
        },
      );
    },
    {
      serverInfo: { name: "toodoo", version: "1.0.0" },
      instructions:
        "toodoo is a minimalist team todo app. Tasks are done or not done, can belong to a project, and can have a deadline and assignees. Use list_projects / list_project_members to resolve ids before writing.",
    },
  );
}

const handler = requireMcpAuth(
  auth,
  async (req, claims) => {
    const userId = String(claims.sub);
    return buildHandler(userId)(req);
  },
  {
    resource: `${appBaseURL}/api/mcp`,
    issuer: `${appBaseURL}/api/auth`,
    jwksUrl: `${appBaseURL}/api/auth/jwks`,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
