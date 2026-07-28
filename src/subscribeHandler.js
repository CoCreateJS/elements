import socket from "@cocreate/socket-client";

/**
 * Canonical scope attributes included in socket server subscription channel keys.
 * Excludes field-level "key" and "$filter" so document and collection channels remain cohesive.
 */
const SUBSCRIPTION_ATTRIBUTES = [
    "host",
    "organization_id",
    "storage",
    "database",
    "array",
    "index",
    "object"
];

/**
 * Derives all target subscription channel keys for write operations (create, update, delete).
 * Returns an array containing both the specific document scope key (with ID) 
 * and the generic scope key (without ID) to notify both single-item and list subscribers.
 * 
 * @param {Object} dataKey - Client dataKey or CRUD payload object
 * @returns {string[]} Array of JSON-stringified subscription key channel strings
 */
export function deriveSubscriptionKeys(dataKey) {
    if (!dataKey) return [];
    const rawObj = dataKey.object || dataKey;

    const baseSubObj = {};

    for (const attr of SUBSCRIPTION_ATTRIBUTES) {
        const value = rawObj[attr];
        if (value !== undefined && value !== null && value !== "") {
            baseSubObj[attr] = value;
        }
    }

    const keysSet = new Set();

    // 1. Specific Document Key (includes exact object ID if present)
    const sortedSpecific = Object.fromEntries(
        Object.entries(baseSubObj).sort(([a], [b]) => a.localeCompare(b))
    );
    keysSet.add(JSON.stringify(sortedSpecific));

    // 2. Generic Scope Key (targets list component subscribers watching the collection)
    if (baseSubObj.object) {
        const genericSubObj = { ...baseSubObj };
        genericSubObj.object = []; // Generalize object scope

        const sortedGeneric = Object.fromEntries(
            Object.entries(genericSubObj).sort(([a], [b]) => a.localeCompare(b))
        );
        keysSet.add(JSON.stringify(sortedGeneric));
    }

    return Array.from(keysSet);
}

/**
 * Sends a subscription payload to the socket server for a registered dataKey.
 * 
 * @param {Object} dataKey - Generated dataKey object { string, object }
 * @param {Object} [data] - Optional metadata or payload overrides
 * @returns {Object|undefined} Payload sent to the socket
 */
export function subscribe(dataKey, data = {}) {
    if (!dataKey || !dataKey.string) return;

    const payload = {
        method: "subscribe",
        key: dataKey.string,
        subscriptionKeys: deriveSubscriptionKeys(dataKey.object || dataKey),
        ...dataKey.object,
        ...data
    };

    if (socket && typeof socket.send === "function") {
        socket.send(payload);
    }

    return payload;
}

/**
 * Sends an unsubscription payload to the socket server when an element scope is unmounted.
 * 
 * @param {Object} dataKey - Generated dataKey object { string, object }
 * @param {Object} [data] - Optional metadata or payload overrides
 * @returns {Object|undefined} Payload sent to the socket
 */
export function unsubscribe(dataKey, data = {}) {
    if (!dataKey || !dataKey.string) return;

    const payload = {
        method: "unsubscribe",
        key: dataKey.string,
        subscriptionKeys: deriveSubscriptionKeys(dataKey.object || dataKey),
        ...dataKey.object,
        ...data
    };

    if (socket && typeof socket.send === "function") {
        socket.send(payload);
    }

    return payload;
}

export default {
    deriveSubscriptionKeys,
    subscribe,
    unsubscribe
};