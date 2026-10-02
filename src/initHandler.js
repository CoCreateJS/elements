import Observer from "@cocreate/observer";
import CRUD from "@cocreate/crud-client";
import filter from "@cocreate/filter";

import { getAttributes } from "@cocreate/utils";
import { initDataKey, getData, getDataObject } from "./getDataHandler.js";
import { read, save } from "./crudHandler.js";
import { setData } from "./setDataHandler.js";
import {
    elements,
    forms,
    keys,
    debounce,
    elementSubscriptions,
    subscriptions
} from "./mapRegistry.js";
import { unsubscribe } from "./subscribeHandler.js";

const selector = "[storage], [database], [array], [render-json]";

/**
 * Initializes elements with specific CRUD attributes. If no parameter is provided, it queries and initializes all elements
 * that have certain CRUD-related attributes. It can also initialize a single element or an array of elements.
 *
 * @param {(Element|Element[])} [element] - Optional. A single element or an array of elements to initialize.
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
        ) {
            continue;
        }

        promises.push(
            (async () => {
                const el = element[i];
                try {
                    const data = await initElement(el);
                    if (data) {
                        const dataKey = initDataKey(el, data);
                        // read() already batches elements by dataKey. Schedule each
                        // ready element without waiting for unrelated async fields.
                        await read(el, data, dataKey);
                    }
                } catch (error) {
                    // Allow initialization to be retried if filter setup failed.
                    if (elements.get(el) === "") elements.delete(el);
                    console.error("[CoCreateElements] Failed to initialize element:", el, error);
                }
            })()
        );
    }

    await Promise.all(promises);
}

/**
 * Prepares a single element for CRUD synchronization, attaching event listeners and filters.
 *
 * @param {Element} el 
 * @returns {Promise<Object|undefined>}
 */
export async function initElement(el) {
    let data = getDataObject(el);
    if (!data || !data.type) {
        return;
    }

    if (
        data.object &&
        data.object !== "pending" &&
        !/^[0-9a-fA-F]{24}$/.test(data.object)
    ) {
        return;
    }

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
        data.filter = await el.getFilter();

        el.setFilter = (filter) => {
            data.filter = filter;
            el.hasRead = false;
            read(el, data);
        };
    }

    return data;
}

/**
 * Removes elements from tracking maps and dispatches an unsubscription socket event
 * when no remaining elements watch a specific dataKey scope.
 * 
 * @param {Element|Element[]} element - Element(s) being unmounted or cleaned up
 */
export async function remove(element) {
    if (
        element &&
        !(element instanceof HTMLCollection) &&
        !Array.isArray(element)
    )
        element = [element];

    for (let i = 0; i < element.length; i++) {
        const el = element[i];
        delete el.hasRead;

        if (el.tagName === "FORM") {
            let form = forms.get(el);
            if (!form) return;

            form = form.elements;
            for (let formEl of form.keys()) {
                removeSubscription(formEl);
                let key = elements.get(formEl);
                if (key) {
                    let keyEntry = keys.get(key);
                    if (keyEntry) {
                        keyEntry.elements.delete(formEl);
                        if (!keyEntry.elements.size) keys.delete(key);
                    }
                    elements.delete(formEl);
                }
            }

            let key = elements.get(el);
            if (key) {
                let keyEntry = keys.get(key);
                if (keyEntry) {
                    keyEntry.elements.delete(el);
                    if (!keyEntry.elements.size) keys.delete(key);
                }
            }
            elements.delete(el);
            forms.delete(el);
        } else {
            removeSubscription(el);
            let key = elements.get(el);
            if (key) {
                if (el.getFilter) filter.filters.delete(el);

                let keyEntry = keys.get(key);
                if (keyEntry) {
                    keyEntry.elements.delete(el);
                    elements.delete(el);

                    if (!keyEntry.elements.size) keys.delete(key);
                } else {
                    elements.delete(el);
                }

                let form = el.closest("form");
                form = forms.get(form);
                if (form) {
                    form.elements.delete(el);
                    if (!form.elements.size) forms.delete(form);
                }
            } else {
                elements.delete(el);
            }
        }
    }
}

function removeSubscription(element) {
    const subscription = elementSubscriptions.get(element);
    if (!subscription) return;

    const subscriptionEntry = subscriptions.get(subscription);
    if (subscriptionEntry) {
        subscriptionEntry.elements.delete(element);
        if (!subscriptionEntry.elements.size) {
            unsubscribe(subscriptionEntry.subscription);
            subscriptions.delete(subscription);
        }
    }

    elementSubscriptions.delete(element);
}

/**
 * Initializes global CRUD socket response listeners.
 */
export function initSocket() {
    const type = ["storage", "database", "array", "index", "object"];
    const method = ["create", "update", "delete"];

    for (let i = 0; i < type.length; i++) {
        for (let j = 0; j < method.length; j++) {
            const action = type[i] + "." + method[j];

            CRUD.listen(action, function (data) {
                if (
                    data.key &&
                    !data.updateDB &&
                    data.status === "received" &&
                    !data.method.includes(".delete") &&
                    CRUD.socket.frameId === data.frameId
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
        if (mutation.move) return;
        init([mutation.target]);
    }
});

Observer.init({
    name: "CoCreateElementsRemovedNodes",
    types: ["removedNodes"],
    selector: selector,
    callback: function (mutation) {
        if (mutation.move) return;
        remove(mutation.target);
    }
});

Observer.init({
    name: "CoCreateElementsAttributes",
    types: ["attributes"],
    attributeFilter: [
        "organization_id",
        "host",
        "namespace",
        "room",
        "storage",
        "database",
        "array",
        "index",
        "object",
        "key"
    ],
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
    name: "CoCreateElementsReadAttribute",
    types: ["attributes"],
    attributeFilter: ["read"],
    selector,
    callback: async function (mutation) {
        const el = mutation.target;
        const currentValue = el.getAttribute("read");
        if (currentValue === mutation.oldValue) return;

        if (currentValue === "false") {
            el.hasRead = false;
            for (const [key, pending] of debounce) {
                pending.elements?.delete(el);
                if (pending.elements && !pending.elements.size) {
                    clearTimeout(pending.timer);
                    debounce.delete(key);
                }
            }
            return;
        }

        if (!elements.has(el)) {
            await init([el]);
        } else if (el.getFilter && el.setFilter) {
            el.setFilter(await el.getFilter());
        } else {
            el.hasRead = false;
            await read(el);
        }
    }
});

init();

export default { init, initElement, initSocket, remove };
