import { describe, expect, it } from "vitest";
import contract from "../releases/release-contract.json" with { type: "json" };
import { REQUIRED_ARTIFACT_KEYS, SOURCE_GATE_IDS } from "../scripts/release-candidate-receipt.mjs";

describe("release contract", () => {
  it("is the single declarative source for immutable receipt gates and artifact keys", () => {
    expect(SOURCE_GATE_IDS).toEqual(contract.candidateSourceGateIds);
    expect(REQUIRED_ARTIFACT_KEYS).toEqual(contract.releaseArtifactKeys);
    expect(contract.canonicalCommands).toEqual(["check", "check:pr", "check:full", "release:prepare", "verify:candidate", "release:publish-exact"]);
  });

  it("keeps exact publication and installer-only distribution fail-closed", () => {
    expect(contract.publication).toMatchObject({ requiresPublishEnvironment: "PUBLISH=1", requiresExactReceipt: true, requiresVerificationReport: true, buildOrRestageDuringPublication: false });
    expect(contract.itch).toEqual({ installerOnly: true, bootstrapperIsStableChannel: true });
    expect(contract.requiredEvidenceClasses).toEqual(expect.arrayContaining(["smoke-attestation", "punch-take-summary", "media-portability-summary", "vst3-host-summary", "game-pack"]));
  });
});
