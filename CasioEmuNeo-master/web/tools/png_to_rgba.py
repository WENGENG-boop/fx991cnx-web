#!/usr/bin/env python3
"""Minimal PNG <-> raw RGBA helper.

Used by the WebAssembly build so the browser is never asked to decode the
interface atlas: the front-end decodes the PNG with the browser's own decoder
and hands raw RGBA to emu_web_set_interface_image().  The Node smoke test needs
the same thing without a browser, hence this file.  It only needs zlib, which
ships with CPython.

    python web/tools/png_to_rgba.py decode in.png out.raw
    python web/tools/png_to_rgba.py encode out.png 284 575 in.raw
    python web/tools/png_to_rgba.py info in.png
"""

import struct
import sys
import zlib

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


# --------------------------------------------------------------------- decode


def _paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def decode_png(path):
    """Returns (width, height, bytearray of RGBA rows, top-down)."""
    data = open(path, "rb").read()
    if data[:8] != PNG_SIGNATURE:
        raise ValueError("not a PNG file: %s" % path)

    pos = 8
    width = height = bit_depth = colour_type = interlace = None
    palette = b""
    transparency = b""
    idat = bytearray()

    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        chunk_type = data[pos + 4 : pos + 8]
        body = data[pos + 8 : pos + 8 + length]
        pos += 12 + length

        if chunk_type == b"IHDR":
            width, height, bit_depth, colour_type, _comp, _filt, interlace = struct.unpack(
                ">IIBBBBB", body
            )
        elif chunk_type == b"PLTE":
            palette = body
        elif chunk_type == b"tRNS":
            transparency = body
        elif chunk_type == b"IDAT":
            idat += body
        elif chunk_type == b"IEND":
            break

    if width is None:
        raise ValueError("PNG has no IHDR chunk")
    if bit_depth != 8:
        raise ValueError("only 8-bit PNGs are supported, got %d" % bit_depth)
    if interlace != 0:
        raise ValueError("interlaced PNGs are not supported")

    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}.get(colour_type)
    if channels is None:
        raise ValueError("unsupported colour type %d" % colour_type)

    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    if len(raw) < height * (stride + 1):
        raise ValueError("truncated image data")

    # Undo the per-scanline filters in place.
    out = bytearray(height * stride)
    previous = bytearray(stride)
    src = 0
    for row in range(height):
        filter_type = raw[src]
        src += 1
        line = bytearray(raw[src : src + stride])
        src += stride
        if filter_type == 1:
            for i in range(channels, stride):
                line[i] = (line[i] + line[i - channels]) & 0xFF
        elif filter_type == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 0xFF
        elif filter_type == 3:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif filter_type == 4:
            for i in range(stride):
                left = line[i - channels] if i >= channels else 0
                upleft = previous[i - channels] if i >= channels else 0
                line[i] = (line[i] + _paeth(left, previous[i], upleft)) & 0xFF
        elif filter_type != 0:
            raise ValueError("bad filter type %d on row %d" % (filter_type, row))
        out[row * stride : (row + 1) * stride] = line
        previous = line

    return width, height, _to_rgba(out, width, height, colour_type, channels, palette, transparency)


def _to_rgba(pixels, width, height, colour_type, channels, palette, transparency):
    rgba = bytearray(width * height * 4)
    count = width * height

    if colour_type == 6:
        return bytearray(pixels)

    if colour_type == 2:
        for i in range(count):
            rgba[i * 4 : i * 4 + 3] = pixels[i * 3 : i * 3 + 3]
            rgba[i * 4 + 3] = 255
        return rgba

    if colour_type == 0:
        for i in range(count):
            value = pixels[i]
            rgba[i * 4 : i * 4 + 3] = bytes((value, value, value))
            rgba[i * 4 + 3] = 255
        return rgba

    if colour_type == 4:
        for i in range(count):
            value = pixels[i * 2]
            rgba[i * 4 : i * 4 + 3] = bytes((value, value, value))
            rgba[i * 4 + 3] = pixels[i * 2 + 1]
        return rgba

    # colour_type == 3, indexed
    for i in range(count):
        index = pixels[i]
        rgba[i * 4 : i * 4 + 3] = palette[index * 3 : index * 3 + 3]
        rgba[i * 4 + 3] = transparency[index] if index < len(transparency) else 255
    return rgba


# --------------------------------------------------------------------- encode


def encode_png(path, width, height, rgba):
    """Writes an 8-bit RGBA PNG.  rgba is a bytes-like of width*height*4."""
    expected = width * height * 4
    if len(rgba) != expected:
        raise ValueError("expected %d bytes of RGBA, got %d" % (expected, len(rgba)))

    raw = bytearray()
    stride = width * 4
    for row in range(height):
        raw.append(0)  # filter type 0 (None) keeps this simple
        raw += rgba[row * stride : (row + 1) * stride]

    def chunk(chunk_type, body):
        return (
            struct.pack(">I", len(body))
            + chunk_type
            + body
            + struct.pack(">I", zlib.crc32(chunk_type + body) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    with open(path, "wb") as handle:
        handle.write(PNG_SIGNATURE)
        handle.write(chunk(b"IHDR", header))
        handle.write(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        handle.write(chunk(b"IEND", b""))


def scale_nearest(width, height, rgba, factor):
    """Integer nearest-neighbour upscale, for making tiny framebuffers viewable."""
    if factor <= 1:
        return width, height, rgba
    out_w = width * factor
    out_h = height * factor
    out = bytearray(out_w * out_h * 4)
    for y in range(out_h):
        src_row = (y // factor) * width * 4
        dst_row = y * out_w * 4
        for x in range(out_w):
            src = src_row + (x // factor) * 4
            dst = dst_row + x * 4
            out[dst : dst + 4] = rgba[src : src + 4]
    return out_w, out_h, out


# ------------------------------------------------------------------------ cli


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2

    command = argv[1]

    if command == "decode":
        width, height, rgba = decode_png(argv[2])
        with open(argv[3], "wb") as handle:
            handle.write(rgba)
        print("%d %d" % (width, height))
        return 0

    if command == "encode":
        out_path = argv[2]
        width = int(argv[3])
        height = int(argv[4])
        rgba = open(argv[5], "rb").read()
        encode_png(out_path, width, height, rgba)
        print("wrote %s (%dx%d)" % (out_path, width, height))
        return 0

    if command == "info":
        width, height, rgba = decode_png(argv[2])
        print("%s: %dx%d" % (argv[2], width, height))
        return 0

    print(__doc__)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
