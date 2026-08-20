/**
 * Structured reply schema.
 *
 * The model returns typed blocks rather than prose that gets regex-parsed
 * afterwards. The old three-section text format stays supported on the read
 * path (parseReply) so replies already stored in history keep rendering —
 * removing it would blank out every past conversation.
 *
 * stripMarkdown still runs over every text field. It is redundant if the model
 * behaves, and it is exactly the sort of thing that should stay in place for
 * the day it does not.
 */

export type Grade = "A" | "B" | "C" | "D";

export type ReplyBlock =
  | {
      type: "observation";
      /** One noticing per line. Rendered staggered, never as a paragraph. */
      lines: {
        text: string;
        /** Observed in what they wrote vs concluded from it. Marked differently. */
        kind: "fact" | "inference";
      }[];
    }
  | {
      type: "questions";
      items: string[];
    }
  | {
      type: "prose";
      text: string;
    }
  | {
      type: "source";
      /** Catalog slug, so the card can link to /train/[slug]. */
      slug: string;
      title: string;
      grade: Grade | null;
      note: string;
    }
  | {
      type: "checklist";
      title: string;
      items: string[];
      /** Groups the ticks in training_responses. */
      skillId: string;
    }
  | {
      type: "timeline";
      title: string;
      steps: { label: string; detail: string; depth?: "core" | "deepening" | "mastery" }[];
    }
  | {
      type: "pattern";
      /** Ties this conversation to something already in the dossier. */
      subject: string;
      observation: string;
      thenWhat: string;
    }
  | {
      type: "drill";
      title: string;
      instruction: string;
      seconds: number;
      skillId: string;
    }
  | {
      type: "envelope";
      title: string;
      /** Sealed until opened — a field assignment, not a to-do. */
      assignment: string;
      skillId: string;
    };

export interface StructuredReply {
  blocks: ReplyBlock[];
}

/** The contract handed to the model. Kept next to the type so they cannot drift. */
export const BLOCK_SCHEMA_INSTRUCTION = `## Your reply format

Return ONLY a JSON object. No prose around it, no code fence, no markdown anywhere inside it.

{"blocks": [ ... ]}

Block types, in the order you would naturally use them:

{"type":"observation","lines":[{"text":"...","kind":"fact"|"inference"}]}
  What you noticed about their exact words. One noticing per line, two to four lines.
  kind "fact" = it is literally there in what they wrote.
  kind "inference" = you concluded it. Be honest about which is which; they are shown differently.

{"type":"questions","items":["...","..."]}
  What you need answered. Three to six. Concrete and answerable.

{"type":"prose","text":"..."}
  What you actually think. On a first message about a new situation this is one or two
  sentences, because you do not have the facts yet.

{"type":"pattern","subject":"...","observation":"...","thenWhat":"..."}
  ONLY when what they are describing matches something already in your memory of them.
  subject is the person or situation from memory. Never invent one.

{"type":"source","slug":"...","title":"...","grade":"A"|"B"|"C"|"D"|null,"note":"..."}
  A method from the catalog. slug must be one that exists. Include the grade honestly.

{"type":"checklist","title":"...","items":["..."],"skillId":"..."}
  Things to actually do away from this screen.

{"type":"drill","title":"...","instruction":"...","seconds":60,"skillId":"..."}
  A timed practice.

{"type":"envelope","title":"...","assignment":"...","skillId":"..."}
  A single field assignment they open when they are ready to do it.

{"type":"timeline","title":"...","steps":[{"label":"...","detail":"...","depth":"core"}]}
  A multi-step plan.

Rules:
- Most replies are two or three blocks. A reply with six is a lecture.

USE THE RICHER BLOCKS. An endless run of observation + questions + prose is
technically correct and reads as a form. When the moment genuinely calls for
one of these, use it:
- They named a goal or asked how to get better at something -> a source block
  for the method, and a timeline if it needs more than one step.
- You told them to go and do something -> a checklist or an envelope, not a
  sentence they will scroll past.
- The thing needs practising under time pressure -> a drill with real seconds.
- What they describe matches something in your memory of them -> a pattern
  block, which is the single most valuable thing you can produce.
Do not force these. Do notice that if you have gone several replies without
one, you are probably being drier than the conversation deserves.
- Never use asterisks, hashes, bullet characters or numbered markers inside any text field.
- Do not put quotation marks around ordinary concepts.
- If someone just says hello, or is in crisis, return a single prose block and nothing else.`;
