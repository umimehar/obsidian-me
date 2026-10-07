"""OCR every receipt image in a folder with macOS Vision; write {filename: text} JSON."""
import json
import sys
from pathlib import Path

from ocrmac import ocrmac

src, out = Path(sys.argv[1]), Path(sys.argv[2])
done = json.loads(out.read_text()) if out.exists() else {}
for p in sorted(src.iterdir()):
    if p.suffix.lower() not in {'.jpg', '.jpeg', '.png'} or p.name in done:
        continue
    res = ocrmac.OCR(str(p), recognition_level='accurate').recognize()
    done[p.name] = '\n'.join(t for t, _, _ in res)
    out.write_text(json.dumps(done, indent=0))
print(len(done), 'files OCRed')
