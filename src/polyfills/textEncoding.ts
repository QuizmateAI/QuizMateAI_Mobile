// Hermes (RN JS engine) chưa expose TextDecoder/TextEncoder global.
// @stomp/stompjs cần TextDecoder để parse STOMP frame nhị phân từ raw WebSocket
// (SockJS không cần vì luôn dùng string frame).
// Polyfill UTF-8 inline — đủ cho STOMP và tránh phải thêm npm dep.

const g = global as any;

if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = class TextDecoderPolyfill {
    readonly encoding: string = 'utf-8';
    readonly fatal: boolean = false;
    readonly ignoreBOM: boolean = false;

    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) {
        return '';
      }
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(
              (input as ArrayBufferView).buffer,
              (input as ArrayBufferView).byteOffset,
              (input as ArrayBufferView).byteLength,
            );

      let result = '';
      let i = 0;
      while (i < bytes.length) {
        const b1 = bytes[i++];
        if (b1 < 0x80) {
          result += String.fromCharCode(b1);
        } else if (b1 < 0xc0) {
          // continuation byte at start — skip
        } else if (b1 < 0xe0) {
          const b2 = bytes[i++];
          result += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
        } else if (b1 < 0xf0) {
          const b2 = bytes[i++];
          const b3 = bytes[i++];
          result += String.fromCharCode(
            ((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f),
          );
        } else {
          const b2 = bytes[i++];
          const b3 = bytes[i++];
          const b4 = bytes[i++];
          let cp =
            ((b1 & 0x07) << 18) |
            ((b2 & 0x3f) << 12) |
            ((b3 & 0x3f) << 6) |
            (b4 & 0x3f);
          cp -= 0x10000;
          result += String.fromCharCode(
            0xd800 + (cp >> 10),
            0xdc00 + (cp & 0x3ff),
          );
        }
      }
      return result;
    }
  };
}

if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = class TextEncoderPolyfill {
    readonly encoding: string = 'utf-8';

    encode(input?: string): Uint8Array {
      if (!input) {
        return new Uint8Array(0);
      }
      const out: number[] = [];
      for (let i = 0; i < input.length; i++) {
        let code = input.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
          const low = input.charCodeAt(i + 1);
          if (low >= 0xdc00 && low <= 0xdfff) {
            code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
            i++;
          }
        }
        if (code < 0x80) {
          out.push(code);
        } else if (code < 0x800) {
          out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
          out.push(
            0xe0 | (code >> 12),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f),
          );
        } else {
          out.push(
            0xf0 | (code >> 18),
            0x80 | ((code >> 12) & 0x3f),
            0x80 | ((code >> 6) & 0x3f),
            0x80 | (code & 0x3f),
          );
        }
      }
      return new Uint8Array(out);
    }
  };
}
