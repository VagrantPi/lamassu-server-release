const crypto = require('crypto');

function decryptAES256(key, data) {
    if (!key) {
        throw new Error('server key is empty');
    }

    const keyBuffer = Buffer.from(key, 'utf8');
    if (keyBuffer.length !== 32) {
        throw new Error(`invalid key size: ${keyBuffer.length}`);
    }

    try {
        const decoded = Buffer.from(data, 'hex');
        
        const nonceSize = 12; // GCM's standard nonce size
        const tagSize = 16; // Authentication Tag size

        if (decoded.length < nonceSize + tagSize) {
            throw new Error('invalid encrypted data');
        }

        const nonce = decoded.slice(0, nonceSize);
        const ciphertext = decoded.slice(nonceSize, -tagSize);
        const authTag = decoded.slice(-tagSize);

        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, nonce);
        decipher.setAuthTag(authTag);

        const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return plaintext.toString();
    } catch (error) {
        throw error;
    }
}

module.exports = { decryptAES256 };
