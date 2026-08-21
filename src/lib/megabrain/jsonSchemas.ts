import { LEVERAGE_KINDS, STRATEGY_KINDS } from "./schemas";

/**
 * JSON Schemas sent as `response_format`, so the provider constrains generation
 * instead of us hoping the prompt was followed.
 *
 * These are NOT the validators. The schema shapes what comes back; the
 * validators in schemas.ts decide whether to trust it. Both exist because
 * providers degrade under load, silently fall back to unconstrained decoding,
 * and occasionally return a structurally valid object with every array empty.
 */

const strings = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const EXTRACT_SCHEMA = {
  name: "case_extraction",
  schema: obj({
    frame: obj({
      verifiedFacts: strings("Checkable without trusting anyone's account."),
      userClaims: strings("What the user asserts. Their account, not evidence."),
      interpretations: strings("Readings already layered on by the user."),
      unknowns: strings("Gaps that would change the strategy if filled."),
      constraints: strings("Money, time, legal, relational limits."),
      stakes: { type: "string" },
    }),
    actors: obj({
      actors: {
        type: "array",
        items: obj({
          label: { type: "string" },
          goals: strings(""),
          fears: strings(""),
          resources: strings(""),
          authority: { type: "string" },
          dependencies: strings("What this actor needs from others."),
          likelyReactions: strings(""),
        }),
      },
    }),
  }),
} as const;

export const ANALYSE_SCHEMA = {
  name: "case_analysis",
  schema: obj({
    hypotheses: obj({
      hypotheses: {
        type: "array",
        minItems: 3,
        items: obj({
          claim: { type: "string" },
          evidenceFor: strings(""),
          evidenceAgainst: strings(""),
          confidence: { type: "number", minimum: 0, maximum: 100 },
          discriminatingTest: {
            type: "string",
            description: "A cheap, reversible observation separating this from the others.",
          },
        }),
      },
    }),
    leverage: obj({
      points: {
        type: "array",
        items: obj({
          kind: { type: "string", enum: [...LEVERAGE_KINDS] },
          description: { type: "string" },
          availableToUser: { type: "boolean" },
        }),
      },
    }),
  }),
} as const;

export const STRATEGISE_SCHEMA = {
  name: "case_plan",
  schema: obj({
    strategies: obj({
      strategies: {
        type: "array",
        items: obj({
          kind: { type: "string", enum: [...STRATEGY_KINDS] },
          summary: { type: "string" },
          firstMove: { type: "string" },
          risk: { type: "string", enum: ["green", "yellow", "orange"] },
          reversible: { type: "boolean" },
          costIfItFails: { type: "string" },
          redirectedFrom: {
            type: "string",
            description: "Set when a dangerous idea was converted to a lawful equivalent.",
          },
        }),
      },
    }),
    countermoves: obj({
      countermoves: {
        type: "array",
        items: obj({
          againstStrategy: { type: "string", enum: [...STRATEGY_KINDS] },
          likelyResponse: { type: "string" },
          denial: { type: "string" },
          retaliation: { type: "string" },
          evidenceDestruction: { type: "string" },
          escalation: { type: "string" },
          worstPlausibleOutcome: { type: "string" },
        }),
      },
    }),
    plan: obj({
      conclusion: { type: "string" },
      missingInformation: strings(""),
      recommendedMove: { type: "string" },
      exactWords: strings("Verbatim sentences the user can say."),
      whatNotToSay: strings(""),
      branches: {
        type: "array",
        items: obj({ condition: { type: "string" }, then: { type: "string" } }),
      },
      stopSignals: strings("Observable events, not feelings."),
      fallbackPlan: { type: "string" },
      risk: { type: "string", enum: ["green", "yellow", "orange"] },
      uncertainty: { type: "string" },
    }),
  }),
} as const;
