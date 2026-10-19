import {
    queryElements,
    getAttributeNames,
    checkValue
} from "@cocreate/utils";
import Actions from "@cocreate/actions";
import CRUD from "@cocreate/crud-client";

import { elements, keys, debounce } from "./mapRegistry.js";
import { getDataObject } from "./getDataHandler.js";
import { setData, setDataType } from "./setDataHandler.js";
import {
    deriveSubscriptionKeys,
    getSubscription
} from "./subscribeHandler.js";

/**
 * Reads data for one or more elements based on their dataKey scope.
 * 
 * @param {Element|Element[]} element - Element(s) to read data for
 * @param {Object} [data] - CRUD payload override
 * @param {Object} [dataKey] - Data key reference
 */
export async function read(element, data, dataKey) {
    if (!dataKey) dataKey = { string: elements.get(element) };
    if (!data) {
        let existingData = keys.get(dataKey.string);
        if (existingData && existingData.dataKey && existingData.dataKey.object)
            data = { ...existingData.dataKey.object };
    }

    if (!dataKey || !data?.type) {
        return;
    }
    if (!data.filter && !data[data.type]) {
        return;
    }

    if (!(element instanceof HTMLCollection) && !Array.isArray(element))
        element = [element];

    let delay = debounce.get(dataKey.string);
    if (!delay) debounce.set(dataKey.string, (delay = {}));

    if (!delay.elements) delay.elements = new Map();

    for (let el of element) {
        const isRead = el.getAttribute("read");
        if (
            isRead !== "false" &&
            !el.hasRead &&
            (!data.filter || (data.filter && data.filter.isFilter !== false))
        ) {
            el.hasRead = true;
            delay.elements.set(el, true);
        }
    }

    if (!delay.elements.size) return;

    clearTimeout(delay.timer);
    delay.timer = setTimeout(function () {
        // Detach this batch before sending so reads queued while the request is
        // in flight cannot mutate (or later delete) the same element map.
        const els = Array.from(delay.elements?.keys() || []);
        if (debounce.get(dataKey.string) === delay)
            debounce.delete(dataKey.string);
        clearTimeout(delay.timer);
        delete delay.elements;
        delete delay.timer;

        if (!els.length) return;

        if (!data.filter && data.type === "object") {
            if (!data.object) {
                return;
            }
            else if (typeof data.object === "string")
                data.object = { _id: data.object };
            else if (Array.isArray(data.object)) {
                if (data.object.length)
                    data.object = { _id: data.object[0]._id };
            } else if (!data.object._id.match(/^[0-9a-fA-F]{24}$/)) {
                return;
            }
        }

        data.method = data.type + ".read";
        const subscription = getSubscription(data);
        if (subscription) data.subscription = subscription.string;

        CRUD.send(data).then(async (responseData) => {
            if (responseData) {
                await setData(els, responseData);
            }
        });
    }, 500);
}

/**
 * Persists modifications for a single element or a form container to the database.
 * Derives and attaches subscriptionKeys (both document-specific and list-scoped)
 * prior to dispatching via CRUD.send().
 * 
 * @param {Element} element - Input element or FORM instance
 * @param {Object} [action] - Action metadata object
 * @returns {Promise<Object[]>}
 */
export async function save(element, action) {
    if (!element) return;
    let data, value, form;
    let upsert = element.getAttribute("upsert");
    if (upsert && upsert !== "false") upsert = true;

    if (element.tagName === "FORM") {
        data = await element.getData();
    } else {
        let isSave = element.getAttribute("save");
        if (isSave === "false") return;
        if (action) {
            form = element.closest("form");
            if (form) {
                return save(form);
            }
        }

        let dataKey = elements.get(element);
        data = { ...keys.get(dataKey).dataKey.object };

        value = await element.getValue();
        let key = element.getAttribute("key");
        if (data.type === "object" && !data.object) {
            if (key == "{}") {
                if (Array.isArray(value)) {
                    data[data.type] = value.map((v) => ({ ...v }));
                } else
                    data[data.type] = value;
            } else {
                data[data.type] = { [key]: value };
            }
        }
        else if (typeof data[data.type] === "string")
            if (key == "{}")
                data[data.type] = { _id: data[data.type], ...value };
            else data[data.type] = { _id: data[data.type], [key]: value };
        else if (typeof data[data.type] === "object")
            if (key == "{}") data[data.type] = { ...data[data.type], ...value };
            else data[data.type][key] = value;

        if (/\.([0-9]*)/g.test(data.key)) {
            let splice = element.getAttribute("splice");
            let slice = element.getAttribute("slice");
            let update = element.getAttribute("update");

            if (splice || splice === "") {
                data[data.type][key] = { $splice: value };
            } else if (slice) {
                data[data.type][key] = "$delete";
            } else if (update) {
                value = data.key.replace(/\[.*?\]/, "[" + value + "]");
                data.updateKey[key] = value;
                data[data.type][key] = { $update: value };
            }
        }

        data = [data];
    }

    let responseDataList = [];
    for (let i = 0; i < data.length; i++) {
        if (data[i].type === "object") {
            let hasId = false;

            if (typeof data[i].object === "string") {
                hasId = !!data[i]._id || !!data[i].object;
            } else if (Array.isArray(data[i].object)) {
                hasId = !!data[i].object[0]?._id;
            } else if (typeof data[i].object === "object" && data[i].object !== null) {
                hasId = !!data[i].object?._id;
            }

            if (!data[i].object || !hasId) {
                data[i].method = "object.create";
            } else {
                data[i].method = "object.update";
                if (upsert) data[i].upsert = true;
            }
        }

        if (data[i].isUpsert) {
            data[i].upsert = true;
            delete data[i].isUpsert;
        }

        if (data[i].method && data[i].method.endsWith(".create")) {
            element.setAttribute(data[i].type, "pending");
        } else if (
            data[i].method &&
            data[i].method.endsWith(".update") &&
            data[i].type == "object" &&
            typeof value == "string" &&
            window.CoCreate?.crdt
        ) {
            return window.CoCreate.crdt.replaceText({
                array: data[i].array,
                key: data[i].key,
                object: data[i].object._id,
                value
            });
        }

        // Derive and attach subscriptionKeys array (contains specific document key and list key)
        const subscription = getSubscription(data[i]);
        if (subscription) data[i].subscription = subscription.string;
        data[i].subscriptionKeys = deriveSubscriptionKeys(data[i]);

        data[i] = await CRUD.send(data[i]);
        const errors = data[i]?.error;
        if (!data[i] || (Array.isArray(errors) ? errors.length > 0 : !!errors)) {
            const message = Array.isArray(errors)
                ? errors.map((error) => error.message || String(error)).join("; ")
                : errors?.message || String(errors || "Save failed");
            throw new Error(message);
        }

        responseDataList.push(data[i]);

        if (
            data[i] &&
            (data[i].method.endsWith(".create") || data[i].method.endsWith(".update"))
        ) {
            setDataType(element, data[i], action);
        } else if (data[i]) {
            if (action) {
                action.element.dispatchEvent(
                    new CustomEvent("saved", {
                        detail: data
                    })
                );
            } else {
                document.dispatchEvent(
                    new CustomEvent("saved", {
                        detail: data
                    })
                );
            }
        }
    }

    return responseDataList;
}

Actions.init([
    {
        name: "save",
        endEvent: "saved",
        callback: async (action) => {
            if (action.element.hasAttribute("save-query")) {
                const targets = queryElements({
                    element: action.element,
                    prefix: "save"
                });

                if (!targets.length) {
                    action.abort({
                        code: "save-target-not-found",
                        message: "The save target could not be found.",
                        selector: action.element.attributes.getNamedItem("save-query")?.value
                    });
                    return;
                }

                try {
                    const result = [];
                    for (const target of targets) {
                        result.push(await save(target));
                    }
                    action.end({ result });
                } catch (error) {
                    action.abort({
                        code: "save-failed",
                        message: "Unable to save the form.",
                        cause: error
                    });
                    console.error("Save action failed:", error);
                }
                return;
            }

            try {
                await save(action.form || action.element, action);
            } catch (error) {
                action.abort({
                    code: "save-failed",
                    message: "Unable to save the form.",
                    cause: error
                });
                console.error("Save action failed:", error);
            }
        }
    },
    {
        name: "delete",
        endEvent: "deleted",
        callback: async (action) => {
            let elements = [];
            if (action.element.hasAttribute("delete-query")) {
                elements = queryElements({
                    element: action.element,
                    prefix: "delete"
                });
            } else {
                elements = [action.element];
            }

            const groups = new Map();
            for (let i = 0; i < elements.length; i++) {
                const data = getDataObject(elements[i]);
                if (!data) continue;
                data.method = data.type + ".delete";

                if (
                    data.type === "object" &&
                    typeof data[data.type] === "string"
                )
                    data[data.type] = { _id: data[data.type] };

                if (data.type !== "object") {
                    groups.set(Symbol(), data);
                    continue;
                }

                const groupKey = JSON.stringify({
                    storage: data.storage || "",
                    database: data.database || "",
                    array: data.array
                });
                const objects = Array.isArray(data.object)
                    ? data.object
                    : [data.object];
                let group = groups.get(groupKey);

                if (!group) {
                    group = {
                        ...data,
                        object: [],
                        objectIds: new Set()
                    };
                    groups.set(groupKey, group);
                }

                for (const object of objects) {
                    if (!object || !object._id || group.objectIds.has(object._id))
                        continue;
                    group.objectIds.add(object._id);
                    group.object.push({ _id: object._id });
                }
            }

            for (const data of groups.values()) {
                if (data.objectIds) {
                    delete data.objectIds;
                    if (!data.object.length) continue;
                }

                // Subscribe the requester at collection scope. A grouped object
                // array is a delete payload, not a subscribable document key.
                const subscriptionData = { ...data };
                delete subscriptionData.object;
                const subscription = getSubscription(subscriptionData);
                if (subscription)
                    data.subscription = subscription.string;
                data.subscriptionKeys = deriveSubscriptionKeys(data);

                let response = await CRUD.send(data);
                action.element.dispatchEvent(
                    new CustomEvent("deleted", {
                        detail: response
                    })
                );
            }
        }
    }
]);

export default { read, save };
