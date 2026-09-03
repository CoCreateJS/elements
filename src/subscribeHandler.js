import socket from "@cocreate/socket-client";

/**
 * Canonical scope attributes included in socket server subscription channel keys.
 * Excludes field-level "key" and "filter" so document and collection channels remain cohesive.
 */
const SUBSCRIPTION_ATTRIBUTES = [
    "namespace",
    "room",
    "storage",
    "database",
    "array",
    "object"
];

export function getSubscription(data) {
    const object = {};

    for (const attribute of SUBSCRIPTION_ATTRIBUTES) {
        let value = data[attribute];

        if (attribute === "object") {
            if (Array.isArray(value)) {
                value = value
                    .map(item => typeof item === "object" ? item?._id : item)
                    .filter(Boolean)
                    .sort();
            } else if (typeof value === "object" && value !== null) {
                value = value._id;
            }
        } else if (Array.isArray(value)) {
            value = [...value].sort();
        }

        if (value !== undefined && value !== null && value !== "") {
            object[attribute] = value;
        }
    }

    const normalizedObject = Object.fromEntries(
        Object.entries(object).sort(([a], [b]) => a.localeCompare(b))
    );

    if (normalizedObject.object && !normalizedObject.array) return;

    return {
        string: JSON.stringify(normalizedObject),
        object: normalizedObject
    };
}

/**
 * Derives all target subscription channel keys for write operations (create, update, delete).
 * Returns an array containing both the specific document scope key (with ID)
 * and the generic scope key (without ID) to notify both single-item and list subscribers.
 *
 * @param {Object} data - CRUD data object
 * @returns {string[]} Array of JSON-stringified subscription key channel strings
 */
export function deriveSubscriptionKeys(data) {
    if (!data) return [];
    const subscription = getSubscription(data);
    if (!subscription) return [];
    const baseSubObj = { ...subscription.object };
    const objects = Array.isArray(baseSubObj.object)
        ? baseSubObj.object
        : baseSubObj.object
            ? [baseSubObj.object]
            : [];
    delete baseSubObj.object;
    const keysSet = new Set();
    const addKey = (scope) => {
        const sortedScope = Object.fromEntries(
            Object.entries(scope).sort(([a], [b]) => a.localeCompare(b))
        );
        keysSet.add(JSON.stringify(sortedScope));
    };

    for (const object of objects)
        addKey({ ...baseSubObj, object });

    // Collection subscribers use the same scope with the object omitted.
    addKey(baseSubObj);

    return Array.from(keysSet);
}

/**
 * Sends an unsubscription payload to the socket server when an element scope is unmounted.
 *
 * @param {Object} dataKey - Generated dataKey object { string, object }
 * @param {Object} [data] - Optional metadata or payload overrides
 * @returns {Object|undefined} Payload sent to the socket
 */
export function unsubscribe(subscription) {
    if (!subscription || !subscription.string) return;

    const payload = {
        method: "unsubscribe",
        subscription: subscription.string
    };

    if (socket && typeof socket.send === "function") {
        socket.send(payload);
    }

    return payload;
}

export default {
    getSubscription,
    deriveSubscriptionKeys,
    unsubscribe
};
