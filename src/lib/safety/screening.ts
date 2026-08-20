/**
 * Intake screening.
 *
 * Item wording follows the standard published phrasing of the PHQ-2, GAD-2 and
 * the PHQ-9 safety item, plus two safety questions drawn from routine
 * domestic-abuse enquiry. Standard wording is used rather than invented
 * questions because these phrasings are what the validation work was done on;
 * rewriting them to sound friendlier would keep the appearance of a screener
 * and throw away the only thing that made it one.
 *
 * IMPORTANT, and worth arguing about: this is a SCREEN, not a diagnosis, and
 * it is the weaker half of the safety system. It asks once, and anyone who
 * wants in can simply answer no. The continuous detector is what actually
 * protects people. This exists to catch someone who arrives already in crisis
 * and to make the boundary of the product explicit up front.
 */

export type ScreeningResult = "clear" | "escalate";

export interface ScreeningItem {
  id: string;
  text: string;
  /** Standard 0-3 frequency scale, or a plain yes/no. */
  scale: "frequency" | "yesno";
  /** Answering at or above this triggers escalation on its own. */
  criticalAt?: number;
}

export const FREQUENCY_OPTIONS = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day",
];

export const ITEMS: ScreeningItem[] = [
  {
    id: "phq1",
    text: "Over the last two weeks, how often have you been bothered by little interest or pleasure in doing things?",
    scale: "frequency",
  },
  {
    id: "phq2",
    text: "Over the last two weeks, how often have you been bothered by feeling down, depressed, or hopeless?",
    scale: "frequency",
  },
  {
    id: "gad1",
    text: "Over the last two weeks, how often have you been bothered by feeling nervous, anxious, or on edge?",
    scale: "frequency",
  },
  {
    id: "gad2",
    text: "Over the last two weeks, how often have you been bothered by not being able to stop or control worrying?",
    scale: "frequency",
  },
  {
    // PHQ-9 item 9. Any non-zero answer escalates, which is the standard
    // clinical convention and not a threshold to soften.
    id: "safety",
    text: "Over the last two weeks, how often have you been bothered by thoughts that you would be better off dead, or of hurting yourself in some way?",
    scale: "frequency",
    criticalAt: 1,
  },
  {
    id: "home_safe",
    text: "Is there someone in your life who frightens you, or who you are afraid of?",
    scale: "yesno",
    criticalAt: 1,
  },
  {
    id: "control",
    text: "Is anyone controlling your money, your movements, or who you are allowed to see?",
    scale: "yesno",
    criticalAt: 1,
  },
  {
    id: "substance",
    text: "Are you currently drinking or using anything in a way that worries you or the people around you?",
    scale: "yesno",
    criticalAt: 1,
  },
];

export interface ScreeningOutcome {
  result: ScreeningResult;
  /** Which item drove escalation. Used to pick the right resource set. */
  reason: "suicide_self_harm" | "domestic_abuse" | "acute_clinical" | null;
  /** High distress without a critical trigger — worth naming, not a block. */
  elevatedDistress: boolean;
}

export function scoreScreening(answers: Record<string, number>): ScreeningOutcome {
  if ((answers.safety ?? 0) >= 1) {
    return { result: "escalate", reason: "suicide_self_harm", elevatedDistress: true };
  }
  if ((answers.home_safe ?? 0) >= 1 || (answers.control ?? 0) >= 1) {
    return { result: "escalate", reason: "domestic_abuse", elevatedDistress: false };
  }
  if ((answers.substance ?? 0) >= 1) {
    return { result: "escalate", reason: "acute_clinical", elevatedDistress: false };
  }

  // PHQ-2 and GAD-2 both use a cut-point of 3 across their two items.
  const phq = (answers.phq1 ?? 0) + (answers.phq2 ?? 0);
  const gad = (answers.gad1 ?? 0) + (answers.gad2 ?? 0);

  return { result: "clear", reason: null, elevatedDistress: phq >= 3 || gad >= 3 };
}
