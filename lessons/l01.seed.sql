CREATE TABLE customer (
  cust_id SMALLINT UNSIGNED,
  fname   VARCHAR(20),
  lname   VARCHAR(20),
  CONSTRAINT pk_customer PRIMARY KEY (cust_id)
);
CREATE TABLE product (
  product_cd VARCHAR(10),
  name       VARCHAR(50),
  CONSTRAINT pk_product PRIMARY KEY (product_cd)
);
CREATE TABLE account (
  account_id INT,
  product_cd VARCHAR(10),
  cust_id    SMALLINT UNSIGNED,
  balance    DECIMAL(10,2),
  CONSTRAINT pk_account PRIMARY KEY (account_id),
  CONSTRAINT fk_account_cust FOREIGN KEY (cust_id) REFERENCES customer (cust_id),
  CONSTRAINT fk_account_prod FOREIGN KEY (product_cd) REFERENCES product (product_cd)
);
CREATE TABLE transaction (
  txn_id      INT,
  txn_type_cd CHAR(3),
  account_id  INT,
  amount      DECIMAL(10,2),
  txn_date    DATE,
  CONSTRAINT pk_transaction PRIMARY KEY (txn_id),
  CONSTRAINT fk_txn_account FOREIGN KEY (account_id) REFERENCES account (account_id)
);
INSERT INTO customer (cust_id, fname, lname) VALUES (1, 'George', 'Blake'), (2, 'Sue', 'Smith');
INSERT INTO product (product_cd, name) VALUES
  ('CHK', 'Checking'), ('SAV', 'Savings'), ('MM', 'Money market'), ('LOC', 'Line of credit');
INSERT INTO account (account_id, product_cd, cust_id, balance) VALUES
  (103, 'CHK', 1, 75.00), (104, 'SAV', 1, 250.00), (105, 'CHK', 2, 783.64),
  (106, 'MM', 2, 500.00), (107, 'LOC', 2, 0);
INSERT INTO transaction (txn_id, txn_type_cd, account_id, amount, txn_date) VALUES
  (978, 'DBT', 103, 100.00, '2004-01-22'), (979, 'CDT', 103, 25.00, '2004-02-05'),
  (980, 'DBT', 104, 250.00, '2004-03-09'), (981, 'DBT', 105, 1000.00, '2004-03-25'),
  (982, 'CDT', 105, 138.50, '2004-04-02'), (983, 'CDT', 105, 77.86, '2004-04-04'),
  (984, 'DBT', 106, 500.00, '2004-03-27');
