export type AtlasCardType =
  | "EVIDENCE"
  | "PSYCH_TACTIC"
  | "MENTALIST_PATTERN"
  | "FICTION_REASONING_PATTERN"
  | "IDEATION_LENS"
  | "ULIKA_CASE_PATTERN"
  | "BOOK_REFERENCE";

export type EpistemicStatus = "evidence" | "practice" | "analogy" | "reference";

export interface AtlasCard {
  id: string;
  type: Exclude<AtlasCardType, "BOOK_REFERENCE">;
  name: string;
  aliases: string[];
  domains: string[];
  problems_it_solves: string[];
  core_idea: string;
  mechanism: string;
  signals: string[];
  possible_explanations: string[];
  when_useful: string[];
  when_not_useful: string[];
  information_needed: string[];
  how_to_test: string[];
  candidate_actions: string[];
  countermoves: string[];
  failure_modes: string[];
  common_misuse: string[];
  ethical_constraints: string[];
  unsafe_variant: string;
  safe_analog: string;
  evidence_strength: string;
  epistemic_status: EpistemicStatus;
  source_ids: string[];
  license: string;
  provenance: string;
  source_date: string;
  example: string;
  tags: string[];
}

export type ShelfStatus = "FULL_INGEST_CANDIDATE" | "PUBLIC_DOMAIN_CANDIDATE" | "REFERENCE_ONLY";

export interface BookReference {
  id: string;
  type: "BOOK_REFERENCE";
  title: string;
  authors: string;
  year: string | null;
  domain: string;
  reason_for_inclusion: string;
  high_level_topics: string[];
  legal_access_status: ShelfStatus;
  source_registry: string;
}

export interface InformationPlanItem {
  unknown: string;
  why_it_changes_decision: string;
  best_source: string;
  source_reliability: "high" | "medium" | "low" | "unknown";
  safe_way_to_obtain: string;
  cost: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  possible_answers: string[];
  what_each_answer_changes: string[];
}

export interface AtlasRetrieval {
  cards: (AtlasCard & { relevance_score: number })[];
  families: string[];
  informationPlan: InformationPlanItem[];
  block: string;
  tokenEstimate: number;
  latencyMs: number;
  truncated: boolean;
}
