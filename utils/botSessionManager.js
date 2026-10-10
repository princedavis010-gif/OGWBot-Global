const { createHash, randomBytes, randomUUID } = require('crypto');
const { fork } = require('child_process');
const path = require('path');

const COOKIE_NAME = 'og_bot_session';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function readCookie(req) {
    const prefix = `${COOKIE_NAME}=`;
    const value = String(req.headers.cookie || '').split(';').map((part) => part.trim())
        .find((part) => part.startsWith(prefix))?.slice(prefix.length);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

function createBotSessionManager({ sessionCollection, workerPath, env = process.env }) {
    const workers = new Map();
    const pendingPairingRequests = new Map();

    function startWorker(tenantId) {
        const existing = workers.get(tenantId);
        if (existing?.child && existing.child.exitCode === null && !existing.child.killed) return existing;

        const child = fork(workerPath, [], {
            env: {
                ...env,
                BOT_WORKER: '1',
                BOT_TENANT_ID: tenantId,
                BOT_DATA_DIR: path.join(__dirname, '../data/tenants', tenantId)
            },
            stdio: ['ignore', 'inherit', 'inherit', 'ipc']
        });
        const worker = { child, status: 'connecting', method: null, qr: null, phoneNumber: null };
        workers.set(tenantId, worker);

        child.on('message', (message) => {
            if (message?.type === 'bot-status') {
                worker.status = message.status || worker.status;
                worker.method = message.method ?? worker.method;
                if (Object.prototype.hasOwnProperty.call(message, 'qr')) worker.qr = message.qr;
                worker.phoneNumber = message.phoneNumber ?? worker.phoneNumber;
                return;
            }

            if (message?.type === 'pairing-result') {
                const pending = pendingPairingRequests.get(message.requestId);
                if (!pending) return;
                clearTimeout(pending.timeout);
                pendingPairingRequests.delete(message.requestId);
                if (message.error) pending.reject(new Error(message.error));
                else pending.resolve(message.code);
            }
        });

        child.on('exit', (code) => {
            if (workers.get(tenantId)?.child !== child) return;
            workers.set(tenantId, { status: 'disconnected', method: worker.method, qr: null, phoneNumber: worker.phoneNumber });
            for (const [requestId, pending] of pendingPairingRequests) {
                if (pending.tenantId !== tenantId) continue;
                clearTimeout(pending.timeout);
                pendingPairingRequests.delete(requestId);
                pending.reject(new Error('WhatsApp session worker stopped.'));
            }
            console.error(`WhatsApp session worker ${tenantId} exited with code ${code}.`);
        });

        return worker;
    }

    async function getOrCreateSession(req, res) {
        let token = readCookie(req);
        let session = token
            ? await sessionCollection.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
            : null;

        if (!session) {
            token = randomBytes(32).toString('hex');
            session = {
                tenantId: randomUUID(),
                tokenHash: hashToken(token),
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS)
            };
            await sessionCollection.insertOne(session);
            const secureCookie = env.NODE_ENV === 'production' || req.secure || req.get('x-forwarded-proto') === 'https';
            res.append('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}${secureCookie ? '; Secure' : ''}`);
        } else {
            session.expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
            await sessionCollection.updateOne({ tokenHash: hashToken(token) }, { $set: { expiresAt: session.expiresAt } });
        }

        startWorker(session.tenantId);
        return session;
    }

    async function restoreSessions() {
        const sessions = await sessionCollection.find({ expiresAt: { $gt: new Date() } }).toArray();
        for (const session of sessions) startWorker(session.tenantId);
        return sessions.length;
    }

    function getStatus(tenantId) {
        const worker = workers.get(tenantId);
        return worker
            ? { status: worker.status, method: worker.method, phoneNumber: worker.phoneNumber, qr: worker.qr }
            : { status: 'connecting', method: null, phoneNumber: null, qr: null };
    }

    function requestPairingCode(tenantId, phoneNumber) {
        const worker = workers.get(tenantId) || startWorker(tenantId);
        if (!worker.child?.connected) throw new Error('WhatsApp is still initializing. Refresh and try again shortly.');

        const requestId = randomUUID();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingPairingRequests.delete(requestId);
                reject(new Error('Pairing request timed out. Refresh and try again.'));
            }, 30000);
            pendingPairingRequests.set(requestId, { tenantId, resolve, reject, timeout });
            worker.child.send({ type: 'request-pairing-code', requestId, phoneNumber }, (error) => {
                if (!error) return;
                clearTimeout(timeout);
                pendingPairingRequests.delete(requestId);
                reject(error);
            });
        });
    }

    return { getOrCreateSession, getStatus, requestPairingCode, restoreSessions };
}

module.exports = { createBotSessionManager };