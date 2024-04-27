import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users, queues, programs } from '../db/schema';
import { zeroPadding } from '../utils/zeroPadding';
import { v4 as uuidv4 } from 'uuid';
import { bearerAuth } from 'hono/bearer-auth';
import { and, eq, gt, lt, or } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { extractNumbersFromString } from '../utils/extractNumbersFromString';

const app = new Hono()

const queryClient = postgres(process.env.DATABASE_URL || "postgres://postgres:postgres@db:5432");
const db = drizzle(queryClient);

const idPrefix = "MC";
const callWaitingTime = 1000 * 60 * 30; // 30分

// ユーザーが初回アクセス時にトークンを発行する
app.post('/register', async (c) => {
  try {
    const token = uuidv4();
    const result = await db.insert(users).values({
      createdAt: new Date(),
      token
    }).returning({ id: users.id, token: users.token })
    const user = result[0];
    if (!user) {
      return c.json({ success: false, error: "Failed to register" }, 500);
    }

    return c.json({ success: true, id: idPrefix + zeroPadding(user.id, 5), token: user.token });
  } catch (e) {
    return c.json({ success: false, error: "Failed to register" }, 500);
  }
})

// 出し物の一覧を取得する
app.get('/programs', async (c) => {
  const _programs = await db.select().from(programs).where(eq(programs.public, true));
  return c.json(_programs);
})

// ユーザーがトークンを使ってアクションを行う際の認証
app.use("/visitor/*",
  bearerAuth({
    verifyToken: async (token, c) => {
      const { user_id: userId }: { user_id?: string } = await c.req.json();
      if (!userId || !parseInt(extractNumbersFromString(userId))) {
        return false;
      }
      const user = await db.select().from(users).where(and(eq(users.token, token), eq(users.id, parseInt(extractNumbersFromString(userId)))));
      return !!user[0];
    },
  })
)

// ユーザーが出し物に並ぶ
app.post("/visitor/wait",
  zValidator(
    "json",
    z.object({
      user_id: z.string(),
      program_id: z.string(),
    })
  ), async (c) => {
    const { user_id, program_id: programId } = c.req.valid("json");
    const userId = parseInt(extractNumbersFromString(user_id));

    // programIdが存在するかつ公開されているか確認
    const program = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.public, true)));

    if (!program[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    // すでに並んでいるか確認 
    const queue = await db.select().from(queues).where(
      or(
        and(eq(queues.userId, userId), eq(queues.status, "wait")),
        and(eq(queues.userId, userId), eq(queues.status, "called"),
          gt(queues.calledAt,
            new Date(Date.now() - callWaitingTime),
          )
        )
      )
    );

    if (queue[0]) {
      return c.json({ success: false, error: "Already waiting" }, 400);
    }

    // 並ぶ
    await db.insert(queues).values({
      userId,
      status: "wait",
      createdAt: new Date()
    });

    return c.json({ message: "Waiting for staff to call" + userId })
  })

app.post("/visitor/cancel", (c) => {
  return c.json({ message: "Cancelled waiting" })
})

app.post("/staff/call", (c) => {
  return c.json({ message: "Calling next visitor" })
})

app.post("/staff/enter", (c) => {
  return c.json({ message: "Entering visitor" })
})

app.post("/staff/quit", (c) => {
  return c.json({ message: "Quitting visitor" })
})

app.get("/staff/wait", (c) => {
  return c.json({ message: "Waiting for visitor" })
})

app.get("/staff/called", (c) => {
  return c.json({ message: "Visitor called" })
})

const port = 8080
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
