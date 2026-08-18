import type { Tool } from "./toolRegistry.js";

export interface WebSearchInput {
  query: string;
}

export interface WebSearchResult {
  query: string;
  results: Array<{ title: string; url: string; snippet: string }>;
  note: string;
}

/**
 * Adapter for web search. Milestone 1 ships a clean, honestly-labeled mock:
 * no external API key is wired in, and no results are fabricated as if they
 * were real. To go live, implement `search()` against a real provider
 * (Brave Search API, SerpAPI, Bing, etc.) and inject that instead — the
 * Tool interface and permission plumbing stay unchanged.
 */
export class WebSearchTool implements Tool<WebSearchInput, WebSearchResult> {
  name = "web_search" as const;
  description = "Search the web for information. Currently a documented mock — no live backend is configured.";

  async run(input: WebSearchInput): Promise<WebSearchResult> {
    if (!input?.query || typeof input.query !== "string") {
      throw new Error("web_search requires a non-empty 'query' string.");
    }
    return {
      query: input.query,
      results: [],
      note:
        "No live web search backend is configured for this Milestone 1 build. " +
        "This is a placeholder response, not fabricated search data. " +
        "Wire a real provider into WebSearchTool.run() to enable live results.",
    };
  }
}
