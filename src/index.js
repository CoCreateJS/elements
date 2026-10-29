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
 * For details, visit <https://cocreate.app/licenses/> or contact us at sales@cocreate.app.
 */
import {
    getAttributes
} from "@cocreate/utils";
import Observer from "@cocreate/observer";
import { init, initElement, initSocket } from "./initHandler.js";
import { initDataKey, getDataKey, getDataElements, getDataKeys, getData, getDataObject } from "./getDataHandler.js";
import { read, save } from "./crudHandler.js";
import { setDataType, setData } from "./setDataHandler.js";

import "@cocreate/element-prototype";
import "./srcHandler.js";
import {
    socketActionSelector,
    socketOnSelector,
    socketStatusSelector
} from "./socketSelectors.js";
import { formSelector } from "./formSelectors.js";
import { valueQuerySelector } from "./valueQuerySelector.js";

import { elements, forms, keys, debounce } from "./mapRegistry.js"

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

document.querySelectorAll(socketSelectors).forEach(loadSocketHandler);
if (document.querySelector(formSelector)) initializeFormHandler();
if (document.querySelector("iframe")) loadIframeHandler();
if (document.querySelector(valueQuerySelector)) loadValueQueryHandler();

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
