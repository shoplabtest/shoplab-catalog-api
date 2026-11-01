import express from 'express';
import { requireStaff } from './auth.ts';
import type { Config } from './config.ts';
import type { Publisher } from './events.ts';
import type { CategoryRow, NewProduct, ProductRow, Sort, Store } from './store.ts';

const CURRENCIES = ['USD', 'EUR', 'GBP'];
const SORTS: Sort[] = ['relevance', 'price_asc', 'price_desc'];

/** Response shape from shoplab-contracts openapi/catalog-api.yaml. */
export const toProduct = (p: ProductRow) => ({
  id: p.id,
  name: p.name,
  price: { amount: p.price_amount, currency: p.currency },
  categoryId: p.category_id,
  ...(p.image_url ? { imageUrl: p.image_url } : {}),
});

interface CategoryNode { id: string; name: string; children: CategoryNode[] }

export function buildTree(rows: CategoryRow[]): CategoryNode[] {
  const nodes = new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, children: [] as CategoryNode[] }]));
  const roots: CategoryNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    const parent = r.parent_id ? nodes.get(r.parent_id) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

type Body = Record<string, unknown>;

function parseProduct(b: Body, partial: boolean): Partial<NewProduct> | string {
  const out: Partial<NewProduct> = {};
  const has = (k: string) => b[k] !== undefined;
  if (!partial || has('name')) {
    if (typeof b.name !== 'string' || !b.name.trim()) return 'name';
    out.name = b.name.trim();
  }
  if (!partial || has('price')) {
    const price = b.price as { amount?: unknown; currency?: unknown } | undefined;
    if (!price || !Number.isInteger(price.amount) || (price.amount as number) < 0 || !CURRENCIES.includes(price.currency as string)) return 'price';
    out.priceAmount = price.amount as number;
    out.currency = price.currency as string;
  }
  if (!partial || has('categoryId')) {
    if (typeof b.categoryId !== 'string') return 'categoryId';
    out.categoryId = b.categoryId;
  }
  if (has('description')) out.description = String(b.description);
  if (has('imageUrl')) out.imageUrl = b.imageUrl === null ? null : String(b.imageUrl);
  return out;
}

export interface Deps { cfg: Config; store: Store; events: Publisher }

export function createApp({ cfg, store, events }: Deps) {
  const app = express();
  app.use(express.json());
  const staff = requireStaff(cfg);

  const announce = (p: ProductRow) =>
    events.publish('product.updated', { productId: p.id, price: (p.price_amount / 100).toFixed(2), currency: p.currency, updatedAt: p.updated_at.toISOString() });

  app.get('/healthz', (_req, res) => void res.json({ ok: true }));

  app.get('/products', async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    res.json((await store.listProducts({ categoryId: category, page, pageSize: cfg.pageSize })).map(toProduct));
  });

  app.get('/products/:id', async (req, res) => {
    const p = await store.getProduct(req.params.id);
    if (!p) return void res.status(404).json({ error: 'not_found' });
    res.json(toProduct(p));
  });

  app.get('/search', async (req, res) => {
    const q = req.query.q;
    const sort = (req.query.sort ?? 'relevance') as Sort;
    if (typeof q !== 'string' || !q.trim() || !SORTS.includes(sort)) return void res.status(400).json({ error: 'invalid_request' });
    res.json((await store.search(q.trim(), sort, 50)).map(toProduct));
  });

  app.get('/categories', async (_req, res) => void res.json(buildTree(await store.listCategories())));

  app.post('/products', staff, async (req, res) => {
    const parsed = parseProduct(req.body ?? {}, false);
    if (typeof parsed === 'string') return void res.status(400).json({ error: 'invalid_request', field: parsed });
    if (!(await store.categoryExists(parsed.categoryId!))) return void res.status(400).json({ error: 'invalid_request', field: 'categoryId' });
    const p = await store.createProduct(parsed as NewProduct);
    await announce(p);
    res.status(201).json(toProduct(p));
  });

  app.put('/products/:id', staff, async (req, res) => {
    const parsed = parseProduct(req.body ?? {}, true);
    if (typeof parsed === 'string') return void res.status(400).json({ error: 'invalid_request', field: parsed });
    if (parsed.categoryId && !(await store.categoryExists(parsed.categoryId))) return void res.status(400).json({ error: 'invalid_request', field: 'categoryId' });
    const p = await store.updateProduct(req.params.id, parsed);
    if (!p) return void res.status(404).json({ error: 'not_found' });
    await announce(p);
    res.json(toProduct(p));
  });

  app.delete('/products/:id', staff, async (req, res) => {
    res.status((await store.deleteProduct(req.params.id)) ? 204 : 404).end();
  });

  return app;
}
