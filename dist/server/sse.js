import { randomUUID } from "node:crypto";
import { validateMessage } from "../shared/message.js";
import getRawBody from "raw-body";
import contentType from "content-type";
const MAXIMUM_MESSAGE_SIZE = "4mb";
/**
 * Server transport for SSE: this will send messages over an SSE connection and receive messages from HTTP POST requests.
 *
 * This transport is only available in Node.js environments.
 */
export class SSEServerTransport {
    /**
     * Creates a new SSE server transport, which will direct the client to POST messages to the relative or absolute URL identified by `_endpoint`.
     */
    constructor(_endpoint) {
        this._endpoint = _endpoint;
        this._sessionId = randomUUID();
    }
    /**
     * Handles the initial SSE connection request.
     *
     * This should be called when a GET request is made to establish the SSE stream.
     */
    async connectSSE(req, res) {
        if (this._sseResponse) {
            throw new Error("Already connected!");
        }
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        // Send the endpoint event
        res.write(`event: endpoint\ndata: ${encodeURI(this._endpoint)}?sessionId=${this._sessionId}\n\n`);
        this._sseResponse = res;
        res.on("close", () => {
            var _a;
            this._sseResponse = undefined;
            (_a = this.onclose) === null || _a === void 0 ? void 0 : _a.call(this);
        });
    }
    /**
     * Handles incoming POST messages.
     *
     * This should be called when a POST request is made to send a message to the server.
     */
    async handlePostMessage(req, res) {
        var _a, _b, _c, _d, _e;
        if (!this._sseResponse) {
            const message = "SSE connection not established";
            res.writeHead(500).end(message);
            throw new Error(message);
        }
        let body;
        try {
            const ct = contentType.parse((_a = req.headers["content-type"]) !== null && _a !== void 0 ? _a : "");
            if (ct.type !== "application/json") {
                throw new Error(`Unsupported content-type: ${ct}`);
            }
            body = await getRawBody(req, {
                limit: MAXIMUM_MESSAGE_SIZE,
                encoding: (_b = ct.parameters.charset) !== null && _b !== void 0 ? _b : "utf-8",
            });
        }
        catch (error) {
            res.writeHead(400).end(String(error));
            (_c = this.onerror) === null || _c === void 0 ? void 0 : _c.call(this, error);
            return;
        }
        let message;
        try {
            message = JSON.parse(body);
            validateMessage(message);
        }
        catch (error) {
            (_d = this.onerror) === null || _d === void 0 ? void 0 : _d.call(this, error);
            res.writeHead(400).end(`Invalid message: ${body}`);
            return;
        }
        (_e = this.onmessage) === null || _e === void 0 ? void 0 : _e.call(this, message);
        res.writeHead(202).end("Accepted");
    }
    async close() {
        var _a, _b;
        (_a = this._sseResponse) === null || _a === void 0 ? void 0 : _a.end();
        this._sseResponse = undefined;
        (_b = this.onclose) === null || _b === void 0 ? void 0 : _b.call(this);
    }
    async send(message) {
        if (!this._sseResponse) {
            throw new Error("Not connected");
        }
        this._sseResponse.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
    }
    /**
     * Returns the session ID for this transport.
     *
     * This can be used to route incoming POST requests.
     */
    get sessionId() {
        return this._sessionId;
    }
}
//# sourceMappingURL=sse.js.map