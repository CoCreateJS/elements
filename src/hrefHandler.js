import Actions from "@cocreate/actions";
import { queryElements } from "@cocreate/utils";

const selector = "[href], [target]";

function init() {
    document.link ||= { islink: "true" };
    document.addEventListener("click", linkEvent, true);
}

// Delegation also handles links inserted after this feature loads.
function linkEvent(event) {
    const target = event.target.closest?.(selector);
    if (!target || target.hasAttribute("download") || target.closest("[actions]")) return;
    open(target, event);
}

function open(target, event) {
    if (!target) return;
    const doc = target.ownerDocument || document;
    if (doc.link?.islink === "false" || doc.link?.islink === false) return;
    if (!target.getAttribute("href")) return;
    event?.preventDefault();
    openLink(target);
}

function openLink(link) {
    const href = link.getAttribute("href");
    const target = link.getAttribute("target");

    if (!target || target === "_self") {
        const currentUrl = new URL(location.href);
        const targetUrl = new URL(href, location.href);
        const currentPath = currentUrl.pathname.replace("/index.html", "/");
        const targetPath = targetUrl.pathname.replace("/index.html", "/");
        if (currentPath !== targetPath || currentUrl.hash !== targetUrl.hash) {
            location.href = href;
        }
    } else if (target === "_window") {
        window.open(href, "_blank", "location=yes,height=570,width=520,scrollbars=yes,status=yes");
    } else {
        window.open(href, target);
    }
}

// Actions passes its chain element; resolve its associated link before opening it.
function href(element, context) {
    const link = element.closest("[href], [target], [state_to]") ||
        element.querySelector("[href], [target], [state_to]");
    if (!link || link.hasAttribute("download")) return;
    return open(link, context?.event);
}

function linkDocuments(element) {
    const targets = element.hasAttribute("link-query")
        ? queryElements({ element, prefix: "link" }) : [document];
    return new Set(targets.map(target => target.nodeType === 9 ? target :
        target.contentDocument || target.document || target.ownerDocument).filter(Boolean));
}

function disableHref(element) {
    for (const doc of linkDocuments(element)) {
        doc.link = { islink: "false" };
        doc.removeEventListener("click", linkEvent, true);
        doc.addEventListener("click", preventDefault, true);
    }
}

function enableHref(element) {
    for (const doc of linkDocuments(element)) {
        doc.link = { islink: "true" };
        doc.removeEventListener("click", preventDefault, true);
        doc.addEventListener("click", linkEvent, true);
    }
}

function preventDefault(event) {
    event.preventDefault();
}

Actions.init([
    {
        name: "disableHref",
        endEvent: "disableHref",
        callback: action => {
            disableHref(action.element);
            action.end();
        }
    },
    {
        name: "enableHref",
        endEvent: "enableHref",
        callback: action => {
            enableHref(action.element);
            action.end();
        }
    }
]);

Actions.href = href;
init();

export { open, disableHref, enableHref };
export default { open, disableHref, enableHref };
