import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedProducts, SEED_CATEGORIES } from '../src/seed.ts';

test('seed is deterministic: 200 unique products in known leaf categories', () => {
  assert.deepEqual(seedProducts(), seedProducts());
  const ps = seedProducts();
  assert.equal(ps.length, 200);
  assert.equal(new Set(ps.map((p) => p.id)).size, 200);
  const ids = new Set(SEED_CATEGORIES.map((c) => c.id));
  assert.ok(ps.every((p) => ids.has(p.categoryId) && Number.isInteger(p.priceAmount)));
});
