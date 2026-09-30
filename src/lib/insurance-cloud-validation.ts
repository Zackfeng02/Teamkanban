import { withRiskQuotes, canConfirmReview, REVIEW_VERSION } from './insurance-risks.ts';
import { z } from 'zod';
import { isReview, withOptionalAB, withVehicles, withProperties, total, planPayments, type Review } from './insurance-review.ts';
import type { SavedProfile } from './insurance-profiles.ts';

export const cloudProfileSchema = z.object({
  id: z.string().min(1).max(128),
  version: z.number().int().min(0).max(2147483646).default(0),
  review: z.custom<Review>(isReview, '比价资料格式不正确'),
  status: z.enum(['draft', 'confirmed']),
  paymentView: z.enum(['year', 'month']).default('year'),
}).strip();

export function prepareCloudProfile(input: unknown, imported = false): SavedProfile {
  const parsed = cloudProfileSchema.parse(input);
  const review = withRiskQuotes(parsed.review);
  // Legacy confirmation did not include the new property fields.
  const complete = canConfirmReview(review);
  if (parsed.status === 'confirmed' && !complete && !imported) throw new Error('INCOMPLETE_CONFIRMATION');
  const status = parsed.status === 'confirmed' && complete ? 'confirmed' : 'draft';
  return { id: parsed.id, version: parsed.version, review, status, savedAt: new Date().toISOString(), calculationVersion: REVIEW_VERSION,
    paymentView: parsed.paymentView, payments: review.carriers.map((_, i) => planPayments(review, i)) };
}
