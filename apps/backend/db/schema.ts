import { integer, pgEnum, pgTable, serial, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

// declaring enum in database
export const popularityEnum = pgEnum('popularity', ['unknown', 'known', 'popular']);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    token: varchar('token').notNull(),
    createdAt: varchar('created_at').notNull(),
});
