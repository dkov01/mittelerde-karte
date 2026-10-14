"""Build a SINGLE-FILE offline demo (no module imports, no localhost server needed)."""
from pathlib import Path
import base64
p=Path(__file__).resolve().parent
source=p/'src'
layout=(p/'demo.template.html').read_text(encoding='utf-8')
data=(source/'reise-daten.js').read_text(encoding='utf-8').replace('export const ','const ')
component=(source/'mittelerde-karte.js').read_text(encoding='utf-8')
importline="import { PLACES, ROUTE_POINTS, STOPS, DISTANCE_ANCHORS, DEFAULT_TOTAL_KM } from './reise-daten.js';"
assert importline in component
component=component.replace(importline,'',1)
# import.meta is unavailable in classic single-file demo scripts. The offline demo
# explicitly passes INLINE_MAP_IMAGE, so this fallback is never requested.
module_url="new URL('./karte.jpg', import.meta.url).href"
assert module_url in component
component=component.replace(module_url,"'./karte.jpg'",1)
image="const INLINE_MAP_IMAGE = 'data:image/jpeg;base64," + base64.b64encode((p/'dist'/'karte.jpg').read_bytes()).decode('ascii') + "';"
assert '<script' not in data.lower() and '</script' not in component.lower()
layout=layout.replace('/* __INLINE_JOURNEY_DATA__ */',data)
layout=layout.replace('/* __INLINE_COMPONENT__ */',component)
layout=layout.replace('/* __INLINE_IMAGE__ */',image)
(p/'demo'/'demo.html').write_text(layout,encoding='utf-8')
print('Built standalone demo.html:',(p/'demo'/'demo.html').stat().st_size,'bytes')
