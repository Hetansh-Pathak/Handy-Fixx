import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_LIMITS, attachmentStoragePath, checkAttachment, formatClipDuration, photosLeft, resolveAttachmentMime,
} from "./attachments";

describe("resolveAttachmentMime", () => {
  it("trusts a supported reported type", () => expect(resolveAttachmentMime("image/JPEG", "x")).toBe("image/jpeg"));
  it("drops codec parameters", () => expect(resolveAttachmentMime("audio/webm;codecs=opus", "blob:x")).toBe("audio/webm"));
  it("falls back to the file extension", () => {
    expect(resolveAttachmentMime(null, "file:///cache/rec-1.m4a")).toBe("audio/mp4");
    expect(resolveAttachmentMime("application/octet-stream", "IMG_0001.HEIC")).toBe("image/heic");
    expect(resolveAttachmentMime(undefined, "https://x/y.jpeg?token=1")).toBe("image/jpeg");
  });
  it("rejects anything else", () => {
    expect(resolveAttachmentMime("video/mp4", "clip.mov")).toBeNull();
    expect(resolveAttachmentMime(null, "notes.pdf")).toBeNull();
  });
});

describe("checkAttachment", () => {
  const MB = 1024 * 1024;
  it("accepts a normal photo and voice note", () => {
    expect(checkAttachment({ type: "image", mimeType: "image/jpeg", sizeBytes: 3 * MB })).toBeNull();
    expect(checkAttachment({ type: "audio", mimeType: "audio/mp4", sizeBytes: MB, durationSeconds: 45 })).toBeNull();
  });
  it("accepts an unknown size (the picker does not always report it)", () => {
    expect(checkAttachment({ type: "image", mimeType: "image/png", sizeBytes: null })).toBeNull();
  });
  it("rejects a type that does not match", () => {
    expect(checkAttachment({ type: "image", mimeType: "audio/mp4", sizeBytes: 1 })).toMatch(/photo/);
  });
  it("enforces size and length limits", () => {
    expect(checkAttachment({ type: "image", mimeType: "image/jpeg", sizeBytes: ATTACHMENT_LIMITS.maxPhotoBytes + 1 })).toMatch(/10 MB/);
    expect(checkAttachment({ type: "audio", mimeType: "audio/mp4", sizeBytes: 1, durationSeconds: 125 })).toMatch(/2 minutes/);
    expect(checkAttachment({ type: "audio", mimeType: "audio/mp4", sizeBytes: 1, durationSeconds: 0 })).toMatch(/too short/);
  });
  it("allows the auto-stop at exactly two minutes", () => {
    expect(checkAttachment({ type: "audio", mimeType: "audio/mp4", sizeBytes: 1, durationSeconds: 121 })).toBeNull();
  });
});

describe("photosLeft", () => {
  it.each([[0, 5], [3, 2], [5, 0], [7, 0]])("%i taken → %i left", (n, left) => expect(photosLeft(n)).toBe(left));
});

describe("attachmentStoragePath", () => {
  it("puts the file inside the user's own folder, then the booking", () => {
    expect(attachmentStoragePath({ userId: "u1", bookingId: "b1", index: 0, mimeType: "image/jpeg", stamp: 1700 })).toBe("u1/b1/image-1-1700.jpg");
    expect(attachmentStoragePath({ userId: "u1", bookingId: "b1", index: 2, mimeType: "audio/mp4", stamp: 1700 })).toBe("u1/b1/audio-3-1700.m4a");
  });
});

describe("formatClipDuration", () => {
  it.each([[0, "0:00"], [7.4, "0:07"], [90, "1:30"], [120, "2:00"]])("%d s → %s", (s, out) => expect(formatClipDuration(s)).toBe(out));
});
