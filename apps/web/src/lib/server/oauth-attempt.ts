import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { oauthAttempts } from "@workpay/shared/db/schema/identity";
import { AppError, newId, sha256Hex } from "@workpay/shared/platform";
import { getDb } from "./api";

export type BrowserOAuthProvider = "GOOGLE" | "GITHUB";

export async function createBrowserOAuthAttempt(input: {
  req: Request;
  provider: BrowserOAuthProvider;
  userId?: string | null;
  returnTo: string;
}): Promise<string> {
  const tabNonce = input.req.headers.get("x-workpay-tab");
  if (!tabNonce || !/^[a-f0-9]{64}$/.test(tabNonce)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "OAuth must be started from the Tenfo sign-in page in this browser tab.",
    );
  }
  const state = randomBytes(32).toString("base64url");
  await getDb()
    .insert(oauthAttempts)
    .values({
      id: newId("oauth"),
      provider: input.provider,
      stateHash: sha256Hex(state),
      intent: input.userId ? "LINK" : "SIGN_IN",
      userId: input.userId ?? null,
      tabNonceHash: sha256Hex(tabNonce),
      returnTo: input.returnTo,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });
  return state;
}

export async function consumeBrowserOAuthAttempt(
  provider: BrowserOAuthProvider,
  state: string | null,
): Promise<{
  intent: "SIGN_IN" | "LINK";
  userId: string | null;
  tabNonceHash: string;
  returnTo: string;
}> {
  if (!state || state.length > 256) {
    throw new AppError("AUTHORIZATION_ERROR", "OAuth state is missing or invalid.");
  }
  const [attempt] = await getDb()
    .update(oauthAttempts)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(oauthAttempts.provider, provider),
        eq(oauthAttempts.stateHash, sha256Hex(state)),
        isNull(oauthAttempts.consumedAt),
        gt(oauthAttempts.expiresAt, new Date()),
      ),
    )
    .returning({
      intent: oauthAttempts.intent,
      userId: oauthAttempts.userId,
      tabNonceHash: oauthAttempts.tabNonceHash,
      returnTo: oauthAttempts.returnTo,
    });
  if (!attempt || (attempt.intent !== "SIGN_IN" && attempt.intent !== "LINK")) {
    throw new AppError("AUTHORIZATION_ERROR", "OAuth attempt expired or was already used.");
  }
  return { ...attempt, intent: attempt.intent };
}
