const { createHmac, timingSafeEqual } = require('crypto');
const {
    getGlobalUser,
    getGlobalUserEvents,
    getGlobalUsers,
    setGlobalUserBlocked
} = require('../utils/globalUserRegistry');

const SESSION_COOKIE = 'og_activity_session';
const SESSION_DURATION_MS = 30 * 60 * 1000;

function signSession(password, expiresAt) {
    return createHmac('sha256', password).update(expiresAt).digest('hex');
}

function hasValidSession(req, password) {
    const cookie = String(req.headers.cookie || '').split(';').map((part) => part.trim())
        .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
    if (!cookie) return false;

    const [expiresAt, signature] = cookie.slice(SESSION_COOKIE.length + 1).split('.');
    if (!/^\d+$/.test(expiresAt || '') || Number(expiresAt) <= Date.now() || !signature) return false;

    const expected = Buffer.from(signSession(password, expiresAt), 'hex');
    const supplied = Buffer.from(signature, 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function loginPage(showError) {
    return `<!doctype html>
    <html lang="en"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="robots" content="noindex, nofollow, noarchive">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Kavoon&family=Rubik+Wet+Paint&display=swap" rel="stylesheet">
        <title>OG CORE Admin Login</title>
        <style>
            body {
                margin: 0;
                padding: 50px 20px;
                background-attachment: fixed;
                background-image: linear-gradient(150deg, #0f172a, #1e1b4b);
                color: #e5e7eb;
                font: 16px Arial, sans-serif;
            }
            main {
                max-width: 420px;
                margin: 0 auto;
                padding: 28px;
                background: rgba(30, 27, 75, .55);
                border: 1px solid rgba(255,255,255,.14);
                border-radius: 8px;
            }
            h1 {
                text-align: center;
                color: #ddbb0f;
                font-size: 60px;
                font-family: Rubik Wet Paint, system-ui;
            }
            h2 {
                margin-top: 0;
                color: #ddbb0f;
                font-size: 26px;
                font-family: Kavoon, system-ui;
                text-align: center;
            }
            label {
                display: block;
                margin: 18px 0 7px;
                color: #13dd96;
            }
            input {
                box-sizing: border-box;
                width: 100%;
                padding: 12px;
                border: 1px solid #475569;
                border-radius: 6px;
                background: #1e293b;
                color: #fff;
            }
            button {
                width: 100%;
                margin-top: 16px;
                padding: 12px;
                border: 0;
                border-radius: 6px;
                background: #25d366;
                color: #fff;
                font-weight: 700;
                cursor: pointer;
            }
            .error {
                color: #ff8e8e;
                <!-- text-align: center; -->
            }
            @media (max-width: 480px) {
                body { padding: 32px 16px; }
                h1 { font-size: 48px; }
                main { padding: 24px; }
            }
        </style>
    </head><body>
        <h1>OG CORE</h1>
        <main>
            <h2>Admin Panel</h2>
            ${showError ? '<p class="error">𝙸𝙽𝙲𝙾𝚁𝚁𝙴𝙲𝚃 𝙿𝙰𝚂𝚂𝚆𝙾𝚁𝙳.</p>' : ''}
            <form action="/admin/login" method="POST">
                <label for="password">Password</label>
                <input id="password" placeholder="Password" name="password" type="password" autocomplete="current-password" required>
                <button type="submit">Sign in</button>
            </form>
    </main></body></html>`;
}

function adminPage() {
    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow, noarchive">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Kavoon&family=Rubik+Doodle+Shadow&family=Rubik+Wet+Paint&display=swap" rel="stylesheet">
    <title>OG CORE Admin Panel</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px 20px;
            color: #e5e7eb;
            background-attachment: fixed;
            background-image: linear-gradient(150deg, #0f172a, #1e1b4b);
            margin: 0;
        }
        h1 {
            color: #ddbb0f;
            text-shadow: black 1px 1px;
            font-family: "Rubik Wet Paint", system-ui;
            font-size: 55px;
            margin: 0 0 12px;
        }
        h2 {
            color: #ddbb0f;
            text-shadow: black 2px 2px;
            font-family: "Rubik Doodle Shadow", system-ui;
            font-weight: 100;
            font-size: 25px;
            margin: 0 0 40px;
        }
        .container {
            max-width: 400px;
            margin: 0 auto;
            padding: 30px;
            background: rgba(30, 27, 75, .4);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, .1);
        }
        .btn {
            display: block;
            margin: 15px 0;
            padding: 12px;
            border: 0;
            border-radius: 8px;
            background: #25d366;
            color: white;
            font-family: "Kavoon", system-ui;
            font-weight: bold;
            text-decoration: none;
            cursor: pointer;
        }
        .btn:hover { background: #20ba5a; }
        .logout-form { margin: 0; }
        @media (max-width: 480px) {
            body { padding: 32px 16px; }
            h1 { font-size: 44px; }
            .container { padding: 24px; }
        }
    </style>
</head>
<body>
    <main class="container">
        <h1>OG CORE</h1>
        <h2>Admin Panel</h2>
        <a href="/admin/connections" class="btn">Connected Accounts</a>
        <a href="/admin/users" class="btn">Global Users</a>
        <a href="/admin/activity" target="_blank" class="btn">Activity Dashboard</a>
        <a href="/admin/upgrade" class="btn">Upgrade Account</a>
        <a href="/" class="btn">Back to Home</a>
      <!--  <form class="logout-form" action="/admin/logout" method="POST">
            <button class="btn" type="submit">Sign out</button>
        </form> -->
    </main>
</body>
</html>`;
}

function dashboardPage() {
    return `<!doctype html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow, noarchive">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Kavoon&family=Rubik+Wet+Paint&display=swap" rel="stylesheet">
    <title>OG CORE Activity Dashboard</title>
    <style>
        :root {
            color-scheme: dark;
            --bg-deep: #0b1020;
            --bg-mid: #151b3c;
            --panel: rgba(15, 23, 42, 0.68);
            --panel-strong: rgba(15, 23, 42, 0.86);
            --line: rgba(148, 163, 184, 0.20);
            --text: #e5eefb;
            --muted: #9aa9c3;
            --green: #34d399;
            --green-soft: rgba(52, 211, 153, 0.14);
            --amber: #fbbf24;
            --amber-soft: rgba(251, 191, 36, 0.12);
            --cyan: #67e8f9;
            --cyan-soft: rgba(103, 232, 249, 0.12);
            --violet: #a78bfa;
            --pink: #f472b6;
            --shadow: 0 30px 80px rgba(15, 23, 42, 0.45);
        }

        * {
            box-sizing: border-box;
        }

        html, body {
            margin: 0;
            min-height: 100%;
        }

        body {
            padding: 28px 20px 50px;
            color: var(--text);
            font: 14px Arial, sans-serif;
            background:
                radial-gradient(circle at top left, rgba(167, 139, 250, 0.18), transparent 28%),
                radial-gradient(circle at bottom right, rgba(52, 211, 153, 0.14), transparent 22%),
                linear-gradient(135deg, var(--bg-deep), var(--bg-mid));
            letter-spacing: 0.01em;
        }

        main {
            max-width: 1280px;
            margin: 0 auto;
        }

        .shell {
            display: flex;
            flex-direction: column;
            gap: 22px;
        }

        .topbar,
        .panel,
        .stat-card {
            background: rgba(15, 23, 42, 0.56);
            border: 1px solid var(--line);
            box-shadow: var(--shadow);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
        }

        .topbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 22px 24px;
            border-radius: 22px;
        }

        h1 {
            margin: 0;
            color: #ddbb0f;
            font-size: clamp(24px, 2vw, 35px);
            line-height: 1.2;
            font-family: 'Kavoon', system-ui;
        }

        .meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 10px;
            color: var(--muted);
        }

        .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 12px;
            border-radius: 999px;
            background: rgba(52, 211, 153, 0.12);
            border: 1px solid rgba(52, 211, 153, 0.25);
            color: var(--green);
            font-weight: 700;
        }

        .status-pill::before {
            content: '';
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: currentColor;
            box-shadow: 0 0 14px currentColor;
        }

        .toolbar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 12px;
            margin-top: 2px;
        }

        input[type=search] {
            flex: 1 1 240px;
            min-width: 200px;
            padding: 12px 14px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: rgba(15, 23, 42, 0.7);
            color: var(--text);
            outline: none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        input[type=search]:focus {
            border-color: rgba(103, 232, 249, 0.8);
            box-shadow: 0 0 0 4px rgba(103, 232, 249, 0.12);
        }

        button {
            padding: 11px 16px;
            border: 0;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--green), #48c7a0);
            color: #08141f;
            font-weight: 800;
            cursor: pointer;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            box-shadow: 0 16px 30px rgba(52, 211, 153, 0.25);
        }

        button:hover {
            transform: translateY(-1px);
        }

        .muted {
            color: var(--muted);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 16px;
        }

        .stat-card {
            padding: 18px 18px 16px;
            border-radius: 20px;
            position: relative;
            overflow: hidden;
        }

        .stat-card::before {
            content: '';
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            height: 3px;
            background: linear-gradient(90deg, var(--cyan), var(--violet), var(--green));
        }

        .kicker {
            display: block;
            color: var(--muted);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.12em;
        }

        .stat-value {
            display: block;
            margin-top: 10px;
            font-size: clamp(24px, 2.2vw, 34px);
            font-weight: 800;
            line-height: 1.1;
        }

        .stat-sub {
            display: block;
            margin-top: 6px;
            color: var(--muted);
            font-size: 12px;
        }

        .layout-grid {
            display: grid;
            grid-template-columns: 1.5fr 1fr;
            gap: 18px;
        }

        .panel {
            padding: 18px;
            border-radius: 24px;
            min-height: 220px;
        }

        .panel-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
        }

        .panel-header h3 {
            margin: 0;
            color: var(--text);
            font-size: 18px;
        }

        .pill {
            display: inline-flex;
            align-items: center;
            padding: 7px 10px;
            border-radius: 999px;
            background: rgba(103, 232, 249, 0.08);
            border: 1px solid rgba(103, 232, 249, 0.18);
            color: var(--cyan);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .chart-wrap {
            height: 220px;
            border-radius: 18px;
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.2), rgba(15, 23, 42, 0.6));
            border: 1px solid rgba(148, 163, 184, 0.14);
            overflow: hidden;
            padding: 12px 12px 6px;
        }

        svg {
            display: block;
            width: 100%;
            height: 100%;
        }

        .chart-labels {
            display: flex;
            justify-content: space-between;
            margin-top: 8px;
            color: var(--muted);
            font-size: 10px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .user-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-top: 8px;
        }

        .user-row {
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border: 1px solid rgba(148, 163, 184, 0.12);
            border-radius: 14px;
            background: rgba(15, 23, 42, 0.34);
        }

        .user-rank {
            width: 26px;
            height: 26px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border-radius: 10px;
            background: rgba(167, 139, 250, 0.16);
            color: var(--violet);
            font-weight: 800;
        }

        .user-main {
            min-width: 0;
        }

        .user-name {
            display: block;
            font-weight: 700;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .user-action {
            display: block;
            color: var(--muted);
            font-size: 11px;
            margin-top: 2px;
        }

        .user-count {
            color: var(--green);
            font-weight: 800;
            font-size: 14px;
        }

        .table-wrap {
            overflow-x: auto;
            border-radius: 18px;
            border: 1px solid rgba(148, 163, 184, 0.14);
            background: rgba(15, 23, 42, 0.32);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            min-width: 700px;
            text-align: left;
        }

        th,
        td {
            padding: 12px 14px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.12);
            vertical-align: top;
        }

        th {
            color: var(--cyan);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            background: rgba(15, 23, 42, 0.42);
        }

        td {
            color: var(--text);
        }

        .action-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 5px 8px;
            border-radius: 999px;
            background: rgba(52, 211, 153, 0.12);
            border: 1px solid rgba(52, 211, 153, 0.18);
            color: var(--green);
            font-size: 11px;
            font-weight: 700;
        }

        .empty-state {
            color: var(--muted);
            text-align: center;
            padding: 18px;
        }

        @media (max-width: 900px) {
            .stats-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }

            .layout-grid {
                grid-template-columns: 1fr;
            }
        }

        @media (max-width: 560px) {
            body {
                padding: 18px 12px 36px;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }

            .topbar,
            .panel,
            .stat-card {
                border-radius: 18px;
            }

            .toolbar {
                width: 100%;
            }
        }
    </style>
</head>

<body>
    <main class="shell">
        <header class="topbar">
            <div>
                <h1>OG CORE Activity Dashboard</h1>
                <div class="meta">
                    <span id="connection" class="status-pill">Loading status...</span>
                    <span id="uptime" class="muted"></span>
                </div>
            </div>
            <div class="toolbar">
                <input id="filter" type="search" placeholder="Filter by user, action, or group" aria-label="Filter activity">
                <span id="updated" class="muted">Loading activity...</span>
                <form action="/admin/login" method="POST"><button type="submit">Back</button></form>
            </div>
        </header>

        <section class="stats-grid">
            <article class="stat-card">
                <span class="kicker">Total events</span>
                <span id="totalEvents" class="stat-value">0</span>
                <span class="stat-sub">Recent command activity</span>
            </article>
            <article class="stat-card">
                <span class="kicker">Unique users</span>
                <span id="uniqueUsers" class="stat-value">0</span>
                <span class="stat-sub">Distinct usernames tracked</span>
            </article>
            <article class="stat-card">
                <span class="kicker">Groups</span>
                <span id="groupCount" class="stat-value">0</span>
                <span class="stat-sub">Chats with group activity</span>
            </article>
            <article class="stat-card">
                <span class="kicker">Top action</span>
                <span id="topAction" class="stat-value">-</span>
                <span id="topActionMeta" class="stat-sub">No activity yet</span>
            </article>
        </section>

        <section class="layout-grid">
            <article class="panel">
                <div class="panel-header">
                    <h3>Usage graph</h3>
                    <span class="pill">Last 12 hours</span>
                </div>
                <div class="chart-wrap">
                    <svg id="usageChart" viewBox="0 0 560 200" preserveAspectRatio="none" aria-label="Usage graph"></svg>
                </div>
                <div id="chartLabels" class="chart-labels"></div>
            </article>

            <article class="panel">
                <div class="panel-header">
                    <h3>Top usernames</h3>
                    <span id="userCountBadge" class="pill">0</span>
                </div>
                <div id="userStats" class="user-list"></div>
            </article>
        </section>

        <section class="panel">
            <div class="panel-header">
                <h3>Recent activity feed</h3>
            </div>
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Action</th>
                            <th>Chat type</th>
                            <th>Chat</th>
                        </tr>
                    </thead>
                    <tbody id="events">
                        <tr>
                            <td class="empty-state" colspan="5">Loading...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    </main>

    <script>
        let activityEvents = [];
        const filterInput = document.getElementById('filter');

        function aggregateUserStats(events) {
            const map = new Map();
            for (const event of events) {
                const user = String(event.user || 'unknown').trim() || 'unknown';
                const entry = map.get(user) || { user, total: 0, actionMap: new Map() };
                entry.total += 1;
                const action = String(event.action || 'unknown').trim() || 'unknown';
                entry.actionMap.set(action, (entry.actionMap.get(action) || 0) + 1);
                map.set(user, entry);
            }

            return Array.from(map.values())
                .map((entry) => ({
                    user: entry.user,
                    total: entry.total,
                    topAction: Array.from(entry.actionMap.entries()).sort((a, b) => b[1] - a[1])[0] || ['unknown', 0]
                }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 6);
        }

        function renderSummary(events) {
            const total = events.length;
            const uniqueUsers = new Set(events.map((event) => event.user || 'unknown')).size;
            const groupCount = new Set(events.filter((event) => event.chatType === 'group').map((event) => event.chat || 'unknown')).size;
            const actionMap = new Map();
            for (const event of events) {
                const action = String(event.action || 'unknown').trim() || 'unknown';
                actionMap.set(action, (actionMap.get(action) || 0) + 1);
            }
            const topActionEntry = Array.from(actionMap.entries()).sort((a, b) => b[1] - a[1])[0];

            document.getElementById('totalEvents').textContent = total;
            document.getElementById('uniqueUsers').textContent = uniqueUsers;
            document.getElementById('groupCount').textContent = groupCount;
            document.getElementById('topAction').textContent = topActionEntry ? topActionEntry[0] : '-';
            document.getElementById('topActionMeta').textContent = topActionEntry ? topActionEntry[1] + ' hits' : 'No activity yet';
        }

        function renderUsageChart(events) {
            const svg = document.getElementById('usageChart');
            const labelsBox = document.getElementById('chartLabels');
            const limit = 12;
            const now = Date.now();
            const buckets = [];
            for (let i = limit - 1; i >= 0; i -= 1) {
                const pointTime = now - (i * 60 * 60 * 1000);
                buckets.push({ time: pointTime, count: 0 });
            }

            for (const event of events) {
                const eventTime = new Date(event.at).getTime();
                if (Number.isNaN(eventTime)) continue;
                const index = Math.max(0, Math.min(limit - 1, Math.floor((now - eventTime) / (60 * 60 * 1000))));
                if (index >= 0 && index < limit) {
                    buckets[limit - 1 - index].count += 1;
                }
            }

            const width = 560;
            const height = 200;
            const chartPadding = 18;
            const maxValue = Math.max(1, ...buckets.map((item) => item.count));
            const step = (width - chartPadding * 2) / Math.max(1, buckets.length - 1);
            const points = buckets.map((bucket, index) => {
                const x = chartPadding + index * step;
                const y = height - chartPadding - (bucket.count / maxValue) * (height - chartPadding * 2);
                return { x, y, count: bucket.count };
            });

            const linePath = points.map((point, index) => (index === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y).join(' ');
            const areaPath = linePath + ' L ' + points[points.length - 1].x + ' ' + (height - chartPadding) + ' L ' + points[0].x + ' ' + (height - chartPadding) + ' Z';

            svg.innerHTML = [
                '<defs>',
                '<linearGradient id="usageFill" x1="0" x2="0" y1="0" y2="1">',
                '<stop offset="0%" stop-color="rgba(103,232,249,0.42)" />',
                '<stop offset="100%" stop-color="rgba(103,232,249,0.02)" />',
                '</linearGradient>',
                '</defs>',
                '<path d="' + areaPath + '" fill="url(#usageFill)" opacity="0.9"></path>',
                '<path d="' + linePath + '" fill="none" stroke="#67e8f9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>',
                points.map(function (point) {
                    return '<circle cx="' + point.x + '" cy="' + point.y + '" r="' + (point.count > 0 ? 3 : 0) + '" fill="#34d399"></circle>';
                }).join('')
            ].join('');

            const labels = buckets.map((bucket, index) => {
                const date = new Date(bucket.time);
                return index % 2 === 0 || index === buckets.length - 1 ? date.toLocaleString('en-US', { hour: 'numeric' }) : '';
            });
            labelsBox.innerHTML = labels.map((label) => '<span>' + label + '</span>').join('');
        }

        function renderUserStats(events) {
            const container = document.getElementById('userStats');
            const data = aggregateUserStats(events);
            document.getElementById('userCountBadge').textContent = data.length;
            if (!data.length) {
                container.innerHTML = '<div class="empty-state">No user activity yet.</div>';
                return;
            }

            container.innerHTML = data.map((entry, index) => {
                const actionName = entry.topAction[0] || 'unknown';
                return '<div class="user-row">' +
                    '<span class="user-rank">' + (index + 1) + '</span>' +
                    '<div class="user-main">' +
                        '<span class="user-name">' + (entry.user || 'unknown') + '</span>' +
                        '<span class="user-action">Top action: ' + actionName + '</span>' +
                    '</div>' +
                    '<span class="user-count">' + entry.total + '</span>' +
                '</div>';
            }).join('');
        }

        function renderEvents() {
            const query = filterInput.value.trim().toLowerCase();
            const body = document.getElementById('events');
            const visible = activityEvents.filter((event) => {
                const text = [event.user, event.action, event.chatType, event.chat, event.at].join(' ').toLowerCase();
                return text.includes(query);
            });

            body.replaceChildren();
            if (visible.length === 0) {
                const row = document.createElement('tr');
                const cell = document.createElement('td');
                cell.colSpan = 5;
                cell.className = 'empty-state';
                cell.textContent = 'No matching activity.';
                row.appendChild(cell);
                body.appendChild(row);
                return;
            }

            for (const event of visible) {
                const row = document.createElement('tr');
                const values = [
                    new Date(event.at).toLocaleString(),
                    event.user || 'unknown',
                    '<span class="action-badge">' + (event.action || 'unknown') + '</span>',
                    event.chatType || 'private',
                    event.chat || '-'
                ];

                values.forEach((value, index) => {
                    const cell = document.createElement('td');
                    if (index === 2) {
                        cell.innerHTML = value;
                    } else {
                        cell.textContent = value || '-';
                    }
                    row.appendChild(cell);
                });

                body.appendChild(row);
            }
        }

        async function refreshActivity() {
            try {
                const response = await fetch('/admin/activity/data', { cache: 'no-store' });
                if (response.status === 401) {
                    window.location.reload();
                    return;
                }
                if (!response.ok) throw new Error('Unable to load activity');

                const data = await response.json();
                activityEvents = Array.isArray(data.events) ? data.events : [];
                document.getElementById('connection').textContent = 'WhatsApp: ' + (data.connection && data.connection.status ? data.connection.status : 'unknown');
                document.getElementById('uptime').textContent = 'Runtime: ' + Math.floor((data.uptimeSeconds || 0) / 60) + ' min';
                document.getElementById('updated').textContent = 'Updated ' + new Date().toLocaleTimeString();

                renderSummary(activityEvents);
                renderUsageChart(activityEvents);
                renderUserStats(activityEvents);
                renderEvents();
            } catch (error) {
                document.getElementById('updated').textContent = 'Activity feed unavailable.';
            }
        }

        filterInput.addEventListener('input', renderEvents);
        refreshActivity();
        setInterval(refreshActivity, 5000);
    </script>
</body>

</html>`;
}

function upgradePage(message = '', phoneNumber = '') {
    return `<!DOCTYPE html><html lang="en"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="robots" content="noindex,nofollow">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Kavoon&family=Rubik+Wet+Paint&display=swap" rel="stylesheet">
        <title>OG CORE - Upgrade Account</title>
        <style>
            *{box-sizing:border-box}
            body{min-height:100vh;margin:0;padding:50px 20px;display:grid;place-items:center;font-family:Arial,sans-serif;text-align:center;color:yellowgreen;background:linear-gradient(150deg,#0f172a,#1e1b4b 76%,#312e81);background-attachment:fixed}
            main{width:min(100%,400px);margin:0 auto;padding:30px;background:rgba(30,27,75,.4);border:1px solid rgba(255,255,255,.12);border-radius:10px}
            h1{margin:0 0 20px;color:rgb(221,187,15);text-shadow:1px 1px #000;font-family:"Rubik Wet Paint",system-ui,sans-serif;font-size:30px;font-weight:400}
            p{margin:15px 0;color:rgb(19,221,150);font-family:Kavoon,system-ui,sans-serif;font-size:14px;line-height:1.5}
            label{display:block;margin:12px 0 6px;color:rgb(19,221,150);font-family:Kavoon,system-ui,sans-serif;text-align:left}
            input{width:100%;padding:12px;margin:8px 0 14px;border:1px solid #475569;border-radius:7px;background:#1e293b;color:#fff;font-size:16px;text-align:center;outline:none}
            input:focus{border-color:rgb(221,187,15)}
            button{display:block;width:100%;margin:12px 0;padding:12px;border:0;border-radius:7px;background:#25d366;color:#fff;font-family:Kavoon,system-ui,sans-serif;font-size:15px;font-weight:700;cursor:pointer}
            button:hover{filter:brightness(1.1)}button:focus-visible,a:focus-visible{outline:3px solid rgb(221,187,15);outline-offset:3px}
            .secondary{background:#24292e;border:1px solid rgba(255,255,255,.12)}
            .message{padding:10px;border:1px solid rgba(19,221,150,.35);border-radius:6px}
            a{color:rgb(19,221,150);font-family:Kavoon,system-ui,sans-serif}
            @media(max-width:480px){body{padding:32px 16px}main{padding:24px 20px}h1{font-size:27px}}
        </style>
    </head><body><main><h1>Upgrade a paired account</h1>${message ? `<p class="message">${message}</p>` : ''}<form method="post" action="/admin/upgrade"><label for="phoneNumber">Paired WhatsApp number</label><input id="phoneNumber" name="phoneNumber" type="tel" inputmode="numeric" pattern="[0-9]{7,15}" placeholder="2348123456789" value="${phoneNumber}" required><button type="submit" name="action" value="premium">Mark as Premium</button><button class="secondary" type="submit" name="action" value="free">Unmark from Premium</button></form><p><a href="/admin">Back to admin</a></p></main></body></html>`;
}

function usersPage() {
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Global Users | OG CORE</title>
    <style>
        :root{color-scheme:dark;--bg:#101716;--panel:#19211f;--line:#34413d;--text:#edf3ef;--muted:#9aaba4;--green:#8fe0b5;--red:#ff8d82}
        *{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 12% 0%,#263b32 0,transparent 34%),var(--bg);color:var(--text);font:15px "Segoe UI",sans-serif;min-height:100vh}
        main{max-width:1120px;margin:auto;padding:36px 24px 56px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:30px}.top a{color:var(--green);text-decoration:none}.eyebrow{color:var(--green);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}h1{font-size:30px;margin:8px 0 4px}p{color:var(--muted);margin:0}.toolbar{display:flex;gap:12px;align-items:center;margin:24px 0 12px}.toolbar input{flex:1;min-width:0;background:#121a17;border:1px solid var(--line);border-radius:5px;padding:12px 14px;color:var(--text);font:inherit}.count{color:var(--muted);font-variant-numeric:tabular-nums}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:6px;background:rgba(25,33,31,.84)}table{width:100%;border-collapse:collapse;min-width:700px;text-align:left}th,td{padding:14px 16px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px;font-weight:600}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:#212d28}td a{display:block;color:var(--text);text-decoration:none;font-weight:600}td small{color:var(--muted);display:block;margin-top:4px}.status{color:var(--green)}.status.blocked{color:var(--red)}.empty{padding:42px;text-align:center;color:var(--muted)}
        @media(max-width:600px){main{padding:26px 16px}.top{align-items:flex-start}.toolbar{align-items:stretch;flex-direction:column}.count{align-self:flex-end}}
    </style></head><body><main><header class="top"><div><div class="eyebrow">OG CORE / administration</div><h1>Global users</h1><p>People seen across every connected bot account.</p></div><a href="/admin">Admin panel</a></header>
    <section class="toolbar"><input id="search" type="search" placeholder="Search by name or number" aria-label="Search users"><span class="count" id="count">Loading users...</span></section>
    <div class="table-wrap"><table><thead><tr><th>User</th><th>Last seen</th><th>Interactions</th><th>Bot accounts</th><th>Access</th></tr></thead><tbody id="users"><tr><td colspan="5" class="empty">Loading user registry...</td></tr></tbody></table></div></main>
    <script>
        const body=document.getElementById('users'),search=document.getElementById('search');let users=[];
        function cell(row,value){const td=document.createElement('td');td.textContent=value;row.appendChild(td);return td}
        function render(){const query=search.value.trim().toLowerCase(),visible=users.filter(user=>(user.name+' '+user.phoneNumber).toLowerCase().includes(query));body.replaceChildren();document.getElementById('count').textContent=visible.length+' of '+users.length+' users';if(!visible.length){const row=document.createElement('tr'),td=cell(row,users.length?'No users match your search.':'No users have been recorded yet.');td.colSpan=5;td.className='empty';body.appendChild(row);return}for(const user of visible){const row=document.createElement('tr'),identity=cell(row,'');const link=document.createElement('a');link.href='/admin/users/'+encodeURIComponent(user.phoneNumber);link.textContent=user.name||'Unknown';identity.appendChild(link);const number=document.createElement('small');number.textContent=user.phoneNumber;identity.appendChild(number);cell(row,new Date(user.lastSeen).toLocaleString());cell(row,Number(user.interactions||0).toLocaleString());cell(row,String((user.accounts||[]).length));const status=cell(row,user.blocked?'Blocked':'Active');status.className='status'+(user.blocked?' blocked':'');body.appendChild(row)}}
        async function refresh(){try{const response=await fetch('/admin/users/data',{cache:'no-store'});if(response.status===401){location.reload();return}if(!response.ok)throw new Error();users=await response.json();render()}catch{document.getElementById('count').textContent='Registry unavailable'}}search.addEventListener('input',render);refresh();setInterval(refresh,5000);
    </script></body></html>`;
}

function userDetailPage(phoneNumber) {
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>User profile | OG CORE</title>
    <style>
        :root{color-scheme:dark;--bg:#101716;--panel:#19211f;--line:#34413d;--text:#edf3ef;--muted:#9aaba4;--green:#8fe0b5;--red:#ff8d82}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 12% 0%,#263b32 0,transparent 34%),var(--bg);color:var(--text);font:15px "Segoe UI",sans-serif;min-height:100vh}main{max-width:960px;margin:auto;padding:36px 24px 56px}.top{display:flex;justify-content:space-between;gap:16px;margin-bottom:30px}.top a{color:var(--green);text-decoration:none}.eyebrow{color:var(--green);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}h1{font-size:30px;margin:8px 0 5px;overflow-wrap:anywhere}.muted{color:var(--muted)}.profile{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin:24px 0}.stat{background:var(--panel);padding:18px}.stat span{display:block;color:var(--muted);font-size:12px;text-transform:uppercase;margin-bottom:8px}.stat strong{overflow-wrap:anywhere}.actions{display:flex;gap:10px;margin:20px 0 32px}button{border:1px solid var(--line);border-radius:4px;padding:10px 14px;background:#26352e;color:var(--text);font:inherit;font-weight:600;cursor:pointer}button.danger{background:#3b2524;border-color:#70403c;color:#ffb0a8}h2{font-size:17px;margin:0 0 12px}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:6px}table{width:100%;border-collapse:collapse;min-width:600px;text-align:left}th,td{padding:13px 15px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:12px;text-transform:uppercase}tbody tr:last-child td{border-bottom:0}.empty{padding:32px;text-align:center;color:var(--muted)}.error{color:var(--red)}@media(max-width:600px){main{padding:26px 16px}.profile{grid-template-columns:1fr}.top{align-items:flex-start}}
    </style></head><body><main><header class="top"><div><div class="eyebrow">OG CORE / global users</div><h1 id="name">Loading profile...</h1><div class="muted">${phoneNumber}</div></div><a href="/admin/users">All users</a></header><div id="notice" class="muted"></div>
    <section class="profile"><div class="stat"><span>Access</span><strong id="access">Loading</strong></div><div class="stat"><span>Interactions</span><strong id="interactions">-</strong></div><div class="stat"><span>First seen</span><strong id="firstSeen">-</strong></div><div class="stat"><span>Last seen</span><strong id="lastSeen">-</strong></div><div class="stat"><span>Last activity</span><strong id="lastAction">-</strong></div><div class="stat"><span>Bot accounts</span><strong id="accounts">-</strong></div></section>
    <div class="actions"><form id="blockForm" method="post"><button id="blockButton" class="danger" type="submit">Block user globally</button></form></div><section><h2>Recent activity</h2><div class="table-wrap"><table><thead><tr><th>Time</th><th>Action</th><th>Chat</th><th>Bot account</th></tr></thead><tbody id="events"><tr><td colspan="4" class="empty">Loading activity...</td></tr></tbody></table></div></section></main>
    <script>
        const number='${phoneNumber}',eventBody=document.getElementById('events'),form=document.getElementById('blockForm');
        function addCell(row,value){const td=document.createElement('td');td.textContent=value||'-';row.appendChild(td)}
        async function load(){try{const response=await fetch('/admin/users/'+number+'/data',{cache:'no-store'});if(response.status===401){location.href='/admin/login';return}if(response.status===404){document.getElementById('name').textContent='User not found';return}if(!response.ok)throw new Error();const data=await response.json(),user=data.user;document.getElementById('name').textContent=user.name||'Unknown';document.getElementById('access').textContent=user.blocked?'Blocked':'Active';document.getElementById('access').className=user.blocked?'error':'';document.getElementById('interactions').textContent=Number(user.interactions||0).toLocaleString();document.getElementById('firstSeen').textContent=new Date(user.firstSeen).toLocaleString();document.getElementById('lastSeen').textContent=new Date(user.lastSeen).toLocaleString();document.getElementById('lastAction').textContent=user.lastAction||'message';document.getElementById('accounts').textContent=(user.accounts||[]).map(account=>account.botNumber||account.tenantId).join(', ')||'Unknown';document.getElementById('blockButton').textContent=user.blocked?'Restore access':'Block user globally';document.getElementById('blockButton').className=user.blocked?'':'danger';form.action='/admin/users/'+number+'/'+(user.blocked?'unblock':'block');eventBody.replaceChildren();if(!data.events.length){const row=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.className='empty';td.textContent='No activity recorded.';row.appendChild(td);eventBody.appendChild(row);return}for(const event of data.events){const row=document.createElement('tr');addCell(row,new Date(event.at).toLocaleString());addCell(row,event.action);addCell(row,event.chatType==='group'?'Group':'Private');addCell(row,event.botNumber||event.tenantId||'Unknown');eventBody.appendChild(row)}}catch{document.getElementById('notice').textContent='Could not load the user profile.'}}load();
    </script></body></html>`;
}

function connectionsPage() {
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Connected Accounts | OG CORE</title>
    <style>
        :root{color-scheme:dark;--bg:#101716;--line:#34413d;--text:#edf3ef;--muted:#9aaba4;--green:#8fe0b5;--red:#ff8d82}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 12% 0%,#263b32 0,transparent 34%),var(--bg);color:var(--text);font:15px "Segoe UI",sans-serif}main{max-width:1120px;margin:auto;padding:36px 24px 56px}.top{display:flex;justify-content:space-between;gap:16px;margin-bottom:28px}.top a{color:var(--green);text-decoration:none}.eyebrow{color:var(--green);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}h1{font-size:30px;margin:8px 0 4px}p{color:var(--muted);margin:0}.toolbar{display:flex;align-items:center;gap:12px;margin:24px 0 12px}.toolbar input{flex:1;min-width:0;padding:12px 14px;border:1px solid var(--line);border-radius:5px;background:#121a17;color:var(--text);font:inherit}.count{color:var(--muted)}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:6px;background:rgba(25,33,31,.84)}table{width:100%;min-width:760px;border-collapse:collapse;text-align:left}th,td{padding:14px 16px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.5px}tbody tr:last-child td{border:0}tbody tr:hover{background:#212d28}td a{color:var(--text);font-weight:600;text-decoration:none}td small{display:block;margin-top:4px;color:var(--muted)}.state{color:var(--green)}.state.off{color:#f5c86b}.state.suspended{color:var(--red)}.empty{padding:42px;text-align:center;color:var(--muted)}@media(max-width:600px){main{padding:26px 16px}.top{align-items:flex-start}.toolbar{align-items:stretch;flex-direction:column}.count{align-self:flex-end}}
    </style></head><body><main><header class="top"><div><div class="eyebrow">OG CORE / administration</div><h1>Connected accounts</h1><p>Website sessions paired with WhatsApp accounts.</p></div><a href="/admin">Admin panel</a></header><section class="toolbar"><input id="search" type="search" placeholder="Search by WhatsApp number or session ID" aria-label="Search connected accounts"><span id="count" class="count">Loading accounts...</span></section><div class="table-wrap"><table><thead><tr><th>WhatsApp account</th><th>Connection</th><th>Last bot activity</th><th>Plan</th><th>Site access</th></tr></thead><tbody id="accounts"><tr><td colspan="5" class="empty">Loading accounts...</td></tr></tbody></table></div></main>
    <script>
        const body=document.getElementById('accounts'),search=document.getElementById('search');let accounts=[];function addCell(row,value){const cell=document.createElement('td');cell.textContent=value||'-';row.appendChild(cell);return cell}function render(){const query=search.value.trim().toLowerCase(),rows=accounts.filter(item=>(item.phoneNumber+' '+item.tenantId).toLowerCase().includes(query));body.replaceChildren();document.getElementById('count').textContent=rows.length+' of '+accounts.length+' accounts';if(!rows.length){const row=document.createElement('tr'),cell=addCell(row,accounts.length?'No accounts match your search.':'No WhatsApp accounts have been paired yet.');cell.colSpan=5;cell.className='empty';body.appendChild(row);return}for(const item of rows){const row=document.createElement('tr'),account=addCell(row,'');const link=document.createElement('a');link.href='/admin/connections/'+encodeURIComponent(item.tenantId);link.textContent=item.phoneNumber||'Number unavailable';account.appendChild(link);const id=document.createElement('small');id.textContent=item.tenantId;account.appendChild(id);const state=addCell(row,item.connectionStatus||'unknown');state.className='state'+(item.suspended?' suspended':item.paired?'':' off');addCell(row,item.lastActivityAt?new Date(item.lastActivityAt).toLocaleString():'No activity recorded');addCell(row,item.plan==='premium'?'Premium':'Free');const access=addCell(row,item.suspended?'Suspended':'Allowed');access.className='state'+(item.suspended?' suspended':'')} }async function refresh(){try{const response=await fetch('/admin/connections/data',{cache:'no-store'});if(response.status===401){location.href='/admin/login';return}if(!response.ok)throw new Error();accounts=await response.json();render()}catch{document.getElementById('count').textContent='Connected accounts unavailable'}}search.addEventListener('input',render);refresh();setInterval(refresh,5000);
    </script></body></html>`;
}

function connectionDetailPage(tenantId) {
    return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Connected Account | OG CORE</title>
    <style>
        :root{color-scheme:dark;--bg:#101716;--panel:#19211f;--line:#34413d;--text:#edf3ef;--muted:#9aaba4;--green:#8fe0b5;--red:#ff8d82}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(ellipse at 12% 0%,#263b32 0,transparent 34%),var(--bg);color:var(--text);font:15px "Segoe UI",sans-serif}main{max-width:900px;margin:auto;padding:36px 24px 56px}.top{display:flex;justify-content:space-between;gap:16px;margin-bottom:28px}.top a{color:var(--green);text-decoration:none}.eyebrow{color:var(--green);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px}h1{font-size:30px;margin:8px 0 5px;overflow-wrap:anywhere}.muted{color:var(--muted);overflow-wrap:anywhere}.profile{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border:1px solid var(--line);border-radius:6px;overflow:hidden;background:var(--line);margin:24px 0}.stat{min-height:88px;padding:17px;background:var(--panel)}.stat span{display:block;margin-bottom:8px;color:var(--muted);font-size:12px;text-transform:uppercase}.stat strong{overflow-wrap:anywhere}.actions{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}button{padding:10px 14px;border:1px solid var(--line);border-radius:4px;background:#26352e;color:var(--text);font:inherit;font-weight:600;cursor:pointer}button.danger{background:#3b2524;border-color:#70403c;color:#ffb0a8}button.warn{background:#3b3424;border-color:#69582f;color:#f4d28b}.error{color:var(--red)}@media(max-width:600px){main{padding:26px 16px}.profile{grid-template-columns:1fr}.top{align-items:flex-start}}
    </style></head><body><main><header class="top"><div><div class="eyebrow">OG CORE / connected accounts</div><h1 id="phone">Loading account...</h1><div class="muted">Site session: ${tenantId}</div></div><a href="/admin/connections">All accounts</a></header><div id="notice" class="muted"></div>
    <section class="profile"><div class="stat"><span>WhatsApp connection</span><strong id="connection">Loading</strong></div><div class="stat"><span>Site access</span><strong id="access">Loading</strong></div><div class="stat"><span>Plan</span><strong id="plan">-</strong></div><div class="stat"><span>Site session created</span><strong id="created">-</strong></div><div class="stat"><span>WhatsApp paired</span><strong id="pairedAt">-</strong></div><div class="stat"><span>Last bot activity</span><strong id="activity">-</strong></div></section>
    <div class="actions"><form id="disconnectForm" method="post"><button class="warn" type="submit">Disconnect bot session</button></form><form id="suspendForm" method="post"><button id="suspendButton" class="danger" type="submit">Suspend account</button></form></div>
    <script>
        const tenantId='${tenantId}';async function load(){try{const response=await fetch('/admin/connections/'+tenantId+'/data',{cache:'no-store'});if(response.status===401){location.href='/admin/login';return}if(response.status===404){document.getElementById('phone').textContent='Account not found';return}if(!response.ok)throw new Error();const item=await response.json();document.getElementById('phone').textContent=item.phoneNumber||'WhatsApp number unavailable';document.getElementById('connection').textContent=item.connectionStatus||'unknown';document.getElementById('access').textContent=item.suspended?'Suspended':'Allowed';document.getElementById('access').className=item.suspended?'error':'';document.getElementById('plan').textContent=item.plan==='premium'?'Premium':'Free';document.getElementById('created').textContent=item.createdAt?new Date(item.createdAt).toLocaleString():'-';document.getElementById('pairedAt').textContent=item.pairedAt?new Date(item.pairedAt).toLocaleString():'-';document.getElementById('activity').textContent=item.lastActivityAt?new Date(item.lastActivityAt).toLocaleString():'No activity recorded';document.getElementById('disconnectForm').action='/admin/connections/'+tenantId+'/disconnect';const suspendButton=document.getElementById('suspendButton');suspendButton.textContent=item.suspended?'Restore account':'Suspend account';suspendButton.className=item.suspended?'':'danger';document.getElementById('suspendForm').action='/admin/connections/'+tenantId+'/'+(item.suspended?'resume':'suspend')}catch{document.getElementById('notice').textContent='Could not load connected account details.'}}load();setInterval(load,5000);
    </script></body></html>`;
}

function registerActivityDashboard(app, { redis, globalRedis = redis, password, getConnectionStatus, getOwnerNumber, getBotNumbers, getSessionCollection, getSessionManager, notifySessionOwner }) {
    const isEnabled = password.length >= 32;
    const isAuthenticated = (req) => isEnabled && hasValidSession(req, password);

    app.get('/admin', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        res.send(adminPage());
    });

    app.get('/admin/login', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (isAuthenticated(req)) return res.redirect(303, '/admin');
        res.send(loginPage(req.query.error === '1'));
    });

    app.get('/admin/activity', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Activity dashboard is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        res.send(dashboardPage());
    });

    app.get('/admin/users', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        res.type('html').send(usersPage());
    });

    app.get('/admin/users/data', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        try {
            res.json(await getGlobalUsers(globalRedis));
        } catch (error) {
            console.error('Could not load global users:', error.message);
            res.status(503).json({ error: 'Global user registry unavailable' });
        }
    });

    app.get('/admin/users/:phone/data', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const user = await getGlobalUser(globalRedis, req.params.phone);
            if (!user) return res.status(404).json({ error: 'User not found' });
            res.json({ user, events: await getGlobalUserEvents(globalRedis, req.params.phone) });
        } catch (error) {
            console.error('Could not load global user profile:', error.message);
            res.status(503).json({ error: 'Global user registry unavailable' });
        }
    });

    const updateUserAccess = (blocked) => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        try {
            const user = await getGlobalUser(globalRedis, req.params.phone);
            if (!user) return res.status(404).send('User not found.');
            await setGlobalUserBlocked(globalRedis, req.params.phone, blocked);
            res.redirect(303, `/admin/users/${req.params.phone}`);
        } catch (error) {
            console.error('Could not update global user access:', error.message);
            res.status(503).send('Could not update user access. Check Redis connectivity and try again.');
        }
    };

    app.post('/admin/users/:phone/block', updateUserAccess(true));
    app.post('/admin/users/:phone/unblock', updateUserAccess(false));

    app.get('/admin/users/:phone', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        if (!/^\d{7,15}$/.test(req.params.phone)) return res.status(400).send('Invalid user number.');
        res.type('html').send(userDetailPage(req.params.phone));
    });

    app.get('/admin/connections', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        res.type('html').send(connectionsPage());
    });

    app.get('/admin/connections/data', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const [sessionCollection, manager] = await Promise.all([getSessionCollection(), getSessionManager()]);
            const sessions = await sessionCollection.find({
                expiresAt: { $gt: new Date() }
            }).sort({ lastActivityAt: -1, pairedAt: -1, createdAt: -1 }).limit(500).toArray();
            res.json(sessions.map((session) => ({
                tenantId: session.tenantId,
                phoneNumber: session.phoneNumber || '',
                paired: Boolean(session.paired),
                pairedAt: session.pairedAt || null,
                createdAt: session.createdAt || null,
                lastActivityAt: session.lastActivityAt || null,
                plan: session.plan === 'premium' ? 'premium' : 'free',
                suspended: Boolean(session.suspended),
                connectionStatus: manager.getStatus(session.tenantId).status
            })));
        } catch (error) {
            console.error('Could not load connected accounts:', error.message);
            res.status(503).json({ error: 'Connected accounts unavailable' });
        }
    });

    app.get('/admin/connections/:tenantId/data', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });
        if (!/^[a-f0-9-]{36}$/i.test(req.params.tenantId)) return res.status(400).json({ error: 'Invalid session ID' });
        try {
            const [sessionCollection, manager] = await Promise.all([getSessionCollection(), getSessionManager()]);
            const session = await sessionCollection.findOne({ tenantId: req.params.tenantId });
            if (!session) return res.status(404).json({ error: 'Connected account not found' });
            res.json({
                tenantId: session.tenantId,
                phoneNumber: session.phoneNumber || '',
                paired: Boolean(session.paired),
                pairedAt: session.pairedAt || null,
                createdAt: session.createdAt || null,
                lastActivityAt: session.lastActivityAt || null,
                plan: session.plan === 'premium' ? 'premium' : 'free',
                suspended: Boolean(session.suspended),
                connectionStatus: manager.getStatus(session.tenantId).status
            });
        } catch (error) {
            console.error('Could not load connected account:', error.message);
            res.status(503).json({ error: 'Connected account unavailable' });
        }
    });

    const updateConnection = (action) => async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        if (!/^[a-f0-9-]{36}$/i.test(req.params.tenantId)) return res.status(400).send('Invalid session ID.');
        try {
            const sessionCollection = await getSessionCollection();
            const session = await sessionCollection.findOne({ tenantId: req.params.tenantId });
            if (!session) return res.status(404).send('Connected account not found.');
            const manager = await getSessionManager();
            if (action === 'disconnect') await manager.disconnectSession(req.params.tenantId);
            else await manager.setSessionSuspended(req.params.tenantId, action === 'suspend');
            res.redirect(303, `/admin/connections/${req.params.tenantId}`);
        } catch (error) {
            console.error('Could not update connected account:', error.message);
            res.status(503).send('Could not update the connected account. Check MongoDB connectivity and try again.');
        }
    };

    app.post('/admin/connections/:tenantId/disconnect', updateConnection('disconnect'));
    app.post('/admin/connections/:tenantId/suspend', updateConnection('suspend'));
    app.post('/admin/connections/:tenantId/resume', updateConnection('resume'));

    app.get('/admin/connections/:tenantId', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        if (!/^[a-f0-9-]{36}$/i.test(req.params.tenantId)) return res.status(400).send('Invalid session ID.');
        res.type('html').send(connectionDetailPage(req.params.tenantId));
    });

    app.get('/admin/upgrade', (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');
        res.type('html').send(upgradePage());
    });

    app.post('/admin/upgrade', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');
        if (!isAuthenticated(req)) return res.redirect(303, '/admin/login');

        const phoneNumber = String(req.body.phoneNumber || '').replace(/\D/g, '');
        if (!/^\d{7,15}$/.test(phoneNumber)) {
            return res.status(400).send('Enter a valid WhatsApp number with country code.');
        }
        const action = String(req.body.action || 'premium');
        if (action !== 'premium' && action !== 'free') {
            return res.status(400).send('Choose whether to mark or unmark premium status.');
        }

        try {
            const sessionCollection = await getSessionCollection();
            const session = await sessionCollection.findOne({ paired: true, phoneNumber });
            if (!session) return res.status(404).send('No paired bot session was found for that WhatsApp number.');

            const update = action === 'premium'
                ? { $set: { plan: 'premium', upgradedAt: new Date() } }
                : { $set: { plan: 'free' }, $unset: { upgradedAt: '' } };
            await sessionCollection.updateOne(
                { tenantId: session.tenantId, paired: true },
                update
            );

            let notificationStatus = '';
            if (action === 'premium' && notifySessionOwner) {
                try {
                    await notifySessionOwner(session.tenantId);
                    notificationStatus = ' The owner was notified on WhatsApp.';
                } catch (error) {
                    console.error('Premium upgrade saved, but owner WhatsApp notification failed:', error.message);
                    notificationStatus = ' The upgrade was saved, but the owner could not be notified because WhatsApp is unavailable.';
                }
            }

            const status = action === 'premium' ? 'marked as premium' : 'unmarked from premium';
            res.type('html').send(upgradePage(`WhatsApp number ending in ${phoneNumber.slice(-4)} is now ${status}.${notificationStatus}`, phoneNumber));
        } catch (error) {
            console.error('Could not upgrade WhatsApp session:', error);
            res.status(503).send('Could not update the account. Check MongoDB connectivity and try again.');
        }
    });

    const login = (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isEnabled) return res.status(503).send('Admin panel is disabled. Configure ACTIVITY_DASHBOARD_PASSWORD in this deployment.');

        const expected = Buffer.from(password);
        const submitted = Buffer.from(String(req.body.password || ''));
        if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) {
            return res.redirect(303, '/admin/login?error=1');
        }

        const expiresAt = String(Date.now() + SESSION_DURATION_MS);
        const session = `${expiresAt}.${signSession(password, expiresAt)}`;
        const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
        const secureAttribute = req.secure || forwardedProtocol === 'https' ? '; Secure' : '';
        res.set('Set-Cookie', `${SESSION_COOKIE}=${session}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=1800${secureAttribute}`);
        res.redirect(303, '/admin');
    };

    app.post('/admin/login', login);
    app.post('/admin/activity/login', login);

    const logout = (req, res) => {
        const forwardedProtocol = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
        const secureAttribute = req.secure || forwardedProtocol === 'https' ? '; Secure' : '';
        res.set('Set-Cookie', `${SESSION_COOKIE}=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0${secureAttribute}`);
        res.redirect(303, '/admin/login');
    };

    app.post('/admin/logout', logout);
    app.post('/admin/activity/logout', logout);

    app.get('/admin/activity/data', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        if (!isAuthenticated(req)) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const storedEvents = await redis.lrange('bot_activity', 0, 99);
            const events = storedEvents.map((event) => {
                if (typeof event !== 'string') return event;
                try { return JSON.parse(event); } catch { return null; }
            }).filter(Boolean);
            res.json({
                connection: getConnectionStatus(),
                uptimeSeconds: Math.floor(process.uptime()),
                events
            });
        } catch (error) {
            console.error('Could not load activity feed:', error.message);
            res.status(500).json({ error: 'Activity feed unavailable' });
        }
    });
}

module.exports = registerActivityDashboard;