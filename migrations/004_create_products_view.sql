-- Read-only surface other services may query. Columns here are a contract.
CREATE VIEW products AS
  SELECT id, name, price_amount, currency, category_id
  FROM catalog_products;
