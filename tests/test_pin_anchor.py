"""Check that the PIN TIP, not the portrait center, coincides with the route coordinate."""
from pathlib import Path
from playwright.sync_api import sync_playwright
P=Path(__file__).resolve().parent.parent
with sync_playwright() as api:
    browser=api.chromium.launch(headless=True, executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':1450,'height':950})
    page.set_content((P/'demo'/'demo.html').read_text('utf-8'),wait_until='load')
    tested=[]
    for km in [0,25.5,737,1481,2106.6,2863,3000,5000,6103.989]:
        state=page.evaluate('''km => {
          values[0]=km;sync();
          const card=document.querySelector('mittelerde-karte');
          const svg=card.shadowRoot.querySelector('svg.map');
          const pin=card.shadowRoot.querySelector('.avatar');
          const path=pin.querySelector('.pin-shape');
          const point=path.getPointAtLength(path.getTotalLength());
          const svgPoint=svg.createSVGPoint();svgPoint.x=point.x;svgPoint.y=point.y;
          const pinTip=svgPoint.matrixTransform(path.getScreenCTM());
          const match=pin.getAttribute('transform').match(/translate\\(([^,]+),([^\\)]+)\\)/);
          const target=svg.createSVGPoint();target.x=+match[1];target.y=+match[2];const expected=target.matrixTransform(svg.getScreenCTM());
          return {x:pinTip.x,y:pinTip.y, expectedX:expected.x,expectedY:expected.y};
        }''',km)
        assert abs(state['x']-state['expectedX']) < .001, (km,state)
        assert abs(state['y']-state['expectedY']) < .001, (km,state)
        tested.append(km)
    assert page.locator('mittelerde-karte').locator('.avatar .pin-art').count()==3
    print('PASS nine positions: pin tip matches route coordinate at',tested)
    browser.close()
