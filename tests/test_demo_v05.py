from playwright.sync_api import sync_playwright
from pathlib import Path
import math
p=Path(__file__).resolve().parent.parent
with sync_playwright() as a:
 browser=a.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1450,'height':1000},device_scale_factor=1)
 errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((p/'demo'/'demo.html').read_text(),wait_until='load',timeout=60000)
 card=page.locator('mittelerde-karte')
 assert card.locator('svg.map').count()==1
 assert card.locator('.avatar').count()==3
 assert card.locator('.map image').first.get_attribute('href').startswith('data:image/jpeg;base64,')
 print('PASS initial map and 3 avatar pins',flush=True)
 page.screenshot(path=str(p/'preview-v06.png'),full_page=False,timeout=15000)
 card.locator('.menu-toggle').click(timeout=10000)
 assert card.locator('.drawer').is_visible()
 assert card.locator('.demo-range').count()==3
 print('PASS menu and sliders',flush=True)
 # Count stable during a slider motion and continue changing it without pointer interruptions.
 card.locator('.demo-range').first.fill('1330.5',timeout=10000)
 first=page.evaluate('''() => {const c=document.querySelector('mittelerde-karte');const r=c.shadowRoot;
  return {km:r.querySelector('.hud-text').textContent,position:r.querySelector('.avatar').getAttribute('transform'),slider:r.querySelector('.demo-range').value};}''')
 assert '330,5' in first['km'] and first['slider']=='1330.5',first
 card.locator('.demo-number').first.fill('2106.6')
 card.locator('.demo-number').first.dispatch_event('change')
 assert card.locator('.avatar').first.get_attribute('transform').startswith('translate(1756')
 print('PASS kilometer input moves pin to Amon Hen',flush=True)
 # Mode changes clamp display, do not overwrite stored km.
 card.locator('.demo-number').first.fill('5000')
 card.locator('.demo-number').first.dispatch_event('change')
 card.locator('.row-check').filter(has_text='Rückreise').locator('input').uncheck()
 limited=page.evaluate('''() => {const c=document.querySelector('mittelerde-karte');const s=c.shadowRoot;return {visible:s.querySelector('.avatar').getAttribute('transform'),max:c.activeTotalKm,stored:values[0]};}''')
 assert limited['visible']=='translate(2380,1256)' and limited['stored']==5000,limited
 card.locator('.row-check').filter(has_text='Rückreise').locator('input').check()
 assert card.locator('.avatar').first.get_attribute('transform')!='translate(2380,1256)'
 print('PASS mode preserves kilometers',flush=True)
 # Layers and people selection
 card.locator('.layers-list .row-check').filter(has_text='Weitere Orte').locator('input').check()
 assert card.locator('g[aria-label="Weitere Orte"]').get_attribute('style')!='display: none;'
 card.locator('.person-row').nth(1).locator('input[type=checkbox]').uncheck()
 assert card.locator('.avatar').count()==2
 print('PASS layer and person visibility',flush=True)
 page.screenshot(path=str(p/'menu-v06.png'),full_page=False,timeout=15000)
 card.locator('.drawer-head .btn').click()
 # Test actual HA person state dynamic names and portrait URL (without loading network).
 page.evaluate('''() => {let c=document.querySelector('mittelerde-karte');states['person.demo_alina'].attributes.friendly_name='Test Hobbit';states['person.demo_alina'].attributes.entity_picture='/local/test-portrait.png';c.hass={states};}''')
 assert card.locator('.hud-title').text_content()=='Test Hobbit'
 assert card.locator('.avatar').first.locator('image').count()==1
 print('PASS HA person name and profile image',flush=True)
 # Config editor selects persons + assigns distance entity.
 editor=page.evaluate('''() => {const e=MittelerdeKarte.getConfigElement();document.body.append(e);e.setConfig({personen:[]});e.hass={states};return e.tagName;}''')
 assert editor=='MITTELERDE-KARTE-EDITOR'
 ed=page.locator('mittelerde-karte-editor')
 assert ed.locator('.group').count()==3
 ed.locator('.group').first.locator('input[type=checkbox]').check()
 assert ed.locator('.group').first.locator('select').count()==2
 ed.locator('.group').first.locator('select').first.select_option('sensor.demo_1')
 configured=page.evaluate("() => document.querySelector('mittelerde-karte-editor')._config.personen")
 assert configured[0]['person_entity']=='person.demo_alina' and configured[0]['entity']=='sensor.demo_1',configured
 print('PASS visual person editor',flush=True)
 assert not errors,errors
 print('ALL TESTS PASSED',flush=True)
 browser.close()
