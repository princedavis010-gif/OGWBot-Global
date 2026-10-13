const { getTargetUser } = require('../utils/targetHelper');
const { matchesOwnerNumber } = require('../utils/ownerAccess');

const MAX_PROFILE_IMAGE_BYTES = 8 * 1024 * 1024;

module.exports = async function handleProfile({
    sock,
    senderNumber,
    botPhoneNumber,
    ownerNumber,
    text,
    m,
    getContextInfo
}) {
    if (!matchesOwnerNumber(senderNumber, ownerNumber, botPhoneNumber)) {
        throw new Error('Only the configured owner can use .profile.');
    }

    const target = getTargetUser(m, text, getContextInfo);
    if (!target?.jid) {
        throw new Error('No profile target found. Reply to a message, mention someone, or provide their phone number.');
    }

    const cleanOwnerNumber = String(ownerNumber || botPhoneNumber || '').replace(/\D/g, '');
    if (!/^\d{7,15}$/.test(cleanOwnerNumber)) {
        throw new Error('The configured owner WhatsApp number is unavailable.');
    }

    const pictureUrl = await sock.profilePictureUrl(target.jid, 'image');
    if (!pictureUrl) throw new Error('No profile picture is available for the requested WhatsApp account.');

    const response = await fetch(pictureUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Profile picture download failed with HTTP ${response.status}.`);

    const image = Buffer.from(await response.arrayBuffer());
    if (!image.length || image.length > MAX_PROFILE_IMAGE_BYTES) {
        throw new Error('The profile picture is empty or exceeds the 8 MB limit.');
    }

    const mimeType = String(response.headers.get('content-type') || 'image/jpeg')
        .split(';', 1)[0]
        .trim();
    if (!mimeType.startsWith('image/')) {
        throw new Error('WhatsApp returned an unsupported profile picture format.');
    }

    await sock.sendMessage(`${cleanOwnerNumber}@s.whatsapp.net`, {
        image,
        mimetype: mimeType,
        caption: `WhatsApp profile picture for ${target.number || target.jid}.`
    });
};
