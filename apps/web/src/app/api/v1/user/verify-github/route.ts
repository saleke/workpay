import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb, jsonError, resolveActorAsync } from "@/lib/server/api";
import { logger } from "@workpay/shared/platform";
import { users, verificationTokens } from "@workpay/shared/db/schema/identity";

interface GitHubUserResponse {
  login: string;
  id: number;
  name?: string;
  bio?: string;
  avatar_url?: string;
  public_repos?: number;
  followers?: number;
  created_at?: string;
}

interface GitHubGistResponse {
  description?: string;
  files?: Record<string, { filename?: string; content?: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required to verify developer profile" }, 401);
    }

    const body = (await req.json()) as {
      action?: "challenge" | "confirm";
      githubUsername?: string;
    };

    const username = body.githubUsername?.trim().replace(/^@/, "");
    if (!username) {
      return jsonError({ code: "VALIDATION_ERROR", message: "A valid GitHub username is required" }, 400);
    }

    const action = body.action || "confirm";
    const identifier = `github_verify:${actor.id}:${username.toLowerCase()}`;
    const db = getDb();
    const now = new Date();

    if (action === "challenge") {
      const ghRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
        headers: {
          "User-Agent": "WorkPay-Verification/1.0",
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (ghRes.status === 404) {
        return jsonError({ code: "NOT_FOUND", message: `GitHub user '@${username}' does not exist` }, 404);
      }

      if (!ghRes.ok) {
        return jsonError({ code: "EXTERNAL_FAILURE", message: "Unable to communicate with GitHub API" }, 502);
      }

      const ghData = (await ghRes.json()) as GitHubUserResponse;
      if (ghData.created_at) {
        const createdDate = new Date(ghData.created_at);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
        if (createdDate > thirtyDaysAgo) {
          return jsonError(
            {
              code: "ACCOUNT_TOO_NEW",
              message: "GitHub account must be at least 30 days old to satisfy developer quality standards.",
            },
            400,
          );
        }
      }

      const challenge = `workpay-verify-${randomBytes(5).toString("hex")}`;
      const expires = new Date(Date.now() + 60 * 60 * 1000);

      await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));
      await db.insert(verificationTokens).values({
        identifier,
        token: challenge,
        expires,
      });

      return NextResponse.json({
        challenge,
        githubUsername: ghData.login,
        name: ghData.name || ghData.login,
        avatarUrl: ghData.avatar_url,
        publicRepos: ghData.public_repos ?? 0,
        followers: ghData.followers ?? 0,
        bio: ghData.bio || "",
        instructions: `Add the verification code '${challenge}' to your GitHub bio or create a public gist containing this code. Then click 'Confirm Verification'.`,
      });
    }

    const [tokenRecord] = await db
      .select()
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, identifier),
          gt(verificationTokens.expires, now),
        ),
      )
      .limit(1);

    if (!tokenRecord) {
      return jsonError(
        {
          code: "NO_ACTIVE_CHALLENGE",
          message: `No active verification challenge found for @${username}. Please generate a verification challenge first.`,
        },
        400,
      );
    }

    const expectedChallenge = tokenRecord.token;

    const ghUserRes = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: {
        "User-Agent": "WorkPay-Verification/1.0",
        Accept: "application/vnd.github.v3+json",
      },
      cache: "no-store",
    });

    if (!ghUserRes.ok) {
      return jsonError({ code: "EXTERNAL_FAILURE", message: "Failed to retrieve live profile from GitHub" }, 502);
    }

    const ghUserData = (await ghUserRes.json()) as GitHubUserResponse;
    const bioText = ghUserData.bio || "";
    let challengeFound = bioText.includes(expectedChallenge);

    if (!challengeFound) {
      const gistsRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(username)}/gists?per_page=5`,
        {
          headers: {
            "User-Agent": "WorkPay-Verification/1.0",
            Accept: "application/vnd.github.v3+json",
          },
          cache: "no-store",
        },
      );

      if (gistsRes.ok) {
        const gists = (await gistsRes.json()) as GitHubGistResponse[];
        for (const gist of gists) {
          if (gist.description?.includes(expectedChallenge)) {
            challengeFound = true;
            break;
          }
          if (gist.files) {
            for (const fileKey of Object.keys(gist.files)) {
              if (fileKey.includes("workpay") || fileKey.includes(expectedChallenge)) {
                challengeFound = true;
                break;
              }
            }
          }
        }
      }
    }

    if (!challengeFound) {
      return jsonError(
        {
          code: "CHALLENGE_NOT_FOUND",
          message: `Verification code '${expectedChallenge}' was not found in @${username}'s GitHub bio or public gists. Please ensure it is saved on GitHub and retry.`,
        },
        400,
      );
    }

    const actorId = actor.id;
    await db
      .update(users)
      .set({
        githubUsername: ghUserData.login,
        githubVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    await db.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier));

    logger.info(
      { userId: actorId, github: ghUserData.login, repos: ghUserData.public_repos },
      "successfully completed authentic github verification",
    );

    return NextResponse.json({
      success: true,
      githubUsername: ghUserData.login,
      publicRepos: ghUserData.public_repos ?? 0,
      followers: ghUserData.followers ?? 0,
      verifiedAt: new Date().toISOString(),
      message: `Successfully verified developer profile @${ghUserData.login}. Verified Developer status unlocked.`,
    });
  } catch (error) {
    logger.error({ err: String(error) }, "error verifying github profile");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to verify GitHub profile" }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const actor = await resolveActorAsync(req);
    if (!actor.id) {
      return jsonError({ code: "UNAUTHORIZED", message: "Sign in required" }, 401);
    }

    const db = getDb();
    const actorId = actor.id;

    await db
      .update(users)
      .set({
        githubUsername: null,
        githubVerifiedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, actorId));

    logger.info({ userId: actorId }, "unlinked verified github profile");

    return NextResponse.json({
      success: true,
      message: "GitHub developer profile disconnected successfully.",
    });
  } catch (error) {
    logger.error({ err: String(error) }, "error unlinking github profile");
    return jsonError({ code: "INTERNAL_ERROR", message: "Failed to disconnect GitHub profile" }, 500);
  }
}
