const debug = require('debug')('telegraf:session-mongo');
const util  = require('util');
const deeq  = require('deep-equal');
const inspect = (o, depth = 1) => console.log(util.inspect(o, { colors: true, depth }));

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
    debug('Getting session for %s', key);
    const document = await this.collection.findOne({ key });
    return (document || { data: {} }).data;
  }

  async saveSession(key, data) {
    if(!data || Object.keys(data).length === 0) {
      debug(`Deleting session: ${key}`);
      return await this.collection.deleteOne({ key });
    }
    if(!data.__dirty) { return; }
    debug('Saving session %s %o', key, data.__changeset);
    await this.collection.updateOne({ key }, data.__changeset, { upsert: true });
  }

  getWrappedStorage(storage) {
    debug('Initializing session: %o', storage);
    const $set = {}
    const $unset = {}
    var dirty = false;
    const { ttl } = this.options;
    const access = new Proxy(storage, {
      get(target, property, receiver) {
        switch(property)
        {
          case '__dirty':
            return dirty;
          case '__changeset':
          {
            var ret = {};
            const expireAt = new Date((new Date()).getTime() + ttl);
            $set['expireAt'] = expireAt;
            if(Object.keys($set).length > 0) { Object.assign(ret, { $set }); }
            if(Object.keys($unset).length > 0) { Object.assign(ret, { $unset }); }
            return ret;
          }
          case 'toJSON':
            return () => target;
          default:
            // debug(`Get: ${property}`);
            // inspect(target);
            return Reflect.get(target, property, receiver);
        }
      },
      set(target, property, value, receiver) {
        if(!target[property] || (target[property] && !deeq(target[property], value))) {
          dirty = true;
          debug('setting %s made object dirty', property);
        }
        Reflect.set(target, property, value, receiver);
        $set[`data.${property}`] = value;
        delete $unset[`data.${property}`];
        return true;
      },
      deleteProperty(target, property, receiver) {
        debug('delete %s', property);
        Reflect.deleteProperty(target, property, receiver);
        delete $set[`data.${property}`];
        $unset[`data.${property}`] = '';
        dirty = true;
        return true;
      }
    });
    return access;
  }

  get middleware() {
    return async (ctx, next) => {
      const key = this.options.getSessionKey(ctx);
      if(!key) { return await next(); }

      let session = this.getWrappedStorage(await this.getSession(key));

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
