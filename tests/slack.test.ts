import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @slack/bolt entirely so tests never touch the network or require
// real Slack credentials. We capture the handlers registered via
// app.event()/app.message() so we can invoke them directly.
const handlers: { appMention?: Function; message?: Function } = {};

vi.mock("@slack/bolt", () => {
  class FakeApp {
    constructor(_opts: unknown) {}
    event(name: string, handler: Function) {
      if (name === "app_mention") handlers.appMention = handler;
    }
    message(handler: Function) {
      handlers.message = handler;
    }
    async start() {
      return Promise.resolve();
    }
  }
  return { default: { App: FakeApp } };
});

const { buildSlackApp } = await import("../src/app/slackApp.js");
const { createLogger } = await import("../src/app/logger.js");

function fakeLinda(response: { taskId: string; status: "completed"; message: string }) {
  return { handleRequest: vi.fn().mockResolvedValue(response) } as any;
}

describe("Slack interface (mocked)", () => {
  beforeEach(() => {
    handlers.appMention = undefined;
    handlers.message = undefined;
  });

  it("normalizes an app_mention event and delegates to Linda, never doing routing itself", async () => {
    const linda = fakeLinda({ taskId: "t1", status: "completed", message: "here you go" });
    buildSlackApp({ botToken: "xoxb-test", appToken: "xapp-test" }, linda, createLogger("error"));

    const say = vi.fn();
    await handlers.appMention!({
      event: { text: "<@U123> Research the latest AI news", user: "U-human", ts: "123.456" },
      say,
    });

    expect(linda.handleRequest).toHaveBeenCalledWith("Research the latest AI news", "U-human");
    expect(say).toHaveBeenCalledWith({ text: "here you go", thread_ts: "123.456" });
  });

  it("normalizes a direct message and delegates to Linda", async () => {
    const linda = fakeLinda({ taskId: "t2", status: "completed", message: "done" });
    buildSlackApp({ botToken: "xoxb-test", appToken: "xapp-test" }, linda, createLogger("error"));

    const say = vi.fn();
    await handlers.message!({
      message: { text: "Help me organize tomorrow", user: "U-human", channel_type: "im" },
      say,
    });

    expect(linda.handleRequest).toHaveBeenCalledWith("Help me organize tomorrow", "U-human");
    expect(say).toHaveBeenCalledWith({ text: "done" });
  });

  it("ignores message subtypes (e.g. edits) rather than treating them as new requests", async () => {
    const linda = fakeLinda({ taskId: "t3", status: "completed", message: "n/a" });
    buildSlackApp({ botToken: "xoxb-test", appToken: "xapp-test" }, linda, createLogger("error"));

    const say = vi.fn();
    await handlers.message!({
      message: { subtype: "message_changed", channel_type: "im" },
      say,
    });

    expect(linda.handleRequest).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
  });
});
