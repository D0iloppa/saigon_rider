<!-- scaffold-contract: v2 -->
# Agent Guide (Scaffold Contract)

Full-stack web app template. This file is the scaffold contract used by the lint contract check.

## Stack

- Package manager: `pnpm`
- Client: React 19, Vite, Tailwind CSS v4, shadcn/ui, react-router BrowserRouter
- Server: Hono, Better Auth, Drizzle ORM, libsql
- Shared: `@repo/shared/http`

## Project Map

- Pages: `apps/client/src/pages/`
- Client helpers: `apps/client/src/lib/`
- UI components: `apps/client/src/components/ui/`
- Server core: `apps/server/_core/`
- Routes: `apps/server/routes/`
- Services: `apps/server/services/`
- Drizzle schema: `apps/server/db/schema.ts`
- Migrations: `apps/server/migrations/`

## API Surface

Server exports mentioned by the scaffold contract: `getDb`, `executeSql`, `isDatabaseConfigured`, `checkDatabaseHealth`, `DatabaseError`, `getAuth`, `AuthUser`, `getPublicBaseUrl`, `env`, `withSession`, `apiSuccess`, `apiFailure`, `storagePut`, `storageGetForUser`, `storageDeleteForUser`, `storageGetByPath`, `storageGetDownloadUrl`, `storageErrorResponse`, `StoredFile`, `sendEmailVerificationCode`.

Client exports mentioned by the scaffold contract: `apiFetch`, `startThirdPartyGoogleAuth`, `syncAuthTokenFromUrl`, `apiUrl`, `authUrl`, `API_BASE_URL`, `authClient`, `getAuthToken`, `setAuthToken`, `clearAuthToken`, `syncAuthTokenFromResult`.

## Exemplar

`apps/server/migrations/001_init.sql`:

```sql
CREATE TABLE IF NOT EXISTS todos (
  id        TEXT    PRIMARY KEY,
  userId    TEXT    NOT NULL,
  title     TEXT    NOT NULL,
  done      INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_todos_userId ON todos (userId);
```

`apps/server/services/todos.ts`:

```ts
import { and, desc, eq } from "drizzle-orm";
import { DatabaseError, getDb } from "../_core/db";
import { todos } from "../db/schema";

export async function listTodos(userId: string) {
  return getDb().select().from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(desc(todos.updatedAt)).limit(100);
}

export async function createTodo(userId: string, input: { title: string }) {
  const rows = await getDb().insert(todos)
    .values({ userId, title: input.title, done: false }).returning();
  return rows[0];
}

export async function updateTodo(userId: string, id: string, input: { title?: string; done?: boolean }) {
  const rows = await getDb().update(todos)
    .set({ ...input, updatedAt: new Date().toISOString() })
    .where(and(eq(todos.id, id), eq(todos.userId, userId))).returning();
  if (!rows[0]) throw new DatabaseError("DATABASE_QUERY_FAILED", "Todo not found", 404);
  return rows[0];
}
```

`apps/server/routes/todos.route.ts`:

```ts
import { Hono, type Context } from "hono";
import { z } from "zod";
import { apiFailure, apiSuccess } from "@repo/shared/http";
import { DatabaseError } from "../_core/db";
import { createTodo, listTodos } from "../services/todos";

const CreateTodoSchema = z.object({ title: z.string().trim().min(1).max(200) });

export const todosRouter = new Hono();

todosRouter.get("/", async (c: Context) => {
  const user = c.var.user;
  if (!user) return c.json(apiFailure("UNAUTHORIZED", "Unauthorized"), 401);
  try {
    return c.json(apiSuccess({ todos: await listTodos(user.id) }), 200);
  } catch (error) {
    if (error instanceof DatabaseError)
      return c.json(apiFailure(error.code, error.message), error.status === 503 ? 503 : error.status === 404 ? 404 : 502);
    throw error;
  }
});

todosRouter.post("/", async (c: Context) => {
  const user = c.var.user;
  if (!user) return c.json(apiFailure("UNAUTHORIZED", "Unauthorized"), 401);
  const parsed = CreateTodoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json(apiFailure("INVALID_INPUT", "Title is required"), 400);
  return c.json(apiSuccess({ todo: await createTodo(user.id, parsed.data) }), 200);
});
```
