export type RoutinePeriod = 'Morning' | 'Evening';

export type RoutineStep = {
  id: string;
  order: number;
  title: string;
  category: string;
  instructions: string;
  ingredients: string[];
  frequency: string;
};

const MEDICAL_OR_DIAGNOSTIC_LANGUAGE = /\b(diagnos(?:e|is|ed|ing)?|treat(?:ment|s|ed|ing)?|cure[ds]?|prescri(?:be|ption)|eczema|acne|rosacea|infection|skin cancer|medical[- ]grade|antibiotic|steroid|medication|beauty score|attractiveness|guaranteed results?)\b/i;

export function isSafeCosmeticText(text: string): boolean {
  return !MEDICAL_OR_DIAGNOSTIC_LANGUAGE.test(text);
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/\bcleanser|cleansing\b/i, 'Cleanser'],
  [/\btoner\b/i, 'Toner'],
  [/\bserum\b/i, 'Serum'],
  [/\bmoisturi[sz]er|cream\b/i, 'Moisturizer'],
  [/\bsunscreen|spf\b/i, 'Sun protection'],
  [/\bexfoliat|aha|bha\b/i, 'Exfoliant'],
  [/\boil\b/i, 'Face oil'],
];

const INGREDIENT_HINTS = [
  'hyaluronic acid',
  'niacinamide',
  'ceramides',
  'salicylic acid',
  'benzoyl peroxide',
  'vitamin c',
  'retinol',
  'glycerin',
  'peptides',
];

export function buildRoutineSteps(guidance: readonly string[], period: RoutinePeriod): RoutineStep[] {
  return guidance
    .filter((instruction) => typeof instruction === 'string'
      && instruction.trim().length > 0
      && isSafeCosmeticText(instruction))
    .slice(0, 8)
    .map((instruction, index) => {
      const text = instruction.trim();
      const category = CATEGORY_HINTS.find(([pattern]) => pattern.test(text))?.[1] ?? 'Skincare guidance';
      const firstPhrase = text.split(/[.!?;:]/, 1)[0]?.trim();
      const title = firstPhrase && firstPhrase.length <= 48
        ? firstPhrase.replace(/^(use|apply|finish with|follow with)\s+/i, '')
        : category;
      const frequency = text.match(/\b(daily|once daily|twice daily|once weekly|twice weekly|every \w+)\b/i)?.[0]
        ?? 'Not specified in the saved guidance';

      return {
        id: `${period}-${index + 1}`,
        order: index + 1,
        title: title || category,
        category,
        instructions: text,
        ingredients: INGREDIENT_HINTS.filter((ingredient) => text.toLowerCase().includes(ingredient)),
        frequency,
      };
    });
}

export function filterRoutineGuidance(guidance: readonly string[]): { items: string[]; removed: boolean } {
  const items = guidance.filter((item) => typeof item === 'string'
    && item.trim().length > 0
    && isSafeCosmeticText(item));
  return { items, removed: items.length !== guidance.length };
}

export function routineTip(
  morning: readonly string[],
  evening: readonly string[],
  precautions: readonly string[],
): string {
  const firstPrecaution = precautions.find((value) => value.trim().length > 0);
  if (firstPrecaution) return `From your saved guidance: ${firstPrecaution.trim()}`;
  if (morning.some((item) => /\bsunscreen|\bspf\b/i.test(item))) {
    return 'Your morning guidance includes sun protection. Apply products in the listed order and follow each product label.';
  }
  if (morning.length || evening.length) {
    return 'Introduce new products one at a time, follow their labels, and stop use if irritation occurs.';
  }
  return 'Complete a skin analysis to receive routine guidance and related safety tips.';
}

export function routineStepIds(morning: readonly string[], evening: readonly string[]): string[] {
  return [
    ...buildRoutineSteps(morning, 'Morning').map((step) => step.id),
    ...buildRoutineSteps(evening, 'Evening').map((step) => step.id),
  ];
}
