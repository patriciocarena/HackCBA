import { describe, expect, test } from "bun:test";
import {
  ESCALATION_REASONS,
  extractionFromEnv,
  isActionable,
  openRouterExtraction,
  toIntent,
  type OpenRouterConfig,
  type PriceEditIntent,
} from "../../src/voice/price-edit-intent";

const CONFIG: Omit<OpenRouterConfig, "fetchImpl"> = {
  apiKey: "test-key",
  model: "openai/gpt-4o-mini",
};

const ENV = {
  OPENROUTER_API_KEY: "k",
  OPENROUTER_MODEL: "openai/gpt-4o-mini",
};

function raw(over: Record<string, unknown> = {}) {
  return {
    kind: "edit",
    target: "tarjetas",
    direction: "raise",
    changeKind: "percent",
    value: 20,
    reason: null,
    detail: "",
    ...over,
  };
}

function completion(intent: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(intent) } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("toIntent accepts a complete dictation", () => {
  test("a percentage stays a percentage, and no price is invented", () => {
    expect(toIntent(raw())).toEqual({
      kind: "edit",
      target: "tarjetas",
      direction: "raise",
      change: { kind: "percent", value: 20 },
    });
  });

  test("an absolute amount becomes an absolute change", () => {
    expect(toIntent(raw({ changeKind: "absolute", value: 15000 }))).toEqual({
      kind: "edit",
      target: "tarjetas",
      direction: "raise",
      change: { kind: "absolute", amount: 15000 },
    });
  });

  test("lowering is as valid as raising", () => {
    const intent = toIntent(raw({ direction: "lower" }));

    expect(isActionable(intent)).toBe(true);
    if (isActionable(intent)) expect(intent.direction).toBe("lower");
  });

  test("surrounding whitespace does not become part of the target", () => {
    const intent = toIntent(raw({ target: "  tarjetas  " }));

    if (!isActionable(intent)) throw new Error("expected an edit");
    expect(intent.target).toBe("tarjetas");
  });
});

describe("toIntent refuses to guess", () => {
  const refusals: [string, Record<string, unknown>, string][] = [
    ["no amount at all", { changeKind: null, value: null }, "ambiguous"],
    ["a null amount with a change kind", { value: null }, "ambiguous"],
    ["an amount that is not a number", { value: "veinte" }, "ambiguous"],
    ["a zero amount", { value: 0 }, "ambiguous"],
    ["a negative amount", { value: -20 }, "ambiguous"],
    ["a NaN amount", { value: Number.NaN }, "ambiguous"],
    ["an infinite amount", { value: Number.POSITIVE_INFINITY }, "ambiguous"],
    ["no direction", { direction: null }, "ambiguous"],
    ["a direction outside the union", { direction: "sideways" }, "ambiguous"],
    ["a change kind outside the union", { changeKind: "vibes" }, "ambiguous"],
    ["nothing named to change", { target: null }, "no_match"],
    ["a target of only whitespace", { target: "   " }, "no_match"],
  ];

  for (const [name, over, reason] of refusals) {
    test(`${name} goes to review as ${reason}`, () => {
      const intent = toIntent(raw(over));

      expect(isActionable(intent)).toBe(false);
      if (intent.kind !== "review") throw new Error("expected a review");
      expect(intent.reason).toBe(reason as (typeof ESCALATION_REASONS)[number]);
    });
  }

  test("a model that answers with no usable shape is not actionable", () => {
    expect(toIntent({})).toEqual({
      kind: "review",
      reason: "ambiguous",
      detail: "the model returned no usable intent",
    });
  });
});

describe("toIntent normalises a review", () => {
  test("a reason the domain knows is kept", () => {
    expect(toIntent({ kind: "review", reason: "vat_question", detail: "d" })).toEqual(
      { kind: "review", reason: "vat_question", detail: "d" },
    );
  });

  test("a reason the domain does not know collapses to ambiguous", () => {
    const intent = toIntent({ kind: "review", reason: "because_i_said_so" });

    if (intent.kind !== "review") throw new Error("expected a review");
    expect(intent.reason).toBe("ambiguous");
  });
});

describe("openRouterExtraction", () => {
  test("the transcript is fenced and the schema is enforced", async () => {
    let body: Record<string, unknown> | undefined;
    const port = openRouterExtraction({
      ...CONFIG,
      fetchImpl: async (_url, init) => {
        body = JSON.parse(String(init?.body));
        return completion(raw());
      },
    });

    await port.extract("Subí las tarjetas un 20 %");

    const messages = body?.messages as { role: string; content: string }[];
    expect(messages[1]?.content).toBe(
      "<transcript>\nSubí las tarjetas un 20 %\n</transcript>",
    );
    expect(body?.temperature).toBe(0);
    expect((body?.response_format as { type: string }).type).toBe("json_schema");
  });

  test("every request carries a deadline", async () => {
    let signal: AbortSignal | undefined;
    const port = openRouterExtraction({
      ...CONFIG,
      fetchImpl: async (_url, init) => {
        signal = init?.signal ?? undefined;
        return completion(raw());
      },
    });

    await port.extract("hola");

    expect(signal).toBeInstanceOf(AbortSignal);
  });

  const failures: [string, () => Promise<Response>][] = [
    ["a rejected request", async () => new Response("nope", { status: 500 })],
    [
      "a body that is not JSON",
      async () => new Response("<html>", { status: 200 }),
    ],
    ["a completion with no content", async () => completion_empty()],
    [
      "content that is not JSON",
      async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "sure thing!" } }] }),
          { status: 200 },
        ),
    ],
  ];

  function completion_empty(): Response {
    return new Response(JSON.stringify({ choices: [] }), { status: 200 });
  }

  for (const [name, impl] of failures) {
    test(`${name} fails closed, never actionable`, async () => {
      const port = openRouterExtraction({ ...CONFIG, fetchImpl: impl });

      const intent = await port.extract("Subí las tarjetas un 20 %");

      expect(isActionable(intent)).toBe(false);
    });
  }

  test("a network failure fails closed", async () => {
    const port = openRouterExtraction({
      ...CONFIG,
      fetchImpl: async () => {
        throw new Error("connection reset");
      },
    });

    const intent = await port.extract("Subí las tarjetas un 20 %");

    if (intent.kind !== "review") throw new Error("expected a review");
    expect(intent.detail).toContain("connection reset");
  });

  test("an empty transcript never reaches the model", async () => {
    let called = false;
    const port = openRouterExtraction({
      ...CONFIG,
      fetchImpl: async () => {
        called = true;
        return completion(raw());
      },
    });

    const intent = await port.extract("   ");

    expect(called).toBe(false);
    expect(isActionable(intent)).toBe(false);
  });
});

describe("configuration is a boot concern", () => {
  test("a configured environment builds a port", () => {
    expect(() => extractionFromEnv(ENV)).not.toThrow();
  });

  test("an unconfigured environment names every missing variable", () => {
    expect(() => extractionFromEnv({})).toThrow(
      "missing OPENROUTER_API_KEY, OPENROUTER_MODEL",
    );
  });
});

describe("the escalation vocabulary has one source", () => {
  test("the mirror matches the frozen block in PLAN.md", async () => {
    const plan = await Bun.file(
      new URL("../../PLAN.md", import.meta.url),
    ).text();

    const block = plan.match(
      /export const ESCALATION_REASONS = \[([\s\S]*?)\] as const/,
    );
    if (!block) throw new Error("ESCALATION_REASONS not found in PLAN.md");

    const frozen: string[] = [...block[1]!.matchAll(/'([a-z_]+)'/g)].map(
      (m) => m[1]!,
    );
    const mirrored: string[] = [...ESCALATION_REASONS];

    expect(mirrored).toEqual(frozen);
  });
});

describe("the shape refuses to represent a half known edit", () => {
  test("an edit without a change does not typecheck", () => {
    const missingChange: { kind: "edit"; target: string; direction: "raise" } = {
      kind: "edit",
      target: "tarjetas",
      direction: "raise",
    };

    // @ts-expect-error `change` is missing, and "raise them a bit" must not be
    // expressible as an actionable intent. kind is already narrowed to "edit",
    // so this error is about the missing change and nothing else.
    const rejected: PriceEditIntent = missingChange;

    expect(rejected).toBeDefined();
  });
});
