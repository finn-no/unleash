import { IUnleashConfig } from '../types/option';
import { IUnleashStores } from '../types/stores';

const session = require('express-session');
const KnexSessionStore = require('connect-session-knex')(session);

const TWO_DAYS = 48 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

// eslint-disable-next-line prettier/prettier
type SessionConfig = Pick<IUnleashConfig, 'session' | 'server' | 'secureHeaders' | 'getLogger'>;
function sessionDb(
    config: SessionConfig,
    stores: Pick<IUnleashStores, 'db'>,
): any {
    const logger = config.getLogger('/middleware/session-db.ts');
    let store;
    const { db } = config.session;
    const age = config.session.ttlHours * HOUR || TWO_DAYS;
    if (db) {
        store = new KnexSessionStore({
            knex: stores.db,
            tablename: 'unleash_session',
            createtable: false,
        });

        store.get = async (sid, fn) => {
            try {
                await store.ready;
                const condition = 'CAST(? as timestamp with time zone) <= expired';
                const content = await store.knex
                    .select('sess')
                    .from(store.tablename)
                    .where(store.sidfieldname, '=', sid)
                    .andWhereRaw(condition, new Date())
                    .then(response => {
                        let ret;
                        if (response[0]) {
                            ret = response[0].sess;
                            if (typeof ret === 'string') {
                                ret = JSON.parse(ret);
                            }
                        }
                        return ret;
                    });
                fn(null, content);
            } catch (e) {
                logger.error(e);
                fn(null, undefined);
            }
        };
    } else {
        store = new session.MemoryStore();
    }
    const sessionMiddleware = session({
        name: 'unleash-session',
        rolling: false,
        resave: false,
        saveUninitialized: false,
        store,
        secret: [config.server.secret],
        cookie: {
            path:
                config.server.baseUriPath === ''
                    ? '/'
                    : config.server.baseUriPath,
            secure: config.secureHeaders,
            maxAge: age,
        },
    });
    return (req, res, next) => {
        try {
            sessionMiddleware(req, res, next);
        } catch (e) {
            console.log(e);
        }
    };
}
export default sessionDb;
module.exports = sessionDb;
