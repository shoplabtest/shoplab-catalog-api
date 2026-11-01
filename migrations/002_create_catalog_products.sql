CREATE TABLE catalog_products (
  id           text PRIMARY KEY,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  price_amount integer NOT NULL CHECK (price_amount >= 0),
  currency     text NOT NULL CHECK (currency IN ('USD', 'EUR', 'GBP')),
  category_id  text NOT NULL REFERENCES categories(id),
  image_url    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_products_category_idx ON catalog_products (category_id);
