import crypto from "node:crypto";
import type { NextRequest } from "next/server";

function readRequestToken(request: NextRequest) {
  const bearer = request.headers.get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearer.slice("Bearer ".length);
  return request.headers.get("x-v4-token")
    || request.headers.get("x-worker-token")
    || request.headers.get("x-admin-token")
    || "";
}

function tokenMatches(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function isLocalEnvironment() {
  return process.env.NODE_ENV !== "production"
    && process.env.VERCEL !== "1"
    && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

export function isAuthorizedV4Request(request: NextRequest, envName: "V4_WORKER_TOKEN" | "V4_ADMIN_TOKEN") {
  const expected = process.env[envName];
  if (!expected) return isLocalEnvironment();
  return tokenMatches(readRequestToken(request), expected);
}
