import type { TefExerciseType } from '../types';

export interface TefSampleAd {
  id: string;
  url: string;
  label: string;
}

const BASE = import.meta.env.BASE_URL;

const sampleUrl = (id: string) => `${BASE}tef-samples/${id}.png`.replace(/\/{2,}/g, '/');

const makeAd = (id: string, label: string): TefSampleAd => ({ id, url: sampleUrl(id), label });

/** Official TEF sample ads, served as static assets from public/tef-samples. */
export const TEF_SAMPLE_ADS: Record<TefExerciseType, TefSampleAd[]> = {
  questioning: [
    makeAd('questioning-1', 'Home care job'),
    makeAd('questioning-2', 'Rando Loisirs hiking'),
    makeAd('questioning-3', 'Ciné-Art extras'),
    makeAd('questioning-4', 'Furniture for sale'),
  ],
  persuasion: [
    makeAd('persuasion-1', 'Tour du Québec'),
    makeAd('persuasion-2', 'Dométudes tutoring'),
    makeAd('persuasion-3', 'S.O.S amitié volunteering'),
    makeAd('persuasion-4', 'MEDIA Langues courses'),
  ],
};

/** Fetch a sample ad image and wrap it as a PNG File for the normal upload flow. */
export async function fetchSampleAdAsFile(ad: TefSampleAd): Promise<File> {
  const response = await fetch(ad.url);
  if (!response.ok) {
    throw new Error(`Failed to load sample ad (HTTP ${response.status}).`);
  }
  const blob = await response.blob();
  return new File([blob], `${ad.id}.png`, { type: 'image/png' });
}
