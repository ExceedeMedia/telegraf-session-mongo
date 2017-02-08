const debug = require('debug')('telegraf:session-mongo');
// const util  = require('util');
// const inspect = (o, depth = 1) => console.log(util.inspect(o, { colors: true, depth }));

class MongoSessionError extends Error {

}

class MongoSession {

  constructor(client, options) {
    this.options = Object.assign({
      property: 'session',
      collection: 'sessions',
      ttl: 3600 * 1000,
      getSessionKey(ctx) {
        if(!ctx.chat || !ctx.from) { return; }
        return `${ctx.chat.id}:${ctx.from.id}`;
      },
      store: {}
    }, options);
    this.client = client;
    this.collection = client.collection(this.options.collection);
  }

  async getSession(key) {
    const document = await this.collection.findOne({ key });
    return (document || { data: {} }).data;
  }

  async saveSession(key, data) {
    if(!data || Object.keys(data).length === 0) {
      debug(`Deleting session: ${key}`);
      await this.collection.deleteOne({ key });
      return;
    }
    await this.collection.replaceOne(
      { key },
      {
        key,
        data,
        expireAt: new Date((new Date()).getTime() + (this.options.ttl))
      },
      { upsert: true }
    );
  }

  get middleware() {
    return async (ctx, next) => {
      const key = this.options.getSessionKey(ctx);
      if(!key) { return await next(); }

      const session = await this.getSession(key);

      Object.defineProperty(ctx, this.options.property, {
        get() { return session },
        set(value) { session = Object.assign({}, value); }
      });

      await next();
      await this.saveSession(key, session);
    }
  }

  async setup() {
    await this.collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
    await this.collection.createIndex({ key: 1 });
  }
}

module.exports = MongoSession;
module.exports.MongoSessionError = MongoSessionError;
