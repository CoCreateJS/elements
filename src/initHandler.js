import Observer from "@cocreate/observer";
import CRUD from "@cocreate/crud-client";
import filter from "@cocreate/filter";

import { getAttributes } from "@cocreate/utils";
import { initDataKey, getData, getDataObject } from "./getDataHandler.js";
import { read, save } from "./crudHandler.js";
import { setData } from "./setDataHandler.js";
import { elements, forms, keys, debounce } from "./mapRegistry.js"

const selector = "[storage], [database], [array], [render-json]";

/**
 * Initializes elements with specific CRUD attributes. If no parameter is provided, it queries and initializes all elements
 * that have certain CRUD-related attributes. It can also initialize a single element or an array of elements.
 *
 * Attributes used for initialization are:
 * - storage: Specifies the storage mechanism.
 * - database: Indicates the database to interact with.
 * - array: Defines the array to be used.
 * - render-json: Determines how JSON data is rendered.
 *
 * @param {(Element|Element[])} [elements] - Optional. A single element or an array of elements to initialize.
 * If omitted, the function queries and initializes all elements containing
 * any of these CRUD attributes: "storage", "database", "array", "render-json".
 */
export async function init(element) {
    if (
        element &&
        !(element instanceof HTMLCollection) &&
        !(element instanceof NodeList) &&
        !Array.isArray(element)
    ) {
        element = [element];
    } else if (!element) {
        element = document.querySelectorAll(selector);
        initSocket();
    }

    let promises = [];
    for (let i = 0; i < element.length; i++) {
        if (
            elements.has(element[i]) ||
            element[i].tagName === "FORM" ||
            element[i].getAttribute("crud") === "false"
        )
            continue;

        promises.push(
            (async () => {
                let data = await initElement(element[i]);
                if (data) {
                    let dataKey = initDataKey(element[i], data);
                    return { string: dataKey.string, data };
                }
            })()
        );
    }

    let results = await Promise.all(promises);
    let dataObjects = new Map();

    for (let res of results) {
        if (res) dataObjects.set(res.string, res.data);
    }

    if (dataObjects && dataObjects.size > 0) {
        for (let key of dataObjects.keys()) {
            let { data, elements: mappedElements } = keys.get(key);
            read(Array.from(mappedElements.keys()), data, { string: key });
        }
    }
}

export async function initElement(el) {
    let data = getDataObject(el);
    if (!data || !data.type) return;

    if (
        data.object &&
        data.object !== "pending" &&
        !/^[0-9a-fA-F]{24}$/.test(data.object)
    )
        return;

    if (!elements.has(el)) {
        elements.set(el, "");

        if (!el.elementsInputEvent) {
            el.elementsInputEvent = true;

            if (
                ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
                (el.hasAttribute("contenteditable") &&
                    el.getAttribute("contenteditable") !== "false") ||
                el.contenteditable || el.value !== undefined || el.hasAttribute("value")
            ) {
                if (el.tagName == "IFRAME") {
                    // ToDo: saving on contenteditable elements when an objectId does not exist in order to crud or crdt
                    el = el.contentDocument.documentElement;
                    el.setAttribute("contenteditable", "true");
                }

                el.addEventListener("input", function (e) {
                    if (el.pendingObject) return;

                    const { object, key, isRealtime, isCrdt } =
                        getAttributes(el);
                    if (!isRealtime || isRealtime === "false" || key === "_id")
                        return;
                    if (isCrdt == "true" && object && object !== "pending")
                        return;
                    if (e.detail && e.detail.skip == true) return;
                    if (data.type !== "object" && data[data.type] === "pending")
                        return;
                    if (!el.value && !el.hasAttribute("value") && el.contenteditable && !el.hasAttribute("contenteditable")) return;
                    save(el);
                });
            }
        }
    }

    await filter.init(el);

    if (el.getFilter) {
        data.$filter = await el.getFilter();

        el.setFilter = (filter) => {
            data.$filter = filter;
            el.hasRead = false;
            read(el, data);
        };
    }

    return data;
}

export async function remove(element) {
    if (
        element &&
        !(element instanceof HTMLCollection) &&
        !Array.isArray(element)
    )
        element = [element];
    for (let i = 0; i < element.length; i++) {
        delete element[i].hasRead;
        if (element[i].tagName === "FORM") {
            let form = forms.get(element[i]);
            if (!form) return;

            form = form.elements;
            for (let el of form.keys()) {
                let key = elements.get(el);
                if (key) {
                    keys.get(key).elements.delete(el);
                    elements.delete(el);
                    // debounce.delete(key)
                }
            }
            let key = elements.get(element[i]);
            if (key) {
                keys.get(key).elements.delete(element[i]);
                if (!keys.get(key).elements.size) keys.delete(key);
            }
            elements.delete(element[i]);
            forms.delete(element[i]);
        } else {
            let key = elements.get(element[i]);
            if (key) {
                if (element[i].getFilter) filter.filters.delete(element[i]);
                keys.get(key).elements.delete(element[i]);
                elements.delete(element[i]);
                if (!keys.get(key).elements.size) keys.delete(key);

                // debounce.delete(key)
                let form = element[i].closest("form");
                form = forms.get(form);
                if (form) {
                    form.elements.delete(element[i]);
                    if (!form.elements.size) forms.delete(form);
                }
            } else elements.delete(element[i]);
        }
    }
}

export function initSocket() {
    const type = ["storage", "database", "array", "index", "object", "filter"];
    const method = ["create", "update", "delete"];

    for (let i = 0; i < type.length; i++) {
        for (let j = 0; j < method.length; j++) {
            const action = type[i] + "." + method[j];

            CRUD.listen(action, function (data) {
                if (
                    data.resolved &&
                    data.status === "received" &&
                    CRUD.socket.clientId === data.clientId
                )
                    return;
                if (data.rendered) return;

                data.rendered = true;

                setData(null, data);
            });
        }
    }
}

Observer.init({
    name: "CoCreateElementsChildList",
    types: ["addedNodes"],
    selector: selector,
    callback: function (mutation) {
        init([mutation.target]);
    }
});

Observer.init({
    name: "CoCreateElementsRemovedNodes",
    types: ["removedNodes"],
    selector: selector,
    callback: function (mutation) {
        if (mutation.target.hasAttribute("render-clone")) return;
        remove(mutation.target);
    }
});

Observer.init({
    name: "CoCreateElementsAttributes",
    types: ["attributes"],
    attributeFilter: [
        "organization_id",
        "host",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "key"
    ],
    // target: selector, // blocks mutations when applied
    callback: function (mutation) {
        let currentValue = mutation.target.getAttribute(mutation.attributeName);
        if (currentValue !== mutation.oldValue) {
            if (mutation.target.tagName === "FORM") return;
            remove(mutation.target);
            init([mutation.target]);
        }
    }
});

Observer.init({
    name: "CoCreateElementsChildList",
    types: ["addedNodes"],
    selector: selector,
    callback: function (mutation) {
        init([mutation.target]);
    }
});

Observer.init({
    name: "CoCreateElementsRemovedNodes",
    types: ["removedNodes"],
    selector: selector,
    callback: function (mutation) {
        if (mutation.target.hasAttribute("render-clone")) return;
        remove(mutation.target);
    }
});

Observer.init({
    name: "CoCreateElementsAttributes",
    types: ["attributes"],
    attributeFilter: [
        "organization_id",
        "host",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "key"
    ],
    // target: selector, // blocks mutations when applied
    callback: function (mutation) {
        let currentValue = mutation.target.getAttribute(mutation.attributeName);
        if (currentValue !== mutation.oldValue) {
            if (mutation.target.tagName === "FORM") return;
            remove(mutation.target);
            init([mutation.target]);
        }
    }
});

init();

export default { init, initElement, initSocket }