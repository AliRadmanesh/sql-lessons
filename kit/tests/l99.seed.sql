CREATE TABLE customer (
  id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  text NOT NULL,
  tier  varchar(10) NOT NULL DEFAULT 'free'
);
CREATE TABLE orders (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customer (id),
  amount      numeric(8,2) NOT NULL,
  placed      date NOT NULL
);
INSERT INTO customer (name, tier) VALUES ('Ada', 'pro'), ('Grace', 'free'), ('Linus', 'pro');
INSERT INTO orders (customer_id, amount, placed) VALUES
  (1, 120.50, '2026-01-05'), (1, 30.00, '2026-02-11'), (2, 15.25, '2026-02-14'), (3, 999.99, '2026-03-01');
