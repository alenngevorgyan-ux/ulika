import type { AiToolDef } from "../ai/provider";
import { TRAININGS } from "../content/trainings";

export const TOOL_DEFS: AiToolDef[] = [
  {
    type: "function",
    function: {
      name: "get_training_catalog",
      description:
        "Возвращает полный список тренировок приложения со всеми метаданными (категория, сложность, что развивает). Вызывай перед тем как собирать персональный план.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "save_learning_plan",
      description:
        "Сохраняет персональный план тренировок для текущего пользователя. Вызывай только после того как обсудил цель пользователя и выбрал 3-5 тренировок в приоритетном порядке.",
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "Цель пользователя одной фразой, как он её сформулировал.",
          },
          items: {
            type: "array",
            description: "3-5 тренировок в порядке приоритета.",
            items: {
              type: "object",
              properties: {
                slug: { type: "string", description: "slug тренировки из каталога" },
                rationale: {
                  type: "string",
                  description: "Почему именно эта тренировка и на этом месте в плане.",
                },
              },
              required: ["slug", "rationale"],
            },
          },
        },
        required: ["goal", "items"],
      },
    },
  },
];

export function getTrainingCatalog() {
  return TRAININGS.map((t) => ({
    slug: t.slug,
    title: t.title,
    category: t.category,
    tagline: t.tagline,
    masteryCriterion: t.masteryCriterion,
  }));
}

export interface SavePlanArgs {
  goal: string;
  items: { slug: string; rationale: string }[];
}

export function validatePlanArgs(args: SavePlanArgs): string | null {
  if (!args.goal || typeof args.goal !== "string") return "Missing goal";
  if (!Array.isArray(args.items) || args.items.length < 1 || args.items.length > 6) {
    return "Plan must have 1-6 items";
  }
  const validSlugs = new Set(TRAININGS.map((t) => t.slug));
  for (const item of args.items) {
    if (!validSlugs.has(item.slug)) return `Unknown training slug: ${item.slug}`;
  }
  return null;
}
