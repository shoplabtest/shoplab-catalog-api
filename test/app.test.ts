import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { NullPublisher } from '../src/events.ts';
import { MemoryStore } from '../src/store.ts';

const cfg = loadConfig({ JWT_SECRET: 'test-secret', PAGE_SIZE: '2' } as NodeJS.ProcessEnv);
const store = new MemoryStore();
const events = new NullPublisher();
let server: Server;
let base: string;

const token = (role: string) => jwt.sign({ sub: 'u1', role, tenant: 'default' }, cfg.jwtSecret);
const call = (path: string, method = 'GET', body?: unknown, role?: string) =>
  fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(role ? { authorization: `Bearer ${token(role)}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  store.categories.push({ id: 'audio', parent_id: 'electronics', name: 'Audio' }, { id: 'electronics', parent_id: null, name: 'Electronics' });
  server = createApp({ cfg, store, events }).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => void server.close());

const create = async (name: string, amount: number) =>
  (await (await call('/products', 'POST', { name, price: { amount, currency: 'USD' }, categoryId: 'audio' }, 'staff')).json()) as { id: string };

test('creating a product requires staff or admin', async () => {
  const body = { name: 'X', price: { amount: 100, currency: 'USD' }, categoryId: 'audio' };
  assert.equal((await call('/products', 'POST', body)).status, 401);
  assert.equal((await call('/products', 'POST', body, 'customer')).status, 403);
  assert.equal((await call('/products', 'POST', body, 'admin')).status, 201);
});

test('create validates price, currency and category', async () => {
  const bad = (b: object) => call('/products', 'POST', b, 'staff');
  assert.equal((await bad({ name: 'X', price: { amount: 1.5, currency: 'USD' }, categoryId: 'audio' })).status, 400);
  assert.equal((await bad({ name: 'X', price: { amount: 100, currency: 'JPY' }, categoryId: 'audio' })).status, 400);
  assert.equal((await bad({ name: 'X', price: { amount: 100, currency: 'USD' }, categoryId: 'nope' })).status, 400);
});

test('GET /products/:id returns the contract shape; unknown id is 404', async () => {
  const { id } = await create('Studio Speaker', 4500);
  const p = (await (await call(`/products/${id}`)).json()) as Record<string, unknown>;
  assert.deepEqual(p, { id, name: 'Studio Speaker', price: { amount: 4500, currency: 'USD' }, categoryId: 'audio' });
  assert.equal((await call('/products/missing')).status, 404);
});

test('product.updated carries the price as a decimal string', async () => {
  const { id } = await create('Event Cable', 1200);
  assert.deepEqual(Object.keys(events.published.at(-1)!.body as object).sort(), ['currency', 'price', 'productId', 'updatedAt']);
  await call(`/products/${id}`, 'PUT', { price: { amount: 999, currency: 'EUR' } }, 'staff');
  const ev = events.published.at(-1)!;
  assert.equal(ev.key, 'product.updated');
  assert.equal((ev.body as { price: unknown }).price, '9.99');
  assert.equal((ev.body as { currency: unknown }).currency, 'EUR');
});

test('list paginates and filters by category', async () => {
  const page1 = (await (await call('/products?category=audio&page=1')).json()) as unknown[];
  const page2 = (await (await call('/products?category=audio&page=2')).json()) as unknown[];
  assert.equal(page1.length, 2);
  assert.ok(page2.length > 0);
  assert.equal(((await (await call('/products?category=electronics')).json()) as unknown[]).length, 0);
});

test('search sorts by price and rejects bad input', async () => {
  await create('Zeta Headphones', 9000);
  await create('Alpha Headphones', 3000);
  const asc = (await (await call('/search?q=headphones&sort=price_asc')).json()) as { price: { amount: number } }[];
  assert.deepEqual(asc.map((p) => p.price.amount), [3000, 9000]);
  const desc = (await (await call('/search?q=headphones&sort=price_desc')).json()) as { price: { amount: number } }[];
  assert.deepEqual(desc.map((p) => p.price.amount), [9000, 3000]);
  assert.equal((await call('/search')).status, 400);
  assert.equal((await call('/search?q=x&sort=bogus')).status, 400);
});

test('categories come back as a tree', async () => {
  const tree = (await (await call('/categories')).json()) as { id: string; children: { id: string }[] }[];
  assert.equal(tree.length, 1);
  assert.equal(tree[0].id, 'electronics');
  assert.deepEqual(tree[0].children.map((c) => c.id), ['audio']);
});

test('delete removes the product', async () => {
  const { id } = await create('Temp', 100);
  assert.equal((await call(`/products/${id}`, 'DELETE', undefined, 'staff')).status, 204);
  assert.equal((await call(`/products/${id}`)).status, 404);
  assert.equal((await call(`/products/${id}`, 'DELETE', undefined, 'staff')).status, 404);
});
