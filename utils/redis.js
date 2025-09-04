const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  tls: {}, // required for Upstash (it enforces TLS)
});

module.exports = redis;
