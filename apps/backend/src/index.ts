import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users } from '../db/schema';
import { zeroPadding } from '../utils/zeroPadding';
import { v4 as uuidv4 } from 'uuid';
import { bearerAuth } from 'hono/bearer-auth';
import { eq } from 'drizzle-orm';

const app = new Hono()

const queryClient = postgres(process.env.DATABASE_URL || "postgres://postgres:postgres@db:5432");
const db = drizzle(queryClient);

const idPrefix = "MC";

app.post('/register', async (c) => {
  try {
    const token = uuidv4();
    const result = await db.insert(users).values({
      createdAt: new Date().toISOString(),
      token
    }).returning({ id: users.id, token: users.token })
    const user = result[0];
    if (!user) {
      return c.json({ error: "Failed to register" }, 500);
    }

    return c.json({ id: idPrefix + zeroPadding(user.id, 5), token: user.token });
  } catch (e) {
    return c.json({ error: "Failed to register" }, 500);
  }
})

app.use("/visitor/*", bearerAuth({
  verifyToken: async (token) => {
    const user = await db.select().from(users).where(eq(users.token, token))
    return !!user[0];
  },
}))

app.post("/visitor/wait", (c) => {
  return c.json({ message: "Waiting for staff to call" })
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
