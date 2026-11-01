import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { migrate } from '../src/migrate.ts';
import { seed, seedProducts } from '../src/seed.ts';
import { PgStore } from '../src/store.ts';

// Runs against a real, empty Postgres. CI provides TEST_DATABASE_URL; locally the tests are skipped.
const url = process.env.TEST_DATABASE_URL;

test('migrations apply to an empty database, seed is idempotent, view and search work', { skip: !url }, async () => {
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    const dir = resolve(import.meta.dirname, '../migrations');
    assert.equal((await migrate(pool, dir)).length, 4);
    assert.deepEqual(await migrate(pool, dir), []);

    assert.equal(await seed(pool), 200);
    assert.equal(await seed(pool), 0);

    const view = await pool.query('SELECT count(*)::int AS n FROM products');
    assert.equal(view.rows[0].n, 200);
    const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'products' ORDER BY ordinal_position");
    assert.deepEqual(cols.rows.map((r) => r.column_name), ['id', 'name', 'price_amount', 'currency', 'category_id']);

    const store = new PgStore(pool);
    const sample = seedProducts()[0];
    assert.equal((await store.getProduct(sample.id))?.name, sample.name);
    const asc = await store.search('chef', 'price_asc', 50);
    assert.ok(asc.length > 0);
    assert.deepEqual(asc.map((p) => p.price_amount), [...asc.map((p) => p.price_amount)].sort((a, b) => a - b));
    assert.equal((await store.search('100%_', 'relevance', 5)).length, 0);
    assert.equal((await store.listProducts({ categoryId: 'audio', page: 1, pageSize: 5 })).length, 5);
  } finally {
    await pool.end();
  }
});
