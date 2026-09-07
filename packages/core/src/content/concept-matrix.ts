import type { AngleDraft, ContentFormat } from "@velocity/contracts";

/**
 * The angle x format x persona fan-out (STEP 8.2), as a pure function —
 * no I/O, fully unit-testable. Applies format/persona validity rules: a
 * meme has no on-screen persona; an ai_ugc talking head requires one.
 */

export interface PersonaRef {
  id: string;
}

export interface ConceptSlot {
  angle: AngleDraft;
  format: ContentFormat;
  personaId: string | null;
}

export interface BuildConceptMatrixInput {
  angles: AngleDraft[];
  formats: ContentFormat[];
  personas: PersonaRef[];
  conceptsPerAngle: number;
}

/** Which formats require an on-screen persona, and which must not have one. */
function personaRequirement(format: ContentFormat): "required" | "forbidden" | "optional" {
  if (format === "ai_ugc") return "required";
  if (format === "meme") return "forbidden";
  return "optional"; // slideshow, hook_demo can go either way
}

export function buildConceptMatrix(input: BuildConceptMatrixInput): ConceptSlot[] {
  const slots: ConceptSlot[] = [];

  for (const angle of input.angles) {
    let producedForAngle = 0;
    for (const format of input.formats) {
      if (producedForAngle >= input.conceptsPerAngle) break;

      const requirement = personaRequirement(format);
      if (requirement === "required" && input.personas.length === 0) continue; // can't produce an ai_ugc slot with no persona available

      const personaId =
        requirement === "forbidden"
          ? null
          : requirement === "required"
            ? input.personas[producedForAngle % input.personas.length]!.id
            : (input.personas[producedForAngle % Math.max(1, input.personas.length)]?.id ?? null);

      slots.push({ angle, format, personaId });
      producedForAngle += 1;
    }
  }

  return slots;
}
