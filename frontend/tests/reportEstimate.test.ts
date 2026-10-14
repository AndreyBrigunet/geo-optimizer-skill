/**
 * Test della stima "baseline → tetto dopo i fix gratuiti" (src/lib/reportEstimate.ts).
 *
 * Il payload gated riproduce quello del SaaS: categorie libere con dettagli,
 * categorie bloccate con il solo punteggio numerico e teaser "[Pro]" in coda
 * alle raccomandazioni.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as any).__ENGINE_VERSION__ = '0.0.0-test';

const { mapBackendToFrontend } = await import('../src/lib/reportMapper.ts');
const { estimateAfterFreeFixes, isProTeaser } = await import('../src/lib/reportEstimate.ts');

const gatedPayload = {
  url: 'https://example.com',
  score: 22,
  band: 'critical',
  gated: true,
  // Forma reale di POST /api/public/audits (14/10): niente score_max, versione né google_ai
  free_categories: ['meta', 'robots', 'signals'],
  locked_categories: ['ai_discovery', 'brand_entity', 'content', 'llms', 'schema'],
  score_breakdown: {
    robots: 0,
    meta: 5,
    signals: 3,
    ai_discovery: 0,
    brand_entity: 0,
    content: 2,
    llms: 0,
    schema: 0,
  },
  recommendations: [
    'Create robots.txt with Allow rules for AI bots (GPTBot, ClaudeBot, PerplexityBot)',
    'Add optimized meta description (150-160 characters)',
    '[Pro] Find and fix JSON-LD schema errors that block AI citation — +14 pts available',
  ],
};

test('ceiling adds only the gaps of the visible categories (v2 maxima)', () => {
  const estimate = estimateAfterFreeFixes(mapBackendToFrontend(gatedPayload));
  // robots 14-0, meta 11-5, signals 6-3
  assert.equal(estimate.baseline, 22);
  assert.deepEqual(
    estimate.freeGains.map((g) => [g.slug, g.points]),
    [['robots', 14], ['meta', 6], ['signals', 3]],
  );
  assert.equal(estimate.ceiling, 45);
});

test('locked gaps are reported apart and never enter the ceiling', () => {
  const estimate = estimateAfterFreeFixes(mapBackendToFrontend(gatedPayload));
  // ai_discovery 3 + brand_entity 12 + content 12 + llms 6 + schema 14
  assert.equal(estimate.lockedGain, 47);
});

test('[Pro] teaser lines are not counted as free fixes', () => {
  const report = mapBackendToFrontend(gatedPayload);
  assert.equal(estimateAfterFreeFixes(report).freeFixCount, 2);
  assert.equal(report.recommendations.filter(isProTeaser).length, 1);
});

test('the ceiling never exceeds 100', () => {
  const full = {
    url: 'https://example.com',
    score: 95,
    band: 'excellent',
    score_version: 2,
    score_breakdown: { google_ai: 10, robots: 14, schema: 14, content: 14, brand_entity: 12, meta: 11, llms: 6, signals: 6, ai_discovery: 3 },
    recommendations: [],
  };
  assert.equal(estimateAfterFreeFixes(mapBackendToFrontend(full)).ceiling, 100);
});

test('categories already at their maximum add nothing', () => {
  const payload = { ...gatedPayload, score: 50, score_breakdown: { ...gatedPayload.score_breakdown, robots: 14, meta: 11, signals: 6 } };
  const estimate = estimateAfterFreeFixes(mapBackendToFrontend(payload));
  assert.deepEqual(estimate.freeGains, []);
  assert.equal(estimate.ceiling, 50);
});
