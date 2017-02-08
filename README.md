MongoDB Session Middleware for Telegraf
=======================================

MongoDB powered session storage middlware for [Telegraf](https://github.com/telegraf/telegraf).

Requirements
------------

* `node >= 7.0`
* `--harmony-async-await`

If you want to contribute a transpiled distribution - pull requests welcome.


Installation
------------

```js
npm install telegraf-session-mongo --save
```

Example
-------

```js
const Telegraf = require('telegraf');
const { MongoClient } = require('mongodb');
const MongoSession = require('telegraf-session-mongo');

const app = new Telegraf(process.env.BOT_TOKEN);

MongoClient.connect(process.env.MONGO_URL).then(client => {

        const session = new MongoSession(client, {
            // ttl - in milliseconds
            // property - name of the context property for the session (default: session)
            // collection - name of the mongodb collection for the sessions (default: sessions)
            // getSessionKey - function (ctx) => String (default "chatId:fromId")
        });

        // Setup function creates necessary indexes for ttl and key lookup
        session.setup().then(() => {
            app.use(session.middleware);

            app.command("session", (ctx) => {
                ctx.respondWithHTML(`<pre>${ctx.session, null, 2}</pre>`);
            });
        });
});
```

Due to the `upsert`-ey nature of mongo, if you delete items from storage - provide an `$unset`

```js
ctx.session['$unset'] = {[token]: ''};
delete ctx.session[token];
```

Postscriptum
------------

I hacked this together using [telegraf-session-redis](https://github.com/telegraf/telegraf-session-redis/) as inspiration.
So it's lacking tests and a distribution compatible with Node < 7.0. Pull requests welcome.
