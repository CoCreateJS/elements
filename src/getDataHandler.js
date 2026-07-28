import {
    getAttributes,
    checkValue
} from "@cocreate/utils";

import { elements, forms, keys} from "./mapRegistry.js"

export function getDataObject(element) {
    const data = getAttributes(element);
    const crudType = ["storage", "database", "array", "index", "object"];

    for (let i = 0; i < crudType.length; i++) {
        if (!checkValue(data[crudType[i]])) return;

        if (data[crudType[i]] && data[crudType[i]].includes(",")) {
            const array = data[crudType[i]].split(",");
            data[crudType[i]] = [];

            for (let j = 0; j < array.length; j++) {
                array[j].trim();
                if (crudType[i] === "object") {
                    data[crudType[i]].push({ _id: array[j] });
                } else {
                    data[crudType[i]].push(array[j]);
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

export function initDataKey(element, data) {
    let dataKey = getDataKey(data);
    if (keys.has(dataKey.string))
        keys.get(dataKey.string).elements.set(element, "");
    else
        keys.set(dataKey.string, {
            elements: new Map([[element, ""]]),
            data,
            dataKey
        });

    elements.set(element, dataKey.string);

    if (element.parentElement) {
        let form = element.closest("form");
        if (form) {
            if (!form.save) form.save = () => save(form);

            if (!form.getData) form.getData = () => getData(form);

            let formObject = forms.get(form);
            if (formObject) {
                formObject.elements.set(element, data);
                if (formObject.types.has(data.type))
                    formObject.types.get(data.type).set(element, data);
                else
                    formObject.types.set(data.type, new Map([[element, data]]));
            } else
                forms.set(form, {
                    elements: new Map([[element, data]]),
                    types: new Map([[data.type, new Map([[element, data]])]])
                });
        }
    }

    if (!element.read) element.read = () => read(element);
    if (!element.save) element.save = () => save(element);

    return dataKey;
}

export function getDataKey(data) {
    let dataKey = {};
    let attributes = [
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

    for (let attribute of attributes) {
        if (attribute === "key" && data.type === "object") continue;
        let value = data[attribute];
        if (value) {
            if (Array.isArray(value)) {
                dataKey[attribute] = [...value];
                if (typeof value[0] === "string") dataKey[attribute].sort(); // Sort the values alphabetically
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

export function getDataElements(data) {
    let element = [];
    let matchingKeys = getDataKeys(data);
    for (let i = 0; i < matchingKeys.length; i++) {
        let matchingElements = keys.get(matchingKeys[i]);
        if (matchingElements?.elements?.size)
            element.push(...matchingElements.elements.keys());
    }
    return element;
}

// TODO: Correctly check for matches
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
            )
                hasMatch = true;
            else if (data.hasOwnProperty(key)) {
                if (!sortedKey.data.hasOwnProperty(key)) {
                    hasMatch = false;
                    break;
                }
                if (
                    Array.isArray(sortedKey.data[key]) &&
                    Array.isArray(data[key])
                ) {
                    // if key is object check _id
                    if (key === "object" && sortedKey.data.$filter)
                        hasMatch = true;
                    else {
                        const matches = sortedKey.data[key].some((value) => {
                            if (key === "object") {
                                return data[key].some((obj) => {
                                    return obj._id === value._id;
                                });
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

function formatPayload(payload, value, element) {
    if (!payload[payload.type] && payload.key) {
        payload.method = payload.type + ".create";
        if (payload.type === "object") {
            if (!payload.object) payload.object = {};
            else if (typeof payload.object === "string")
                payload.object = { _id: payload.object };

            if (payload.key) {
                if (payload.key == "{}") {
                    if (Array.isArray(value)) {
                        payload.object = value;
                    } else payload.object = { ...payload.object, ...value };
                } else payload.object[payload.key] = value;
            }
            if (payload.isUpsert && payload.$filter)
                payload.method = "object.update";
        } else payload[payload.type] = value;
    } else if (payload[payload.type] && payload.key) {
        let attributes = element.attributes;
        if (payload.key.startsWith("$")) {
            const operators = ["$rename", "$inc", "$push", "$each", "$splice", "$unset", "$delete", "$slice", "$pop", "$shift", "$addToSet", "$pull"];
            const matchedAttr = Array.from(attributes).find(attr => operators.includes(attr.name));
            if (matchedAttr) {
                payload.key = matchedAttr.name + "." + payload.key;
            }
        }

        if (payload.type === "object") {
            if (typeof payload[payload.type] === "string")
                if (payload.key == "{}") {
                    if (Array.isArray(value))
                        payload[payload.type] = {
                            _id: payload[payload.type],
                            ...value[0]
                        };
                    else
                        payload[payload.type] = {
                            _id: payload[payload.type],
                            ...value
                        };
                } else
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        [payload.key]: value
                    };
            else if (Array.isArray(payload[payload.type]))
                if (payload.key == "{}")
                    payload[payload.type][0] = {
                        ...payload[payload.type][0],
                        ...value
                    };
                else {
                    if (payload[payload.type][0]) {
                        payload[payload.type][0][payload.key] = value;
                    }
                    if (!payload[payload.type][0]._id)
                        payload.method = payload.type + ".create";
                }
            else if (typeof payload[payload.type] === "object")
                if (payload.key == "{}")
                    payload[payload.type] = { ...payload[payload.type], ...value };
                else {
                    payload[payload.type][payload.key] = value;
                    if (!payload[payload.type]._id)
                        payload.method = payload.type + ".create";
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
            if (payload.type == "object" && payload.key) {
                payload.method = payload.type + ".update";
                if (typeof payload[payload.type] === "string")
                    payload[payload.type] = {
                        _id: payload[payload.type],
                        [payload.key]: undefined
                    };
                else if (Array.isArray(payload[payload.type])) {
                    console.log(
                        "payload.type is an array function incomplete"
                    );
                } else if (typeof payload[payload.type] === "object")
                    payload[payload.type][payload.key] = undefined;
            } else {
                payload.method = payload.type + ".delete";
            }
        }
    }
    return true;
}

export async function getData(form) {
    let dataKeys = new Map();
    let formObject = forms.get(form);
    if (!formObject) {
        let elements = form.querySelectorAll(selector);
        await init(elements);
        return await getData(form);
    }

    for (let type of formObject.types.values()) {
        for (let [element, data] of type.entries()) {
            if (
                !element.hasAttribute("key") ||
                element.getAttribute("save") === "false"
            )
                continue;

            if (element.hasAttribute("actions")) {
                let attribute = element.getAttribute("actions");
                if (attribute.includes("save") || attribute.includes("delete")) continue;
            }

            if (element.matches("[render-query]")) {
                let type = element.getAttribute("type");
                if (type !== "file") continue;
            }

            let value = await element.getValue();
            if (value === undefined) continue;

            let payload = { ...data };
            let dataKey = elements.get(element);

            let success = formatPayload(payload, value, element);
            if (!success) continue;

            //dataKey should be used to group
            let key = dataKey; //+ payload.method;
            if (dataKeys.has(key)) {
                let storedData = dataKeys.get(key)[payload.type];
                dataKeys.get(key)[payload.type] = {
                    ...storedData,
                    ...payload[payload.type]
                };
            } else {
                dataKeys.set(key, payload);
            }
        }
    }

    // TODO: group by methods so we can make one crud request per method
    let dataArray = Array.from(dataKeys.values());

    return dataArray;
}

export default { initDataKey, getDataKey, getDataElements, getDataKeys, getData, getDataObject }