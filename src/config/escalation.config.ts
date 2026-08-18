import type { CostTier } from "../models/types.js";

export interface EscalationConfig {
  /** If false, LLMService only ever tries the agent's starting tier (still
   * with provider fallback within that tier), never escalating. */
  enabled: boolean;
  /** Tier ladder, low to high. Escalation only ever moves forward through
   * this list starting from the agent's default/requested tier — it never
   * moves down. */
  tierOrder: CostTier[];
  /** Hard cap on total provider calls for a single LLMService.execute()
   * call, counted across every tier and every provider fallback combined.
   * This is what keeps a bad day from turning into an unbounded API bill —
   * it is intentionally conservative and must stay a small, explicit
   * number rather than "keep trying until something works". */
  maxAttemptsPerRequest: number;
}

export const escalationConfig: EscalationConfig = {
  enabled: true,
  tierOrder: ["low", "standard", "premium"],
  maxAttemptsPerRequest: 4,
};
