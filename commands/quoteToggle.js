const { matchesOwnerNumber } = require('../utils/ownerAccess');

let quoteReplyAiEnabled = true; // Enabled by default
let aiEnabled = true;

async function handleAiToggle({ sock, m, sender, text, senderNumber, OWNER_NUMBER, botPhoneNumber }) {
    const cleanText = text.toLowerCase().trim();
    if (!['.ai on', '.ai off'].includes(cleanText)) {
        await sock.sendMessage(sender, {
            text: 'Usage: .ai on or .ai off'
        }, { quoted: m });
        return true;
    }

    if (!matchesOwnerNumber(senderNumber, OWNER_NUMBER, botPhoneNumber)) {
        await sock.sendMessage(sender, {
            text: '❌ Only the bot owner can change AI mode.'
        }, { quoted: m });
        return true;
    }

    aiEnabled = cleanText === '.ai on';
    await sock.sendMessage(sender, {
        text: `AI replies are now ${aiEnabled ? 'enabled' : 'disabled'}.`
    }, { quoted: m });
    return true;
}

function isAiEnabled() {
    return aiEnabled;
}

async function handleQuoteToggle({ sock, m, sender, text, senderNumber, OWNER_NUMBER, botPhoneNumber, sleep }) {
    const cleanText = text.toLowerCase().trim();

    if (cleanText === '.life') {
        if (!matchesOwnerNumber(senderNumber, OWNER_NUMBER, botPhoneNumber)) {
            await sock.sendMessage(sender, { text: `❌ 𝚁𝙴𝚂𝚃𝚁𝙸𝙲𝚃𝙴𝙳.\n\n— 𝙾𝙽𝙻𝚈 𝚃𝙷𝙴 𝙾𝚆𝙽𝙴𝚁 𝙲𝙰𝙽 𝚄𝚂𝙴 𝚃𝙷𝙸𝚂 𝙲𝙾𝙼𝙼𝙰𝙽𝙳` });
            return true;
        }
        quoteReplyAiEnabled = true;
        await sleep(2000);
        await sock.sendMessage(sender, { text: "*POWER ON* 😎" });
        return true;
    }

    if (cleanText === '.death') {
        if (!matchesOwnerNumber(senderNumber, OWNER_NUMBER, botPhoneNumber)) {
            await sock.sendMessage(sender, { text: `❌ 𝚁𝙴𝚂𝚃𝚁𝙸𝙲𝚃𝙴𝙳.\n\n— 𝙾𝙽𝙻𝚈 𝚃𝙷𝙴 𝙾𝚆𝙽𝙴𝚁 𝙲𝙰𝙽 𝚄𝚂𝙴 𝚃𝙷𝙸𝚂 𝙲𝙾𝙼𝙼𝙰𝙽𝙳` });
            return;
        }
        quoteReplyAiEnabled = false;
        await sleep(2000);
        await sock.sendMessage(sender, { text: "*SHUTDOWN* 😴." });
        return true;
    }

    return false;
}

function isQuoteAiEnabled() {
    return quoteReplyAiEnabled;
}

module.exports = { handleAiToggle, handleQuoteToggle, isAiEnabled, isQuoteAiEnabled };