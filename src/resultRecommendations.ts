import type { AnalysisPreferences } from './analysisQuality';
import type { SkinObservation } from './services/analysisApi';

export type ProductIdea = {
  name: string;
  reason: string;
  retailer: 'Boots' | 'Sephora UK';
  priceLabel: string;
  url: string;
};
export const PERFUME_VIBES = ['Calm', 'Fresh', 'Bright', 'Evening'] as const;
export type PerfumeVibe = typeof PERFUME_VIBES[number];

function retailerSearch(retailer: ProductIdea['retailer'], name: string): string {
  const query = encodeURIComponent(name);
  return retailer === 'Boots'
    ? `https://www.boots.com/sitesearch?searchTerm=${query}`
    : `https://www.sephora.co.uk/search?query=${query}`;
}

function bootsIdea(name: string, reason: string): ProductIdea {
  return { name, reason, retailer: 'Boots', priceLabel: 'Price varies · check Boots', url: retailerSearch('Boots', name) };
}

const COMMON_PICK_NOTE = 'Common pick to explore for this observation in the UK, not a fix or a personal necessity. Check ingredients for your sensitivity and follow the product label.';

export function getCreams(
  preferences: AnalysisPreferences,
  observations: readonly SkinObservation[],
): ProductIdea[] {
  const ideas = [
    bootsIdea('CeraVe Moisturising Cream', 'Common UK moisturiser pick to explore. Follow its label and stop if irritation occurs.'),
    bootsIdea('The Ordinary Hyaluronic Acid 2% + B5', 'Common UK moisture-focused serum pick to explore; use as directed on its label.'),
    bootsIdea('La Roche-Posay Anthelios UVMune 400 SPF50+', 'Broad-spectrum SPF pick to explore year-round, including on overcast days. Follow the label and reapply as directed.'),
  ];
  const categories = new Set(observations.map(item => item.category));
  let targeted: ProductIdea | null = null;

  if (preferences.skinType === 'dry' || categories.has('apparent-dryness')) {
    targeted = bootsIdea('The Ordinary Hyaluronic Acid 2% + B5', 'An optional moisture-focused pick to explore when dry-looking areas are observed.');
  } else if (categories.has('visible-shine')) {
    targeted = bootsIdea('The Ordinary Niacinamide 10% + Zinc 1%', 'An optional formula to explore alongside this visible-shine observation; a photo does not determine skin type.');
  } else if (categories.has('general-texture')) {
    targeted = bootsIdea('The Ordinary Niacinamide 10% + Zinc 1%', 'An optional product to explore alongside this visible texture observation. Introduce one new product at a time and stop if irritation occurs.');
  } else if (categories.has('uneven-looking-tone') || categories.has('color-variation')) {
    targeted = bootsIdea('The Ordinary Ascorbyl Glucoside Solution 12%', 'An optional vitamin C product to explore alongside this visible colour variation; no result or change is promised.');
  } else if (categories.has('visible-blemishes')) {
    targeted = bootsIdea('CeraVe Blemish Control Cleanser', 'An optional cleanser to explore alongside visible blemish-like marks; this is not a diagnosis or treatment plan.');
  } else if (preferences.concern === 'dry-looking-areas') {
    targeted = bootsIdea('The Ordinary Hyaluronic Acid 2% + B5', 'An optional moisture-focused pick to explore for your self-reported preference.');
  } else if (preferences.concern === 'shine') {
    targeted = bootsIdea('The Ordinary Niacinamide 10% + Zinc 1%', 'An optional formula to explore alongside your self-reported preference; a photo does not determine skin type.');
  } else if (preferences.concern === 'texture') {
    targeted = bootsIdea('The Ordinary Niacinamide 10% + Zinc 1%', 'An optional product to explore alongside your self-reported texture preference. Introduce one new product at a time and stop if irritation occurs.');
  } else if (preferences.concern === 'uneven-tone') {
    targeted = bootsIdea('The Ordinary Ascorbyl Glucoside Solution 12%', 'An optional vitamin C product to explore alongside your self-reported preference; no result or change is promised.');
  } else if (preferences.concern === 'blemish-like-marks') {
    targeted = bootsIdea('CeraVe Blemish Control Cleanser', 'An optional cleanser to explore alongside your self-reported preference; this is not a diagnosis or treatment plan.');
  }

  const recommendations = targeted
    ? [targeted, ...ideas.filter(idea => idea.name !== targeted.name)]
    : ideas;
  return recommendations.map(idea => ({
    ...idea,
    reason: `${idea.reason} ${COMMON_PICK_NOTE}`,
  }));
}

export function getPerfume(preferences: AnalysisPreferences, vibe?: PerfumeVibe): ProductIdea[] {
  if (preferences.fragranceFree === 'prefer') return [];
  if (!vibe) return [];

  const suggestions: Record<PerfumeVibe, { name: string; description: string }> = {
    Calm: { name: 'Glossier You', description: 'a soft, close-to-skin scent' },
    Fresh: { name: 'Byredo Blanche', description: 'a clean, airy scent' },
    Bright: { name: 'Dior Blooming Bouquet', description: 'a light, floral scent' },
    Evening: { name: 'YSL Libre', description: 'a warm, expressive scent' },
  };
  const suggestion = suggestions[vibe];
  return [{
    name: suggestion.name,
    reason: `Your ${vibe.toLowerCase()}-mood routine pairs with ${suggestion.description}. This is a user-chosen style vibe, not a skin or scent-compatibility assessment. Try a light spray on clothing; check the product label and fabric care first.`,
    retailer: 'Sephora UK',
    priceLabel: 'Check current price',
    url: retailerSearch('Sephora UK', suggestion.name),
  }];
}
