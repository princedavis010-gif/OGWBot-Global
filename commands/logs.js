async function handleLogs({ sock, m, remoteJid, sleep, redis, args = [] }) {
    if (!remoteJid.endsWith('@g.us')) {
        await sock.sendMessage(remoteJid, { text: "❌ This command can only be used inside group chats!" }, { quoted: m });
        return;
    }

    try {
        // 1. Fetch group metadata to cross-reference admins and current live members
        const groupMeta = await sock.groupMetadata(remoteJid);
        const groupName = groupMeta.subject || "This Group";
        const participants = groupMeta.participants || [];
        
        const adminJids = new Set(
            participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id)
        );

        // 2. Fetch recorded message counts from Redis
        const groupLogs = await redis.hgetall(`group_logs:${remoteJid}`) || {};

        const subCommand = (args[0] || '').toLowerCase();

        // --- SUB-COMMAND: .logs zero (Show members with 0 tracked messages) ---
        if (subCommand === 'zero' || subCommand === 'inactive') {
            const zeroMembers = participants.filter(p => !groupLogs[p.id]);

            if (zeroMembers.length === 0) {
                await sock.sendMessage(remoteJid, { text: "🎉 Great news! Everyone in this group has sent at least one message." }, { quoted: m });
                return;
            }

            let text = `🪫 *Zero-Message Members (${zeroMembers.length})*\n`;
            text += `Group: *${groupName}*\n\n`;

            const mentions = [];
            zeroMembers.forEach((member, index) => {
                const tag = member.id.split('@')[0];
                const isAdmin = adminJids.has(member.id) ? " 👑" : "";
                text += `${index + 1}. @${tag}${isAdmin}\n`;
                mentions.push(member.id);
            });

            await sleep(500);
            await sock.sendMessage(remoteJid, { text: text.trim(), mentions }, { quoted: m });
            return;
        }

        // --- STANDARD LEADERBOARD: .logs (Top Active Members) ---
        if (Object.keys(groupLogs).length === 0) {
            await sock.sendMessage(remoteJid, { text: "📢 No activity recorded yet in this group." }, { quoted: m });
            return;
        }

        // Sort active members descending
        const sortedUsers = Object.entries(groupLogs)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 15); // Top 15 active

        let text = `📈 *Group Activity Leaderboard*\n`;
        text += `Group: *${groupName}*\n\n`;

        const mentions = [];
        sortedUsers.forEach(([userJid, count], index) => {
            const tag = userJid.split('@')[0];
            const isAdmin = adminJids.has(userJid) ? " 👑" : "";
            text += `${index + 1}. @${tag}${isAdmin} — *${count}* msgs\n`;
            mentions.push(userJid);
        });

        await sleep(500);
        await sock.sendMessage(remoteJid, { text: text.trim(), mentions }, { quoted: m });

    } catch (error) {
        console.error("Logs command error:", error);
        await sock.sendMessage(remoteJid, { text: "❌ Failed to fetch group activity logs." }, { quoted: m });
    }
}

module.exports = handleLogs;
