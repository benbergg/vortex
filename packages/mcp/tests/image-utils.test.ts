import { describe, it, expect, afterEach } from "vitest";
import { unlinkSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "os";

import {
  saveBase64Image,
  getImageSize,
  estimateImageBytes,
  ensureTmpDir,
} from "../src/lib/image-utils.js";

const TMP_DIR = join(tmpdir(), "vortex-screenshots");

function cleanup() {
  try {
    const files = readdirSync(TMP_DIR).filter((f) => f.startsWith("test-") || f.startsWith("my-prefix"));
    for (const f of files) {
      try { unlinkSync(join(TMP_DIR, f)); } catch {}
    }
  } catch {}
}

afterEach(cleanup);

const PNG_1X1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFfwI/BPcIAAAAAAABuAiWgAABBBBn8P6AAAAABJRU5ErkJggg==";

describe("saveBase64Image", () => {
  it("saves a valid PNG and returns path + byte count", () => {
    const { path, bytes } = saveBase64Image(PNG_1X1, "test");
    expect(path).toMatch(/test-\d+-\d+\.png$/);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(1000);
  });

  it("saves with custom prefix", () => {
    const { path } = saveBase64Image(PNG_1X1, "my-prefix");
    expect(path).toContain("my-prefix");
  });

  it("throws on completely invalid data URL", () => {
    expect(() => saveBase64Image("not-a-data-url", "test")).toThrow();
  });

  it("throws when base64 portion is missing", () => {
    expect(() => saveBase64Image("data:image/png;base64,", "test")).toThrow();
  });

  it("handles JPEG extension", () => {
    const jpeg = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMCwsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQU1hQUFBT/wAARCAAUABQDASIAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAYIB//EAB8QAAIBBAMBAAAAAAAAAAAAAAECAxEEBRIhMf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCWgAoAAAAAAAAAAAAAAAAAAAAAD/2gAIAQIAAQUA9gAAAD//2Q==";
    const { path } = saveBase64Image(jpeg, "test");
    expect(path).toMatch(/\.jpeg$/);
  });
});

describe("getImageSize", () => {
  it("returns {0,0} for invalid data URLs", () => {
    expect(getImageSize("not-a-url")).toEqual({ width: 0, height: 0 });
    expect(getImageSize("")).toEqual({ width: 0, height: 0 });
    expect(getImageSize("data:image/png;base64,truncated")).toEqual({ width: 0, height: 0 });
  });

  it("returns {0,0} for non-PNG/JPEG data", () => {
    expect(getImageSize("data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==")).toEqual({ width: 0, height: 0 });
  });

  it("returns {0,0} when base64 is truncated", () => {
    expect(getImageSize("data:image/png;base64,iVBORw0KGgo=")).toEqual({ width: 0, height: 0 });
  });

  it("returns {0,0} for empty base64 string", () => {
    expect(getImageSize("data:image/png;base64,")).toEqual({ width: 0, height: 0 });
  });
});

describe("estimateImageBytes", () => {
  it("returns 0 for invalid data URL", () => {
    expect(estimateImageBytes("")).toBe(0);
    expect(estimateImageBytes("not-a-url")).toBe(0);
    expect(estimateImageBytes("data:image/png;base64,")).toBe(0);
  });

  it("returns proportional bytes for valid base64", () => {
    const bytes = estimateImageBytes(PNG_1X1);
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThan(200);
  });

  it("larger images return more bytes", () => {
    const short = "data:image/png;base64,abc";
    const long = "data:image/png;base64,abcdefghijklmnopqrstuvwxyz";
    expect(estimateImageBytes(long)).toBeGreaterThan(estimateImageBytes(short));
  });

  it("floor of 3/4 of base64 length", () => {
    const data = "abc";
    expect(estimateImageBytes(`data:image/png;base64,${data}`)).toBe(Math.floor(data.length * 0.75));
  });
});

describe("ensureTmpDir", () => {
  it("returns the vortex-screenshots temp directory path", () => {
    const dir = ensureTmpDir();
    expect(dir).toContain("vortex-screenshots");
  });

  it("creates directory if it does not exist", () => {
    expect(() => ensureTmpDir()).not.toThrow();
  });
});