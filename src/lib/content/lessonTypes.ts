/**
 * Interactive lesson engine.
 *
 * A lesson is a SEQUENCE OF SCREENS, not a wall of text. The design follows
 * what actually makes training stick (deliberate practice + retrieval
 * practice + immediate feedback), rather than "here are 5 bullet points":
 *
 *  - concept   : the idea, and WHY it works on the brain (short)
 *  - demo      : a worked example the learner watches happen
 *  - guided    : do it RIGHT NOW, in the moment, eyes closed, then report back
 *  - input     : learner types their own material — it becomes their palace
 *  - recall    : active retrieval test, the single strongest learning move
 *  - quiz      : check understanding with immediate feedback
 *  - timer     : timed drill, builds speed under pressure
 *  - field     : real-world assignment outside the app
 *
 * Anything the learner types is persisted (see useLessonProgress) so their
 * own route/images come BACK on later screens. That is the whole point: the
 * lesson is built out of their material, not our examples.
 */

export type IllustrationSpec = {
  /**
   * Key into the drawn SVG set (components/lesson/Illustrations). Not a file
   * path: illustrations are drawn inline so there is no asset to license,
   * host or lose, and they inherit theme tokens automatically.
   */
  key: string;
  alt: string;
  caption?: string;
};

export type LessonBlock =
  | {
      kind: "concept";
      title: string;
      body: string[];
      illustration?: IllustrationSpec;
    }
  | {
      kind: "demo";
      title: string;
      body: string[];
      /** Walkthrough rows: a location and the image placed there. */
      example: { at: string; image: string }[];
      illustration?: IllustrationSpec;
    }
  | {
      kind: "guided";
      title: string;
      /** What to physically do, right now. */
      instruction: string[];
      /** The thing to notice while doing it — sensory, not intellectual. */
      noticePrompt: string;
      /** Asked afterwards; the answer is kept and can be referenced later. */
      reflection: string;
      storeAs?: string;
    }
  | {
      kind: "input";
      title: string;
      body: string[];
      /** One field per item the learner supplies. */
      fields: { label: string; placeholder: string; storeAs: string }[];
    }
  | {
      kind: "recall";
      title: string;
      body: string[];
      /** Which stored keys the learner must reproduce from memory. */
      recallKeys: string[];
      /** Shown after they commit an answer — never before. */
      afterword: string;
    }
  | {
      kind: "quiz";
      title: string;
      question: string;
      options: string[];
      correctIndex: number;
      explanation: string;
    }
  | {
      kind: "timer";
      title: string;
      instruction: string[];
      seconds: number;
      afterword: string;
    }
  | {
      // Retrieval practice, and the only gated block: you cannot continue
      // without writing something. Writing an answer beats re-reading, and it
      // is also what the adaptive review reads to decide what comes next.
      kind: "response";
      title: string;
      body: string[];
      prompt: string;
      minWords: number;
    }
  | {
      kind: "field";
      title: string;
      body: string[];
      assignment: string;
      masteryCheck: string;
    };

export interface Lesson {
  slug: string;
  /** Which training this lesson teaches. */
  trainingSlug: string;
  title: string;
  subtitle: string;
  estimatedMinutes: number;
  blocks: LessonBlock[];
}
