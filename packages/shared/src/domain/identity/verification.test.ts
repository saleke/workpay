import { describe, expect, it } from "vitest";
import {
  isDisposableEmail,
  isPersonaIdentityVerified,
  validateEmailForRegistration,
  validateUsername,
} from "./verification.js";

describe("Identity and verification domain rules", () => {
  describe("Disposable Email Defense (Step 1)", () => {
    it("rejects known disposable and burner email domains", () => {
      expect(isDisposableEmail("test@mailinator.com")).toBe(true);
      expect(isDisposableEmail("user@guerrillamail.com")).toBe(true);
      expect(isDisposableEmail("bot@10minutemail.com")).toBe(true);
      expect(isDisposableEmail("burner@tempmail.com")).toBe(true);
      expect(isDisposableEmail("burner@trashmail.com")).toBe(true);
      expect(isDisposableEmail("burner@yopmail.com")).toBe(true);
    });

    it("accepts legitimate institutional and personal domains", () => {
      expect(isDisposableEmail("aleke@gmail.com")).toBe(false);
      expect(isDisposableEmail("engineer@anthropic.com")).toBe(false);
      expect(isDisposableEmail("lead@openai.com")).toBe(false);
      expect(isDisposableEmail("contractor@company.co.uk")).toBe(false);
    });

    it("validates email formatting and returns clear error message on disposable domain", () => {
      const invalidSyntax = validateEmailForRegistration("notanemail");
      expect(invalidSyntax.ok).toBe(false);
      expect(invalidSyntax.message).toContain("valid email address");

      const disposableResult = validateEmailForRegistration("evaluator@mailinator.com");
      expect(disposableResult.ok).toBe(false);
      expect(disposableResult.message).toContain("Disposable and temporary email addresses are not permitted");

      const validResult = validateEmailForRegistration("sarah.dev@company.org");
      expect(validResult.ok).toBe(true);
      expect(validResult.message).toBeUndefined();
    });
  });

  describe("Username Handle Enforcement", () => {
    it("validates valid platform username handles", () => {
      expect(validateUsername("aleke").ok).toBe(true);
      expect(validateUsername("sarah_dev").ok).toBe(true);
      expect(validateUsername("data-specialist").ok).toBe(true);
      expect(validateUsername("agent_007").ok).toBe(true);
    });

    it("rejects handles that are too short or too long", () => {
      expect(validateUsername("al").ok).toBe(false);
      expect(validateUsername("a".repeat(31)).ok).toBe(false);
    });

    it("rejects handles with invalid symbols or punctuation", () => {
      expect(validateUsername("user@name").ok).toBe(false);
      expect(validateUsername("user.name").ok).toBe(false);
      expect(validateUsername("-leadinghyphen").ok).toBe(false);
      expect(validateUsername("trailinghyphen-").ok).toBe(false);
      expect(validateUsername("spaces in handle").ok).toBe(false);
    });
  });

  describe("Persona verification provenance", () => {
    it("recognizes only provider-approved Persona identity states", () => {
      expect(isPersonaIdentityVerified("VERIFIED", "PERSONA")).toBe(true);
      expect(isPersonaIdentityVerified("VERIFIED", null)).toBe(false);
      expect(isPersonaIdentityVerified("VERIFIED", "LEGACY")).toBe(false);
      expect(isPersonaIdentityVerified("UNVERIFIED", "PERSONA")).toBe(false);
    });
  });
});
