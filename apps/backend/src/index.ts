import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users, queues, programs, staff } from '../db/schema';
import { zeroPadding } from '../utils/zeroPadding';
import { v4 as uuidv4 } from 'uuid';
import { bearerAuth } from 'hono/bearer-auth';
import { and, eq, gt, lt, or } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import dotenv from 'dotenv';
import cryptoRandomString from 'crypto-random-string';
import { hashPassword, verifyPassword } from '../utils/password';

dotenv.config();

const app = new Hono();

const queryClient = postgres(process.env.DATABASE_URL || "postgres://postgres:postgres@db:5432");
const db = drizzle(queryClient);

const idPrefix = "MC";
const callWaitingTime = 1000 * 60 * 30; // 30分

// ユーザーが初回アクセス時にトークンを発行する
app.post('/register', async (c) => {
  try {
    const result = await db.insert(users).values({
      createdAt: new Date()
    }).returning({ id: users.id, token: users.token })
    const user = result[0];
    if (!user) {
      return c.json({ success: false, error: "Failed to register" }, 500);
    }

    return c.json({ success: true, id: user.id, screenId: idPrefix + zeroPadding(user.id, 5), token: user.token });
  } catch (e) {
    return c.json({ success: false, error: "Failed to register" }, 500);
  }
})

// 出し物の一覧を取得する
app.get('/programs', async (c) => {
  const _programs = await db.select().from(programs).where(eq(programs.public, true));
  return c.json(_programs.map(_v => {
    return {
      id: _v.id,
      name: _v.name,
      description: _v.description,
      category: _v.category,
      grade: _v.grade,
      className: _v.className
    }
  }));
})

// ユーザーがトークンを使ってアクションを行う際の認証
app.use("/visitor/*",
  zValidator(
    "json",
    z.object({
      userId: z.number(),
    })
  ),
  bearerAuth({
    verifyToken: async (token, c) => {
      try {
        const { userId } = await c.req.json();
        const user = await db.select().from(users).where(and(eq(users.token, token), eq(users.id, userId)));
        return !!user[0];
      } catch (e) {
        return false;
      }
    },
  })
)

// ユーザーが並んでいる出し物
app.post("/visitor/queue",
  zValidator(
    "json",
    z.object({
      userId: z.number(),
    })
  ), async (c) => {
    const { userId } = c.req.valid("json");

    const queue = await db.select().from(queues).where(
      and(eq(queues.userId, userId),
        or(eq(queues.status, "wait"),
          and(eq(queues.status, "called"),
            gt(queues.calledAt,
              new Date(Date.now() - callWaitingTime),
            ),
          )
        )
      )
    );

    return c.json(queue.map((q) => {
      return {
        success: true,
        status: q.status,
        programId: q.programId,
        calledAt: q.calledAt,
      }
    }));

  });

// ユーザーが出し物に並ぶ
app.post("/visitor/wait",
  zValidator(
    "json",
    z.object({
      userId: z.number(),
      programId: z.string().uuid(),
    })
  ), async (c) => {
    const { userId, programId } = c.req.valid("json");

    // programIdが存在するかつ公開されているか確認
    const program = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.public, true), eq(programs.waitEnabled, true)));

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
          ),
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
      createdAt: new Date(),
      programId,
    });

    return c.json({
      success: true,
      message: "Waiting",
    })
  })

app.put("/visitor/cancel", zValidator(
  "json",
  z.object({
    userId: z.number(),
    programId: z.string().uuid(),
  })
), async (c) => {
  const { userId, programId } = c.req.valid("json");


  await db.update(queues).set({ status: "canceled" }).where(
    and(
      eq(queues.userId, userId),
      eq(queues.programId, programId),
      or(eq(queues.status, "wait"), eq(queues.status, "called")),
    )
  );

  return c.json({ success: true, message: "Cancelled waiting" })
})

app.get("/staff/login", (c) => {
  return c.json({ message: "Logged in" })
});



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

// スーパーアドミンの認証
app.use(
  '/admin/*',
  bearerAuth({
    verifyToken: async (token, c) => {
      return !!process.env.SUPER_PASSWORD_HASH && await verifyPassword(token, process.env.SUPER_PASSWORD_HASH)
    },
  })
)

// スタッフのアカウントの一覧を取得
app.get("/admin/staff", async (c) => {
  const staffList = await db.select().from(staff);
  return c.json(staffList.map((staff) => ({ id: staff.id, name: staff.name })));
});

// スタッフのアカウントを作成
const createUserSchema = z.object({
  nameList: z.array(z.string()),
});
app.post("/admin/staff/create",
  zValidator("json", createUserSchema),
  async (c) => {
    const { nameList } = c.req.valid("json");
    const staffList = await Promise.all(nameList
      .filter((name, index, self) => self.indexOf(name) === index)
      .map(async (name) => {
        const password = cryptoRandomString({ length: 10 });
        return {
          name,
          password: password,
          passwordHash: await hashPassword(password),
        }
      }));

    const insertedStaff = await db.insert(staff).values(staffList.map((staff) => ({
      name: staff.name,
      passwordHash: staff.passwordHash,
      createdAt: new Date(),
    }))).onConflictDoNothing().returning({ name: staff.name });

    return c.json({ success: true, staffList: insertedStaff });
  });

// スタッフのアカウントを削除
app.delete("/admin/staff/:userId",
  zValidator("param", z.object({
    userId: z.string().uuid(),
  })),
  async (c) => {
    const { userId } = c.req.valid("param");

    await db.delete(staff).where(eq(staff.id, userId));

    return c.json({ success: true });
  });

const port = 8080
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
