import { Context } from "hono";
const utf8Decoder = new TextDecoder();

const decodeBase64 = (str: string) => {
    const binary = atob(str);
    const bytes = new Uint8Array(new ArrayBuffer(binary.length));
    const half = binary.length / 2;
    for (let i = 0, j = binary.length - 1; i <= half; i++, j--) {
        bytes[i] = binary.charCodeAt(i);
        bytes[j] = binary.charCodeAt(j);
    }
    return bytes;
};

export const getAuthUserId = (c: Context) => {
    const match = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/.exec(c.req.header("Authorization") || "");

    if (!match) {
        return null;
    }

    let userPass;
    try {
        userPass = /^([^:]*):(.*)$/.exec(utf8Decoder.decode(decodeBase64(match[1])));
    } catch (e) {
    }

    if (!userPass || !parseInt(userPass[1])) {
        return null;
    }

    return parseInt(userPass[1]);
}

export const getStaffUserId = (c: Context) => {
    const match = /^ *(?:[Bb][Aa][Ss][Ii][Cc]) +([A-Za-z0-9._~+/-]+=*) *$/.exec(c.req.header("Authorization") || "");

    if (!match) {
        return null;
    }

    let userPass;
    try {
        userPass = /^([^:]*):(.*)$/.exec(utf8Decoder.decode(decodeBase64(match[1])));
    } catch (e) {
    }

    if (!userPass) {
        return null;
    }

    return userPass[1];
}