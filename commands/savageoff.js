const { setSavageMode } = require('../aiService');
const { matchesOwnerNumber } = require('../utils/ownerAccess');

async function handleSavageOff({ sock, m, sender, senderNumber, OWNER_NUMBER, botPhoneNumber, sleep }) {
    if (!matchesOwnerNumber(senderNumber, OWNER_NUMBER, botPhoneNumber)) {
        await sleep(500);
        await sock.sendMessage(sender, { text: `❌ Access Denied!` });
        return;
    }

    setSavageMode(false);
    await sleep(500);
    await sock.sendMessage(sender, { text: `✅ *Savage mode disabled.* The AI is back to its normal tone.` }, { quoted: m });
}

module.exports = handleSavageOff;
