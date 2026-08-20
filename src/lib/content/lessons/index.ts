import type { Lesson } from "../lessonTypes";
import { MEMORY_PALACE_LESSON } from "./memoryPalace";

export const LESSONS: Lesson[] = [MEMORY_PALACE_LESSON];

export function getLesson(slug: string): Lesson | undefined {
  return LESSONS.find((l) => l.slug === slug);
}

export function hasLesson(trainingSlug: string): boolean {
  return LESSONS.some((l) => l.trainingSlug === trainingSlug);
}
