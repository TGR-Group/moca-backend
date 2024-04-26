import { boolean, integer, pgEnum, pgTable, serial, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    token: varchar('token').notNull(),
    createdAt: varchar('created_at').notNull(),
});

export const queues = pgTable('queues', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    createdAt: varchar('created_at').notNull(),
    status: varchar('status', { enum: ["wait", "called", "in", "exited"] }).notNull(),
});

export const programs = pgTable('programs', {
    id: varchar('id').primaryKey(),
    name: varchar('name').notNull(),
    description: varchar('description').notNull(),
    className: varchar('class_name').notNull(),
    public: boolean('public').notNull(),
});