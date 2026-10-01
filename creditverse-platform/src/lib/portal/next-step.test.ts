import { describe, expect, it } from "vitest";
import { nextStepLabel, nextStepTone } from "./next-step";

describe("the partner's next step", () => {
  it("is worded for a partner, never an internal status", () => {
    expect(nextStepLabel("waiting_for_results")).toBe("Waiting for bureau results");
    expect(nextStepLabel("waiting_on_client")).toBe("Waiting on the client");
    expect(nextStepLabel("waiting_on_partner")).toBe("Waiting on you");
    expect(nextStepLabel("in_progress")).toBe("BES is working on it");
    expect(nextStepLabel("completed")).toBe("Completed");
    expect(nextStepLabel(null)).toBe("Not started yet");
    expect(nextStepLabel("ROUND SENT - AWAITING RESULTS")).toBe("Not started yet");
  });
  it("tones waiting states amber and finished states green", () => {
    expect(nextStepTone("waiting_on_partner")).toBe("waiting");
    expect(nextStepTone("completed")).toBe("done");
    expect(nextStepTone("in_progress")).toBe("plain");
  });
});
