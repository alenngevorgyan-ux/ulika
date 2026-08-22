import { LEVERAGE_KINDS, PHRASE_ROLES, REDIRECT_CATEGORIES, STRATEGY_KINDS } from "./schemas";

/**
 * JSON Schemas sent as `response_format`, so the provider constrains generation
 * instead of us hoping the prompt was followed.
 *
 * These are NOT the validators. The schema shapes what comes back; the
 * validators in schemas.ts decide whether to trust it. Both exist because
 * providers degrade under load, silently fall back to unconstrained decoding,
 * and occasionally return a structurally valid object with every array empty.
 */

const strings = (description: string, maxItems?: number) => ({
  type: "array",
  items: { type: "string" },
  ...(maxItems === undefined ? {} : { maxItems }),
  description,
});

/**
 * Ceilings on how much the extract stage may emit.
 *
 * These are enforced where generation happens — as maxItems inside the schema
 * the provider decodes against — rather than by trimming a finished object. A
 * post-hoc trim throws away tokens already paid for, and it silently discards
 * whichever fact the model happened to put last, which is not the same as the
 * least important one.
 *
 * The numbers are what a hard human situation actually needs. A dispute with
 * more than four actors or more than a dozen distinct load-bearing facts is not
 * being under-served by these limits; it is being told, correctly, that it
 * needs a bigger mode.
 */
export const EXTRACT_LIMITS = {
  reportedFacts: 12,
  reportedEvidenceAvailable: 6,
  interpretations: 6,
  unknowns: 6,
  constraints: 6,
  actors: 4,
  /** Per claim array on one actor: goals, fears, resources, dependencies, reactions. */
  claimsPerActorField: 3,
} as const;

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
      documentedFacts: strings("MUST BE EMPTY in V0 — nothing here can inspect a document."),
      reportedFacts: {
        type: "array",
        maxItems: EXTRACT_LIMITS.reportedFacts,
        description:
          "Stated by the user. Testimony, not evidence. Ids are referenced by actor claims. " +
          "ONE atomic claim each, under about 15 words. Not a retelling of the account.",
        items: obj({ id: { type: "string" }, text: { type: "string" } }),
      },
      reportedEvidenceAvailable: {
        type: "array",
        maxItems: EXTRACT_LIMITS.reportedEvidenceAvailable,
        description: "What the user SAYS they can produce. Never treated as produced.",
        items: obj({
          type: { type: "string" },
          description: { type: "string" },
          verificationStatus: { type: "string", enum: ["not_reviewed"] },
        }),
      },
      interpretations: strings(
        "Readings already layered on by the user. A reading, never a restatement of a fact " +
          "already listed in reportedFacts.",
        EXTRACT_LIMITS.interpretations
      ),
      unknowns: strings("Gaps that would change the strategy if filled.", EXTRACT_LIMITS.unknowns),
      constraints: strings("Money, time, legal, relational limits.", EXTRACT_LIMITS.constraints),
      stakes: { type: "string" },
    }),
    actors: obj({
      actors: {
        type: "array",
        maxItems: EXTRACT_LIMITS.actors,
        items: obj({
          label: { type: "string" },
          goals: { type: "array", maxItems: EXTRACT_LIMITS.claimsPerActorField, items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "basis", "supportingFactIds"],
          properties: {
            value: { type: "string", description: "Literally \"unknown\" when basis is unknown." },
            basis: { type: "string", enum: ["reported", "inferred", "unknown"] },
            supportingFactIds: { type: "array", items: { type: "string" } },
            uncertainty: { type: "string", description: "Required when basis is inferred." },
          },
        } },
          fears: { type: "array", maxItems: EXTRACT_LIMITS.claimsPerActorField, items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "basis", "supportingFactIds"],
          properties: {
            value: { type: "string", description: "Literally \"unknown\" when basis is unknown." },
            basis: { type: "string", enum: ["reported", "inferred", "unknown"] },
            supportingFactIds: { type: "array", items: { type: "string" } },
            uncertainty: { type: "string", description: "Required when basis is inferred." },
          },
        } },
          resources: { type: "array", maxItems: EXTRACT_LIMITS.claimsPerActorField, items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "basis", "supportingFactIds"],
          properties: {
            value: { type: "string", description: "Literally \"unknown\" when basis is unknown." },
            basis: { type: "string", enum: ["reported", "inferred", "unknown"] },
            supportingFactIds: { type: "array", items: { type: "string" } },
            uncertainty: { type: "string", description: "Required when basis is inferred." },
          },
        } },
          authority: {
          type: "object",
          additionalProperties: false,
          required: ["value", "basis", "supportingFactIds"],
          properties: {
            value: { type: "string", description: "Literally \"unknown\" when basis is unknown." },
            basis: { type: "string", enum: ["reported", "inferred", "unknown"] },
            supportingFactIds: { type: "array", items: { type: "string" } },
            uncertainty: { type: "string", description: "Required when basis is inferred." },
          },
        },
          dependencies: { type: "array", maxItems: EXTRACT_LIMITS.claimsPerActorField, items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "basis", "supportingFactIds"],
          properties: {
            value: { type: "string", description: "Literally \"unknown\" when basis is unknown." },
            basis: { type: "string", enum: ["reported", "inferred", "unknown"] },
            supportingFactIds: { type: "array", items: { type: "string" } },
            uncertainty: { type: "string", description: "Required when basis is inferred." },
          },
        } },
          likelyReactions: { type: "array", maxItems: EXTRACT_LIMITS.claimsPerActorField, items: {
          type: "object",
          additionalProperties: false,
          required: ["value", "basis", "supportingFactIds"],
          properties: {
            value: { type: "string", description: "Literally \"unknown\" when basis is unknown." },
            basis: { type: "string", enum: ["reported", "inferred", "unknown"] },
            supportingFactIds: { type: "array", items: { type: "string" } },
            uncertainty: { type: "string", description: "Required when basis is inferred." },
          },
        } },
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
        minItems: 10,
        description: "All ten kinds, every time. Absent is a status, not an omission.",
        items: obj({
          kind: { type: "string", enum: [...LEVERAGE_KINDS] },
          status: { type: "string", enum: ["present", "absent", "unknown"] },
          description: { type: "string" },
          basis: { type: "string" },
          risk: { type: "string" },
          reversibility: {
            type: "string",
            enum: ["reversible", "hard_to_reverse", "irreversible", "not_applicable"],
          },
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
          redirect: {
            type: ["object", "null"],
            additionalProperties: false,
            description:
              "NULL unless a dangerous idea was actually converted. Never a placeholder.",
            required: ["category", "reason", "preservedObjective"],
            properties: {
              category: { type: "string", enum: [...REDIRECT_CATEGORIES] },
              reason: { type: "string", description: "Non-operational: why it was out of bounds." },
              preservedObjective: { type: "string" },
            },
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
      exactWords: {
        type: "array",
        minItems: 3,
        description: "At least three, one per role. Said out loud by the user.",
        items: obj({
          role: { type: "string", enum: [...PHRASE_ROLES] },
          purpose: { type: "string" },
          text: { type: "string" },
          useWhen: { type: "string" },
          doNotUseWhen: { type: "string" },
        }),
      },
      whatNotToSay: strings(""),
      ifThenBranches: {
        type: "array",
        minItems: 3,
        description: "Conceded, stalled, escalated — the three things the other side does.",
        items: obj({
          if: { type: "string" },
          then: { type: "string" },
          rationale: { type: "string" },
          stopCondition: { type: "string", description: "Observable, not a feeling." },
        }),
      },
      stopSignals: strings("Observable events, not feelings."),
      fallbackPlan: { type: "string" },
      risk: { type: "string", enum: ["green", "yellow", "orange"] },
      riskAssessment: obj({
        jurisdictionKnown: { type: "boolean" },
        requestedBenefit: { type: "string" },
        relevanceToDispute: { type: "string", enum: ["direct", "tangential", "unrelated"] },
        informationSource: { type: "string", enum: ["user_owned", "shared_with_user", "third_party", "improperly_obtained"] },
        proceduralChannel: { type: "string", enum: ["formal", "informal", "none"] },
        reversibility: { type: "string", enum: ["reversible", "hard_to_reverse", "irreversible"] },
        retaliationRisk: { type: "string", enum: ["low", "medium", "high"] },
        legalUncertainty: { type: "string", description: "Required when jurisdictionKnown is false." },
      }),
      uncertainty: { type: "string" },
    }),
  }),
} as const;

/**
 * The merged shape for the two-call ablation: everything analyse and strategise
 * produce, in one response. Composed from the two existing schemas rather than
 * written again, so they cannot drift apart.
 */
export const COMBINED_SCHEMA = {
  name: "case_analysis_and_plan",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["hypotheses", "leverage", "strategies", "countermoves", "plan"],
    properties: {
      ...ANALYSE_SCHEMA.schema.properties,
      ...STRATEGISE_SCHEMA.schema.properties,
    },
  },
} as const;

/** Light mode. Five fields, all required, nothing optional to pad with. */
export const LIGHT_SCHEMA = {
  name: "light_plan",
  schema: obj({
    shortAssessment: { type: "string" },
    nextMove: { type: "string" },
    oneExactPhrase: { type: "string" },
    oneRisk: { type: "string" },
    oneQuestion: { type: "string" },
  }),
} as const;
