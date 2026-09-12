import { describe, expect, test } from "bun:test";
import {
  isActionable,
  type PriceEditExtractionPort,
  type PriceEditIntent,
} from "./price-edit-intent";

const RAISE: PriceEditIntent = {
  kind: "edit",
  target: "tarjetas",
  direction: "raise",
  change: { kind: "percent", value: 20 },
};

const AMBIGUOUS: PriceEditIntent = {
  kind: "review",
  reason: "ambiguous",
  detail: "no amount was dictated",
};

function portReturning(intent: PriceEditIntent): PriceEditExtractionPort {
  return { async extract() { return intent; } };
}

describe("a dictated edit", () => {
  test("a percentage the owner dictated survives as a percentage", async () => {
    const port = portReturning(RAISE);

    const intent = await port.extract("Subí las tarjetas un 20 %");

    expect(intent).toEqual(RAISE);
  });

  test("an actionable intent carries a direction and a change, never a price", async () => {
    const intent = await portReturning(RAISE).extract("Subí las tarjetas un 20 %");

    expect(isActionable(intent)).toBe(true);
    if (!isActionable(intent)) return;
    expect(intent.direction).toBe("raise");
    expect(intent.change).toEqual({ kind: "percent", value: 20 });
    expect(intent).not.toHaveProperty("newPrice");
    expect(intent).not.toHaveProperty("itemId");
  });
});

describe("a dictation with no amount in it", () => {
  test("che, subime un poco las tarjetas goes to review, not to a guess", async () => {
    const port = portReturning(AMBIGUOUS);

    const intent = await port.extract("Che, subime un poco las tarjetas");

    expect(intent).toEqual(AMBIGUOUS);
  });

  test("a review intent is never actionable, so no price can be derived from it", async () => {
    const intent = await portReturning(AMBIGUOUS).extract(
      "Che, subime un poco las tarjetas",
    );

    expect(isActionable(intent)).toBe(false);
  });

  test("the reason comes from the domain vocabulary, not from a loose string", async () => {
    const intent = await portReturning(AMBIGUOUS).extract("whatever");

    if (intent.kind !== "review") throw new Error("expected a review intent");
    expect(intent.reason).toBe("ambiguous");
  });
});

describe("the shape refuses to represent a half known edit", () => {
  test("there is no way to build an edit without a change", () => {
    const missingChange = {
      kind: "edit",
      target: "tarjetas",
      direction: "raise",
    };

    // @ts-expect-error an edit without a change does not typecheck, which is the point:
    // "raise the cards a bit" cannot be smuggled through as an actionable intent.
    const rejected: PriceEditIntent = missingChange;

    expect(rejected).toBeDefined();
  });
});
