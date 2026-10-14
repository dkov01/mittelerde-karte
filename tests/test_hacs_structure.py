"""Validate the distribution layout and relative asset URLs used for a HACS dashboard repository."""
from pathlib import Path
import json
import subprocess
P=Path(__file__).resolve().parent.parent
hacs=json.loads((P/'hacs.json').read_text())
assert hacs['filename']=='mittelerde-karte.js'
assert (P/'dist'/hacs['filename']).is_file()
assert (P/'dist'/'karte.jpg').is_file()
assert (P/'dist'/'reise-daten.js').is_file()
card=(P/'dist'/hacs['filename']).read_text()
assert "from './reise-daten.js'" in card
assert "new URL('./karte.jpg', import.meta.url).href" in card
assert "'/local/mittelerde/karte.jpg'" not in card
assert "class:'pin-art',transform:'translate(0,-42)'" in card
for filename in ('mittelerde-karte.js','reise-daten.js'):
    result=subprocess.run(['node','--check',str(P/'dist'/filename)],capture_output=True,text=True)
    assert result.returncode==0,(filename,result.stderr)
assert (P/'src'/'mittelerde-karte.js').read_bytes() == (P/'dist'/'mittelerde-karte.js').read_bytes()
assert (P/'src'/'reise-daten.js').read_bytes() == (P/'dist'/'reise-daten.js').read_bytes()
url_test=subprocess.run(['node','-e',"console.log(new URL('./karte.jpg','https://example.test/hacsfiles/mittelerde-karte/mittelerde-karte.js?hacstag=xyz').href)"],capture_output=True,text=True)
assert url_test.stdout.strip()=='https://example.test/hacsfiles/mittelerde-karte/karte.jpg'
print('PASS HACS dist structure, ESM imports, relative JPG URI and JS syntax')
