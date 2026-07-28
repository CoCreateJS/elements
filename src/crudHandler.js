import {
    queryElements,
    getAttributeNames,
    checkValue
} from "@cocreate/utils";
import Actions from "@cocreate/actions";
import CRUD from "@cocreate/crud-client";

import { elements, keys, debounce} from "./mapRegistry.js"

export async function read(element, data, dataKey) {
    if (!dataKey) dataKey = { string: elements.get(element) };
    if (!data) {
        let existingData = keys.get(dataKey.string);
        if (existingData && existingData.dataKey && existingData.dataKey.object)
            data = { ...existingData.dataKey.object };
    }

    if (!dataKey || !data.type) return;
    if (!data.$filter && (!data[data.type] || !data[data.type].length)) return;

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
            (!data.$filter || (data.$filter && data.$filter.isFilter !== false))
        ) {
            el.hasRead = true;
            delay.elements.set(el, true);
        } else {
            // console.log("read skipped", el);
        }
    }

    if (!delay.elements.size) return;

    clearTimeout(delay.timer);
    delay.timer = setTimeout(function () {
        // TODO: should server support string and string array for type object, methods create, read, delete
        if (!data.$filter && data.type === "object") {
            if (!data.object) return;
            else if (typeof data.object === "string")
                data.object = { _id: data.object };
            else if (Array.isArray(data.object)) {
                if (data.object.length)
                    data.object = { _id: data.object[0]._id };
            } else if (!data.object._id.match(/^[0-9a-fA-F]{24}$/)) return;
            // if (data.object._id.startsWith('$'))
            //     return
        }

        data.method = data.type + ".read";

        CRUD.send(data).then((responseData) => {
            debounce.delete(dataKey.string);
            let els = Array.from(delay.elements.keys());
            clearTimeout(delay.timer);
            delete delay.elements;
            delete delay.timer;

            setData(els, responseData);
        });
    }, 500);
}

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

        if (typeof data[data.type] === "string")
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
                data[data.type][key] = { $update: value }; // $update is string use the value as the key name

                // data[data.type][key] = { $update: {[value]: value} } // $update is an object use the key as the value to use for the new key
            }
        }

        data = [data];
    }

    let responseDataList = [];
    for (let i = 0; i < data.length; i++) {
        if (data[i].type === "object") {
            let hasId = false;

            // 1. Check your three scenarios just like before
            if (typeof data[i].object === "string") {
                hasId = !!data[i]._id; 
            } else if (Array.isArray(data[i].object)) {
                hasId = !!data[i].object[0]?._id;
            } else if (typeof data[i].object === "object" && data[i].object !== null) {
                hasId = !!data[i].object?._id;
            }

            // 2. Apply the method based on what we found
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
            window.CoCreate.crdt &&
            !"crdt"
        ) {
            return window.CoCreate.crdt.replaceText({
                array: data[i].array,
                key: data[i].key,
                object: data[i].object._id,
                value
            });
        }

        data[i] = await CRUD.send(data[i]);

        responseDataList.push(data[i]);

        if (
            data[i] &&
            (data[i].method.endsWith(".create") ||
                (data[i].type !== "object" &&
                    data[i].method.endsWith(".update")))
        ) {
            setTypeValue(element, data[i], action);
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
        callback: (action) => {
            if ((action.form, action)) save(action.form, action);
        }
    },
    {
        name: "delete",
        endEvent: "deleted",
        callback: async (action) => {
            // TODO: use selector to target elements for deletion if element is apart of render get render get rendering element for more crud detils
            // this way any selector can be used to target crud deletions not just .selected
            let elements = [];
            if (action.element.hasAttribute("delete-query")) {
                elements = queryElements({
                    element: action.element,
                    prefix: "delete"
                });
            } else {
                elements = [action.element];
            }

            for (let i = 0; i < elements.length; i++) {
                const data = getDataObject(elements[i]);
                if (!data) return;
                data.method = data.type + ".delete";

                if (elements[i].renderValue) {
                    let selected = elements[i].querySelectorAll(".selected");
                    data[data.type] = [];
                    for (let j = 0; j < selected.length; j++) {
                        let attribute = selected[j].getAttribute(data.type);
                        if (attribute) {
                            attribute = attribute.split(",");
                            for (let k = 0; k < attribute.length; k++) {
                                if (data.type === "object")
                                    data[data.type].push({ _id: attribute[k] });
                                else {
                                    data[data.type].push(attribute[k]);
                                }
                            }
                        }
                    }
                } else if (
                    data.type === "object" &&
                    typeof data[data.type] === "string"
                )
                    data[data.type] = { _id: data[data.type] };

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

export default { read, save }