// Minimal STORE-method ZIP writer. We don't compress because the bulk of the
// payload is audio/video/PNG/JPG (already compressed). Building uncompressed keeps
// us out of zlib calls per entry and matches what archiver-mode-STORE would do.
//
// MVP note: we accumulate the ZIP bytes in memory, GCM-encrypt the whole blob, and
// PUT it. The spec's "constant memory streaming" pipeline (R2 source → cipher → R2
// multipart upload) is a follow-up — the format below is correct either way; only
// the chunking changes. Multi-hundred-MB packages will live briefly in node heap.
//
// Plaintext is ONLY in heap buffers — never written to disk. After encryption +
// upload, the caller .fill(0)'s the plaintext buffer.

import { crc32 } from 'zlib';

interface PendingEntry {
  nameBuf: Buffer;
  data: Buffer;
  localHeaderOffset: number;
  crc: number;
}

export class MinimalZipWriter {
  private parts: Buffer[] = [];
  private entries: PendingEntry[] = [];
  private offset = 0;

  addFile(path: string, data: Buffer) {
    const nameBuf = Buffer.from(path, 'utf8');
    const fileCrc = crc32(data) >>> 0; // ensure uint32
    const size = data.length;

    // Local File Header (30 bytes) + name + data.
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);  // LFH signature
    lfh.writeUInt16LE(20, 4);          // version needed
    lfh.writeUInt16LE(0x0800, 6);      // GP flag bit 11: UTF-8 filenames
    lfh.writeUInt16LE(0, 8);           // method = STORE
    lfh.writeUInt16LE(0, 10);          // last mod time (zero)
    lfh.writeUInt16LE(0, 12);          // last mod date (zero)
    lfh.writeUInt32LE(fileCrc, 14);
    lfh.writeUInt32LE(size, 18);       // compressed size = size (STORE)
    lfh.writeUInt32LE(size, 22);       // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);          // extra field length

    const localHeaderOffset = this.offset;
    this.parts.push(lfh, nameBuf, data);
    this.offset += lfh.length + nameBuf.length + data.length;
    this.entries.push({ nameBuf, data, localHeaderOffset, crc: fileCrc });
  }

  finish(): Buffer {
    // Central Directory: one File Header per entry.
    const cdParts: Buffer[] = [];
    let cdSize = 0;
    for (const e of this.entries) {
      const cdh = Buffer.alloc(46);
      cdh.writeUInt32LE(0x02014b50, 0); // CD signature
      cdh.writeUInt16LE(20, 4);         // version made by
      cdh.writeUInt16LE(20, 6);         // version needed
      cdh.writeUInt16LE(0x0800, 8);     // GP flag
      cdh.writeUInt16LE(0, 10);         // method = STORE
      cdh.writeUInt16LE(0, 12);         // mtime
      cdh.writeUInt16LE(0, 14);         // mdate
      cdh.writeUInt32LE(e.crc, 16);
      cdh.writeUInt32LE(e.data.length, 20); // compressed size
      cdh.writeUInt32LE(e.data.length, 24); // uncompressed size
      cdh.writeUInt16LE(e.nameBuf.length, 28);
      cdh.writeUInt16LE(0, 30);          // extra len
      cdh.writeUInt16LE(0, 32);          // comment len
      cdh.writeUInt16LE(0, 34);          // disk number
      cdh.writeUInt16LE(0, 36);          // internal attrs
      cdh.writeUInt32LE(0, 38);          // external attrs
      cdh.writeUInt32LE(e.localHeaderOffset, 42);
      cdParts.push(cdh, e.nameBuf);
      cdSize += cdh.length + e.nameBuf.length;
    }
    const cdOffset = this.offset;

    // End of Central Directory Record (22 bytes, no comment).
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
    eocd.writeUInt16LE(0, 4);          // disk number
    eocd.writeUInt16LE(0, 6);          // disk with CD start
    eocd.writeUInt16LE(this.entries.length, 8);  // entries on this disk
    eocd.writeUInt16LE(this.entries.length, 10); // total entries
    eocd.writeUInt32LE(cdSize, 12);    // CD size
    eocd.writeUInt32LE(cdOffset, 16);  // CD offset from start
    eocd.writeUInt16LE(0, 20);          // .zip comment length

    return Buffer.concat([...this.parts, ...cdParts, eocd]);
  }
}
