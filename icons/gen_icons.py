"""
从 SVG 设计生成 PNG 图标。
来源: icon.svg — 蓝圆 + 白色 M + 底部折线
"""
import struct, zlib, os, math


def create_png(size, draw_fn):
    """创建 PNG，draw_fn(x, y, size) -> (r, g, b, a)"""
    def chunk(ctype, data):
        c = ctype + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))

    raw = b''
    for y in range(size):
        raw += b'\x00'
        for x in range(size):
            r, g, b, a = draw_fn(x, y, size)
            raw += bytes([r, g, b, a])

    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend


def blend(fg, bg):
    """前景叠加到背景（带 alpha）"""
    r1, g1, b1, a1 = fg
    r2, g2, b2, a2 = bg
    if a1 == 255:
        return fg
    if a1 == 0:
        return bg
    a = a1 + a2 * (255 - a1) // 255
    if a == 0:
        return (0, 0, 0, 0)
    r = (r1 * a1 + r2 * a2 * (255 - a1) // 255) // a
    g = (g1 * a1 + g2 * a2 * (255 - a1) // 255) // a
    b = (b1 * a1 + b2 * a2 * (255 - a1) // 255) // a
    return (min(255, r), min(255, g), min(255, b), min(255, a))


def draw_icon(x, y, size):
    scale = size / 128.0
    sx, sy = x / scale, y / scale

    result = (0, 0, 0, 0)

    # ---- 背景圆 ----
    dist = math.sqrt((sx - 64)**2 + (sy - 64)**2)
    circle_r = 62
    stroke_w = 2

    if dist <= circle_r + stroke_w / 2:
        # 填充色 #1a73e8
        fill_color = (26, 115, 232, 255)
        if dist <= circle_r - stroke_w / 2:
            result = fill_color
        else:
            # 描边区域 #1557b0，简单抗锯齿
            t = (circle_r + stroke_w/2 - dist) / stroke_w
            stroke_color = (21, 87, 176, 255)
            result = blend(stroke_color, fill_color) if t > 0.5 else stroke_color

    # ---- 底部折线 path: M40,100 L64,80 L88,100 ----
    def point_to_segment_dist(px, py, ax, ay, bx, by):
        """点到线段的最短距离"""
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return math.sqrt((px - ax)**2 + (py - ay)**2)
        t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx*dx + dy*dy)))
        nx, ny = ax + t * dx, ay + t * dy
        return math.sqrt((px - nx)**2 + (py - ny)**2)

    # 左段: (40,100) -> (64,80)
    d1 = point_to_segment_dist(sx, sy, 40, 100, 64, 80)
    # 右段: (64,80) -> (88,100)
    d2 = point_to_segment_dist(sx, sy, 64, 80, 88, 100)

    line_stroke = 6 * scale
    if d1 <= 3 or d2 <= 3:
        result = blend((255, 255, 255, 220), result)

    # ---- 文字 M ----
    # SVG: <text x="64" y="76" font-size="52" font-weight="bold">M</text>
    # y=76 是 baseline；大写字母 cap-height ≈ font-size * 0.72 ≈ 37
    # M 范围: top=76-37=39, bottom=76 (baseline)
    cap_height = 37
    letter_top = 76 - cap_height  # 39
    letter_bot = 76               # baseline
    letter_left = 64 - 18
    letter_right = 64 + 18

    def in_M_shape(px, py):
        """简化 M 字形检测"""
        if py < letter_top or py > letter_bot:
            return False
        # 左竖
        lx = letter_left + 5
        if px >= letter_left and px <= lx:
            return True
        # 右竖
        rx = letter_right - 5
        if px >= rx and px <= letter_right:
            return True
        # 中间 V: (letter_left+5, letter_top) → (64, letter_bot) → (letter_right-5, letter_top)
        mid_x = 64
        t_y = (py - letter_top) / (letter_bot - letter_top)  # 0..1
        v_left_x = (letter_left + 5) + (mid_x - (letter_left + 5)) * t_y
        v_right_x = mid_x + (letter_right - 5 - mid_x) * (1 - t_y)

        line_w = 5
        if abs(px - v_left_x) <= line_w / 2 or abs(px - v_right_x) <= line_w / 2:
            return True
        return False

    if in_M_shape(sx, sy):
        result = blend((255, 255, 255, 250), result)

    return result


base = os.path.dirname(os.path.abspath(__file__))
for s in [16, 48, 128]:
    path = os.path.join(base, f'icon{s}.png')
    with open(path, 'wb') as f:
        f.write(create_png(s, draw_icon))
    print(f'Created icon{s}.png ({s}x{s})')

print('Done!')
