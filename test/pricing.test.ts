import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unitPriceFor, validateTiers } from '../src/pricing.ts';

const tiers = [{ minQuantity: 5, amount: 900 }, { minQuantity: 20, amount: 800 }];

test('unitPriceFor picks the highest tier the quantity reaches', () => {
  assert.equal(unitPriceFor(1000, tiers, 1), 1000);
  assert.equal(unitPriceFor(1000, tiers, 5), 900);
  assert.equal(unitPriceFor(1000, tiers, 19), 900);
  assert.equal(unitPriceFor(1000, tiers, 20), 800);
  assert.equal(unitPriceFor(1000, [], 50), 1000);
  assert.equal(unitPriceFor(1000, [...tiers].reverse(), 25), 800);
});

test('validateTiers sorts and rejects bad input', () => {
  assert.deepEqual(validateTiers(1000, [...tiers].reverse()), tiers);
  assert.deepEqual(validateTiers(1000, []), []);
  for (const bad of [null, 'x', [{}], [{ minQuantity: 1, amount: 1 }], [{ minQuantity: 2.5, amount: 1 }], [{ minQuantity: 2, amount: -1 }], [{ minQuantity: 2, amount: 1000 }]]) {
    assert.equal(validateTiers(1000, bad), 'tiers');
  }
  assert.equal(validateTiers(1000, Array.from({ length: 11 }, (_, i) => ({ minQuantity: i + 2, amount: 500 - i }))), 'tiers');
});
