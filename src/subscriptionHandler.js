import socket from "@cocreate/socket-client";

/**
 * Sends a subscription payload to the socket server for a registered dataKey.
 * 
 * @param {Object} dataKey - Generated dataKey object { string, object }
 * @param {Object} [data] - Optional metadata/payload overrides
 * @returns {Object|undefined} Sent payload
 */
export function subscribe(dataKey, data = {}) {
    if (!dataKey || !dataKey.string) return;

    const payload = {
        method: "subscribe",
        key: dataKey.string,
        ...dataKey.object,
        ...data
    };

    if (socket && typeof socket.send === "function") {
        socket.send(payload);
    }

    return payload;
}

/**
 * Sends an unsubscription payload to the socket server when a key scope is cleared.
 * 
 * @param {Object} dataKey - Generated dataKey object { string, object }
 * @param {Object} [data] - Optional metadata/payload overrides
 * @returns {Object|undefined} Sent payload
 */
export function unsubscribe(dataKey, data = {}) {
    if (!dataKey || !dataKey.string) return;

    const payload = {
        method: "unsubscribe",
        key: dataKey.string,
        ...dataKey.object,
        ...data
    };

    if (socket && typeof socket.send === "function") {
        socket.send(payload);
    }

    return payload;
}

export default { subscribe, unsubscribe }