const { createHash } = require('crypto');

const MAX_QUEUE_SIZE = 30;
const MAX_ERROR_LENGTH = 2800;
const REPEAT_WINDOW_MS = 60_000;

function stringifyArgument(value) {
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    if (typeof value === 'string') return value;
    if (value === undefined) return 'undefined';
    try {
        return JSON.stringify(value, (key, nestedValue) => key === 'stack' ? undefined : nestedValue);
    } catch {
        return String(value);
    }
}

function sanitizeError(value) {
    return String(value)
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/((?:api[_ -]?key|access[_ -]?token|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
        .replace(/([?&](?:key|token|access_token|api_key)=)[^&\s]+/gi, '$1[redacted]')
        .slice(0, MAX_ERROR_LENGTH);
}

function installErrorReporter({ getOwnerNumber, getSocket, getTenantId, isReady }) {
    const originalConsoleError = console.error.bind(console);
    const queue = [];
    const recentErrors = new Map();
    let isFlushing = false;

    function queueReport(details) {
        const now = Date.now();
        const fingerprint = createHash('sha256').update(details).digest('hex');
        const recent = recentErrors.get(fingerprint);
        if (recent && now - recent.firstSeen < REPEAT_WINDOW_MS) {
            recent.count += 1;
            return;
        }

        if (recentErrors.size >= 500) {
            recentErrors.delete(recentErrors.keys().next().value);
        }
        recentErrors.set(fingerprint, { firstSeen: now, count: 1 });

        const tenantId = getTenantId?.();
        const tenantLabel = tenantId ? `Tenant: ${tenantId}\n` : '';
        queue.push({
            fingerprint,
            text: `⚠️ Bot error\n${tenantLabel}Time: ${new Date(now).toISOString()}\n\n${details}`
        });
        if (queue.length > MAX_QUEUE_SIZE) queue.shift();
        void flushReports();
    }

    async function flushReports() {
        if (isFlushing) return;
        let ready = false;
        try {
            ready = Boolean(isReady?.());
        } catch {
            return;
        }
        if (!ready || !queue.length) return;

        const ownerNumber = String(getOwnerNumber?.() || '').replace(/\D/g, '');
        if (!/^\d{7,15}$/.test(ownerNumber)) return;

        const sock = getSocket?.();
        if (!sock?.sendMessage) return;

        isFlushing = true;
        try {
            while (queue.length && isReady?.()) {
                const report = queue[0];
                const repeatedCount = recentErrors.get(report.fingerprint)?.count || 1;
                const repeatNote = repeatedCount > 1 ? `\n\nRepeated ${repeatedCount} times in the last minute.` : '';
                await sock.sendMessage(`${ownerNumber}@s.whatsapp.net`, {
                    text: `${report.text}${repeatNote}`
                });
                queue.shift();
            }
        } catch (error) {
            originalConsoleError('Could not DM a bot error report to the owner:', error);
        } finally {
            isFlushing = false;
        }
    }

    console.error = (...args) => {
        originalConsoleError(...args);
        try {
            queueReport(sanitizeError(args.map(stringifyArgument).join(' ')));
        } catch (error) {
            originalConsoleError('Could not queue a bot error report:', error);
        }
    };

    const retryTimer = setInterval(() => {
        void flushReports();
        const cutoff = Date.now() - REPEAT_WINDOW_MS;
        for (const [fingerprint, recent] of recentErrors) {
            if (recent.firstSeen < cutoff) recentErrors.delete(fingerprint);
        }
    }, 15000);
    retryTimer.unref?.();

    return { flush: flushReports };
}

module.exports = { installErrorReporter, sanitizeError };
