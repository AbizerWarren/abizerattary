"""Conservative local PDF extraction. Every imported record requires human review."""
import json, re, sys
import fitz

doc = fitz.open(sys.argv[1])
pages = [{"page": i + 1, "text": page.get_text()[:22000]} for i, page in enumerate(doc)]
text = '\n'.join(p['text'] for p in pages)
name = None
for p in pages:
    match = re.search(r'(?:^|\n)(?:FDW Name[^\n]*\n|(?:\d+\.\s*)?Name[ \t]*:[ \t]*)([^\n]+)', p['text'], re.I)
    if match and 2 < len(match[1].strip()) < 70:
        guess = match[1].strip()
        if not re.search(r'\d|:', guess) and not any(x in guess.lower() for x in ['signature', 'registration', 'date of birth', 'age:']):
            name = guess
            break
print(json.dumps({"name": name, "pages": pages, "scanned": sum(len(p['text']) for p in pages) < 150,
                  "notice": "Text extraction only. Staff must verify identity, experience and other fields against the PDF. Scanned documents need manual entry; OCR/AI extraction is not connected in this first cut."}))
