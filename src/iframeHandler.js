import observer from "@cocreate/observer";
import { relayEvents } from "@cocreate/utils/iframe";

export function clickedElement(frames) {
    for (const frame of frames) {
        try {
            const frameDocument = frame.contentDocument;
            if (frameDocument.clickedElement === undefined) {
                frameDocument.addEventListener("click", (e) => {
                    frame.clickedElement = e.target;
                    frameDocument.clickedElement = e.target;
                    const ClickedElementEvent = frame.ownerDocument.defaultView.CustomEvent;
                    frame.dispatchEvent(new ClickedElementEvent("clickedElement", {
                        bubbles: true,
                        detail: {
                            cursor: { x: e.clientX, y: e.clientY },
                            document: frameDocument
                        }
                    }));
                });
                frameDocument.clickedElement = null;
            }
        } catch (iframeError) {
            console.log(
                `Cross-origin frame handling failed for: ${frame}`,
                iframeError
            );
        }
    }
}

export function hoveredElement(frames) {
    for (const frame of frames) {
        try {
            const frameDocument = frame.contentDocument;
            if (frameDocument.hoveredElement === undefined) {
                frameDocument.hoveredElement = null;
                frame.hoveredElement = null;

                const emitHoveredElement = (event) => {
                    const HoveredElementEvent = frame.ownerDocument.defaultView.CustomEvent;
                    frame.dispatchEvent(new HoveredElementEvent("hoveredElement", {
                        bubbles: true,
                        detail: {
                            cursor: { x: event.clientX, y: event.clientY },
                            document: frameDocument
                        }
                    }));
                };

                frameDocument.addEventListener("mouseover", (event) => {
                    frame.hoveredElement = event.target;
                    frameDocument.hoveredElement = event.target;
                    emitHoveredElement(event);
                });
                frameDocument.addEventListener("mouseout", (event) => {
                    const nextElement = event.relatedTarget;
                    frame.hoveredElement = nextElement;
                    frameDocument.hoveredElement = nextElement;
                    emitHoveredElement(event);
                });
                frameDocument.addEventListener("mousemove", (event) => {
                    frame.hoveredElement = event.target;
                    frameDocument.hoveredElement = event.target;
                    emitHoveredElement(event);
                });
            }
        } catch (iframeError) {
            console.log(
                `Cross-origin frame handling failed for: ${frame}`,
                iframeError
            );
        }
    }
}

clickedElement(document.querySelectorAll("iframe"));
hoveredElement(document.querySelectorAll("iframe"));
relayEvents(document.querySelectorAll("iframe"));

observer.init({
    name: "CoCreateIframes",
    types: ["addedNodes"],
    selector: "iframe",
    callback: (mutation) => {
        clickedElement([mutation.target]);
        hoveredElement([mutation.target]);
        relayEvents([mutation.target]);
    }
});
