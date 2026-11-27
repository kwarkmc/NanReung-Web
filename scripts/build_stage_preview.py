"""Build the isolated stage redesign from the current published HTML."""

import argparse
from pathlib import Path
import posixpath
import re
from urllib.parse import urlsplit, urlunsplit

DOCS = Path(__file__).resolve().parents[1] / "docs"
PREVIEW = "test"
ADDRESS = re.compile(r'\b(src|href)="([^"]+)"')
BOOK = ["index.html", *(f"{n:02}.html" for n in range(2, 32))]
SCREENS = [*BOOK, "scroll/index.html", "casting/index.html", "casting/scroll/index.html"]


def render(source, screen):
    folder = posixpath.dirname(screen) or "."
    destination = posixpath.join(PREVIEW, folder)
    is_cast = screen.startswith("casting/")
    is_scroll = folder.endswith("scroll")
    root = posixpath.relpath(PREVIEW, destination)
    screen_set = set(SCREENS)

    def rewrite(match):
        attr, address = match.groups()
        url = urlsplit(address)
        if url.scheme or url.netloc or not url.path:
            return match[0]
        original = posixpath.normpath(posixpath.join(folder, url.path))
        target = posixpath.join(PREVIEW, original) if original in screen_set else original
        href = posixpath.relpath(target, destination)
        return f'{attr}="{urlunsplit(("", "", href, url.query, url.fragment))}"'

    source = ADDRESS.sub(rewrite, source)
    if is_scroll:
        source = re.sub(r'  <script src="[^"]*scroll/scroll\.js[^"]*" defer></script>\n', "", source)

    page_classes = ["stage", "stage-cast" if is_cast else "stage-book"]
    if is_scroll:
        page_classes.append("stage-scroll")
    source = re.sub(r'<body(?: class="([^"]*)")?>',
                    lambda m: f'<body class="{" ".join(filter(None, [m[1], *page_classes]))}">', source, count=1)

    if not is_cast:
        def label_page(match):
            number = int(match[2]) if is_scroll else BOOK.index(screen) + 1
            kind = "cover" if number == 1 else "contents" if number == 2 else "profile" if 8 <= number <= 19 else "closing" if number == 31 else "chapter"
            return match[1].replace("book-page", f"book-page stage-{kind}", 1)

        marker = r'(<section class="[^"]*book-page[^"]*" id="page-(\d\d)")' if is_scroll else r'(<main class="[^"]*book-page[^"]*")'
        source = re.sub(marker, label_page, source)
        poster = f"{root}/poster.webp"
        artwork = (
            f'<a class="stage-poster-link" href="{poster}" target="_blank" rel="noopener"'
            ' aria-label="공연 포스터 크게 보기 (새 탭)" aria-describedby="stage-poster-art">'
            f'<img class="poster-scene" src="{root}/poster-scene.webp" alt="" aria-hidden="true" fetchpriority="high">'
            f'<img id="stage-poster-art" class="stage-art" src="{poster}"'
            ' alt="뮤지컬 〈난릉〉 공연 포스터. 2026년 11월 27일 금요일 19:00, 11월 28일 토요일 16:00. 한양대학교 한양예술극장."'
            ' width="1449" height="2050" fetchpriority="high"></a>'
        )
        source = source.replace('<div class="motion-poster">', '<div class="motion-poster">' + artwork)

    if screen in ("index.html", "scroll/index.html"):
        tag = "section" if is_scroll else "main"
        opening = f'<{tag} class="program-page book-page stage-cover"'
        start = source.index(opening)
        end = source.index(f"</{tag}>", start) + len(f"</{tag}>")
        layers = (
            '<div class="poster-atmosphere" aria-hidden="true"></div>'
            '<div class="poster-flight" aria-hidden="true"><div class="mask-spin">'
            f'<img class="mask-front" src="{root}/mask-front.webp" alt="" fetchpriority="high">'
            '</div></div>'
            '<button class="poster-cue" type="button">아래로 스크롤</button>'
        )
        scene = ('<div class="poster-runway"><div class="poster-pin">'
                 + source[start:end] + layers + '</div></div>')
        source = source[:start] + scene + source[end:]

    stylesheet = "stage-cast.css" if is_cast else "stage-book.css"
    shared = f'  <link rel="stylesheet" href="{root}/stage.css">\n'
    shared += f'  <link rel="stylesheet" href="{root}/{stylesheet}">\n'
    if is_scroll:
        shared += f'  <script src="{root}/vendor/gsap.min.js" defer></script>\n'
        shared += f'  <script src="{root}/vendor/ScrollTrigger.min.js" defer></script>\n'
        shared += f'  <script src="{root}/stage-motion.js" defer></script>\n'
    if screen in ("index.html", "scroll/index.html"):
        shared += f'  <script src="{root}/poster-motion.js" defer></script>\n'
    return source.replace("</head>", shared + "</head>", 1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name in SCREENS:
        output = DOCS / PREVIEW / name
        expected = render((DOCS / name).read_text(encoding="utf-8"), name)
        if args.check:
            if not output.exists() or output.read_text(encoding="utf-8") != expected:
                parser.exit(1, f"Regenerate {output.relative_to(DOCS)} with python scripts/build_stage_preview.py\n")
        else:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(expected, encoding="utf-8", newline="\n")
