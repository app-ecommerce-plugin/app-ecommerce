require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const { RedisStore } = require("connect-redis");
const redisClient = require("./utils/redisClient");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.set("trust proxy", 1);
app.use(express.json());
app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: true, httpOnly: true, maxAge: 86400000 },
  })
);

// Routes
app.use("/shopify", require("./routes/auth"));
app.use("/shopify", require("./routes/products"));
app.use("/shopify", require("./routes/selection"));
app.use("/shopify", require("./routes/comparison"));
app.use("/debug", require("./routes/debug"));

// Root
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente en Render");
});

// Start
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});

// Verificación opcional de presencia de OPENAI_API_KEY
if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️  No se ha definido OPENAI_API_KEY. Las comparaciones semánticas estarán deshabilitadas.");
}