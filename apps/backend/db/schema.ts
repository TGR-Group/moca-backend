import { boolean, integer, pgEnum, pgTable, serial, uniqueIndex, uuid, varchar, timestamp, json } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    token: uuid('token').defaultRandom().unique().notNull(),
    createdAt: timestamp('created_at').notNull(),
});

export const queues = pgTable('queues', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: integer('user_id').notNull(),
    createdAt: timestamp('created_at').notNull(),
    calledAt: timestamp('called_at'),
    inAt: timestamp('in_at'),
    exitedAt: timestamp('exited_at'),
    stayLength: integer('stay_length'),
    status: varchar('status', { enum: ["wait", "called", "in", "exited", "canceled"] }).notNull(),
    programId: uuid('program_id').notNull(),
});

export const programs = pgTable('programs', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name').notNull(),
    description: varchar('description').notNull(),
    summary: varchar('summary').notNull(),
    category: varchar('category', { enum: ["食販", "飲食店", "物販", "体験型", "展示", "イベント", "その他"] }).default("その他").notNull(),
    grade: varchar('grade', { enum: ["1年生", "2年生", "3年生", "部活", "その他"] }).default("その他").notNull(),
    className: varchar('class_name'),
    place: varchar('place').notNull(),
    menu: json('menu'),
    staffId: varchar('staff_id').notNull(),
    waitEnabled: boolean('wait_enabled').default(true).notNull(),
    timeTable: json('time_table'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
});

export const staff = pgTable('staff', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name').notNull().unique(),
    passwordHash: varchar('password_hash').notNull(),
    createdAt: timestamp('created_at').notNull(),
});

export const stockStatus = pgTable('stock_status', {
    id: serial('id').primaryKey(),
    quantity: integer('quantity').notNull(),
    lastUpdated: timestamp('last_updated').defaultNow(),
    programId: uuid('program_id').notNull(),
    updatedBy: uuid('updated_by').references(() => staff.id)
});

export const lostProperty = pgTable('lost_property', {
    id: serial('id').primaryKey(),
    lostPropertyName: varchar('lostproperty_name', { length: 50 }).notNull(),
    status: boolean('status').notNull().default(false),
    foundBy: uuid('found_by').references(() => staff.id)
});
