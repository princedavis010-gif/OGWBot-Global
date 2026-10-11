const USERS_KEY = 'ogwbot:global:users';
const BLOCKED_USERS_KEY = 'ogwbot:global:blocked-users';
const SUSPENDED_BOT_ACCOUNTS_KEY = 'ogwbot:global:suspended-bot-accounts';

function normalizePhoneNumber(value) {
    return String(value || '').replace(/\D/g, '');
}

function parseRecord(value) {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
}

async function recordGlobalUser(redis, { phoneNumber, name, tenantId, botNumber, chatJid, action, at = new Date().toISOString() }) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) return null;

    const previous = parseRecord(await redis.hget(USERS_KEY, number)) || {};
    const accounts = Array.isArray(previous.accounts) ? previous.accounts : [];
    const account = accounts.find((item) => item.tenantId === tenantId);
    if (account) {
        account.botNumber = botNumber || account.botNumber || '';
        account.lastSeen = at;
    } else if (tenantId) {
        accounts.push({ tenantId, botNumber: botNumber || '', lastSeen: at });
    }

    const record = {
        phoneNumber: number,
        name: String(name || '').slice(0, 100) || previous.name || 'Unknown',
        firstSeen: previous.firstSeen || at,
        lastSeen: at,
        interactions: (Number(previous.interactions) || 0) + 1,
        lastAction: String(action || 'message').slice(0, 48),
        lastChatType: chatJid?.endsWith('@g.us') ? 'group' : 'private',
        accounts: accounts.slice(-50)
    };

    await redis.hset(USERS_KEY, { [number]: JSON.stringify(record) });
    await redis.lpush(`${USERS_KEY}:${number}:events`, JSON.stringify({
        at,
        action: record.lastAction,
        chatType: record.lastChatType,
        chat: record.lastChatType === 'group' ? String(chatJid || '').slice(0, 128) : '',
        botNumber: botNumber || '',
        tenantId: tenantId || ''
    }));
    await redis.ltrim(`${USERS_KEY}:${number}:events`, 0, 49);
    return record;
}

async function getGlobalUsers(redis) {
    const [storedUsers, blockedNumbers] = await Promise.all([
        redis.hgetall(USERS_KEY),
        redis.smembers(BLOCKED_USERS_KEY)
    ]);
    const blocked = new Set((blockedNumbers || []).map(String));
    return Object.values(storedUsers || {})
        .map(parseRecord)
        .filter((user) => user && /^\d{7,15}$/.test(user.phoneNumber || ''))
        .map((user) => ({ ...user, blocked: blocked.has(user.phoneNumber) }))
        .sort((left, right) => String(right.lastSeen).localeCompare(String(left.lastSeen)));
}

async function getGlobalUser(redis, phoneNumber) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) return null;
    const [storedUser, blocked] = await Promise.all([
        redis.hget(USERS_KEY, number),
        redis.sismember(BLOCKED_USERS_KEY, number)
    ]);
    const user = parseRecord(storedUser);
    return user ? { ...user, blocked: Boolean(blocked) } : null;
}

async function getGlobalUserEvents(redis, phoneNumber) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) return [];
    const events = await redis.lrange(`${USERS_KEY}:${number}:events`, 0, 49);
    return (events || []).map(parseRecord).filter(Boolean);
}

async function isGlobalUserBlocked(redis, phoneNumber) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) return false;
    return Boolean(await redis.sismember(BLOCKED_USERS_KEY, number));
}

async function setGlobalUserBlocked(redis, phoneNumber, blocked) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) throw new Error('Invalid WhatsApp phone number.');
    if (blocked) await redis.sadd(BLOCKED_USERS_KEY, number);
    else await redis.srem(BLOCKED_USERS_KEY, number);
}

async function isBotAccountSuspended(redis, phoneNumber) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) return false;
    return Boolean(await redis.sismember(SUSPENDED_BOT_ACCOUNTS_KEY, number));
}

async function setBotAccountSuspended(redis, phoneNumber, suspended) {
    const number = normalizePhoneNumber(phoneNumber);
    if (!/^\d{7,15}$/.test(number)) return;
    if (suspended) await redis.sadd(SUSPENDED_BOT_ACCOUNTS_KEY, number);
    else await redis.srem(SUSPENDED_BOT_ACCOUNTS_KEY, number);
}

module.exports = {
    getGlobalUser,
    getGlobalUserEvents,
    getGlobalUsers,
    isBotAccountSuspended,
    isGlobalUserBlocked,
    recordGlobalUser,
    setBotAccountSuspended,
    setGlobalUserBlocked
};