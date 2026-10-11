const { createHash, randomBytes, randomUUID } = require('crypto');
const { fork } = require('child_process');
const path = require('path');

const COOKIE_NAME = 'og_bot_session';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const UNPAIRED_SESSION_LIFETIME_MS = 10 * 60 * 1000;

function hashToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function readCookie(req) {
    const prefix = `${COOKIE_NAME}=`;
    const value = String(req.headers.cookie || '').split(';').map((part) => part.trim())
        .find((part) => part.startsWith(prefix))?.slice(prefix.length);
    return /^[a-f0-9]{64}$/.test(value || '') ? value : null;
}

function createBotSessionManager({ sessionCollection, authCollection, workerPath, env = process.env }) {
    const workers = new Map();
    const pendingPairingRequests = new Map();
    const configuredMaxWorkers = Number.parseInt(env.BOT_MAX_WORKERS || '1', 10);
    const maxWorkers = Number.isInteger(configuredMaxWorkers) && configuredMaxWorkers > 0
        ? configuredMaxWorkers
        : 1;

    function activeWorkerCount() {
        return [...workers.values()].filter((worker) =>
            worker.child && worker.child.exitCode === null && !worker.child.killed
        ).length;
    }

    function refreshUnpairedTimeout(tenantId, worker) {
        if (worker.status === 'connected' || worker.expiring) return;
        clearTimeout(worker.unpairedTimeout);
        worker.unpairedTimeout = setTimeout(async () => {
            if (worker.status === 'connected' || workers.get(tenantId) !== worker) return;
            worker.expiring = true;
            await Promise.allSettled([
                sessionCollection.deleteOne({ tenantId, paired: { $ne: true } }),
                authCollection.deleteMany({ tenantId })
            ]);
            worker.child.kill('SIGTERM');
        }, UNPAIRED_SESSION_LIFETIME_MS);
        worker.unpairedTimeout.unref?.();
    }

    function startWorker(tenantId) {
        const existing = workers.get(tenantId);
        if (existing?.child && existing.child.exitCode === null && !existing.child.killed) return existing;
        if (activeWorkerCount() >= maxWorkers) {
            throw new Error(`The bot is at its current capacity (${maxWorkers} active sessions). Try again later.`);
        }

        const child = fork(workerPath, [], {
            env: {
                ...env,
                BOT_WORKER: '1',
                BOT_TENANT_ID: tenantId,
                BOT_DATA_DIR: path.join(__dirname, '../data/tenants', tenantId)
            },
            stdio: ['ignore', 'inherit', 'inherit', 'ipc']
        });
        const worker = { child, status: 'connecting', method: null, qr: null, phoneNumber: null, paired: false };
        workers.set(tenantId, worker);
        refreshUnpairedTimeout(tenantId, worker);

        child.on('message', (message) => {
            if (message?.type === 'bot-status') {
                worker.status = message.status || worker.status;
                worker.method = message.method ?? worker.method;
                if (Object.prototype.hasOwnProperty.call(message, 'qr')) worker.qr = message.qr;
                worker.phoneNumber = message.phoneNumber ?? worker.phoneNumber;
                if (worker.status === 'connected') {
                    worker.paired = true;
                    clearTimeout(worker.unpairedTimeout);
                    void sessionCollection.updateOne(
                        { tenantId },
                        {
                            $set: {
                                paired: true,
                                pairedAt: new Date(),
                                phoneNumber: worker.phoneNumber,
                                expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS)
                            }
                        }
                    ).catch((error) => console.error('Could not persist paired session status:', error));
                } else if (worker.status === 'awaiting-pairing' && worker.paired) {
                    worker.paired = false;
                    worker.phoneNumber = null;
                    void sessionCollection.updateOne(
                        { tenantId },
                        {
                            $set: {
                                paired: false,
                                expiresAt: new Date(Date.now() + UNPAIRED_SESSION_LIFETIME_MS)
                            },
                            $unset: { pairedAt: '', phoneNumber: '' }
                        }
                    ).catch((error) => console.error('Could not persist unpaired session status:', error));
                    refreshUnpairedTimeout(tenantId, worker);
                }
                return;
            }

            if (message?.type === 'pairing-result' || message?.type === 'premium-notification-result') {
                const pending = pendingPairingRequests.get(message.requestId);
                if (!pending) return;
                clearTimeout(pending.timeout);
                pendingPairingRequests.delete(message.requestId);
                if (message.error) pending.reject(new Error(message.error));
                else pending.resolve(message.code ?? true);
            }
        });

        child.on('exit', (code) => {
            if (workers.get(tenantId)?.child !== child) return;
            clearTimeout(worker.unpairedTimeout);
            if (worker.expiring) workers.delete(tenantId);
            else workers.set(tenantId, { status: 'disconnected', method: worker.method, qr: null, phoneNumber: worker.phoneNumber, paired: worker.paired });
            for (const [requestId, pending] of pendingPairingRequests) {
                if (pending.tenantId !== tenantId) continue;
                clearTimeout(pending.timeout);
                pendingPairingRequests.delete(requestId);
                pending.reject(new Error('WhatsApp session worker stopped.'));
            }
            if (!worker.expiring) console.error(`WhatsApp session worker ${tenantId} exited with code ${code}.`);
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
                paired: false,
                expiresAt: new Date(Date.now() + UNPAIRED_SESSION_LIFETIME_MS)
            };
            await sessionCollection.insertOne(session);
            const secureCookie = env.NODE_ENV === 'production' || req.secure || req.get('x-forwarded-proto') === 'https';
            res.append('Set-Cookie', `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_LIFETIME_MS / 1000}${secureCookie ? '; Secure' : ''}`);
        } else {
            const lifetime = session.paired ? SESSION_LIFETIME_MS : UNPAIRED_SESSION_LIFETIME_MS;
            session.expiresAt = new Date(Date.now() + lifetime);
            await sessionCollection.updateOne({ tokenHash: hashToken(token) }, { $set: { expiresAt: session.expiresAt } });
        }

        const worker = startWorker(session.tenantId);
        if (!session.paired) refreshUnpairedTimeout(session.tenantId, worker);
        return session;
    }

    async function restoreSessions() {
        const abandonedSessions = sessionCollection.find({ paired: { $ne: true } })
            .project({ tenantId: 1 })
        for await (const session of abandonedSessions) {
            await authCollection.deleteMany({ tenantId: session.tenantId });
        }
        await sessionCollection.deleteMany({ paired: { $ne: true } });

        const sessions = await sessionCollection.find({ paired: true, expiresAt: { $gt: new Date() } })
            .sort({ pairedAt: 1 })
            .limit(maxWorkers)
            .toArray();
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

    function notifyPremiumUpgrade(tenantId) {
        const worker = workers.get(tenantId);
        if (!worker?.child?.connected || worker.status !== 'connected') {
            throw new Error('The paired WhatsApp worker is not connected.');
        }

        const requestId = randomUUID();
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingPairingRequests.delete(requestId);
                reject(new Error('Premium notification timed out.'));
            }, 15000);
            pendingPairingRequests.set(requestId, { tenantId, resolve, reject, timeout });
            worker.child.send({ type: 'notify-premium-upgrade', requestId }, (error) => {
                if (!error) return;
                clearTimeout(timeout);
                pendingPairingRequests.delete(requestId);
                reject(error);
            });
        });
    }

    return { getOrCreateSession, getStatus, notifyPremiumUpgrade, requestPairingCode, restoreSessions };
}

module.exports = { createBotSessionManager };