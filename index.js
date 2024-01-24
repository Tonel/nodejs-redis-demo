const express = require("express");
// populate proces.env
require("dotenv").config();
const { UserController } = require("./src/controllers/users");
const {
  initializeRedisClient,
  redisCachingMiddleware,
} = require("./src/middlewares/redis");

async function initializeExpressServer() {
  // initialize an Express application
  const app = express();
  app.use(express.json());

  // connect to Redis
  await initializeRedisClient();

  // register an endpoint
  app.get("/api/v1/users", redisCachingMiddleware(), UserController.getAll);

  // start the server
  const port = 3000;
  app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
  });
}

initializeExpressServer()
  .then()
  .catch((e) => console.error(e));
