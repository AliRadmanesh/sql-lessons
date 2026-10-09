// SQL lesson kit · engine probe: node kit.test_engine.js [seed.sql]  — prints results/errors for ad-hoc statements. Add show(...) lines for new engine features.
const M=require('./kit.engine.js'); const fs=require('fs'); const seed=fs.readFileSync(process.argv[2]||'l01.seed.sql','utf8');
const show=(sql)=>{const db=M.create(seed); try{ for(const r of db.exec(sql)){ if(r.type==='rows'){console.log(r.columns.join(' | ')); r.rows.forEach(x=>console.log(x.map((v,i)=>M.formatValue(v,r.colTypes[i])).join(' | ')))} else console.log(r.msg, r.flag||'')} }catch(e){console.log('ERR:',e.message)} console.log('---')};
show("SELECT account_id, product_cd, balance FROM account WHERE cust_id = 2");
show("select txn_id, amount from transaction where txn_type_cd='dbt' and amount > 200");
show(`SELECT t.txn_id, t.txn_type_cd, t.txn_date, t.amount
FROM customer i
 INNER JOIN account a ON i.cust_id = a.cust_id
 INNER JOIN product p ON p.product_cd = a.product_cd
 INNER JOIN transaction t ON t.account_id = a.account_id
WHERE i.fname = 'George' AND i.lname = 'Blake' AND p.name = 'checking';`);
show("SELECT cust_id FROM customer c JOIN account a ON c.cust_id=a.cust_id");
show("SELECT customer.fname FROM customer c");
show("INSERT INTO customer VALUES (1,'X','Y')");
show("INSERT INTO account VALUES (200,'CHK',9,1)");
show("DELETE FROM customer WHERE cust_id=1");
show("DELETE FROM transaction; SELECT * FROM transaction");
show("INSERT INTO product (product_cd, name) VALUES ('CD', 'Certificate of Depysit'); UPDATE product SET name = 'Certificate of Deposit' WHERE product_cd = 'CD'; select * from product");
show("UPDATE product SET name='x'");
show("SELECT * FROM account ORDER BY balance DESC LIMIT 2");
show("SELECT fname, lname FROM customer WHERE lname = 'Smith");
show("SELEC * FROM x");
show("SELECT COUNT(*) FROM account");
show("CREATE TABLE corporation (corp_id SMALLINT, name VARCHAR(30), CONSTRAINT pk_corporation PRIMARY KEY (corp_id)); INSERT INTO corporation (corp_id, name) VALUES (27, 'Acme Paper Corporation'); SELECT name FROM corporation WHERE corp_id = 27;");
show("START TRANSACTION; DELETE FROM transaction; ROLLBACK; SELECT txn_id FROM transaction WHERE amount BETWEEN 100 AND 300 ORDER BY 1");
show("describe account; show tables");
show("select balance*2 as dbl, concat(fname,' ',lname) full from account a left join customer c on c.cust_id=a.cust_id where balance is not null and product_cd in ('CHK','MM')");
show("select * from transaction t where t.txn_date like '2004-03%'");
