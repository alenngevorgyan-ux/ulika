export type TrainingCategory = "memory" | "observation" | "math" | "trick";

/** Tracks are how the catalog is presented — a flat list of 20 reads as noise. */
export type TrackId = "reading-people" | "memory" | "calculation" | "self-command";

export interface Track {
  id: TrackId;
  title: string;
  blurb: string;
}

export interface TrainingStep {
  phase: "LEARN" | "TRY" | "FIELD TEST";
  text: string;
}

export interface Training {
  slug: string;
  title: string;
  category: TrainingCategory;
  track: TrackId;
  tagline: string;
  description: string;
  /** Legacy outline. Superseded by a full interactive lesson where one exists. */
  steps: TrainingStep[];
  masteryCriterion: string;
  /** Only for category "trick": a full proof the trick works every time. */
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
  track: TrackId;
  whenToUse: string;
  steps: string[];
  ethicalBoundary: string;
}

export const TRACKS: Track[] = [
  {
    id: "reading-people",
    title: "Reading people",
    blurb: "What a room tells you in twenty seconds, and what a face tells you in a quarter of one.",
  },
  {
    id: "memory",
    title: "Memory",
    blurb: "Storage systems that hold names, numbers and lists without a single note.",
  },
  {
    id: "calculation",
    title: "Calculation and effect",
    blurb: "Arithmetic fast enough to look like a trick, and tricks that are really arithmetic.",
  },
  {
    id: "self-command",
    title: "Self-command",
    blurb: "Staying accurate when you're the one who's rattled. The part nobody applauds.",
  },
];
