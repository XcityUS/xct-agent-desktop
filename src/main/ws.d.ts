declare module "ws" {
  type Data = string | Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket {
    static readonly OPEN: number;

    readonly readyState: number;

    constructor(address: string);

    close(code?: number, data?: string): void;
    on(event: "close", listener: (code: number, reason: Buffer) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "message", listener: (data: Data) => void): this;
    on(event: "open", listener: () => void): this;
    removeAllListeners(): this;
    send(data: string): void;
    terminate(): void;
  }
}
