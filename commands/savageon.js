const { setSavageMode } = require('../aiService');
const { matchesOwnerNumber } = require('../utils/ownerAccess');

async function handleSavageOn({ sock, m, sender, senderNumber, OWNER_NUMBER, botPhoneNumber, sleep }) {
    if (!matchesOwnerNumber(senderNumber, OWNER_NUMBER, botPhoneNumber)) {
        await sleep(500);
        await sock.sendMessage(sender, { text: `❌ Access Denied!` });
        return;
    }

    setSavageMode(true);
    await sleep(500);
    await sock.sendMessage(sender, { text: `𝙾𝙶-𝙲𝙾𝚁𝙴 𝙸𝚂 𝙽𝙾𝚆 𝙸𝙽 𝚂𝙰𝚅𝙰𝙶𝙴 𝙼𝙾𝙳𝙴 💀` });
}

module.exports = handleSavageOn;
