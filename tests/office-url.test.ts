import { describe, expect, it } from "vitest";
import {
  buildOfficeWebviewUrl,
  withOfficePath,
} from "../src/renderer/src/screens/Office/officeUrl";

describe("Office webview URL", () => {
  it("opens the local Office route directly", () => {
    expect(buildOfficeWebviewUrl(null, 3000)).toBe(
      "http://localhost:3000/office",
    );
  });

  it("opens a remote origin at the Office route", () => {
    expect(buildOfficeWebviewUrl("http://office.example.com:3000", 3000)).toBe(
      "http://office.example.com:3000/office",
    );
  });

  it("does not rewrite remote URLs that already include a path", () => {
    expect(
      buildOfficeWebviewUrl("http://office.example.com:3000/custom", 3000),
    ).toBe("http://office.example.com:3000/custom");
  });

  it("preserves query strings and hashes when adding /office", () => {
    expect(withOfficePath("http://localhost:3000?debug=1#top")).toBe(
      "http://localhost:3000/office?debug=1#top",
    );
  });

  it("leaves invalid URLs unchanged", () => {
    expect(withOfficePath("not a url")).toBe("not a url");
  });
});
