"""Snapshot ERA's published-EIA registry into reports.json for the dashboard/repository.

Fetches https://www.era.gov.mv/eia/public/list.php (the JSON behind
era.gov.mv/reports.html), groups entries by keywords in the folder NAME only
(the reports themselves are never downloaded), and writes a compact reports.json.

Run from the repo root to refresh the snapshot:  python scripts/build_reports.py
"""
import json, re, os, urllib.request
from datetime import datetime, timezone

SRC = "https://www.era.gov.mv/eia/public/list.php"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CATEGORIES = [
    ("Harbour & jetty",            r"harbou?r|jetty|jetties|quay|breakwater|marina|slipway"),
    ("Reclamation & dredging",     r"reclamation|reclaim|dredg|sand ?bank|borrow"),
    ("Coastal protection",         r"coastal protection|shore protection|revetment|sea ?wall|erosion|beach (nourish|replenish|profil)"),
    ("Tourism & resorts",          r"resort|tourist|tourism|guesthouse|guest house|hotel|picnic island|city hotel|integrated tourism"),
    ("Water & sewerage",           r"water supply|sewerage|sewage|desalinat|r\.?o\.? plant|water and sew|wastewater"),
    ("Buildings & housing",        r"housing|building|flats?\b|commercial|mosque|school|hospital|office|warehouse|apartment"),
    ("Airports",                   r"airport|airstrip|runway|seaplane"),
    ("Roads & bridges",            r"road|bridge|causeway|link ?road"),
    ("Energy & power",             r"power ?house|powerhouse|power plant|solar|energy|fuel|diesel|lpg|electric"),
    ("Waste management",           r"waste|landfill|dump ?site"),
    ("Agriculture & farming",      r"agricultur|farming|farm\b|poultry|hydroponic"),
    ("Fisheries & aquaculture",    r"aquacultur|maricultur|fisher|ice plant|fish process"),
]

def category(name):
    low = name.lower()
    for label, pat in CATEGORIES:
        if re.search(pat, low):
            return label
    return "Other"

def doc_class(name):
    if re.search(r"addendum|adendum|_ad\d*_|\bad\d?\b", name, re.I): return "Addendum"
    if re.search(r"\besmp\b|\bemp\b|management plan", name, re.I):   return "EMP"
    if re.search(r"\besia\b", name, re.I):                            return "ESIA"
    return "EIA"

def parse(entry):
    folder = entry["folder"].strip()
    # strip zip-export suffix like "-20250426T141522Z-001"
    folder = re.sub(r"-\d{8}T\d{6}Z-\d{3}$", "", folder)
    parts = folder.split("_")
    date = None
    if re.match(r"^\d{8}$", parts[0]):
        try:
            date = datetime.strptime(parts[0], "%Y%m%d").strftime("%Y-%m-%d")
            parts = parts[1:]
        except ValueError:
            pass
    if not date:
        date = (entry.get("created") or "")[:10] or None
    # drop project-code and doc-class tokens from the display title
    parts = [p for p in parts if p and not re.match(r"^(PRJ-?[\d-]*|\d{4}-\d{3}|EIA|ESIA|EMP|ESMP|AD\d*|\d)$", p.strip(), re.I)]
    if len(parts) >= 3:
        title = " ".join(parts[:-2]) + " — " + parts[-2] + ", " + parts[-1]
    else:
        title = " ".join(parts) or folder
    year = entry.get("year") or (date or "")[:4] or "?"
    return {
        "n": title.strip(),
        "u": entry.get("anonUrl") or entry.get("webUrl") or "",
        "y": year,
        "d": date,
        "t": doc_class(folder),
        "c": category(folder),
    }

def main():
    req = urllib.request.Request(SRC, headers={"User-Agent": "Mozilla/5.0 (eia-sub-portal snapshot)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        src = json.load(r)
    reports = [parse(e) for e in src["data"]]
    out = {
        "source": "https://www.era.gov.mv/reports.html",
        "sourceUpdatedAt": src.get("updatedAt"),
        "snapshotAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": len(reports),
        "reports": reports,
    }
    dest = os.path.join(ROOT, "reports.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print("wrote", dest, len(reports), "reports,", os.path.getsize(dest), "bytes")

if __name__ == "__main__":
    main()
