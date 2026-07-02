import { describe, expect, it } from "vitest";
import { getHealthMessage } from "../../lib/health";

describe("getHealthMessage", () => {
  it("returns the default health message", () => {
    expect(getHealthMessage()).toBe("JobAI is healthy");
  });

  it("returns a customized health message", () => {
    expect(getHealthMessage("JobAI CI")).toBe("JobAI CI is healthy");
  });
});
