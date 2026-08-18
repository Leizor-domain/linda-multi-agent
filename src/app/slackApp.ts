import pkg from "@slack/bolt";
const { App } = pkg;
import type { LindaOrchestrator } from "../core/orchestrator.js";
import type { Logger } from "./logger.js";

export interface SlackConfig {
  botToken: string;
  appToken: string;
}

/**
 * Slack is only an interface. This file must never contain routing logic,
 * agent logic, or tool execution logic — it normalizes Slack events into a
 * plain (text, userId) pair and hands off to LindaOrchestrator.
 */
export function buildSlackApp(config: SlackConfig, linda: LindaOrchestrator, logger: Logger) {
  const app = new App({
    token: config.botToken,
    appToken: config.appToken,
    socketMode: true,
  });

  app.event("app_mention", async ({ event, say }) => {
    const text = stripMention(event.text);
    logger.info({ event: "slack_app_mention", user: event.user });
    const response = await linda.handleRequest(text, event.user ?? "unknown-user");
    await say({ text: response.message, thread_ts: event.ts });
  });

  app.message(async ({ message, say }) => {
    // Only handle plain user DMs/messages with text; ignore edits, bot
    // messages, and other subtypes.
    if ("subtype" in message && message.subtype) return;
    if (!("text" in message) || !message.text) return;
    if (!("user" in message) || !message.user) return;

    logger.info({ event: "slack_message", user: message.user, channelType: message.channel_type });
    const response = await linda.handleRequest(message.text, message.user);
    await say({ text: response.message });
  });

  return app;
}

function stripMention(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/<@[^>]+>\s*/g, "").trim();
}
