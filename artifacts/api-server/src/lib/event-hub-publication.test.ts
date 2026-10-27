import { afterEach, it, expect, vi } from "vitest";
import {
  DEFAULT_PRIVACY_POLICY,
  PRIVACY_PURPOSES,
  type PrivacyPolicy,
} from "@workspace/api-zod";
import {
  policyCompletionIssue,
  policyFingerprint,
  publicationPolicyIssue,
} from "./event-hub-publication.js";
afterEach(() => vi.unstubAllEnvs());
const policy = (): PrivacyPolicy => ({
  ...DEFAULT_PRIVACY_POLICY,
  status: "approved",
  policyVersion: "fixture-v1",
  controllerName: "격리 주체",
  contact: "example.invalid",
  notice: "확정 합성 원문",
  backupProcedure: "백업 만료 후 삭제, 분쟁 보류 별도",
  rules: Object.fromEntries(
    PRIVACY_PURPOSES.map((k) => [
      k,
      { days: 30, basis: "합성 검사 목적·예외" },
    ]),
  ) as PrivacyPolicy["rules"],
});
it("requires actual complete policy, its approval and separate exact-release consent", () => {
  const p = policy();
  expect(policyCompletionIssue(DEFAULT_PRIVACY_POLICY)).toBeTruthy();
  expect(publicationPolicyIssue(p, {})).toBeTruthy();
  expect(
    publicationPolicyIssue(
      { ...p, status: "draft" },
      {
        EVENT_HUB_PRODUCTION_RELEASE: "approved-v6",
        EVENT_HUB_RELEASE_POLICY_SHA256: policyFingerprint(p),
      },
    ),
  ).toBeTruthy();
  expect(
    publicationPolicyIssue(p, {
      EVENT_HUB_PRODUCTION_RELEASE: "approved-v6",
      EVENT_HUB_RELEASE_POLICY_SHA256: policyFingerprint(p),
    }),
  ).toBeNull();
});
it("policy amendments invalidate release instead of silently changing the approved notice", () => {
  const p = policy(),
    env = {
      EVENT_HUB_PRODUCTION_RELEASE: "approved-v6",
      EVENT_HUB_RELEASE_POLICY_SHA256: policyFingerprint(p),
    };
  expect(
    publicationPolicyIssue({ ...p, notice: "다른 원문" }, env),
  ).toBeTruthy();
  expect(policyFingerprint({ ...p, revision: 100, updatedAt: "later" })).toBe(
    policyFingerprint(p),
  );
});
