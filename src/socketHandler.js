import "@cocreate/element-prototype";
import Actions from "@cocreate/actions";
import Observer from "@cocreate/observer";
import { SocketClient as Socket } from "@cocreate/socket";
import { dotNotationToObject, getValueFromObject, queryData, uuid } from "@cocreate/utils";
import { socketOnSelector, socketStatusSelector } from "./socketSelectors.js";

const socketOnElements = new WeakMap();
const socketOnListeners = new Map();
const socketStatusElements = new Set();
let socketStatusListenersInitialized = false;

function getSocketScope(element, form) {
    const scopedElement = element?.closest("[socket]");
    if (scopedElement && scopedElement !== element) return scopedElement;
    return form || scopedElement || element;
}

function getSocketFields(scope, element) {
    if (!scope) return element ? [element] : [];

    const fields = [];
    if (scope.matches?.("[socket-key], [send]")) fields.push(scope);
    fields.push(...scope.querySelectorAll?.("[socket-key], [send]") || []);

    return fields.filter((field) => {
        if (field.closest("[template]")) return false;
        const key = field.getAttribute("socket-key") || field.getAttribute("send");
        if (!key) return false;

        // Keep nested socket scopes independent, just like API endpoint groups.
        const fieldScope = field.closest("[socket]");
        return !fieldScope || fieldScope === scope;
    });
}

async function getData({ element, form, scope }) {
    const fields = getSocketFields(scope, element);
    const flatData = {};

    for (const field of fields) {
        const key = field.getAttribute("socket-key") || field.getAttribute("send");
        if (!key || typeof field.getValue !== "function") continue;
        flatData[key] = await field.getValue();
    }

    return dotNotationToObject(flatData);
}

function dispatchSocketError(element, form, error) {
    element?.dispatchEvent?.(
        new CustomEvent("socketerror", {
            bubbles: true,
            detail: { error, element, form }
        })
    );
}

function getResponseError(response) {
    if (!response?.error && response?.success !== false && response?.ai?.status !== "error") return null;
    return new Error(
        response.ai?.message || response.error || "Socket request failed."
    );
}

async function send({ element, form, continue: next, abort }) {
    const scope = getSocketScope(element, form);
    const method = scope?.getAttribute?.("socket") || element?.getAttribute?.("socket");
    const checkbox = element?.matches?.('input[type="checkbox"]') ? element : null;
    const previousChecked = checkbox ? !checkbox.checked : null;
    const wasDisabled = checkbox?.disabled;
    if (checkbox) checkbox.disabled = true;

    try {
        const data = await getData({ element, form, scope });
        const request = { ...data };
        if (method) request.method = method;
        if (!request.uuid) request.uuid = uuid();
        const isAIChat = request.method === "ai.chat";
        if (isAIChat) {
            console.info("CoCreate AI socket request", {
                uuid: request.uuid,
                conversation_id: request.ai?.conversation_id,
                user_message_id: request.ai?.user_message_id
            });
        }

        const response = await Socket.send(request);
        if (response?.uuid !== request.uuid) {
            throw new Error("Socket response UUID did not match the request.");
        }

        if (isAIChat) {
            console.info("CoCreate AI socket response", {
                uuid: request.uuid,
                response_uuid: response.uuid,
                status: response.ai?.status || response.status,
                user_message_id: response.ai?.user_message_id
            });
        }
        const responseError = getResponseError(response);
        if (responseError) {
            if (checkbox) checkbox.checked = previousChecked;
            dispatchSocketError(element, form, responseError);
            abort?.();
            return;
        }
        next?.();
    } catch (error) {
        if (checkbox) checkbox.checked = previousChecked;
        dispatchSocketError(element, form, error);
        abort?.();
    } finally {
        if (checkbox) checkbox.disabled = wasDisabled;
    }
}

function parseSocketMatches(element) {
    const value = element.getAttribute("socket-on-matches");
    if (!value) return {};

    try {
        const matches = JSON.parse(value);
        if (!matches || typeof matches !== "object" || Array.isArray(matches)) {
            return null;
        }
        return matches;
    } catch (error) {
        console.warn("CoCreate: socket-on-matches must be a JSON object.", error);
        return null;
    }
}

function normalizeSocketMatches(query, prefix = "") {
    const normalized = {};
    const logicalOperators = new Set(["$and", "$or", "$nor"]);

    for (const [key, value] of Object.entries(query)) {
        if (!prefix && logicalOperators.has(key)) {
            normalized[key] = Array.isArray(value)
                ? value.map((entry) => normalizeSocketMatches(entry))
                : value;
            continue;
        }

        const path = prefix ? `${prefix}.${key}` : key;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const properties = Object.keys(value);
            if (properties.some((property) => property.startsWith("$"))) {
                normalized[path] = value;
            } else {
                Object.assign(normalized, normalizeSocketMatches(value, path));
            }
        } else {
            normalized[path] = value;
        }
    }

    return normalized;
}

function matchesSocketMessage(element, data) {
    const matches = parseSocketMatches(element);
    if (!matches) return false;
    try {
        return queryData(data, normalizeSocketMatches(matches));
    } catch (error) {
        console.warn("CoCreate: unable to evaluate socket-on-matches query.", error);
        return false;
    }
}

async function setSocketOnValue(element, data) {
    if (!element.isConnected || !matchesSocketMessage(element, data)) return;
    const key = element.getAttribute("socket-on-key");
    if (!key || typeof element.setValue !== "function") return;

    const value = getValueFromObject(data, key);
    if (value === undefined) return;
    if (typeof element.renderValue === "function") {
        await element.renderValue({ object: value });
        return;
    }
    await element.setValue(value);
}

function setSocketStatus(element, status) {
    if (!element.isConnected) return;
    const label = element.getAttribute(`socket-status-${status}`);
    if (label) element.textContent = label;
    element.classList.toggle("connected", status === "connected");
    element.classList.toggle("disconnected", status === "disconnected");
    element.classList.remove("error");
}

function registerSocketStatus(element) {
    if (!element?.matches?.(socketStatusSelector)) return;
    socketStatusElements.add(element);
    if (!socketStatusListenersInitialized) {
        Socket.listen("connect", () => {
            for (const target of socketStatusElements) {
                setSocketStatus(target, "connected");
            }
        });
        Socket.listen("disconnect", () => {
            for (const target of socketStatusElements) {
                setSocketStatus(target, "disconnected");
            }
        });
        socketStatusListenersInitialized = true;
    }
    if (Socket.connected) setSocketStatus(element, "connected");
}

function initializeSocketStatus(root = document) {
    if (root.matches?.(socketStatusSelector)) registerSocketStatus(root);
    root.querySelectorAll?.(socketStatusSelector).forEach(registerSocketStatus);
}

function removeSocketStatus(root) {
    if (root.matches?.(socketStatusSelector)) socketStatusElements.delete(root);
    root.querySelectorAll?.(socketStatusSelector).forEach(element => {
        socketStatusElements.delete(element);
    });
}

function registerSocketOn(element) {
    if (!element?.matches?.(socketOnSelector)) return;

    const previousMethod = socketOnElements.get(element);
    const method = element.getAttribute("socket-on")?.trim();
    if (previousMethod && previousMethod !== method) {
        socketOnListeners.get(previousMethod)?.elements.delete(element);
        socketOnElements.delete(element);
    }
    if (!method || socketOnElements.has(element)) return;

    let listener = socketOnListeners.get(method);
    if (!listener) {
        listener = { elements: new Set() };
        listener.callback = (data) => {
            for (const target of listener.elements) {
                if (target.getAttribute("socket-on") !== method) continue;
                setSocketOnValue(target, data).catch((error) => {
                    console.error("CoCreate: unable to set socket listener value.", error);
                });
            }
        };
        socketOnListeners.set(method, listener);
        Socket.listen(method, listener.callback);
    }

    listener.elements.add(element);
    socketOnElements.set(element, method);
}

function initializeSocketOn(root = document) {
    if (root.matches?.(socketOnSelector)) registerSocketOn(root);
    root.querySelectorAll?.(socketOnSelector).forEach(registerSocketOn);
}

function removeSocketOn(root) {
    const elements = [];
    if (root.matches?.(socketOnSelector)) elements.push(root);
    elements.push(...root.querySelectorAll?.(socketOnSelector) || []);
    for (const element of elements) {
        const method = socketOnElements.get(element);
        if (method) socketOnListeners.get(method)?.elements.delete(element);
        socketOnElements.delete(element);
    }
}

Actions.init({ name: "send", callback: send });

initializeSocketOn();
initializeSocketStatus();

Observer.init({
    name: "CoCreateElementsSocketOnAdded",
    types: ["addedNodes"],
    selector: socketOnSelector,
    callback: (mutation) => initializeSocketOn(mutation.target)
});

Observer.init({
    name: "CoCreateElementsSocketOnRemoved",
    types: ["removedNodes"],
    selector: socketOnSelector,
    callback: (mutation) => removeSocketOn(mutation.target)
});

Observer.init({
    name: "CoCreateElementsSocketOnAttribute",
    types: ["attributes"],
    attributeFilter: ["socket-on"],
    selector: socketOnSelector,
    callback: (mutation) => registerSocketOn(mutation.target)
});

Observer.init({
    name: "CoCreateElementsSocketStatusAdded",
    types: ["addedNodes"],
    selector: socketStatusSelector,
    callback: (mutation) => initializeSocketStatus(mutation.target)
});

Observer.init({
    name: "CoCreateElementsSocketStatusRemoved",
    types: ["removedNodes"],
    selector: socketStatusSelector,
    callback: (mutation) => removeSocketStatus(mutation.target)
});

export { getData as getSocketData, send as sendSocketMessage };
export {
    initializeSocketOn,
    registerSocketOn,
    removeSocketOn,
    setSocketOnValue
};
export default {
    getData,
    initializeSocketOn,
    registerSocketOn,
    removeSocketOn,
    send,
    setSocketOnValue
};
