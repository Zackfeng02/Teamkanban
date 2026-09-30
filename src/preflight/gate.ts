import { dirname } from 'node:path';
import { containedPath, inspectSample, readJson } from './inspect.ts';

export const requiredCases = ['ios', 'android'].flatMap(os => ['wechat', 'wecom'].flatMap(client => ['merged', 'image'].map(kind => `${os}-${client}-${kind}`)));
export const requiredAdminChecks = [
  'productAndApi', 'organizationEligibility', 'recipientAccount', 'captureScope',
  'authorizationRequirements', 'processingRegions', 'mediaAccess', 'pricingAndSeats',
] as const;

export async function evaluateGate(manifestPath: string) {
  const manifest = await readJson(manifestPath) as any;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('INVALID_ACCEPTANCE_MANIFEST');
  const blockers: string[] = [];
  const results: { id: string; readyForReview: boolean; issues: string[] }[] = [];
  if (manifest.evidenceMode !== 'live-synthetic-data') blockers.push('LIVE_SYNTHETIC_DEVICE_EVIDENCE_REQUIRED');
  if (typeof manifest.organizationReviewer !== 'string' || !manifest.organizationReviewer.trim()) blockers.push('ORGANIZATION_REVIEWER_REQUIRED');
  for (const key of requiredAdminChecks) {
    const check = manifest.adminChecks?.[key];
    if (check?.confirmed !== true || typeof check?.notes !== 'string' || !check.notes.trim()) blockers.push(`ADMIN_CHECK_REQUIRED:${key}`);
  }
  if (!Array.isArray(manifest.cases)) blockers.push('CASE_LIST_REQUIRED');
  for (const id of requiredCases) {
    const cases = Array.isArray(manifest.cases) ? manifest.cases.filter((c: any) => c?.id === id) : [];
    const issues: string[] = [];
    if (cases.length !== 1) issues.push('EXACTLY_ONE_CASE_REQUIRED');
    const test = cases[0];
    if (test) {
      for (const field of ['tester', 'clientVersion', 'steps']) {
        if (typeof test[field] !== 'string' || !test[field].trim()) issues.push(`${field.toUpperCase()}_REQUIRED`);
      }
      if (typeof test.testedAt !== 'string' || !Number.isFinite(Date.parse(test.testedAt)) || Date.parse(test.testedAt) > Date.now()) issues.push('VALID_TEST_TIME_REQUIRED');
      for (const field of ['forwardedWithoutUpload', 'sourceContentCompared', 'imagesOpenedAndCompared', 'sourceOrderCompared']) {
        if (test[field] !== true) issues.push(`${field.toUpperCase()}_REQUIRED`);
      }
      try {
        const sample = await containedPath(dirname(manifestPath), test.sample);
        const media = await containedPath(dirname(manifestPath), test.media);
        const inspected = await inspectSample(sample, media);
        if (!inspected.structurallyComplete) issues.push(...inspected.issues.map(x => x.code));
        if (test.sampleSha256 !== inspected.sampleSha256) issues.push('SAMPLE_DIGEST_MISMATCH');
        const mediaDigests = inspected.entries.filter(e => e.kind === 'image').map(e => e.media?.sha256 ?? null);
        if (!Array.isArray(test.imageSha256) || JSON.stringify(test.imageSha256) !== JSON.stringify(mediaDigests)) issues.push('IMAGE_DIGESTS_MISMATCH');
        const merged = id.endsWith('-merged');
        if (inspected.messageType !== (merged ? 'chatrecord' : 'image')) issues.push('WRONG_MESSAGE_TYPE');
        if (merged && inspected.counts.text < 2) issues.push('AT_LEAST_TWO_TEXT_ITEMS_REQUIRED');
        if (inspected.counts.verifiedImages < (merged ? 2 : 1)) issues.push('INSUFFICIENT_IMAGE_BYTES');
        if (test.expectedTextCount !== inspected.counts.text || test.expectedImageCount !== inspected.counts.image) issues.push('SOURCE_ITEM_COUNTS_MISMATCH');
      } catch { issues.push('EVIDENCE_FILES_INVALID_OR_MISSING'); }
    }
    if (issues.length) blockers.push(`CASE_NOT_READY:${id}`);
    results.push({ id, readyForReview: issues.length === 0, issues });
  }
  return {
    schemaVersion: 1,
    status: blockers.length ? 'BLOCKED' : 'READY_FOR_ADMIN_REVIEW',
    fullDevelopmentApproved: false,
    note: 'Offline checks do not establish live provenance. An administrator must review original device observations, permissions and costs before the development gate can pass.',
    blockers, cases: results,
  };
}
