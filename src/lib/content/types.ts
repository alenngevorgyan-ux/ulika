export type TrainingCategory = "memory" | "observation" | "math" | "trick";

export interface TrainingStep {
  phase: "LEARN" | "TRY" | "FIELD TEST";
  text: string;
}

export interface Training {
  slug: string;
  title: string;
  category: TrainingCategory;
  tagline: string;
  description: string;
  steps: TrainingStep[];
  masteryCriterion: string;
  /** Only present for category "trick": a full proof the trick works every time. */
  proof?: string;
}

export type PsychTechniqueCategory =
  | "stoicism"
  | "communication"
  | "influence"
  | "habit"
  | "mindset";

export interface PsychTechnique {
  slug: string;
  title: string;
  category: PsychTechniqueCategory;
  whenToUse: string;
  steps: string[];
  ethicalBoundary: string;
}
