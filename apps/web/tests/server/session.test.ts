import { describe, expect, it } from "vitest";
import { getRequestSessionToken } from "../../src/lib/server/request-session";

const TAB_TOKEN = "a".repeat(64);
const COOKIE_TOKEN = "b".repeat(64);

describe("request session precedence", () => {
  it("uses the explicit tab session instead of the shared cookie", () => {
    const request = new Request("http://tenfo.test", {
      headers: {
        "x-workpay-session": TAB_TOKEN,
        cookie: `workpay_session=${COOKIE_TOKEN}`,
      },
    });
    expect(getRequestSessionToken(request)).toBe(TAB_TOKEN);
  });

  it("does not fall back to another tab's cookie after explicit sign-out", () => {
    const request = new Request("http://tenfo.test", {
      headers: {
        "x-workpay-session": "signed-out",
        cookie: `workpay_session=${COOKIE_TOKEN}`,
      },
    });
    expect(getRequestSessionToken(request)).toBeNull();
  });

  it("keeps a new tab unauthenticated when it supplies a tab nonce only", () => {
    const request = new Request("http://tenfo.test", {
      headers: {
        "x-workpay-tab": "c".repeat(64),
        cookie: `workpay_session=${COOKIE_TOKEN}`,
      },
    });
    expect(getRequestSessionToken(request)).toBeNull();
  });

  it("retains cookie fallback for non-tab-aware clients", () => {
    const request = new Request("http://tenfo.test", {
      headers: { cookie: `other=1; workpay_session=${COOKIE_TOKEN}; theme=dark` },
    });
    expect(getRequestSessionToken(request)).toBe(COOKIE_TOKEN);
  });
});
