import type { AgentCapabilityDescriptor } from "../models/types.js";

/**
 * Descriptor metadata for each built-in agent. Actual behavior lives in
 * src/agents/*.ts — this file is just the registration data, kept separate
 * so capabilities/tools aren't duplicated between config and code.
 */
export const agentDescriptors: Record<string, AgentCapabilityDescriptor> = {
  research: {
    id: "research",
    name: "Research Agent",
    description: "Web research, information gathering, summarization, comparison, fact gathering.",
    capabilities: ["research"],
    allowedTools: ["web_search"],
  },
  developer: {
    id: "developer",
    name: "Developer Agent",
    description: "Programming tasks, code analysis, debugging, repository work, technical investigation.",
    capabilities: ["development"],
    allowedTools: ["web_search", "filesystem", "shell"],
  },
  admin: {
    id: "admin",
    name: "Admin Agent",
    description: "Planning, organization, summarization, administrative reasoning.",
    capabilities: ["administration"],
    allowedTools: ["web_search"],
  },
};
