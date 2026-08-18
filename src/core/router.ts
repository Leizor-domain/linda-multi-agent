import type { TaskCategory } from "../models/types.js";

/**
 * AgentRouter classifies a raw request string into a TaskCategory.
 *
 * Milestone 1 uses a deterministic keyword classifier. It's isolated behind
 * this single class specifically so it can be replaced or augmented with an
 * LLM-based classifier later without touching any other part of the system
 * (see RouteClassifier interface below).
 */
export interface RouteClassifier {
  classify(rawRequest: string): TaskCategory;
}

interface CategoryRule {
  category: TaskCategory;
  keywords: string[];
}

const RULES: CategoryRule[] = [
  {
    category: "development",
    keywords: [
      "code", "bug", "crash", "repo", "repository", "typescript", "javascript",
      "python", "function", "compile", "build failed", "stack trace", "debug",
      "api server", "deploy", "pull request", "pr ", "unit test", "refactor",
      "error message", "exception", "npm", "package.json",
    ],
  },
  {
    category: "research",
    keywords: [
      "research", "find out", "look up", "latest", "compare", "summarize",
      "summarise", "what is", "who is", "news about", "developments in",
      "state of the art", "survey", "gather information",
    ],
  },
  {
    category: "administration",
    keywords: [
      "organize", "organise", "prioritize", "prioritise", "priorities",
      "schedule", "plan my", "todo", "to-do", "agenda", "remind me",
      "help me organize", "checklist", "tomorrow",
    ],
  },
];

export class KeywordRouteClassifier implements RouteClassifier {
  classify(rawRequest: string): TaskCategory {
    const text = rawRequest.toLowerCase();

    let best: { category: TaskCategory; score: number } | null = null;
    for (const rule of RULES) {
      const score = rule.keywords.reduce(
        (acc, kw) => (text.includes(kw) ? acc + 1 : acc),
        0
      );
      if (score > 0 && (!best || score > best.score)) {
        best = { category: rule.category, score };
      }
    }
    return best?.category ?? "unknown";
  }
}

export class AgentRouter {
  constructor(private readonly classifier: RouteClassifier = new KeywordRouteClassifier()) {}

  route(rawRequest: string): TaskCategory {
    return this.classifier.classify(rawRequest);
  }
}
