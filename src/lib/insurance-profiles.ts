import { withCoverageControls } from './insurance-coverage.ts';
import { isReview, initialReview, withOptionalAB, withVehicles, type Review, type planPayments } from './insurance-review.ts';
export const PROFILES_KEY = 'insurance-review-profiles-v1';
export type SavedProfile = { id: string; review: Review; status: 'draft' | 'confirmed'; savedAt: string; version?: number; calculationVersion?: number; paymentView?: string; payments?: ReturnType<typeof planPayments>[] };
export type ProfileStore = { version: 1; activeId: string; profiles: SavedProfile[] };
export function readProfiles(raw: string | null): ProfileStore | null {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (value.version !== 1 || !Array.isArray(value.profiles) || !value.profiles.length || !value.profiles.every((p: SavedProfile) => p && typeof p.id === 'string' && p.id && isReview(p.review) && ['draft', 'confirmed'].includes(p.status) && typeof p.savedAt === 'string' && Number.isFinite(Date.parse(p.savedAt))) || new Set(value.profiles.map((p: SavedProfile) => p.id)).size !== value.profiles.length || !value.profiles.some((p: SavedProfile) => p.id === value.activeId)) throw new Error('Invalid profile store');
  return value;
}
export function upsertProfile(store: ProfileStore | null, profile: SavedProfile): ProfileStore {
  return { version: 1, activeId: profile.id, profiles: [...(store?.profiles ?? []).filter(p => p.id !== profile.id), profile] };
}
export function blankProfile(): Review {
  const review = withCoverageControls(withVehicles(withOptionalAB(structuredClone(initialReview))));
  return { ...review, name: '', phone: '', property: '', effective: '', vehicle: '', note: '', selected: null, checks: [false, false, false], carriers: review.carriers.map(() => ''), auto: review.auto.map(() => ''), home: review.home.map(() => ''), vehicles: [{ id: 'vehicle-1', name: '', premiums: review.carriers.map(() => '') }], autoRows: review.autoRows.map(r => ({ ...r, values: r.values.map(() => '待确认') })), homeRows: review.homeRows.map(r => ({ ...r, values: r.values.map(() => '待确认') })) };
}
