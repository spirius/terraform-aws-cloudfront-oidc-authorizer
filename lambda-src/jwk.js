const crypto = require('crypto');

// References:
// https://coolaj86.com/articles/asn1-for-dummies/
// https://lapo.it/asn1js

function base64urldecode(data) {
    return Buffer.from(data
        .replace(/\-/g, '+')
        .replace(/\_/g, '/') + "===", 'base64');
}

// OID 1.2.840.113549.1.1.1
const oidRsaEncryption = Buffer.from([0x2A, 0x86, 0x48, 0x86, 0xF7, 0x0D, 0x01, 0x01, 0x01]);

const NULL = Buffer.from([0x00]);

const TYPE_INTEGER           = Buffer.from([0x02]);
const TYPE_BIT_STRING        = Buffer.from([0x03]);
const TYPE_NULL              = Buffer.from([0x05]);
const TYPE_OBJECT_IDENTIFIER = Buffer.from([0x06]);
const TYPE_SEQUENCE          = Buffer.from([0x30]);

function makeLength(l) {
    if (l === -1) {
        return Buffer.from([0x80]);
    } else if (l < 128) {
        return Buffer.from([l]);
    } else {
        const parts = [];
        while (l) {
            parts.unshift(l & 0xFF);
            l >>= 8;
        }
        parts.unshift(0x80 | parts.length);
        return Buffer.from(parts);
    }
}

function makeInteger(integer) {
    if (integer[0] & 0x80) {
        // first bit is 1, so padding is needed
        return Buffer.concat([
            TYPE_INTEGER,

            // Length + 1 padding
            makeLength(integer.length + 1),

            // Padding
            NULL,
            integer,
        ]);
    } else {
        return Buffer.concat([
            TYPE_INTEGER,
            makeLength(integer.length),
            integer,
        ]);
    }
}

function makeSequence(list) {
    const totalLength = list.reduce((r, v) => r + v.length, 0);
    return Buffer.concat([
        TYPE_SEQUENCE,
        makeLength(totalLength),
        ...list,
    ]);
}

function makeBitString(data) {
    return Buffer.concat([
        TYPE_BIT_STRING,

        // Length + 1 padding
        makeLength(data.length + 1),

        // Padding
        NULL,
        data,
    ]);
}

function makeObjectIdentifier(identifier) {
    return Buffer.concat([TYPE_OBJECT_IDENTIFIER, makeLength(identifier.length), identifier]);
}

function toPEM(jwk) {
    if (jwk.kty !== "RSA") {
        throw new Error("only RSA keys are currently supported");
    }
    if (jwk.use !== "sig") {
        throw new Error("only public keys are currently supported");
    }
    const n = base64urldecode(jwk.n);
    const e = base64urldecode(jwk.e);

    const key = makeSequence([
        makeSequence([
            // rsaEncryption OID
            makeObjectIdentifier(oidRsaEncryption),
            // No attributes
            TYPE_NULL, NULL,
        ]),
        makeBitString(
            makeSequence([
                makeInteger(n),
                makeInteger(e),
            ]),
        ),
    ]);

    return "-----BEGIN PUBLIC KEY-----\n"
        + key.toString('base64').match(/.{1,64}/g).join("\n")
        + "\n-----END PUBLIC KEY-----";
}

function toKeyObject(jwk) {
    return crypto.createPublicKey(toPEM(jwk));
}

exports.toPEM = toPEM;
exports.toKeyObject = toKeyObject;
