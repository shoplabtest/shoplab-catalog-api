-- Products are archived instead of deleted, so order history and carts can still resolve them.
ALTER TABLE catalog_products
  ADD COLUMN status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  ADD COLUMN archived_at timestamptz;

CREATE INDEX catalog_products_active_category_idx ON catalog_products (category_id) WHERE status = 'active';

-- Appending a column keeps the existing view columns in place.
CREATE OR REPLACE VIEW products AS
  SELECT id, name, price_amount, currency, category_id, status
  FROM catalog_products;
