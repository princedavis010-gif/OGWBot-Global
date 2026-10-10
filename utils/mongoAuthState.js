const { BufferJSON, initAuthCreds, proto } = require('@whiskeysockets/baileys');

function serialize(value) {
    return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize(value) {
    return JSON.parse(value, BufferJSON.reviver);
}

function validateTenantId(tenantId) {
    if (typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(tenantId)) {
        throw new Error('MongoDB auth state requires a valid tenant ID.');
    }
}

async function useMongoAuthState(collection, tenantId) {
    validateTenantId(tenantId);

    const credentialsDocument = await collection.findOne({ tenantId, type: 'creds' });
    const creds = credentialsDocument ? deserialize(credentialsDocument.data) : initAuthCreds();

    const keys = {
        async get(type, ids) {
            if (!ids.length) return {};

            const documents = await collection.find({ tenantId, type, id: { $in: ids } }).toArray();
            const values = Object.fromEntries(documents.map((document) => [document.id, deserialize(document.data)]));

            if (type === 'app-state-sync-key') {
                for (const [id, value] of Object.entries(values)) {
                    values[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
                }
            }

            return values;
        },
        async set(data) {
            const operations = [];

            for (const [type, entries] of Object.entries(data)) {
                for (const [id, value] of Object.entries(entries)) {
                    const filter = { tenantId, type, id };
                    if (value === null) {
                        operations.push({ deleteOne: { filter } });
                    } else {
                        operations.push({
                            replaceOne: {
                                filter,
                                replacement: { ...filter, data: serialize(value) },
                                upsert: true
                            }
                        });
                    }
                }
            }

            if (operations.length) await collection.bulkWrite(operations, { ordered: false });
        }
    };

    return {
        state: { creds, keys },
        async saveCreds() {
            await collection.updateOne(
                { tenantId, type: 'creds' },
                { $set: { data: serialize(creds) } },
                { upsert: true }
            );
        }
    };
}

module.exports = { useMongoAuthState };