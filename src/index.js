/********************************************************************************
 * Copyright (C) 2023 CoCreate and Contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 ********************************************************************************/

/**
 * Commercial Licensing Information:
 * For commercial use of this software without the copyleft provisions of the AGPLv3,
 * you must obtain a commercial license from CoCreate LLC.
 * For details, visit <https://CoCreateJS.com/licenses/> or contact us at sales@CoCreateJS.com.
 */
import {
    getAttributes
} from "@cocreate/utils";
import Observer from "@cocreate/observer";
import { getDataObject } from "./dataObject.js";
import {
    socketActionSelector,
    socketOnSelector,
    socketStatusSelector
} from "./socketSelectors.js";
import { formSelector } from "./formSelectors.js";
import { valueQuerySelector } from "./valueQuerySelector.js";

import { elements, forms, keys, debounce } from "./mapRegistry.js"

let hrefHandlerLoading;
let dataHandlerLoading;
let srcHandlerLoading;
let socketHandlerLoading;
let formHandlerLoading;
let iframeHandlerLoading;
let valueQueryHandlerLoading;
const socketSelectors = [socketOnSelector, socketStatusSelector, socketActionSelector].join(", ");

if (document.clickedElement === undefined) {
    document.clickedElement = null;
    document.addEventListener("click", event => {
        document.clickedElement = event.target;
    });
}

const hrefSelector = "[href], [target]";
const dataSelector = "[storage], [database], [array], [render-json]";
const srcSelector = "img, [src], [source], [stream]";

function loadHrefHandler() {
    if (!hrefHandlerLoading) {
        hrefHandlerLoading = import(/* webpackChunkName: "elements-href-handler" */ "./hrefHandler.js")
            .catch(error => {
                hrefHandlerLoading = undefined;
                throw error;
            });
    }
    hrefHandlerLoading.catch(error => console.error("CoCreate: unable to load href handler.", error));
}

function loadDataHandler() {
    if (!dataHandlerLoading) {
        dataHandlerLoading = import(/* webpackChunkName: "elements-data-handler" */ "./dataHandler.js")
            .catch(error => {
                dataHandlerLoading = undefined;
                throw error;
            });
    }
    return dataHandlerLoading;
}

function initializeDataHandler() {
    loadDataHandler().catch(error => console.error("CoCreate: unable to load data handler.", error));
}

function loadSrcHandler() {
    if (!srcHandlerLoading) {
        srcHandlerLoading = import(/* webpackChunkName: "elements-src-handler" */ "./srcHandler.js")
            .catch(error => {
                srcHandlerLoading = undefined;
                throw error;
            });
    }
    srcHandlerLoading.catch(error => console.error("CoCreate: unable to load source handler.", error));
}

function loadIframeHandler() {
    if (!iframeHandlerLoading) {
        iframeHandlerLoading = import(/* webpackChunkName: "elements-iframe-handler" */ "./iframeHandler.js")
            .catch(error => {
                iframeHandlerLoading = undefined;
                throw error;
            });
    }
    iframeHandlerLoading.catch(error => console.error("CoCreate: unable to load iframe handler.", error));
}

function loadValueQueryHandler() {
    if (!valueQueryHandlerLoading) {
        valueQueryHandlerLoading = import(/* webpackChunkName: "elements-value-query" */ "./valueQuery.js")
            .catch(error => {
                valueQueryHandlerLoading = undefined;
                throw error;
            });
    }
    valueQueryHandlerLoading.catch(error => console.error("CoCreate: unable to load value query handler.", error));
}

function loadFormHandler() {
    if (!formHandlerLoading) {
        formHandlerLoading = import(/* webpackChunkName: "elements-form-handler" */ "./formHandler.js")
            .catch(error => {
                formHandlerLoading = undefined;
                throw error;
            });
    }
    return formHandlerLoading;
}

function initializeFormHandler() {
    loadFormHandler().catch(error => console.error("CoCreate: unable to load form handler.", error));
}

function usesSocket(element) {
    if (element.matches(socketOnSelector) || element.matches(socketStatusSelector)) return true;
    return (element.getAttribute("actions") || "").split(",").some(action =>
        action.trim().split("(", 1)[0].trim() === "send"
    );
}

function loadSocketHandler(element) {
    if (!usesSocket(element)) return;
    if (!socketHandlerLoading) {
        socketHandlerLoading = import(/* webpackChunkName: "elements-socket-handler" */ "./socketHandler.js")
            .catch(error => {
                socketHandlerLoading = undefined;
                throw error;
            });
    }
    socketHandlerLoading.catch(error => {
        element.dispatchEvent(new CustomEvent("socketerror", {
            bubbles: true, detail: { error, element }
        }));
    });
}

Observer.init([
    {
        name: "CoCreateElementsHrefLoaderAddedNodes",
        types: ["addedNodes"],
        selector: hrefSelector,
        callback: loadHrefHandler
    },
    {
        name: "CoCreateElementsHrefLoaderAttributes",
        types: ["attributes"],
        attributeFilter: ["href", "target"],
        selector: hrefSelector,
        callback: loadHrefHandler
    },
    {
        name: "CoCreateElementsDataLoaderAddedNodes",
        types: ["addedNodes"],
        selector: dataSelector,
        callback: initializeDataHandler
    },
    {
        name: "CoCreateElementsDataLoaderAttributes",
        types: ["attributes"],
        attributeFilter: ["storage", "database", "array", "render-json"],
        selector: dataSelector,
        callback: initializeDataHandler
    },
    {
        name: "CoCreateElementsSrcLoaderAddedNodes",
        types: ["addedNodes"],
        selector: srcSelector,
        callback: loadSrcHandler
    },
    {
        name: "CoCreateElementsSrcLoaderAttributes",
        types: ["attributes"],
        attributeFilter: ["src", "source", "stream"],
        selector: srcSelector,
        callback: loadSrcHandler
    },
    {
        name: "CoCreateElementsActionLoaderAddedNodes",
        types: ["addedNodes"],
        selector: "[actions]",
        callback: mutation => loadActionHandler(mutation.target)
    },
    {
        name: "CoCreateElementsActionLoaderAttributes",
        types: ["attributes"],
        attributeFilter: ["actions"],
        selector: "[actions]",
        callback: mutation => loadActionHandler(mutation.target)
    },
    {
        name: "CoCreateElementsFormLoader",
        types: ["addedNodes"],
        selector: formSelector,
        callback: initializeFormHandler
    },
    {
        name: "CoCreateElementsSocketLoaderAddedNodes",
        types: ["addedNodes"],
        selector: socketSelectors,
        callback: mutation => loadSocketHandler(mutation.target)
    },
    {
        name: "CoCreateElementsSocketLoaderAttributes",
        types: ["attributes"],
        attributeFilter: ["socket-on", "socket-status", "actions"],
        selector: socketSelectors,
        callback: mutation => loadSocketHandler(mutation.target)
    },
    {
        name: "CoCreateElementsIframeLoader",
        types: ["addedNodes"],
        selector: "iframe",
        callback: loadIframeHandler
    },
    {
        name: "CoCreateElementsValueQueryLoaderAddedNodes",
        types: ["addedNodes"],
        selector: valueQuerySelector,
        callback: loadValueQueryHandler
    },
    {
        name: "CoCreateElementsValueQueryLoaderAttributes",
        types: ["attributes"],
        attributeFilter: ["value-query"],
        selector: valueQuerySelector,
        callback: loadValueQueryHandler
    }
]);

function loadActionHandler(element) {
    const actions = (element.getAttribute("actions") || "").split(",");
    for (const action of actions) {
        const name = action.trim().split("(", 1)[0].trim();
        if (name === "save" || name === "delete") initializeDataHandler();
        if (name === "reset") initializeFormHandler();
        if (name === "disableHref" || name === "enableHref") loadHrefHandler();
    }
}

document.querySelectorAll("[actions]").forEach(loadActionHandler);
if (document.querySelector(hrefSelector)) loadHrefHandler();
if (document.querySelector(dataSelector)) initializeDataHandler();
if (document.querySelector(srcSelector)) loadSrcHandler();
document.querySelectorAll(socketSelectors).forEach(loadSocketHandler);
if (document.querySelector(formSelector)) initializeFormHandler();
if (document.querySelector("iframe")) loadIframeHandler();
if (document.querySelector(valueQuerySelector)) loadValueQueryHandler();

// Preserve the asynchronous public APIs while loading their implementation on demand.
const callDataHandler = (name, args) => loadDataHandler().then(module => module[name](...args));
const init = (...args) => callDataHandler("init", args);
const read = (...args) => callDataHandler("read", args);
const save = (...args) => callDataHandler("save", args);
const getData = (...args) => callDataHandler("getData", args);
const setDataType = (...args) => callDataHandler("setDataType", args);

export function reset(action) {
    return loadFormHandler().then(module => module.reset(action));
}

export default {
    init,
    read,
    save,
    getData,
    getDataObject,
    reset,
    elements,
    keys,
    forms,
    debounce,
    getAttributes,
    setDataType
};
