import { Hono, type Context } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { createTodo, deleteTodo, listTodos, updateTodo } from "../services/todos";

const CreateTodoSchema = z.object({
  title: z.string().trim().min(1).max(200)
});

const UpdateTodoSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  done: z.boolean().optional()
});

export const todosRouter = new Hono();

function unauthorized() {
  return apiFailure("UNAUTHORIZED", "Unauthorized");
}

function databaseStatus(error: DatabaseError) {
  if (error.status === 404) {
    return 404;
  }

  if (error.status === 503) {
    return 503;
  }

  return 502;
}

function invalidInput(message: string) {
  return apiFailure("INVALID_INPUT", message);
}

const listHandler = async (c: Context) => {
  const user = c.var.user;
  if (!user) {
    return c.json(unauthorized(), 401);
  }

  try {
    return c.json(apiSuccess({ todos: await listTodos(user.id) }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), databaseStatus(error));
    }
    throw error;
  }
};

const createHandler = async (c: Context) => {
  const user = c.var.user;
  if (!user) {
    return c.json(unauthorized(), 401);
  }

  const parsed = CreateTodoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(invalidInput("Title is required"), 400);
  }

  try {
    return c.json(apiSuccess({ todo: await createTodo(user.id, parsed.data) }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), databaseStatus(error));
    }
    throw error;
  }
};

todosRouter.get("", listHandler);
todosRouter.get("/", listHandler);
todosRouter.post("", createHandler);
todosRouter.post("/", createHandler);

todosRouter.patch("/:id", async (c) => {
  const user = c.var.user;
  if (!user) {
    return c.json(unauthorized(), 401);
  }

  const id = c.req.param("id");
  const parsed = UpdateTodoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(invalidInput("Invalid todo update"), 400);
  }

  if (parsed.data.title === undefined && parsed.data.done === undefined) {
    return c.json(invalidInput("At least one field is required"), 400);
  }

  try {
    return c.json(apiSuccess({ todo: await updateTodo(user.id, id, parsed.data) }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), databaseStatus(error));
    }
    throw error;
  }
});

todosRouter.delete("/:id", async (c) => {
  const user = c.var.user;
  if (!user) {
    return c.json(unauthorized(), 401);
  }

  const id = c.req.param("id");

  try {
    await deleteTodo(user.id, id);
    return c.json(apiSuccess({ id }), 200);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), databaseStatus(error));
    }
    throw error;
  }
});
