async function handleLogs({ sock, m, remoteJid, sleep }) {
    if (!remoteJid.endsWith('@g.us')) {
        await sock.sendMessage(remoteJid, { text: "❌ This command can only be used inside group chats!" }, { quoted: m });
        return;
    }

    try {
        const groupLogs = await redis.hgetall(`group_logs:${remoteJid}`);

        if (!groupLogs || Object.keys(groupLogs).length === 0) {
            await sleep(500);
            await sock.sendMessage(remoteJid, { text: "📢 No activity recorded yet in this group." }, { quoted: m });
            return;
        }

        // Sort members by message count descending and take top 10
        const sortedUsers = Object.entries(groupLogs)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 10);

        let text = "📢 *Group Activity Leaderboard*\n\n";
        
        sortedUsers.forEach(([userJid, count], index) => {
            const tag = userJid.split('@')[0];
            text += `${index + 1}. @${tag} — *${count}* messages\n`;
        });

        // Extract mentions for the tagged users
        const mentions = sortedUsers.map(([userJid]) => userJid);

        await sleep(500);
        await sock.sendMessage(remoteJid, {
            text: text.trim(),
            mentions: mentions
        }, { quoted: m });

    } catch (error) {
        console.error("Logs command error:", error);
        await sock.sendMessage(remoteJid, { text: "❌ Failed to fetch group logs. Please try again!" }, { quoted: m });
    }
}

module.exports = handleLogs;
