# shoplab-catalog-api

Products, prices, categories and search. Express + Postgres.

| Endpoint | Notes |
| --- | --- |
| `GET /products` | `category`, `page` query params |
| `GET /products/:id` | response shape from `shoplab-contracts` |
| `GET /search` | `q`, `sort` = `relevance` \| `price_asc` \| `price_desc` |
| `GET /categories` | nested tree |
| `GET /products/:id/price` | `quantity` query param; unit and total price after quantity tiers |
| `PUT /products/:id/tiers` | staff or admin; replaces the quantity tiers |
| `POST/PUT/DELETE /products` | staff or admin JWT from iam; create and update publish `product.updated` |
| `DELETE /products/:id` | archives the product (204), publishes `product.archived`; `GET /products/:id` then answers 410 and lists and search skip it |
| `POST /products/:id/restore` | staff or admin; makes an archived product active again |

`product.updated` carries `pricing.amount` (an integer in minor units) and `pricing.tiers`, plus `currency` and `status`. The `products` view (`id, name, price_amount, currency, category_id, status`) is a read-only surface other services may query.

Env: `DATABASE_URL`, `JWT_SECRET` (shared with iam), `RABBITMQ_URL` (optional), `PORT`, `PAGE_SIZE`.
`npm test` uses an in-memory store; set `TEST_DATABASE_URL` to also run migrations, seed and search against Postgres.
`npm run seed` creates the same 200 products every time.
