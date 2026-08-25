"""Build a standalone index.html from the template + inlined Thaana fonts.

Run from the repo root:  python src/build.py
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")

tpl = open(os.path.join(SRC, "eia-portal.template.html"), encoding="utf-8").read()
t4 = open(os.path.join(SRC, "thaana400.b64.txt"), encoding="utf-8").read().strip()
t7 = open(os.path.join(SRC, "thaana700.b64.txt"), encoding="utf-8").read().strip()

out = tpl.replace("__THAANA400__", t4).replace("__THAANA700__", t7)
assert "__THAANA" not in out, "font placeholder left unreplaced"

# Wrap the template (which starts at <title>) into a full HTML document.
idx = out.index("</style>") + len("</style>")
head, body = out[:idx], out[idx:]
full = (
    "<!doctype html>\n<html lang=\"en\">\n<head>\n"
    "<meta charset=\"utf-8\">\n"
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
    "<meta name=\"description\" content=\"EIA Submission Portal — Maldives ERA. "
    "Bilingual (English/Dhivehi) applicant submission portal with document manifests, "
    "expedited-review checks, and an ERA review dashboard.\">\n"
    + head + "\n</head>\n<body>\n" + body + "\n</body>\n</html>\n"
)

dest = os.path.join(ROOT, "index.html")
open(dest, "w", encoding="utf-8").write(full)
print("wrote", dest, len(full), "chars")
