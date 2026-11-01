# shoplab-catalog-api

Products, prices, categories and search. Express + Postgres.

| Endpoint | Notes |
| --- | --- |
| `GET /products` | `category`, `page` query params |
| `GET /products/:id` | response shape from `shoplab-contracts` |
| `GET /search` | `q`, `sort` = `relevance` \| `price_asc` \| `price_desc` |
| `GET /categories` | nested tree |
| `POST/PUT/DELETE /products` | staff or admin JWT from iam; create and update publish `product.updated` |

`product.updated.price` is an integer in minor units. The `products` view (`id, name, price_amount, currency, category_id`) is a read-only surface other services may query.

Env: `DATABASE_URL`, `JWT_SECRET` (shared with iam), `RABBITMQ_URL` (optional), `PORT`, `PAGE_SIZE`.
`npm test` uses an in-memory store; set `TEST_DATABASE_URL` to also run migrations, seed and search against Postgres.
`npm run seed` creates the same 200 products every time.
