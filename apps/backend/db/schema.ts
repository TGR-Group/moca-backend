import { boolean, integer, pgEnum, pgTable, serial, uniqueIndex, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    token: uuid('token').defaultRandom().unique().notNull(),
    createdAt: timestamp('created_at').notNull(),
});

export const queues = pgTable('queues', {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    calledAt: timestamp('called_at'),
    inAt: timestamp('in_at'),
    exitedAt: timestamp('exited_at'),
    status: varchar('status', { enum: ["wait", "called", "in", "exited", "canceled"] }).notNull(),
    programId: uuid('program_id').notNull(),
});

export const programs = pgTable('programs', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name').notNull(),
    description: varchar('description').notNull(),
    className: varchar('class_name').notNull(),
    public: boolean('public').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
});