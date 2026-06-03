"""Generate realistic example meter-face photos for the SnapMeter app.

Each image matches a seeded meter's register format so it reads as a plausible
"correct" example in the capture flow. Output: examples/*.jpg
"""
from __future__ import annotations

import math
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

random.seed(7)
HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, "examples")
os.makedirs(OUT, exist_ok=True)

FONTS = "/mnt/skills/examples/canvas-design/canvas-fonts"
DIGIT_FONT = os.path.join(FONTS, "DMMono-Regular.ttf")
DIGIT_BOLD = os.path.join(FONTS, "IBMPlexMono-Bold.ttf")
SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
SANS_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
if not os.path.exists(SANS):
    SANS = os.path.join(FONTS, "GeistMono-Bold.ttf")
    SANS_REG = os.path.join(FONTS, "GeistMono-Regular.ttf")

SS = 2  # supersample factor for anti-aliasing
W, H = 1080 * SS, 1440 * SS


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size * SS)


def centered(draw, cx, y, text, fnt, fill):
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    draw.text((cx - (r - l) / 2, y), text, font=fnt, fill=fill)
    return (r - l), (b - t)


def background(base):
    """Dark plant-room backdrop with a soft radial light and grain."""
    img = Image.new("RGB", (W, H), base)
    grad = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grad)
    cx, cy = W * 0.5, H * 0.42
    maxd = math.hypot(W, H)
    for r in range(int(maxd), 0, -8 * SS):
        v = int(120 * (1 - r / maxd))
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=v)
    light = Image.new("RGB", (W, H), (90, 96, 110))
    img = Image.composite(light, img, grad)
    return img


def odometer(img, cx, cy, w, h, int_digits, dec_digits, value, red_decimals=True):
    """Mechanical/odometer-style register window: white integer wheels, red decimals."""
    d = ImageDraw.Draw(img)
    total = int_digits + dec_digits
    pad = int(h * 0.16)
    cell_w = (w - pad * 2) / total
    x0 = cx - w / 2
    y0 = cy - h / 2
    # window frame
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=int(h * 0.12), fill=(18, 18, 20))
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=int(h * 0.12), outline=(120, 120, 130), width=2 * SS)
    digits = str(int(round(value * (10 ** dec_digits)))).zfill(total)
    fnt = font(DIGIT_BOLD, int(h * 0.42))
    for i, ch in enumerate(digits):
        is_dec = i >= int_digits
        wx0 = x0 + pad + i * cell_w
        wx1 = wx0 + cell_w
        # individual wheel cell
        cell_bg = (170, 30, 30) if (is_dec and red_decimals) else (245, 245, 245)
        d.rounded_rectangle([wx0 + 2 * SS, y0 + pad * 0.7, wx1 - 2 * SS, y0 + h - pad * 0.7],
                            radius=int(h * 0.06), fill=cell_bg)
        # subtle wheel shading top/bottom
        d.rectangle([wx0 + 2 * SS, y0 + pad * 0.7, wx1 - 2 * SS, y0 + pad * 0.7 + h * 0.14],
                    fill=tuple(int(c * 0.82) for c in cell_bg))
        d.rectangle([wx0 + 2 * SS, y0 + h - pad * 0.7 - h * 0.14, wx1 - 2 * SS, y0 + h - pad * 0.7],
                    fill=tuple(int(c * 0.82) for c in cell_bg))
        col = (255, 255, 255) if (is_dec and red_decimals) else (20, 20, 24)
        cxx = (wx0 + wx1) / 2
        l, t, r, b = d.textbbox((0, 0), ch, font=fnt)
        d.text((cxx - (r - l) / 2, cy - (b - t) / 2 - t), ch, font=fnt, fill=col)
        if i < total - 1:
            d.line([wx1, y0 + pad * 0.6, wx1, y0 + h - pad * 0.6], fill=(60, 60, 66), width=1 * SS)


def glass_glare(img, box):
    """Add a glassy highlight + faint reflection over a region."""
    x0, y0, x1, y1 = box
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([x0 + (x1 - x0) * 0.05, y0 + (y1 - y0) * 0.04,
                x0 + (x1 - x0) * 0.62, y0 + (y1 - y0) * 0.34], fill=(255, 255, 255, 38))
    od.ellipse([x0 + (x1 - x0) * 0.55, y0 + (y1 - y0) * 0.6,
                x1, y1 + (y1 - y0) * 0.2], fill=(255, 255, 255, 14))
    overlay = overlay.filter(ImageFilter.GaussianBlur(18 * SS))
    img.paste(Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB"), (0, 0))


def label_sticker(img, cx, cy, text, sub):
    d = ImageDraw.Draw(img)
    f1 = font(SANS, 30)
    f2 = font(SANS_REG, 20)
    w = max(d.textlength(text, font=f1), d.textlength(sub, font=f2)) + 60 * SS
    h = 110 * SS
    x0, y0 = cx - w / 2, cy - h / 2
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=14 * SS, fill=(238, 238, 232))
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=14 * SS, outline=(160, 160, 150), width=2 * SS)
    centered(d, cx, y0 + 16 * SS, text, f1, (25, 25, 30))
    centered(d, cx, y0 + 60 * SS, sub, f2, (90, 90, 95))


def finish(img, rotate_deg, name):
    # grain
    noise = Image.effect_noise((W, H), 14).convert("L")
    img = Image.composite(img, Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.06), Image.new("L", (W, H), 255))
    img = Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.045)
    # vignette
    vig = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(vig)
    vd.ellipse([-W * 0.25, -H * 0.2, W * 1.25, H * 1.2], fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(120 * SS))
    img = Image.composite(img, ImageImage := Image.new("RGB", (W, H), (8, 8, 12)), vig)
    img = img.rotate(rotate_deg, resample=Image.BICUBIC, fillcolor=(12, 12, 16))
    img = img.resize((W // SS, H // SS), Image.LANCZOS)
    path = os.path.join(OUT, name)
    img.save(path, "JPEG", quality=86)
    print("wrote", path)


# ── Water meter — round register, 5 + 2 (m³) ─────────────────────────────────
def water_meter(label, value):
    img = background((44, 52, 66))
    d = ImageDraw.Draw(img)
    cx, cy = W / 2, H * 0.43
    R = W * 0.40
    # brass/blue body bevel rings
    for i, col in enumerate([(60, 92, 140), (40, 64, 104), (150, 170, 200), (30, 44, 74)]):
        rr = R - i * 16 * SS
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=col)
    inner = R - 70 * SS
    d.ellipse([cx - inner, cy - inner, cx + inner, cy + inner], fill=(245, 246, 248))
    # brand + units
    centered(d, cx, cy - inner * 0.62, "AQUA-FLOW", font(SANS, 30), (70, 90, 130))
    centered(d, cx, cy + inner * 0.40, "m³", font(SANS, 44), (40, 60, 100))
    # register
    odometer(img, cx, cy - inner * 0.10, inner * 1.25, inner * 0.42, 5, 2, value)
    # small sub-dials
    for ang, lab in [(-40, "x0.1"), (40, "x0.01"), (90, "x0.001")]:
        sx = cx + math.cos(math.radians(ang)) * inner * 0.62
        sy = cy + inner * 0.66 + math.sin(math.radians(ang)) * 0 + (0 if ang == 90 else 0)
        sx = cx + (ang / 90) * inner * 0.5
        sy = cy + inner * 0.66
        rr = inner * 0.13
        d.ellipse([sx - rr, sy - rr, sx + rr, sy + rr], fill=(255, 255, 255), outline=(150, 30, 30), width=3 * SS)
        d.line([sx, sy, sx + rr * 0.6 * math.cos(math.radians(ang * 2)), sy + rr * 0.6 * math.sin(math.radians(ang * 2))],
               fill=(170, 30, 30), width=3 * SS)
        centered(d, sx, sy + rr + 4 * SS, lab, font(SANS_REG, 14), (120, 120, 130))
    glass_glare(img, [cx - R, cy - R, cx + R, cy + R])
    label_sticker(img, cx, H * 0.86, label, "Water · m³ · 5+2")
    finish(img, -2.5, "water_RS-WATER-01.jpg")


# ── Electricity meter — LCD, 6 + 1 (kWh) ─────────────────────────────────────
def electricity_meter(label, value):
    img = background((54, 58, 64))
    d = ImageDraw.Draw(img)
    cx = W / 2
    bx0, by0, bx1, by1 = W * 0.13, H * 0.12, W * 0.87, H * 0.74
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=40 * SS, fill=(228, 230, 233))
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=40 * SS, outline=(180, 182, 188), width=4 * SS)
    centered(d, cx, by0 + 26 * SS, "ELECTRO-METER  EM-3", font(SANS, 28), (70, 72, 80))
    # LCD
    lx0, ly0, lx1, ly1 = W * 0.20, H * 0.26, W * 0.80, H * 0.40
    d.rounded_rectangle([lx0, ly0, lx1, ly1], radius=16 * SS, fill=(150, 168, 150))
    d.rounded_rectangle([lx0, ly0, lx1, ly1], radius=16 * SS, outline=(70, 80, 70), width=3 * SS)
    digits = f"{value:07.1f}".replace(".", "")  # 6 int + 1 dec
    digits = str(int(round(value * 10))).zfill(7)
    fnt = font(DIGIT_BOLD, 96)
    txt = digits[:6] + "." + digits[6]
    # faint "off" segments background
    off = digits  # ignore
    l, t, r, b = d.textbbox((0, 0), txt, font=fnt)
    d.text((cx - (r - l) / 2, (ly0 + ly1) / 2 - (b - t) / 2 - t), txt, font=fnt, fill=(20, 32, 20))
    centered(d, lx1 - 60 * SS, ly1 - 70 * SS, "kWh", font(SANS, 30), (20, 32, 20))
    # OBIS code + barcode-ish strip + terminals
    centered(d, cx, ly1 + 24 * SS, "1.8.0  Total active energy", font(SANS_REG, 22), (90, 92, 100))
    for i in range(8):
        tx = bx0 + 70 * SS + i * (bx1 - bx0 - 140 * SS) / 7
        d.rectangle([tx - 18 * SS, by1 - 90 * SS, tx + 18 * SS, by1 - 30 * SS], fill=(120, 122, 128))
        d.ellipse([tx - 10 * SS, by1 - 78 * SS, tx + 10 * SS, by1 - 58 * SS], fill=(80, 82, 88))
    glass_glare(img, [lx0, ly0, lx1, ly1])
    label_sticker(img, cx, H * 0.86, label, "Electricity · kWh · 6+1")
    finish(img, 1.8, "electricity_RS-ELEC-01.jpg")


# ── Gas meter — counter, 5 + 3 (m³) ──────────────────────────────────────────
def gas_meter(label, value):
    img = background((70, 66, 58))
    d = ImageDraw.Draw(img)
    cx = W / 2
    bx0, by0, bx1, by1 = W * 0.15, H * 0.14, W * 0.85, H * 0.72
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=46 * SS, fill=(210, 180, 60))
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=46 * SS, outline=(150, 120, 30), width=5 * SS)
    centered(d, cx, by0 + 30 * SS, "GASCOUNT  G4", font(SANS, 30), (90, 70, 20))
    # counter window
    odometer(img, cx, H * 0.40, (bx1 - bx0) * 0.82, H * 0.13, 5, 3, value)
    centered(d, cx, H * 0.40 + H * 0.085, "m³", font(SANS, 34), (90, 70, 20))
    centered(d, cx, by1 - 80 * SS, "max 6 m³/h", font(SANS_REG, 22), (90, 70, 20))
    glass_glare(img, [bx0, by0, bx1, by1])
    label_sticker(img, cx, H * 0.86, label, "Gas · m³ · 5+3")
    finish(img, -1.4, "gas_RS-GAS-01.jpg")


if __name__ == "__main__":
    water_meter("RS-WATER-01", 1852.31)        # last seed 1842.55 → ~+9.76 m³
    electricity_meter("RS-ELEC-01", 285102.7)  # last seed 284910.4 → ~+192.3 kWh
    gas_meter("RS-GAS-01", 5121.498)           # last seed 5120.115 → ~+1.383 m³
    print("done")
