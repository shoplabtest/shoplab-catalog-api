CREATE TABLE categories (
  id        text PRIMARY KEY,
  parent_id text REFERENCES categories(id),
  name      text NOT NULL
);
CREATE INDEX categories_parent_id_idx ON categories (parent_id);
