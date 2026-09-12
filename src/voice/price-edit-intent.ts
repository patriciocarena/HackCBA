// Mirrors ESCALATION_REASONS in PLAN.md section 4. Swap for an import from
// ../domain/types the moment A2 lands; it is one line and the values are identical.
export const ESCALATION_REASONS = [
  "no_match",
  "ambiguous",
  "missing_attribute",
  "out_of_catalog",
  "vat_question",
  "not_a_fact",
] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export type PriceChange =
  | { kind: "percent"; value: number }
  | { kind: "absolute"; amount: number };

export type PriceEditIntent =
  | {
      kind: "edit";
      target: string;
      direction: "raise" | "lower";
      change: PriceChange;
    }
  | { kind: "review"; reason: EscalationReason; detail: string };

export interface PriceEditExtractionPort {
  extract(transcript: string): Promise<PriceEditIntent>;
}

export function isActionable(
  intent: PriceEditIntent,
): intent is Extract<PriceEditIntent, { kind: "edit" }> {
  return intent.kind === "edit";
}
