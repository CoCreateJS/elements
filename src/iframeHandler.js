import observer from "@cocreate/observer";

if (document.clickedElement === undefined) {
    document.clickedElement = null;
    document.addEventListener("click", (e) => {
        document.clickedElement = e.target;
    });
}

export function clickedElement(frames) {
    for (const frame of frames) {
        try {
            const frameDocument = frame.contentDocument;
            if (frameDocument.clickedElement === undefined) {
                frameDocument.addEventListener("click", (e) => {
                    frame.clickedElement = e.target;
                    frameDocument.clickedElement = e.target;
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

clickedElement(document.querySelectorAll("iframe"));

observer.init({
    name: "CoCreateIframes",
    types: ["addedNodes"],
    selector: "iframe",
    callback: (mutation) => clickedElement([mutation.target])
});
