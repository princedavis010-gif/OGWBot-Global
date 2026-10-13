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
    await sock.sendMessage(sender, { text: `✅ *Savage mode enabled.* The AI will now respond with a harsher tone.` }, { quoted: m });
}

module.exports = handleSavageOn;
