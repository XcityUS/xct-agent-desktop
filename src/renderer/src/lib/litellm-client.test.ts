import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  callChatCompletion,
  clearLiteLlmKey,
  getLiteLlmKey,
  listAllowedModels,
} from "./litellm-client";

const TOKENHUB = "https://tokenhub.xcity.one";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockBearer(token: string, expires_at: number): void {
  const stub = vi.fn().mockResolvedValue({ access_token: token, expires_at });
  // Use vi.stubGlobal so subsequent tests get a clean slate via vi.unstubAllGlobals.
  vi.stubGlobal("window", { hermesAPI: { litellmGetBearer: stub } });
}

beforeEach(() => {
  // Reset module-level cache between tests.
  clearLiteLlmKey();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("litellm-client", () => {
  it("getLiteLlmKey returns access_token from IPC and caches it", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    mockBearer("acc_1", farFuture);

    const k = await getLiteLlmKey();
    expect(k).toBe("acc_1");
    expect(window.hermesAPI.litellmGetBearer).toHaveBeenCalledTimes(1);

    const k2 = await getLiteLlmKey();
    expect(k2).toBe("acc_1");
    // Second call serves the in-memory cache, no second IPC.
    expect(window.hermesAPI.litellmGetBearer).toHaveBeenCalledTimes(1);
  });

  it("getLiteLlmKey re-fetches when cached token is within 60s of expiry", async () => {
    const nearExpiry = Math.floor(Date.now() / 1000) + 30; // 30s away → triggers re-fetch
    mockBearer("acc_old", nearExpiry);

    await getLiteLlmKey();

    // Swap the IPC mock to return a fresh token; the next call should hit IPC.
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    const fresh = vi
      .fn()
      .mockResolvedValue({ access_token: "acc_new", expires_at: farFuture });
    vi.stubGlobal("window", { hermesAPI: { litellmGetBearer: fresh } });

    const k = await getLiteLlmKey();
    expect(k).toBe("acc_new");
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it("getLiteLlmKey throws on { error } from IPC", async () => {
    const stub = vi.fn().mockResolvedValue({ error: "not-signed-in" });
    vi.stubGlobal("window", { hermesAPI: { litellmGetBearer: stub } });
    await expect(getLiteLlmKey()).rejects.toThrow(/not-signed-in/);
  });

  it("listAllowedModels calls /v1/models with bearer + parses ids", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    mockBearer("acc_1", farFuture);

    const fetchStub = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(200, {
          data: [
            { id: "tencent_cloud/deepseek-v3.2" },
            { id: "tencent_cloud/glm-5" },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchStub);

    const ids = await listAllowedModels();
    expect(ids).toEqual([
      "tencent_cloud/deepseek-v3.2",
      "tencent_cloud/glm-5",
    ]);
    expect(fetchStub).toHaveBeenCalledWith(
      `${TOKENHUB}/v1/models`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer acc_1" }),
      }),
    );
  });

  it("callChatCompletion clears cache + retries on 401, succeeds on 2nd attempt", async () => {
    const farFuture = Math.floor(Date.now() / 1000) + 3600;
    const ipc = vi
      .fn()
      .mockResolvedValueOnce({
        access_token: "acc_old",
        expires_at: farFuture,
      })
      .mockResolvedValueOnce({
        access_token: "acc_rotated",
        expires_at: farFuture,
      });
    vi.stubGlobal("window", { hermesAPI: { litellmGetBearer: ipc } });

    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: "rotated" }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          choices: [{ message: { role: "assistant", content: "ok" } }],
        }),
      );
    vi.stubGlobal("fetch", fetchStub);

    const res = (await callChatCompletion({
      model: "tencent_cloud/deepseek-v3.2",
      messages: [{ role: "user", content: "hi" }],
    })) as {
      choices: Array<{ message: { content: string } }>;
    };

    expect(res.choices[0].message.content).toBe("ok");
    // First attempt → 401 → cache cleared → 2nd IPC call → second fetch succeeds
    expect(ipc).toHaveBeenCalledTimes(2);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer acc_old",
    );
    expect(fetchStub.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer acc_rotated",
    );
  });
});
