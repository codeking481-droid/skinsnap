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

const MEDICAL_OR_DIAGNOSTIC_LANGUAGE = /\b(diagnos(?:e|is|ed|ing)?|medical[- ]treatment|cure[ds]?|prescri(?:be|ption)|eczema|acne|rosacea|infection|skin cancer|medical[- ]grade|antibiotic|steroid|medication|beauty score|attractiveness|guaranteed results?)\b/i;

export function isSafeCosmeticText(text: string): boolean {
  return !MEDICAL_OR_DIAGNOSTIC_LANGUAGE.test(text);
}

export function parseRoutineGuidance(value: unknown, tolerateUnsupported = false): string[] {
  if (!Array.isArray(value) || value.length > 8 || (!tolerateUnsupported && value.length === 0)) {
    throw new Error('invalid-routine-guidance');
  }
  const supported: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim().length > 0 && item.length <= 240 && isSafeCosmeticText(item)) {
      supported.push(item);
    } else if (!tolerateUnsupported) {
      throw new Error('invalid-routine-guidance');
    }
  }
  return supported;
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

export function restoreRoutineGuidance(
  guidance: { morningRoutine: readonly string[]; eveningRoutine: readonly string[]; precautions: readonly string[] },
): {
  morningRoutine: string[];
  eveningRoutine: string[];
  precautions: string[];
  usesGeneralGuidance: boolean;
  removedUnsupportedGuidance: boolean;
} {
  const morning = filterRoutineGuidance(guidance.morningRoutine);
  const evening = filterRoutineGuidance(guidance.eveningRoutine);
  const precautions = filterRoutineGuidance(guidance.precautions);
  const usesGeneralGuidance = morning.items.length === 0 || evening.items.length === 0;
  return {
    morningRoutine: morning.items.length ? morning.items : [
      'Rinse gently with lukewarm water.',
      'Apply a moisturizer that suits your skin.',
      'Use broad-spectrum sunscreen as directed on its label.',
    ],
    eveningRoutine: evening.items.length ? evening.items : [
      'Cleanse gently to remove sunscreen and daily buildup.',
      'Apply a moisturizer that suits your skin.',
    ],
    precautions: precautions.items.length ? precautions.items : [
      'Introduce products one at a time, follow their labels, and stop use if irritation occurs.',
    ],
    usesGeneralGuidance,
    removedUnsupportedGuidance: morning.removed || evening.removed || precautions.removed,
  };
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
