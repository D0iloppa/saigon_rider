import type { MiddlewareHandler } from "hono";
import { apiFailure } from "@repo/shared/http";
import { getAuth, toAuthSession, toAuthUser, type AuthSession, type AuthUser } from "../_core/auth";
import { DatabaseError } from "../_core/db";
import { publicApiPrefixes } from "../_core/route-registry";

declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser | null;
    session: AuthSession | null;
  }
}

// Public prefixes are computed from the route registry: better-auth's prefix
// plus every route module that declared `isPublic = true`. A route opts itself
// out of session auth — nothing to maintain here.
export const PUBLIC_API_PREFIXES = publicApiPrefixes;

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const withSession: MiddlewareHandler = async (c, next) => {
  if (isPublicApiPath(new URL(c.req.url).pathname)) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    c.set("user", null);
    c.set("session", null);
    await next();
    return;
  }

  let betterAuthSession;
  try {
    betterAuthSession = await getAuth().api.getSession({
      headers: new Headers({
        Authorization: authorization
      })
    });
  } catch (error) {
    if (error instanceof DatabaseError) {
      return c.json(apiFailure(error.code, error.message), error.status === 503 ? 503 : 502);
    }

    throw error;
  }

  c.set("user", toAuthUser(betterAuthSession));
  c.set("session", toAuthSession(betterAuthSession));

  await next();
};
