require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");

//  connect-redis@8.x expone la clase **RedisStore** directamente:
const { RedisStore } = require("connect-redis");

const redisClient = require("./utils/redisClient");

const app = express();
const PORT = process.env.PORT || 3000;

/* ----------  MIDDLEWARE  ---------- */
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

app.use(
  session({
    store: new RedisStore({ client: redisClient }), // 👈  usa el cliente ya conectado
    secret: process.env.SESSION_SECRET || "dev-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // pon true en producción HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 24 h
    },
  })
);


/* ----------  ROUTES  ---------- */
app.use("/shopify", require("./routes/products"));
app.use("/compare", require("./routes/comparison"));
app.use("/auth", require("./routes/auth")); // stub (501)

/* ----------  DEFAULT ---------- */
app.get("/", (_, res) => res.json({ ok: true, msg: "Backend alive" }));

app.listen(PORT, () => console.log(`🚀  Server ready on :${PORT}`));
