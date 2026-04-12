import type { NmMessageFromExtension, NmMessageFromServer } from "@bytenew/vortex-shared";

export class NativeMessagingReader {
  private buffer = Buffer.alloc(0);
  private onMessage: (msg: NmMessageFromExtension) => void;

  constructor(onMessage: (msg: NmMessageFromExtension) => void) {
    this.onMessage = onMessage;
  }

  feed(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this.drain();
  }

  private drain(): void {
    while (this.buffer.length >= 4) {
      const msgLen = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + msgLen) break;
      const jsonStr = this.buffer.subarray(4, 4 + msgLen).toString("utf-8");
      this.buffer = this.buffer.subarray(4 + msgLen);
      try {
        const msg = JSON.parse(jsonStr) as NmMessageFromExtension;
        this.onMessage(msg);
      } catch {
        // skip unparseable messages
      }
    }
  }
}

export function writeNmMessage(stream: NodeJS.WritableStream, msg: NmMessageFromServer): void {
  const json = JSON.stringify(msg);
  const buf = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  stream.write(header);
  stream.write(buf);
}
