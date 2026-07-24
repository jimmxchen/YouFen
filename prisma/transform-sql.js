const fs = require('fs');
let sql = fs.readFileSync(__dirname + '/raw.sql', 'utf8');

// CREATE TYPE -> DO block
sql = sql.replace(/CREATE TYPE "(\w+)" AS ENUM \(([^)]+)\);/g, (_, name, values) => {
  return `DO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN\n    CREATE TYPE "${name}" AS ENUM (${values});\n  END IF;\nEND$$;`;
});

// CREATE TABLE -> CREATE TABLE IF NOT EXISTS
sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');

// CREATE UNIQUE INDEX -> CREATE UNIQUE INDEX IF NOT EXISTS
sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');

// AddForeignKey -> DO block
sql = sql.replace(/ALTER TABLE "(\w+)" ADD CONSTRAINT "(\w+)" FOREIGN KEY \(([^)]+)\) REFERENCES "(\w+)"\(([^)]+)\)(.*?);/gs, (match, table, constraint) => {
  return `DO $$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${constraint}') THEN\n    ${match.trim()}\n  END IF;\nEND$$;`;
});

fs.writeFileSync(__dirname + '/init.sql', '-- CreateSchema\nCREATE SCHEMA IF NOT EXISTS "public";\n\n' + sql);
console.log('Done, lines:', sql.split('\n').length);
