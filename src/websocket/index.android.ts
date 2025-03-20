import {HttpRequestOptions} from "@nativescript/core";
import {buildJavaOptions} from "../http.android";
import {IWebsocketConnection, WebsocketCallbacks} from "./websocket.common";
export type {IWebsocketConnection, WebsocketCallbacks} from "./websocket.common";

export class WebsocketConnection implements IWebsocketConnection {
    constructor(private nativeConnection: okhttp3.WebSocket) {
    }

    queueSize(): number {
        return this.nativeConnection.queueSize();
    }

    send(text: string) {
        this.nativeConnection.send(text);
    }

    sendBinary(bytes: ArrayBuffer) {
        const typedArray = new Uint8Array(bytes as ArrayBuffer);
        const nativeBuffer = java.nio.ByteBuffer.wrap(Array.from(typedArray));
        const nativeByteString = okio.ByteString.of(nativeBuffer);
        this.nativeConnection.send(nativeByteString);
    }

    close(code: number, reason: string) {
        try {
            if ((code >= 1004 && code <= 1006) || (code >= 1015 && code <= 2999)) {
                console.warn(`Code ${code} is reserved and may not be used.`);
                // Fall back to an accepted code. Otherwise, the error will be caught by try/catch, but the connection won't be closed.
                // https://github.com/square/okhttp/blob/master/okhttp/src/commonJvmAndroid/kotlin/okhttp3/internal/ws/WebSocketProtocol.kt#L146
                // https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent/code
                code = 1001; 
            }
            return this.nativeConnection.close(code, reason);
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    cancel() {
        this.nativeConnection.cancel();
    }
}

export function newWebsocketConnection(options: HttpRequestOptions, callbacks: WebsocketCallbacks): Promise<IWebsocketConnection> {
    return new Promise<IWebsocketConnection>((resolve, reject) => {
        try {
            // initialize the options
            const javaOptions = buildJavaOptions(options);

            @NativeClass()
            class OurListener extends okhttp3.WebSocketListener {
                onClosed(ws: okhttp3.WebSocket, code: number, reason: string) {
                    callbacks.onClosed(code, reason);
                }
                onMessage(ws: okhttp3.WebSocket, data: string | okio.ByteString) {
                    if (typeof data === "string") {
                        callbacks.onMessage(data);
                    } else {
                        const arrayBuffer = new Uint8Array(data.toByteArray()).buffer;
                        callbacks.onBinaryMessage(arrayBuffer);
                    }
                }
                onFailure(ws: okhttp3.WebSocket, t: java.lang.Throwable, response: okhttp3.Response) {
                    callbacks.onFailure(t.getMessage());
                }
                onOpen(ws: okhttp3.WebSocket, response: okhttp3.Response) {
                    callbacks.onOpen();
                }
                onClosing(ws: okhttp3.WebSocket, code: number, reason: string) {
                    callbacks.onClosing(code, reason);
                }
            }

            const listener = new OurListener();

            const websocket = com.klippa.NativeScriptHTTP.Async.Http.GetWebSocketConnection(javaOptions, listener);
            const websocketConnection = new WebsocketConnection(websocket);
            resolve(websocketConnection);
        } catch (e) {
            reject(e);
        }
    });
}
