import Observer from "@cocreate/observer";
import { getAttributeNames, ObjectId, queryElements } from "@cocreate/utils";
import Action from "@cocreate/actions";
import elementPrototype from "@cocreate/element-prototype";

/**
 * Initializes form elements. If no parameter is provided, or null is passed, it queries and initializes all form elements.
 * It can also initialize a single form element or an array of form elements.
 *
 * @param {(Element|Element[]|null)} [elements] - Optional. A single form element, an array of form elements, or null.
 *     - If null or omitted, the function queries and initializes all form elements.
 *     - If a single form element is provided, it initializes that element.
 *     - If an array of form elements is provided, each element in the array is initialized.
 */
function init(elements) {
    if (!elements) elements = document.querySelectorAll("form, fieldset");
    else if (!Array.isArray(elements)) elements = [elements];

    for (let element of elements) {
        runObjectId(element);
        setAttribute(element);
        if (element.tagName === "FIELDSET") continue;
        disableAutoFill(element);
        setValue(element);
        element.addEventListener("keydown", handleEnter);

        element.addEventListener("submit", function (event) {
            if (!element.hasAttribute("action")) {
                event.preventDefault();
            }
        });

        // Handle form reset event
        element.addEventListener("reset", function (event) {
            event.preventDefault(); // Prevent default reset
            reset({ form: event.target }); // Call custom reset logic
        });
    }
}

// Enter shortcuts are explicit and do not replace native widget keyboard behavior.
function handleEnter(event) {
    if (event.key !== "Enter" || event.defaultPrevented || event.isComposing ||
        event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

    const input = event.target;
    const form = event.currentTarget;
    if (input.tagName !== "INPUT" || input.form !== form ||
        !["text", "search", "email", "url", "tel", "password", "number"].includes(input.type) ||
        input.isContentEditable || input.closest(
            '[role="combobox"], [role="listbox"], [role="tree"], [role="grid"], ' +
            '[role="tablist"], [role="menu"], [aria-activedescendant], [aria-multiline="true"], input[list]'
        )) return;

    const source = input.closest("[submit-query]");
    if (!source || (source !== form && !form.contains(source))) return;

    // An opted-in shortcut must not fall through to implicit submission, even
    // when its target is disabled, missing, or the key is being held down.
    event.preventDefault();
    if (event.repeat) return;
    const selector = source.getAttribute("submit-query");
    if (!selector?.trim()) return;
    const targets = queryElements({ element: source, selector });
    if (targets.length !== 1) return;
    const target = targets[0];
    if (!target.hasAttribute("actions") || typeof target.click !== "function" ||
        (target.form || target.closest("form")) !== form ||
        target.matches(":disabled, [disabled], [aria-disabled='true']") ||
        target.closest("[hidden], [inert], [aria-hidden='true']") ||
        !target.getClientRects().length || getComputedStyle(target).visibility !== "visible") return;

    target.click();
}

/**
 * @param form
 */
// TODO: runObjectId could potentially be removed and handled by element-prototype getAttribute $object_id
// Somthing to consider is that $object_id is not replaced by an _id causing getAttribute to return a new _id on each get
function runObjectId(form) {
    let elements = Array.from(form.querySelectorAll("[object='ObjectId()']"));

    if (form.getAttribute("object") === "ObjectId()") {
        elements.push(form);
    }
    for (let i = 0; i < elements.length; i++) {
        let array = elements[i].getAttribute("array");
        if (!array) continue;
        elements[i].setAttribute("object", ObjectId().toString());
    }
}

const formAttributes = [
    "organization_id",
    "host",
    "storage",
    "database",
    "array",
    "index",
    "object",
    "key"
];
const formAttributesSelector = formAttributes.map((attr) => `[${attr}]`).join(", ");

function setAttribute(scope, elements, attributes) {
    const updateAttributes = attributes || formAttributes;
    if (!elements) {
        const selector = attributes
            ? attributes.map((attribute) => `[${attribute}]`).join(", ")
            : formAttributesSelector;
        if (!selector) return;
        elements = scope.querySelectorAll(selector);
    }
    for (let el of elements) {
        // Fieldsets define scopes; copying onto them would erase their overrides.
        if (el.tagName === "FIELDSET" || el.getAttribute("form-attributes") === "false") continue;

        for (let name of updateAttributes) {
            let value = null;

            let parent = el.parentElement;
            while (parent) {
                if ((parent.tagName === "FORM" ||
                    (parent.tagName === "FIELDSET" && name !== "key")) &&
                    parent.hasAttribute(name)) {
                    value = parent.getAttribute(name);
                    break;
                }
                if (attributes && parent === scope) break;
                parent = parent.parentElement;
            }

            if (value !== null) {
                if (el.getAttribute(name) !== value) el.setAttribute(name, value);
            } else if (attributes && parent === scope) {
                el.removeAttribute(name);
            }
        }
    }
}

/**
 * @param element
 */
function disableAutoFill(element) {
    // Clear the text area and set the autocomplete attribute to off.
    if (element.tagName == "TEXTAREA") {
        element.value = "";
        element.setAttribute("autocomplete", "off");
    }
    // Set the autocomplete attribute to off.
    if (!element.hasAttribute("autocomplete")) {
        element.setAttribute("autocomplete", "off");
    }
}

/**
 * @param form
 */
function reset(action) {
    let form = action.form;

    // Convert the form elements collection to an array
    const formElementsArray = Array.from(form.elements);

    // Query for additional elements with [object] or [key] attributes that are not already part of form controls
    const customElements = Array.from(
        form.querySelectorAll(
            "[object], [key]:not(input):not(select):not(textarea):not(button)"
        )
    );

    // Merge form elements and custom elements using the spread operator
    const allElements = [...formElementsArray, ...customElements];

    // Store the elements and their values in a map for restoration
    const elementStates = new Map();

    // Iterate over all elements and store their current state based on the 'reset' attribute
    for (const element of allElements) {
        if (["BUTTON", "FIELDSET"].includes(element.tagName)) continue;
        // Get the reset attribute value, if any
        const resetType = element.getAttribute("reset");
        if (
            element.hasAttribute("object") &&
            (!resetType || resetType === "object")
        )
            element.setAttribute("object", "");
        if (resetType === "false" || resetType === "object")
            elementStates.set(
                element,
                element.getValue() ||
                element.value ||
                element.getAttribute("value")
            );
        if (!resetType || resetType === "value") {
            if (element.contentEditable === "true") {
                element.innerHTML = "";
            } else {
                element.setValue("");
            }
        }
    }

    if (form.hasAttribute("object")) form.setAttribute("object", "");

    // Perform the default form reset
    form.reset();

    // Restore values based on the 'reset' attribute
    elementStates.forEach((value, element) => {
        element.setValue(value);
    });

    // Dispatch a custom reset event
    if (action.element) {
        action.element.dispatchEvent(
            new CustomEvent("reset", {
                detail: {}
            })
        );
    }
}

function setValue(form) {
    form.setValue = (value) => {
        if (typeof value !== "object") elementPrototype.setValue(form, value);
        else {
            const inputs = form.querySelectorAll("[name], [key]");
            inputs.forEach((element) => {
                const key =
                    element.getAttribute("key") || element.getAttribute("name");
                if (value[key]) {
                    element.setValue(value[key]);
                }
            });
        }
    };
}

Observer.init({
    name: "CoCreateForm",
    types: ["addedNodes"],
    selector: "form, fieldset",
    callback: (mutation) => init(mutation.target)
});

Observer.init({
    name: "CoCreateForm",
    types: ["attributes"],
    attributeFilter: getAttributeNames([
        "organization_id",
        "host",
        "storage",
        "database",
        "array",
        "object",
        "index"
    ]),
    selector: "form, fieldset",
    callback: (mutation) => setAttribute(mutation.target, null, [mutation.attributeName])
});

Observer.init({
    name: "CoCreateFormElements",
    types: ["addedNodes"],
    selector: formAttributesSelector,
    callback: function (mutation) {
        let form = mutation.target.closest("form, fieldset");
        if (form) setAttribute(form, [mutation.target]);
    }
});

Action.init({
    name: "reset",
    endEvent: "reset",
    callback: (action) => {
        if (action.form) reset(action);
    }
});

init();

export { reset };
