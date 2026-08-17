// Points every test at the disposable fake_review_test database (schema
// already loaded via db/schema.sql + indexes.sql + views.sql + triggers.sql)
// instead of the seeded development database.
process.env.DATABASE_URL = 'postgresql://postgres@127.0.0.1:5544/fake_review_test';
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
