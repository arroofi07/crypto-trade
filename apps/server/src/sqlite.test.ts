import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

it('loads the native SQLite module and executes a transaction on this runtime', () => {
  const db = new Database(':memory:');
  try {
    db.exec('CREATE TABLE smoke (value TEXT NOT NULL)');
    db.transaction(() => db.prepare('INSERT INTO smoke VALUES (?)').run('0.000000000000000001'))();
    expect(db.prepare('SELECT value FROM smoke').get()).toEqual({ value: '0.000000000000000001' });
    expect(() => db.transaction(() => { db.exec("INSERT INTO smoke VALUES ('rollback')"); throw new Error('abort'); })()).toThrow('abort');
    expect(db.prepare('SELECT COUNT(*) AS count FROM smoke').get()).toEqual({ count: 1 });
  } finally { db.close(); }
});
