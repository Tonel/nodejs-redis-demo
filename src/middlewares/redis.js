const { createClient } = require("redis");
const zlib = require("zlib");
const hash = require("object-hash");


// initialize the Redis client variable
let redisClient = undefined;


async function initializeRedisClient() {
  // read the Redis connection URL from the envs
  let redisURL = process.env.REDIS_URI;
  if (redisURL) {
    // create the Redis client object
    redisClient = createClient({ url: redisURL }).on("error", (e) => {
      console.error(`Failed to create the Redis client with error:`);
      console.error(e);
    });


    try {
      // connect to the Redis server
      await redisClient.connect();
      console.log(`Connected to Redis successfully!`);
    } catch (e) {
      console.error(`Connection to Redis failed with error:`);
      console.error(e);
    }
  }
}


function requestToKey(req) {
  // build a custom object to use as part of the Redis key
  const reqDataToHash = {
    query: req.query,
    body: req.body,
  };


  // `${req.path}@...` to make it easier to find
  // keys on a Redis client
  return `${req.path}@${hash.sha1(reqDataToHash)}`;
}


function isRedisWorking() {
  // verify wheter there is an active connection
  // to a Redis server or not
  return !!redisClient?.isOpen;
}


async function writeData(key, data, options, compress) {
  if (isRedisWorking()) {
    let dataToCache = data;
    if (compress) {
      // compress the value with ZLIB to save RAM
      dataToCache = zlib.deflateSync(data).toString("base64");
    }


    try {
      // write data to the Redis cache
      await redisClient.set(key, dataToCache, options);
    } catch (e) {
      console.error(`Failed to cache data for key=${key}`, e);
    }
  }
}


async function readData(key, compressed) {
  let cachedValue = undefined;
  if (isRedisWorking()) {
    // try to get the cached response from redis
    cachedValue = await redisClient.get(key);
    if (cachedValue) {
      if (compressed) {
        // decompress the cached value with ZLIB
        return zlib.inflateSync(Buffer.from(cachedValue, "base64")).toString();
      } else {
        return cachedValue;
      }
    }
  }


  return cachedValue;
}


function redisCachingMiddleware(
  options = {
    EX: 21600, // 6h
  },
  compression = true
) {
  return async (req, res, next) => {
    if (isRedisWorking()) {
      const key = requestToKey(req);
      // if there is some cached data, retrieve it and return it
      const cachedValue = await readData(key, compression);
      if (cachedValue) {
        try {
          // if it is JSON data, then return it
          return res.json(JSON.parse(cachedValue));
        } catch {
          // if it is not JSON data, then return it
          return res.send(cachedValue);
        }
      } else {
        // override how res.send behaves
        // to introduce the caching logic
        const oldSend = res.send;
        res.send = function (data) {
          // set the function back to avoid the 'double-send' effect
          res.send = oldSend;


          // cache the response only if it is successful
          if (res.statusCode.toString().startsWith("2")) {
            writeData(key, data, options, compression).then();
          }


          return res.send(data);
        };


        // continue to the controller function
        next();
      }
    } else {
      // proceed with no caching
      next();
    }
  };
}


module.exports = { initializeRedisClient, redisCachingMiddleware };
