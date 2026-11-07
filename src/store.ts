import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { Tier } from './pricing.ts';

export interface ProductRow {
  id: string;
  name: string;
  description: string;
  price_amount: number;
  currency: string;
  category_id: string;
  image_url: string | null;
  status: 'active' | 'archived';
  archived_at: Date | null;
  updated_at: Date;
}

export interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
}

export interface NewProduct {
  name: string;
  description?: string;
  priceAmount: number;
  currency: string;
  categoryId: string;
  imageUrl?: string | null;
}

export type Sort = 'relevance' | 'price_asc' | 'price_desc';

export interface Store {
  listProducts(o: { categoryId?: string; page: number; pageSize: number }): Promise<ProductRow[]>;
  getProduct(id: string): Promise<ProductRow | null>;
  search(q: string, sort: Sort, limit: number): Promise<ProductRow[]>;
  createProduct(p: NewProduct): Promise<ProductRow>;
  updateProduct(id: string, patch: Partial<NewProduct>): Promise<ProductRow | null>;
  /** Archives an active product; false when it is unknown or already archived. */
  archiveProduct(id: string): Promise<ProductRow | null>;
  restoreProduct(id: string): Promise<ProductRow | null>;
  tiersFor(productIds: string[]): Promise<Map<string, Tier[]>>;
  setTiers(productId: string, tiers: Tier[]): Promise<void>;
  listCategories(): Promise<CategoryRow[]>;
  categoryExists(id: string): Promise<boolean>;
}

const newId = () => `p-${randomUUID().slice(0, 8)}`;

export class PgStore implements Store {
  constructor(private pool: Pool) {}

  async listProducts({ categoryId, page, pageSize }: { categoryId?: string; page: number; pageSize: number }) {
    const r = await this.pool.query<ProductRow>(
      `SELECT * FROM catalog_products WHERE status = 'active' AND ($1::text IS NULL OR category_id = $1)
       ORDER BY name, id LIMIT $2 OFFSET $3`,
      [categoryId ?? null, pageSize, (page - 1) * pageSize],
    );
    return r.rows;
  }
  async getProduct(id: string) {
    return (await this.pool.query<ProductRow>('SELECT * FROM catalog_products WHERE id = $1', [id])).rows[0] ?? null;
  }
  async search(q: string, sort: Sort, limit: number) {
    const like = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const order = sort === 'price_asc' ? 'price_amount ASC, id' : sort === 'price_desc' ? 'price_amount DESC, id' : '(name ILIKE $2) DESC, name, id';
    const r = await this.pool.query<ProductRow>(
      `SELECT * FROM catalog_products WHERE status = 'active' AND (name ILIKE $1 OR description ILIKE $1) ORDER BY ${order} LIMIT ${Number(limit)}`,
      sort === 'relevance' ? [like, `${q.replace(/[\\%_]/g, '\\$&')}%`] : [like],
    );
    return r.rows;
  }
  async createProduct(p: NewProduct) {
    const r = await this.pool.query<ProductRow>(
      `INSERT INTO catalog_products (id, name, description, price_amount, currency, category_id, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [newId(), p.name, p.description ?? '', p.priceAmount, p.currency, p.categoryId, p.imageUrl ?? null],
    );
    return r.rows[0];
  }
  async updateProduct(id: string, p: Partial<NewProduct>) {
    const r = await this.pool.query<ProductRow>(
      `UPDATE catalog_products SET
         name = COALESCE($2, name), description = COALESCE($3, description),
         price_amount = COALESCE($4, price_amount), currency = COALESCE($5, currency),
         category_id = COALESCE($6, category_id), image_url = COALESCE($7, image_url), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, p.name ?? null, p.description ?? null, p.priceAmount ?? null, p.currency ?? null, p.categoryId ?? null, p.imageUrl ?? null],
    );
    return r.rows[0] ?? null;
  }
  async archiveProduct(id: string) {
    const r = await this.pool.query<ProductRow>(
      `UPDATE catalog_products SET status = 'archived', archived_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'active' RETURNING *`,
      [id],
    );
    return r.rows[0] ?? null;
  }
  async restoreProduct(id: string) {
    const r = await this.pool.query<ProductRow>(
      `UPDATE catalog_products SET status = 'active', archived_at = NULL, updated_at = now()
       WHERE id = $1 AND status = 'archived' RETURNING *`,
      [id],
    );
    return r.rows[0] ?? null;
  }
  async tiersFor(productIds: string[]) {
    const out = new Map<string, Tier[]>();
    if (productIds.length === 0) return out;
    const r = await this.pool.query<{ product_id: string; min_quantity: number; price_amount: number }>(
      'SELECT product_id, min_quantity, price_amount FROM price_tiers WHERE product_id = ANY($1) ORDER BY product_id, min_quantity',
      [productIds],
    );
    for (const row of r.rows) {
      const list = out.get(row.product_id) ?? [];
      list.push({ minQuantity: row.min_quantity, amount: row.price_amount });
      out.set(row.product_id, list);
    }
    return out;
  }
  async setTiers(productId: string, tiers: Tier[]) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM price_tiers WHERE product_id = $1', [productId]);
      for (const t of tiers) {
        await client.query('INSERT INTO price_tiers (product_id, min_quantity, price_amount) VALUES ($1, $2, $3)', [productId, t.minQuantity, t.amount]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  async listCategories() {
    return (await this.pool.query<CategoryRow>('SELECT id, parent_id, name FROM categories ORDER BY name')).rows;
  }
  async categoryExists(id: string) {
    return ((await this.pool.query('SELECT 1 FROM categories WHERE id = $1', [id])).rowCount ?? 0) > 0;
  }
}

/** In-memory store for unit tests. Returns copies, like a database. */
export class MemoryStore implements Store {
  products: ProductRow[] = [];
  categories: CategoryRow[] = [];
  tiers = new Map<string, Tier[]>();

  async listProducts({ categoryId, page, pageSize }: { categoryId?: string; page: number; pageSize: number }) {
    return this.products
      .filter((p) => p.status === 'active' && (!categoryId || p.category_id === categoryId))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
      .slice((page - 1) * pageSize, page * pageSize)
      .map((p) => ({ ...p }));
  }
  async getProduct(id: string) {
    const p = this.products.find((x) => x.id === id);
    return p ? { ...p } : null;
  }
  async search(q: string, sort: Sort, limit: number) {
    const n = q.toLowerCase();
    const hits = this.products.filter((p) => p.status === 'active' && (p.name.toLowerCase().includes(n) || p.description.toLowerCase().includes(n)));
    const by = {
      price_asc: (a: ProductRow, b: ProductRow) => a.price_amount - b.price_amount,
      price_desc: (a: ProductRow, b: ProductRow) => b.price_amount - a.price_amount,
      relevance: (a: ProductRow, b: ProductRow) => Number(b.name.toLowerCase().startsWith(n)) - Number(a.name.toLowerCase().startsWith(n)) || a.name.localeCompare(b.name),
    }[sort];
    return hits.sort(by).slice(0, limit).map((p) => ({ ...p }));
  }
  async createProduct(p: NewProduct) {
    const row: ProductRow = { id: newId(), name: p.name, description: p.description ?? '', price_amount: p.priceAmount, currency: p.currency, category_id: p.categoryId, image_url: p.imageUrl ?? null, status: 'active', archived_at: null, updated_at: new Date() };
    this.products.push(row);
    return { ...row };
  }
  async updateProduct(id: string, p: Partial<NewProduct>) {
    const row = this.products.find((x) => x.id === id);
    if (!row) return null;
    Object.assign(row, {
      name: p.name ?? row.name, description: p.description ?? row.description, price_amount: p.priceAmount ?? row.price_amount,
      currency: p.currency ?? row.currency, category_id: p.categoryId ?? row.category_id, image_url: p.imageUrl ?? row.image_url, updated_at: new Date(),
    });
    return { ...row };
  }
  async archiveProduct(id: string) {
    const row = this.products.find((x) => x.id === id && x.status === 'active');
    if (!row) return null;
    Object.assign(row, { status: 'archived', archived_at: new Date(), updated_at: new Date() });
    return { ...row };
  }
  async restoreProduct(id: string) {
    const row = this.products.find((x) => x.id === id && x.status === 'archived');
    if (!row) return null;
    Object.assign(row, { status: 'active', archived_at: null, updated_at: new Date() });
    return { ...row };
  }
  async tiersFor(productIds: string[]) {
    return new Map(productIds.filter((id) => this.tiers.has(id)).map((id) => [id, this.tiers.get(id)!.map((t) => ({ ...t }))]));
  }
  async setTiers(productId: string, tiers: Tier[]) {
    if (tiers.length === 0) this.tiers.delete(productId);
    else this.tiers.set(productId, tiers.map((t) => ({ ...t })));
  }
  async listCategories() { return this.categories.map((c) => ({ ...c })); }
  async categoryExists(id: string) { return this.categories.some((c) => c.id === id); }
}
