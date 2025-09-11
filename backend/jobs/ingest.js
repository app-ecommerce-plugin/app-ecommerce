// jobs/ingest.js
const fetch = require("node-fetch");
const redis = require("../utils/redisClient");

(async () => {
  const shops = await redis.sMembers("shops"); // set de tiendas
  for (const shop of shops) {
    const url = `${
      process.env.BACKEND_BASE_URL
    }/competitors/ingest?shop=${encodeURIComponent(shop)}`;
    try {
      const r = await fetch(url, { method: "POST" });
      const j = await r.json();
      console.log(
        `[ingest][${shop}] ok=${j.success} count=${
          j?.report?.consolidatedCount ?? "?"
        }`
      );
    } catch (e) {
      console.error(`[ingest][${shop}]`, e.message);
    }
  }
  process.exit(0);
})();
