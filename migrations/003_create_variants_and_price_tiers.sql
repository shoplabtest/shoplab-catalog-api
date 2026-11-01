CREATE TABLE product_variants (
  id         text PRIMARY KEY,
  product_id text NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  sku        text NOT NULL UNIQUE,
  name       text NOT NULL
);

CREATE TABLE price_tiers (
  product_id   text NOT NULL REFERENCES catalog_products(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL CHECK (min_quantity > 1),
  price_amount integer NOT NULL CHECK (price_amount >= 0),
  PRIMARY KEY (product_id, min_quantity)
);
