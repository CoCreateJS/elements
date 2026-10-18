import observer from "@cocreate/observer";
import { getRelativePath, ObjectId } from "@cocreate/utils";

const sourceTagNames = new Set([
    "IMG",
    "VIDEO",
    "AUDIO",
    "SCRIPT",
    "INPUT",
    "IFRAME",
    "FRAME",
    "LINK",
    "SOURCE"
]);
const selector = "[src], [source], [stream]";

const initializing = new WeakMap();

/**
 * Validates whether a given URL string points to the current origin.
 * Relative paths (e.g., "/partial.html") resolve to the same origin.
 * @param {string} urlStr - The URL to validate
 * @returns {boolean} True if safe/same-origin, false otherwise
 */
function isSameOrigin(urlStr) {
    try {
        let origin = window.location.origin;

        // Sandboxed srcdoc/about:blank documents have an opaque URL even when
        // same-origin access was explicitly granted. In that case, parent
        // access succeeds only when the browser considers the frame trusted.
        if (origin === "null" && window.parent !== window) {
            origin = window.parent.location.origin;
        }

        if (!origin || origin === "null") return false;

        const url = new URL(urlStr, origin);
        return url.origin === origin;
    } catch (err) {
        console.error("Invalid URL format:", urlStr, err);
        return false;
    }
}

function init(elements) {
    if (elements?.tagName && sourceTagNames.has(elements.tagName)) return;

    if (elements && !Array.isArray(elements)) elements = [elements];

    if (!elements) elements = document.querySelectorAll(selector);

    initElements(elements);
}

async function initElements(elements) {
    for (let element of elements) {
        if (sourceTagNames.has(element.tagName)) continue;

        let src =
            element.getAttribute("src") ||
            element.getAttribute("source") ||
            element.getAttribute("stream");

        if (!src || /{{\s*([\w\W]+)\s*}}/g.test(src)) continue;

        let initialize = initializing.get(element);

        if (element.hasAttribute("rendered")) {
            element.removeAttribute("rendered");
            initializing.set(element, { src });
            continue
        }
        if (initialize && initialize.src === src) continue;


        const request = { src };
        initializing.set(element, request);
        const isCurrentRequest = () =>
            initializing.get(element) === request &&
            (element.getAttribute("src") ||
                element.getAttribute("source") ||
                element.getAttribute("stream")) === src;
        try {
            // --- SECURITY FIX: Conditional Sensitive Headers ---
            // Only attach the local state header if fetching from the same origin.
            let headers = {};
            if (isSameOrigin(src)) {
                let state = sessionStorage.getItem("state");
                if (state) {
                    headers["X-State"] = state;
                }
            }

            let response = await fetch(src, { headers });
            if (!isCurrentRequest()) continue;

            if (response.status === 404 || response.status === 403) {
                element.setAttribute("error", response.status);
                continue;
            }

            if (response.ok && ["304", "403", "404"].includes(element.getAttribute("error"))) {
                element.removeAttribute("error");
            }

            if (element.tagName === "AUDIO" || element.tagName === "VIDEO") {
                // Media streams can safely load cross-origin without risk of DOM-based XSS
                initMediaSource(element, src);
            } else {
                // --- SECURITY FIX: Cross-Origin HTML Injection Prevention ---
                // Only allow rendering the fetched response directly into the HTML tree if same-origin.
                if (!isSameOrigin(src)) {
                    console.warn(`[CoCreateSrc] Blocked inserting fetched text into HTML from cross-origin: ${src}`);
                    element.setAttribute("error", "403-forbidden-cross-origin-html");
                    continue;
                }

                let text = await response.text();
                if (!isCurrentRequest()) continue;
                if (text) {
                    // let path = "";
                    // let pathElement = element.closest("[path]");
                    // if (pathElement) {
                    //     path =
                    //         pathElement.getAttribute("path") ||
                    //         getRelativePath();
                    // } else {
                    //     path = getRelativePath();
                    // }
                    // // Replace $relativePath in the fetched text
                    // if (path) {
                    //     text = text.replaceAll(/\$relativePath\/?/g, path);
                    // }
                    // Replace ObjectId() with a new ObjectId
                    text = text.replaceAll("ObjectId()", () => {
                        return ObjectId().toString();
                    });
                    element.setValue(text);
                }
            }
        } catch (err) {
            console.log("FetchSrc error:" + err);
        }
    }
}

async function initMediaSource(element, src) {
    try {
        let response = await fetch(src);
        let mediaConfig = await response.json();
        let sourceBuffer;

        const mediaSource = new MediaSource();
        element.src = URL.createObjectURL(mediaSource);
        mediaSource.addEventListener("sourceopen", async () => {
            sourceBuffer = mediaSource.addSourceBuffer(
                `${mediaConfig["content-type"]}; codecs="${mediaConfig.codecs}"`
            );

            sourceBuffer.addEventListener("updateend", () => {
                console.log(
                    "Update ended, buffered ranges:",
                    sourceBuffer.buffered
                );
                if (
                    !sourceBuffer.updating &&
                    mediaSource.readyState === "open"
                ) {
                    mediaSource.endOfStream();

                    element.addEventListener("ended", () => {
                        URL.revokeObjectURL(element.src);
                    });
                }
            });

            sourceBuffer.addEventListener("error", (e) => {
                console.error("SourceBuffer error event:", e);
                console.log("MediaSource readyState:", mediaSource.readyState);
                console.log("SourceBuffer updating:", sourceBuffer.updating);
                console.log(
                    "SourceBuffer buffered ranges:",
                    sourceBuffer.buffered
                );
            });

            getSegment(sourceBuffer, mediaConfig.segments[0]);
        });

        mediaSource.addEventListener("sourceended", () => {
            console.log("MediaSource ended event fired");
        });

        mediaSource.addEventListener("sourceclose", () => {
            console.log("MediaSource close event fired");
        });

        // Event listener for seeking
        element.addEventListener("seeking", () => {
            let currentTime = element.currentTime;
            let chunkIndex = Math.floor(currentTime / chunkDuration);
        });

        // Event listener for seeked
        element.addEventListener("seeked", () => {
            let currentTime = element.currentTime;
            if (isBuffered(element, currentTime)) return;

            let query = {
                start: { $lte: currentTime },
                end: { $gte: currentTime }
            };

            let segments = queryData(mediaConfig.segments, query);
            for (let segment of segments) {
                getSegment(sourceBuffer, segment);
            }
        });

        element.addEventListener("timeupdate", function () {
            const bufferEnd = element.buffered.end(0);
            const currentTime = element.currentTime;
            const threshold = 10;

            if (bufferEnd - currentTime < threshold) {
                getSegment(sourceBuffer, mediaConfig);
            }
        });
    } catch (error) {
        element.src = src;
    }
}

async function getSegment(sourceBuffer, segment) {
    let segments = [];
    let data;
    if (segment.array && segment.object) {
        data = { method: "object.read", ...segment };
        data = await crud.send(data);
        if (segment.key) {
            if (Array.isArray(data.object[0][key]))
                segments.push(...data.object[0][key]);
            else segments.push(data.object[0][key]);
        } else segments.push(...data.object);
        segment.src = segments[0];
        segment.src = await segment.src.text();
    } else if (segment.src) {
        // Media segments are safe to fetch cross-origin as they're not processed as HTML
        let response = await fetch(segment.src);
        if (response.status === 404 || response.status === 403) {
            console.warn(`Segment fetch failed with status: ${response.status}`);
            return;
        }
        segment.src = await response.text();
    }

    appendSegment(sourceBuffer, segment);
}

async function appendSegment(sourceBuffer, segment) {
    let arrayBuffer = segment.src;
    if (typeof segment.src === "string") {
        try {
            arrayBuffer = base64ToArrayBuffer(segment.src);
        } catch (e) {
            console.error("Base64 decode error:", e);
        }
    } else if (segment.src instanceof ArrayBuffer) {
        arrayBuffer = segment.src;
    } else if (segment.src instanceof Blob) {
        arrayBuffer = await segment.src.arrayBuffer();
    } else {
        arrayBuffer = base64ToArrayBuffer(segment.src);
    }

    if (sourceBuffer.updating)
        await new Promise((resolve) =>
            sourceBuffer.addEventListener("updateend", resolve, { once: true })
        );

    sourceBuffer.appendBuffer(arrayBuffer);
    console.log(sourceBuffer);
}

function isBuffered(element, currentTime) {
    for (let i = 0; i < element.buffered.length; i++) {
        if (
            currentTime >= element.buffered.start(i) &&
            currentTime <= element.buffered.end(i)
        ) {
            return true;
        }
    }
    return false;
}

function base64ToBlob(base64, contentType = "") {
    const binaryString = atob(base64.split(",")[1]);
    const len = binaryString.length;
    const uint8Array = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        uint8Array[i] = binaryString.charCodeAt(i);
    }
    return new Blob([uint8Array], { type: contentType });
}

function base64ToArrayBuffer(base64) {
    const binaryString = window.atob(base64.split(",")[1]);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

observer.init({
    name: "CoCreateSrc",
    types: ["addedNodes"],
    selector: "[src], [source], [stream]",
    callback: function (mutation) {
        if (mutation.move) return;
        init(mutation.target);
    }
});

observer.init({
    name: "CoCreateSrcOperator",
    types: ["addedNodes"],
    selector: "img",
    callback: function (mutation) {
        let src = mutation.target.getAttribute("src");
        if (src) {
            mutation.target.setAttribute("src", src);
        }
    }
});

observer.init({
    name: "CoCreateSrcAttributes",
    types: ["attributes"],
    attributeFilter: ["src"],
    selector: "[src], [source], [stream]",
    callback: function (mutation) {
        init(mutation.target);
    }
});

init();
