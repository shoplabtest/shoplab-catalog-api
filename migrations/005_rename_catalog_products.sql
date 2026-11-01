-- The table is renamed; the `products` view keeps the same name and columns so readers are unaffected.
DROP VIEW products;
ALTER TABLE catalog_products RENAME TO catalog_items;
CREATE VIEW products AS
  SELECT id, name, price_amount, currency, category_id
  FROM catalog_items;
