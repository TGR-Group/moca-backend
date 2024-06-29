import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users, queues, programs, staff , stockStatus , lostProperty } from '../db/schema';
import { zeroPadding } from '../utils/zeroPadding';
import { v4 as uuidv4 } from 'uuid';
import { bearerAuth } from 'hono/bearer-auth';
import { and, avg, count, eq, gt, isNotNull, lt, ne, or, sql, sum } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import dotenv from 'dotenv';
import cryptoRandomString from 'crypto-random-string';
import { hashPassword, verifyPassword } from '../utils/password';
import { basicAuth } from 'hono/basic-auth';
import { getAuthUserId, getStaffUserId } from '../utils/getAuthUserId';
import { interval } from 'drizzle-orm/pg-core';
import { cors } from 'hono/cors'
import { table, time } from 'console';
import { year } from 'drizzle-orm/mysql-core';
import { highlight } from 'vitest/utils.js';
import { m } from 'vitest/dist/reporters-yx5ZTtEV.js';


dotenv.config();

const app = new Hono();

const queryClient = postgres(process.env.DATABASE_URL || "postgres://postgres:postgres@db:5432");
const db = drizzle(queryClient);

const idPrefix = "MC";
const callWaitingTime = 1000 * 60 * 30; // 30分

app.use('*', cors({
  origin: ['http://127.0.0.1','https://app.project-moca.com','https://staff.project-moca.com','https://staff-admin.project-moca.com'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

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
  const _programs = await db.select().from(programs);
  return c.json({
    success: true,
    programs:_programs.map(_v => {
      return {
        id: _v.id,
        name: _v.name,
        description: _v.description,
        summary: _v.summary,
        category: _v.category,
        grade: _v.grade,
        className: _v.className,
        place: _v.place,
        waitEnabled: _v.waitEnabled
      }
  })});
})

// 待ち時間を含めた出し物の詳細を取得する
app.get('/program/:id', zValidator(
  "param",
  z.object({
    id: z.string().uuid()
  })
), async (c) => {
  const { id } = c.req.valid("param");

  const programList = await db.select().from(programs).where(eq(programs.id, id));
  if (!programList[0]) {
    return c.json({ success: false, error: "Program not found" }, 404);
  }

  const program = programList[0];

  const queueList = await db.select({
    averageDurationSeconds: avg(
      queues.stayLength
    )
  }).from(queues).where(
    and(
      eq(queues.programId, id),
      eq(queues.status, "exited"),
      isNotNull(queues.stayLength),
    )
  );

  const waitingCount = await db.select({
    count: count(queues.id)
  }).from(queues).where(
    and(
      eq(queues.programId, id),
      or(
        eq(queues.status, "wait"),
        and(eq(queues.status, "called"),
          gt(queues.calledAt,
            new Date(Date.now() - callWaitingTime),
          ),
        )
      )
    )
  );

  return c.json({
    success: true,
    id: program.id,
    name: program.name,
    description: program.description,
    summary: program.summary,
    category: program.category,
    grade: program.grade,
    className: program.className,
    menu: program.menu,
    place: program.place,
    waitEnabled: program.waitEnabled,
    timeTable: program.timeTable,
    avgStayLength: queueList[0]?.averageDurationSeconds || null,
    waitingCount: waitingCount[0].count,
  });
})

// ユーザーがトークンを使ってアクションを行う際の認証
app.use("/visitor/*",
  basicAuth({
    verifyUser: async (username, password) => {
      try {
        if (!username || !password || !parseInt(username)) return false;
        const user = await db.select().from(users).where(and(eq(users.token, password), eq(users.id, parseInt(username))));
        return !!user[0];
      } catch (e) {
        return false;
      }
    },
  })
)

// ユーザーが並んでいる出し物
app.get("/visitor/queue", async (c) => {
  const userId = getAuthUserId(c);

  if (!userId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

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

  return c.json({
    success: true, queue: await Promise.all(queue.map(async (q) => {
      let waitingCount = null;
      try {
        const waitingCountList = await db.select({
          count: count(queues.id)
        }).from(queues).where(
          and(
            eq(queues.programId, q.programId),
            lt(queues.createdAt, q.createdAt),
            or(
              eq(queues.status, "wait"),
              and(eq(queues.status, "called"),
                gt(queues.calledAt,
                  new Date(Date.now() - callWaitingTime),
                ),
              )
            )
          )
        );

        waitingCount = waitingCountList[0].count;

      } catch (e) { }

      return {
        status: q.status,
        programId: q.programId,
        waitedAt: q.createdAt,
        calledAt: q.calledAt,
        waitingCount: waitingCount,
      }
    }))
  });

});

// ユーザーが出し物に並ぶ
app.post("/visitor/wait",
  zValidator(
    "json",
    z.object({
      programId: z.string().uuid(),
    })
  ), async (c) => {
    const userId = getAuthUserId(c);

    if (!userId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const { programId } = c.req.valid("json");

    // programIdが存在するか確認
    const program = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.waitEnabled, true)));

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
// ユーザーが出し物に並ぶ
app.post("/guest/wait",
  zValidator(
    "json",
    z.object({
      programId: z.string().uuid(),
      userId: z.number(),
    })
  ), async (c) => {

    const { programId, userId } = c.req.valid("json");

    // programIdが存在するか確認
    const program = await db.select().from(programs).where(and(eq(programs.id, programId), eq(programs.waitEnabled, true)));

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
// 出し物の並びをキャンセル
app.put("/visitor/cancel", zValidator(
  "json",
  z.object({
    programId: z.string().uuid(),
  })
), async (c) => {
  const userId = getAuthUserId(c);

  if (!userId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { programId } = c.req.valid("json");


  await db.update(queues).set({ status: "canceled" }).where(
    and(
      eq(queues.userId, userId),
      eq(queues.programId, programId),
      or(eq(queues.status, "wait"), eq(queues.status, "called")),
    )
  );

  return c.json({ success: true, message: "Cancelled waiting" })
})

// staffの認証
app.use("/staff/*",
  basicAuth({
    verifyUser: async (username, password) => {
      try {
        if (!username || !password) return false;
        const user = await db.select().from(staff).where(eq(staff.name, username));
        if (!!user[0]) {
          return await verifyPassword(password, user[0].passwordHash);
        } else {
          return false;
        }
      } catch (e) {
        return false;
      }
    },
  })
)

app.get("/staff/auth", async (c) => {
  const staffId = getStaffUserId(c);

  if (!staffId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }else{
    return c.json({ success: true }, 200);
  }

})

// プログラム一覧を取得する
app.get("/staff/program", async (c) => {
  const staffId = getStaffUserId(c);

  if (!staffId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const programList = await db.select().from(programs).where(eq(programs.staffId, staffId));
  return c.json({
    success: true,
    programs:programList.map((program) => ({
      id: program.id,
      name: program.name,
      description: program.description,
      summary: program.summary,
      category: program.category,
      grade: program.grade,
      className: program.className,
      waitEnabled: program.waitEnabled,
      place: program.place,
    }
  ))});
})

// プログラムを登録する
app.post("/staff/program", zValidator(
  "json",
  z.object({
    name: z.string(),
    description: z.string(),
    summary: z.string(),
    category: z.enum(["食販", "飲食店", "物販", "体験型", "展示", "イベント", "その他"]),
    grade: z.enum(["1年生", "2年生", "3年生", "部活", "その他"]),
    className: z.string(),
    menu: z.array(z.object(
      {
        name: z.string(),
        description: z.string().optional(),
        price: z.number(),
      }
    )).nullable(),
    place: z.string(),
    waitEnabled: z.boolean(),
    timeTable: z.object(
      {
        tableName: z.string(),
        year: z.number(),
        month: z.number(),
        day: z.number(),
        table: z.array(z.object(
          {
            content: z.string(),
            start: z.object(
              {
                hour: z.number().optional(),
                minute: z.number().optional(),
              }
            ).default({}),
            end: z.object(
              {
                hour: z.number().optional(),
                minute: z.number().optional(),
              }
            ).default({}),
          })),
          highlight: z.boolean().default(false),
          pageLink: z.string().optional(),
      }
    ).nullable(),
  })
), async (c) => {
  const staffId = getStaffUserId(c);

  if (!staffId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { name, description, summary, category, grade, className, menu, place, waitEnabled, timeTable } = c.req.valid("json");

  let program;
  try {
    program = await db.insert(programs).values({
      name,
      description,
      summary,
      category,
      grade,
      className,
      staffId,
      menu,
      place,
      waitEnabled,
      timeTable,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning({ id: programs.id });
  } catch (e) {
    return c.json({ success: false, error: e }, 500);
  }

  return c.json({ success: true, programId: program[0].id });
})

// プログラムを削除する
app.delete("/staff/program/:programId", zValidator(
  "param",
  z.object({
    programId: z.string().uuid(),
  })
), async (c) => {
  const staffId = getStaffUserId(c);

  if (!staffId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { programId } = c.req.valid("param");

  const deleteProgramList = await db.delete(programs).where(and(eq(programs.id, programId), eq(programs.staffId, staffId))).returning({ id: programs.id });

  if (!deleteProgramList[0]) {
    return c.json({ success: false, error: "Program not found" }, 404);
  }

  return c.json({ success: true });
})

// プログラムを変更する
app.put("/staff/program/:programId", zValidator(
  "param",
  z.object({
    programId: z.string().uuid(),
  })
), zValidator(
  "json",
  z.object({
    name: z.string(),
    description: z.string(),
    summary: z.string(),
    category: z.enum(["食販", "飲食店", "物販", "体験型", "展示", "イベント", "その他"]),
    grade: z.enum(["1年生", "2年生", "3年生", "部活", "その他"]),
    className: z.string(),
    menu: z.array(z.object(
      {
        name: z.string(),
        description: z.string().optional(),
        price: z.number(),
      }
    )).nullable(),
    place: z.string(),
    waitEnabled: z.boolean(),
    timeTable: z.object(
      {
        tableName: z.string(),
        year: z.number(),
        month: z.number(),
        day: z.number(),
        table: z.array(z.object(
          {
            content: z.string(),
            start: z.object(
              {
                hour: z.number().optional(),
                minute: z.number().optional(),
              }
            ).default({}),
            end: z.object(
              {
                hour: z.number().optional(),
                minute: z.number().optional(),
              }
            ).default({}),
          })),
          highlight: z.boolean().default(false),
          pageLink: z.string().optional(),
      }
    ).nullable(),
  })
), async (c) => {
  const staffId = getStaffUserId(c);

  if (!staffId) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  const { programId } = c.req.valid("param");
  const { name, description, summary, category, grade, className, menu, place, waitEnabled, timeTable } = c.req.valid("json");

  try {
    const updateProgramList = await db.update(programs).set({
      name,
      description,
      summary,
      category,
      grade,
      className,
      staffId,
      menu,
      place,
      waitEnabled,
      timeTable,
      updatedAt: new Date(),
    }).where(and(eq(programs.id, programId), eq(programs.staffId, staffId))).returning({ id: programs.id });

    if (!updateProgramList[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    return c.json({ success: true });
  } catch (e) {
    return c.json({ success: false, error: "Failed to update" }, 500);
  }
})

app.post("/staff/call/:programId",
  zValidator("param", z.object({
    programId: z.string().uuid(),
  })),
  zValidator("json", z.object({
    userId: z.number(),
  })), async (c) => {
    const { programId: _programId } = c.req.valid("param");
    const { userId } = c.req.valid("json");

    const staffId = getStaffUserId(c);

    if (!staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const queueDataList = await db.select().from(queues).where(and(eq(queues.userId, userId), eq(queues.programId, _programId), eq(queues.status, "wait")));
    if (!queueDataList[0]) {
      return c.json({ success: false, error: "Queue not found" }, 404);
    }

    const queueData = queueDataList[0];

    const programId = queueData.programId;

    const programDataList = await db.select().from(programs).where(eq(programs.id, programId));
    if (!programDataList[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    const programData = programDataList[0];

    if (staffId !== programData.staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    await db.update(queues).set({
      status: "called",
      calledAt: new Date(),
    }).where(eq(queues.id, queueData.id));

    return c.json({ success: true });
  })

app.post("/staff/enter/:programId", zValidator("param", z.object({
  programId: z.string().uuid(),
})),
  zValidator("json", z.object({
    userId: z.number(),
  })), async (c) => {
    const { programId: _programId } = c.req.valid("param");
    const { userId } = c.req.valid("json");

    const staffId = getStaffUserId(c);

    if (!staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const queueDataList = await db.select().from(queues).where(and(eq(queues.userId, userId), eq(queues.programId, _programId), eq(queues.status, "called"), isNotNull(queues.calledAt)));
    if (!queueDataList[0]) {
      return c.json({ success: false, error: "Queue not found" }, 404);
    }

    const queueData = queueDataList[0];

    if (!queueData.calledAt) {
      return c.json({ success: false, error: "Not called yet" }, 400);
    }

    const programId = queueData.programId;

    const programDataList = await db.select().from(programs).where(eq(programs.id, programId));
    if (!programDataList[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    const programData = programDataList[0];

    if (staffId !== programData.staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    if (queueData.calledAt < new Date(Date.now() - callWaitingTime)) {
      return c.json({ success: false, error: "Time out" }, 400);
    }

    await db.update(queues).set({
      status: "in",
      inAt: new Date(),
    }).where(eq(queues.id, queueData.id));

    return c.json({ success: true });

  })

app.post("/staff/quit/:programId",
  zValidator("param", z.object({
    programId: z.string().uuid(),
  })),
  zValidator("json", z.object({
    userId: z.number(),
  }))
  , async (c) => {
    const { programId: _programId } = c.req.valid("param");
    const { userId } = c.req.valid("json");

    const staffId = getStaffUserId(c);

    if (!staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const queueDataList = await db.select().from(queues).where(and(eq(queues.userId, userId), eq(queues.programId, _programId), eq(queues.status, "in"), isNotNull(queues.inAt)));
    if (!queueDataList[0]) {
      return c.json({ success: false, error: "Queue not found" }, 404);
    }

    const queueData = queueDataList[0];

    if (!queueData.inAt) {
      return c.json({ success: false, error: "Not entered yet" }, 400);
    }

    const programId = queueData.programId;

    const programDataList = await db.select().from(programs).where(eq(programs.id, programId));
    if (!programDataList[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    const programData = programDataList[0];

    if (staffId !== programData.staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const inAt = queueData.inAt;
    const exitedAt = new Date();

    const stayLength = Math.floor((exitedAt.getTime() - inAt.getTime()) / 1000);
    await db.update(queues).set({
      status: "exited",
      exitedAt,
      stayLength
    }).where(eq(queues.id, queueData.id));

    return c.json({ success: true });
  })

app.get("/staff/wait/:programId",
  zValidator("param", z.object({
    programId: z.string().uuid(),
  })), async (c) => {
    const programId = c.req.valid("param").programId;

    const staffId = getStaffUserId(c);

    if (!staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const programList = await db.select().from(programs).where(
      and(
        eq(programs.id, programId),
        eq(programs.staffId, staffId),
      )
    );

    if (!programList[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    const queueList = await db.select().from(queues).where(
      and(
        eq(queues.programId, programId),
        eq(queues.status, "wait"),
      )
    );

    return c.json(queueList.map(v => {
      return {
        id: v.id,
        userId: v.userId,
        status: v.status,
        waitedAt: v.createdAt,
      }
    }))
  })

app.get("/staff/called/:programId",
  zValidator("param", z.object({
    programId: z.string().uuid(),
  })), async (c) => {
    const programId = c.req.valid("param").programId;

    const staffId = getStaffUserId(c);

    if (!staffId) {
      return c.json({ success: false, error: "Unauthorized" }, 401);
    }

    const programList = await db.select().from(programs).where(
      and(
        eq(programs.id, programId),
        eq(programs.staffId, staffId),
      )
    );

    if (!programList[0]) {
      return c.json({ success: false, error: "Program not found" }, 404);
    }

    const queueList = await db.select().from(queues).where(
      and(
        eq(queues.programId, programId),
        eq(queues.status, "called"),
        gt(queues.calledAt, new Date(Date.now() - callWaitingTime)),
      )
    );

    return c.json(queueList.map(v => {
      return {
        id: v.id,
        userId: v.userId,
        status: v.status,
        waitedAt: v.createdAt,
        calledAt: v.calledAt,
      }
    }));
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
app.post("/admin/staff/create",
  zValidator("json", z.object({
    nameList: z.array(z.string()),
  })),
  async (c) => {
    const { nameList } = c.req.valid("json");
    const staffList = await Promise.all(nameList
      .filter((name, index, self) => self.indexOf(name) === index)
      .map(async (name) => {
        const password = cryptoRandomString({ length: 15 });
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
    }))).onConflictDoNothing().returning({ name: staff.name, id: staff.id });

    return c.json({
      success: true, staffList: insertedStaff.map((staff) => ({ id: staff.id, name: staff.name, password: staffList.find((s) => s.name === staff.name)?.password }))
    });
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

// 在庫状況の追加
app.post('/add_stock', zValidator('json', z.object({
  itemName: z.string(),
  quantity: z.number()
})), async (c) => {
  const { itemName, quantity } = c.req.valid('json');
  await db.insert(stockStatus).values({ itemName, quantity });
  return c.json({ message: 'Stock item added successfully' });
});

// 在庫状況の取得
app.get('/get_stock/:id', async (c) => {
  const { id } = c.req.param();
  const stock = await db.select().from(stockStatus).where(eq(stockStatus.id, Number(id)));  // idを数値に変換
  if (stock.length === 0) {
    return c.json({ message: 'Stock item not found' }, 404);
  }
  return c.json(stock[0]);
});

// 在庫状況の更新
app.post('/update_stock/:id', zValidator('json', z.object({
  quantity: z.number()
})), async (c) => {
  const { id } = c.req.param();
  const { quantity } = c.req.valid('json');
  await db.update(stockStatus).set({ quantity }).where(eq(stockStatus.id, Number(id)));  // idを数値に変換
  return c.json({ message: 'Stock quantity updated successfully' });
});

// 落とし物の追加
app.post('/add_lostproperty', zValidator('json', z.object({
  lostproperty_name: z.string()
})), async (c) => {
  const { lostproperty_name } = c.req.valid('json');
  await db.insert(lostProperty).values({ lostPropertyName: lostproperty_name });
  return c.json({ message: 'Lost property added successfully' });
});

// 落とし物の取得
app.get('/get_lostproperty', async (c) => {
  const properties = await db.select().from(lostProperty);
  return c.json(properties);
});

// 落とし物の更新
app.post('/update_lostproperty/:id', zValidator('json', z.object({
  status: z.boolean()
})), async (c) => {
  const { id } = c.req.param();
  const { status } = c.req.valid('json');
  await db.update(lostProperty).set({ status }).where(eq(lostProperty.id, Number(id)));  // idを数値に変換
  return c.json({ message: 'Lost property status updated successfully' });
});

const port = 8080
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
