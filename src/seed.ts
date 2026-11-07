import { resolve } from 'node:path';
import { Pool } from 'pg';
import { loadConfig } from './config.ts';
import { migrate } from './migrate.ts';

/** Deterministic PRNG so every environment gets the same 200 products. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SEED_CATEGORIES = [
  { id: 'apparel', parent: null, name: 'Apparel' },
  { id: 'shirts', parent: 'apparel', name: 'Shirts' },
  { id: 'pants', parent: 'apparel', name: 'Pants' },
  { id: 'home', parent: null, name: 'Home' },
  { id: 'kitchen', parent: 'home', name: 'Kitchen' },
  { id: 'decor', parent: 'home', name: 'Decor' },
  { id: 'electronics', parent: null, name: 'Electronics' },
  { id: 'audio', parent: 'electronics', name: 'Audio' },
  { id: 'accessories', parent: 'electronics', name: 'Accessories' },
];

const LEAVES = ['shirts', 'pants', 'kitchen', 'decor', 'audio', 'accessories'];
const ADJ = ['Classic', 'Modern', 'Compact', 'Premium', 'Everyday', 'Studio'];
const NOUN: Record<string, string[]> = {
  shirts: ['Oxford Shirt', 'Linen Tee', 'Polo'],
  pants: ['Chinos', 'Jeans', 'Joggers'],
  kitchen: ['Chef Knife', 'Kettle', 'Cutting Board'],
  decor: ['Vase', 'Lamp', 'Wall Clock'],
  audio: ['Headphones', 'Speaker', 'Earbuds'],
  accessories: ['Charger', 'Cable', 'Phone Stand'],
};

export function seedProducts(count = 200, seed = 7) {
  const rnd = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  return Array.from({ length: count }, (_, i) => {
    const category = LEAVES[i % LEAVES.length];
    const name = `${pick(ADJ)} ${pick(NOUN[category])}`;
    return {
      id: `p-seed${String(i + 1).padStart(3, '0')}`,
      name,
      description: `${name} from the ShopLab catalog, item ${i + 1}.`,
      priceAmount: 500 + Math.floor(rnd() * 19500),
      currency: 'USD',
      categoryId: category,
    };
  });
}

/** Every fifth product gets a 5+ and a 20+ quantity break (5% and 10% off). */
export function seedTiers(priceAmount: number) {
  return [
    { minQuantity: 5, amount: Math.floor(priceAmount * 0.95) },
    { minQuantity: 20, amount: Math.floor(priceAmount * 0.9) },
  ];
}

export async function seed(pool: Pool) {
  for (const c of SEED_CATEGORIES) {
    await pool.query('INSERT INTO categories (id, parent_id, name) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING', [c.id, c.parent, c.name]);
  }
  let created = 0;
  for (const p of seedProducts()) {
    const r = await pool.query(
      `INSERT INTO catalog_products (id, name, description, price_amount, currency, category_id)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
      [p.id, p.name, p.description, p.priceAmount, p.currency, p.categoryId],
    );
    created += r.rowCount ?? 0;
    if ((r.rowCount ?? 0) > 0 && Number(p.id.slice(-3)) % 5 === 0) {
      for (const t of seedTiers(p.priceAmount)) {
        await pool.query('INSERT INTO price_tiers (product_id, min_quantity, price_amount) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [p.id, t.minQuantity, t.amount]);
      }
    }
  }
  return created;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = new Pool({ connectionString: loadConfig().databaseUrl });
  await migrate(pool, resolve(import.meta.dirname, '../migrations'));
  console.log(`seeded ${await seed(pool)} products`);
  await pool.end();
}
