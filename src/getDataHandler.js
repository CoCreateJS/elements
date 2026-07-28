import {
    getAttributes,
    checkValue
} from "@cocreate/utils";

import { elements, forms, keys } from "./mapRegistry.js";
import { subscribe } from "./subscribeHandler.js";

/**
 * Parses and normalizes HTML attributes from an element into a canonical CRUD data object.
 * Infers execution type (object, index, array, database, storage, data) dynamically.
 * 
 * @param {Element} element 
 * @returns {Object|undefined} Normalized data payload object
 */
export function getDataObject(element) {
    const data = getAttributes(element);
    const crudType = ["storage", "database", "array", "index", "object"];

    for (let i = 0; i < crudType.length; i++) {
        if (!checkValue(data[crudType[i]])) return;

        if (data[crudType[i]] && data[crudType[i]].includes(",")) {
            const array = data[crudType[i]].split(",");
            data[crudType[i]] = [];

            for (let j = 0; j < array.length; j++) {
                const item = array[j].trim();
                if (crudType[i] === "object") {
                    data[crudType[i]].push({ _id: item });
                } else {
                    data[crudType[i]].push(item);
                }
            }
        }
    }

    if (data.object || data.object === "" || data.key || data.key === "") {
        if (!data.array || (data.array && !data.array.length)) return;
        data.type = "object";
    } else if (data.index || data.index === "") {
        if (!data.array || (data.array && !data.array.length)) return;
        data.type = "index";
    } else if (data.array || data.array === "") data.type = "array";
    else if (data.database || data.database === "") data.type = "database";
    else if (data.storage || data.storage === "") data.type = "storage";
    else if (data.data) data.type = "data";

    delete data.isRealtime;
    return data;
}

/**
 * Registers an element and its generated dataKey into local client maps.
 * Binds element save/read helper methods and associates form context.
 * 
 * @param {Element} element 
 * @param {Object} data 
 * @returns {{ string: string, object: Object }}
 */
export function initDataKey(element, data) {
    const dataKey = getDataKey(data);

    if (keys.has(dataKey.string)) {
        keys.get(dataKey.string).elements.set(element, "");
    } else {
        keys.set(dataKey.string, {
            elements: new Map([[element, ""]]),
            data,
            dataKey
        });
        subscribe(dataKey, data);
    }

    elements.set(element, dataKey.string);

    if (element.parentElement) {
        const form = element.closest("form");
        if (form) {
            if (!form.save) form.save = () => save(form);
            if (!form.getData) form.getData = () => getData(form);

            let formObject = forms.get(form);
            if (formObject) {
                formObject.elements.set(element, data);
                if (formObject.types.has(data.type)) {
                    formObject.types.get(data.type).set(element, data);
                } else {
                    formObject.types.set(data.type, new Map([[element, data]]));
                }
            } else {
                forms.set(form, {
                    elements: new Map([[element, data]]),
                    types: new Map([[data.type, new Map([[element, data]])]])
                });
            }
        }
    }

    if (!element.read) element.read = () => read(element);
    if (!element.save) element.save = () => save(element);

    return dataKey;
}

/**
 * Generates the canonical client-side dataKey object for a payload.
 * Field-level "key" is explicitly excluded for object-level operations
 * to ensure all fields targeting the same document share 1 dataKey.
 * 
 * @param {Object} data 
 * @returns {{ string: string, object: Object }}
 */
export function getDataKey(data) {
    const dataKey = {};
    const attributes = [
        "host",
        "organization_id",
        "apikey",
        "method",
        "type",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "key",
        "updateKey",
        "$filter",
        "upsert",
        "namespace",
        "room",
        "broadcast",
        "broadcastSender",
        "broadcastBrowser"
    ];

    for (const attribute of attributes) {
        // Exclude field-level "key" from object-scope dataKeys so fields share document key
        if (attribute === "key" && data.type === "object") continue;

        const value = data[attribute];
        if (value !== undefined && value !== null && value !== "") {
            if (Array.isArray(value)) {
                const sortedVal = [...value];
                if (typeof sortedVal[0] === "string") sortedVal.sort();
                dataKey[attribute] = sortedVal;
            } else {
                dataKey[attribute] = value;
            }
        }
    }

    const object = Object.fromEntries(
        Object.entries(dataKey).sort(([a], [b]) => a.localeCompare(b))
    );
    const string = JSON.stringify(object);

    return { string, object };
}

/**
 * Finds all DOM elements watching keys matched by an incoming payload.
 * 
 * @param {Object} data 
 * @returns {Element[]}
 */
export function getDataElements(data) {
    const matchingElements = [];
    const matchingKeys = getDataKeys(data);

    for (let i = 0; i < matchingKeys.length; i++) {
        const keyEntry = keys.get(matchingKeys[i]);
        if (keyEntry?.elements?.size) {
            matchingElements.push(...keyEntry.elements.keys());
        }
    }
    return matchingElements;
}

/**
 * Evaluates registered client keys against a payload to identify subscriptions.
 * 
 * @param {Object} data 
 * @returns {string[]} Matching key strings
 */
export function getDataKeys(data) {
    const matchingKeyStrings = [];
    const targetKeys = [
        "type",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "$filter"
    ];

    for (const [keyString, sortedKey] of keys.entries()) {
        let hasMatch = true;

        for (const key of targetKeys) {
            if (
                !data.$filter &&
                key === "$filter" &&
                sortedKey.data.hasOwnProperty(key)
            ) {
                hasMatch = true;
            } else if (data.hasOwnProperty(key)) {
                if (!sortedKey.data.hasOwnProperty(key)) {
                    hasMatch = false;
                    break;
                }
                if (
                    Array.isArray(sortedKey.data[key]) &&
                    Array.isArray(data[key])
                ) {
                    if (key === "object" && sortedKey.data.$filter) {
                        hasMatch = true;
                    } else {
                        const matches = sortedKey.data[key].some((value) => {
                            if (key === "object") {
                                return data[key].some((obj) => obj._id === value._id);
                            } else {
                                return data[key].includes(value);
                            }
                        });

                        if (!matches) {
                            hasMatch = false;
                            break;
                        }
                    }
                } else if (sortedKey.data[key] !== data[key]) {
                    hasMatch = false;
                    break;
                }
            }
        }

        if (hasMatch) {
            matchingKeyStrings.push(keyString);
        }
    }

    return matchingKeyStrings;
}

/**
 * Formats values into a standardized CRUD write payload.
 */
function formatPayload(payload, value, element) {
    if (!payload[payload.type] && payload.key) {
        payload.method = payload.type + ".create";
        if (payload.type === "object") {
            if (!payload.object) payload.object = {};
            else if (typeof payload.object === "string")
                payload.object = { _id: payload.object };

            if (payload.key) {
                if (payload.key === "{}") {
                    if (Array.isArray(value)) {
                        payload.object = value;
                    } else payload.object = { ...payload.object, ...value };
                } else payload.object[payload.key] = value;
            }
            if (payload.isUpsert && payload.$filter)
                payload.method = "object.update";
        } else payload[payload.type] = value;
    } else if (payload[payload.type] && payload.key) {
        const attributes = element.attributes;
        if (payload.key.startsWith("$")) {
            const operators = ["$rename", "$inc", "$push", "$each", "$splice", "$unset", "$delete", "$slice", "$pop", "$shift", "$addToSet", "$pull"];
            const matchedAttr = Array.from(attributes).find(attr => operators.includes(attr.name));
            if (matchedAttr) {
                payload.key = matchedAttr.name + "." + payload.key;
            }
        }

        if (payload.type === "object") {
            if (typeof payload[payload.type] === "string") {
                if (payload.key === "{}") {
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        ...(Array.isArray(value) ? value[0] : value)
                    };
                } else {
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        [payload.key]: value
                    };
                }
            } else if (Array.isArray(payload[payload.type])) {
                if (payload.key === "{}") {
                    payload[payload.type][0] = {
                        ...payload[payload.type][0],
                        ...value
                    };
                } else {
                    if (payload[payload.type][0]) {
                        payload[payload.type][0][payload.key] = value;
                    }
                    if (!payload[payload.type][0]?._id) {
                        payload.method = payload.type + ".create";
                    }
                }
            } else if (typeof payload[payload.type] === "object") {
                if (payload.key === "{}") {
                    payload[payload.type] = { ...payload[payload.type], ...value };
                } else {
                    payload[payload.type][payload.key] = value;
                    if (!payload[payload.type]._id) {
                        payload.method = payload.type + ".create";
                    }
                }
            }
        } else {
            payload[payload.type] = { [payload[payload.type]]: value };
        }

        if (payload.isUpdate || payload.isUpdate === "") {
            if (!payload.key) return false;
            delete payload.isUpdate;
            payload.updateKey = { [payload.key]: value };
            payload.method = payload.type + ".update";
        } else if (payload.isDelete || payload.isDelete === "") {
            delete payload.isDelete;
            if (payload.type === "object" && payload.key) {
                payload.method = payload.type + ".update";
                if (typeof payload[payload.type] === "string") {
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        [payload.key]: undefined
                    };
                } else if (typeof payload[payload.type] === "object") {
                    payload[payload.type][payload.key] = undefined;
                }
            } else {
                payload.method = payload.type + ".delete";
            }
        }
    }
    return true;
}

/**
 * Extracts and aggregates form field values into unified CRUD operational payloads.
 * Groups inputs targeting the same document scope via dataKey into a single write operation.
 * 
 * @param {Element} form 
 * @returns {Promise<Object[]>} Array of CRUD request payloads
 */
export async function getData(form) {
    const dataKeys = new Map();
    const formObject = forms.get(form);

    if (!formObject) {
        const selector = "[storage], [database], [array], [object]";
        const elementsInForm = form.querySelectorAll(selector);
        await init(elementsInForm);
        return await getData(form);
    }


    for (const type of formObject.types.values()) {
        for (const [element, data] of type.entries()) {
            if (
                !element.hasAttribute("key") ||
                element.getAttribute("save") === "false"
            ) {
                continue;
            }

            if (element.hasAttribute("actions")) {
                const actionAttr = element.getAttribute("actions");
                if (actionAttr.includes("save") || actionAttr.includes("delete")) continue;
            }

            if (element.matches("[render-query]")) {
                const attrType = element.getAttribute("type");
                if (attrType !== "file") continue;
            }

            const value = await element.getValue();
            if (value === undefined) continue;

            const payload = { ...data };
            const dataKey = elements.get(element);

            const success = formatPayload(payload, value, element);
            if (!success) continue;

            // Group form fields sharing the exact same document dataKey into 1 payload write
            const groupKey = dataKey;
            if (dataKeys.has(groupKey)) {
                const storedPayload = dataKeys.get(groupKey);
                storedPayload[payload.type] = {
                    ...storedPayload[payload.type],
                    ...payload[payload.type]
                };
            } else {
                dataKeys.set(groupKey, payload);
            }
        }
    }

    return Array.from(dataKeys.values());
}

export default {
    initDataKey,
    getDataKey,
    getDataElements,
    getDataKeys,
    getData,
    getDataObject
};