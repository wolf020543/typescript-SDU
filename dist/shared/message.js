// Throws an exception if the message is invalid or unsupported.
export function validateMessage(message) {
    if (message.jsonrpc !== "2.0") {
        throw new Error(`Message is not in a supported JSON-RPC version: ${message}`);
    }
}
//# sourceMappingURL=message.js.map