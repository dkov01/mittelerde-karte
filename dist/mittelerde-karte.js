import { PLACES, ROUTE_POINTS, STOPS, DISTANCE_ANCHORS, DEFAULT_TOTAL_KM } from './reise-daten.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SOURCE = 'https://mapmiddleearth.com/de';
const COPYRIGHT = 'Kartengrafik: mapmiddleearth.com · CC BY-NC 4.0';
// Relative module asset URL also works with HACS cache-busting (?hacstag=...).
const DEFAULT_MAP_URL = new URL('./karte.jpg', import.meta.url).href;
const ROUTE_CUMULATIVE = [0];
for (let i = 1; i < ROUTE_POINTS.length; i++) {
  const a = ROUTE_POINTS[i - 1], b = ROUTE_POINTS[i];
  ROUTE_CUMULATIVE.push(ROUTE_CUMULATIVE[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
}
const ROUTE_LENGTH = ROUTE_CUMULATIVE.at(-1);
const DOOM_ANCHOR = DISTANCE_ANCHORS.find(a => a.id === 'mount-doom');
const IMPORTANT_STOPS = new Set(['hobbiton','bree','rivendell','moria','caras-galadhon','amon-hen','black-gate','mount-doom','minas-tirith-return','edoras-return','isengard-return','rivendell-return','hobbiton-return','grey-havens']);
const MARKER_PATHS = {
  house:'M3 10 12 3 21 10 M5 9 V21 H19 V9 M10 21 V14 H14 V21',
  castle:'M3 21 V9 H6 V5 H9 V9 H15 V5 H18 V9 H21 V21 Z M9 21 V15 H15 V21 M3 9 H21',
  mountain:'M2 20 L9 5 L16 20 Z M10 20 L15 10 L22 20 Z',
  forest:'M12 2 L4 13 H8 L5 18 H19 L16 13 H20 Z M12 18 V22',
  water:'M2 8 C5 5 8 11 12 8 S19 5 22 8 M2 15 C5 12 8 18 12 15 S19 12 22 15',
  fire:'M12 22 C4 18 5 12 10 7 C11 11 14 10 15 2 C22 9 23 17 12 22 Z M12 20 C8 17 11 15 12 12 C16 15 16 18 12 20 Z',
  harbor:'M12 2 V19 M8 7 H16 M4 16 C4 22 20 22 20 16 M8 14 L12 18 L16 14',
  gate:'M4 21 V7 Q12 0 20 7 V21 M9 21 V12 H15 V21 M4 9 H20',
  star:'M12 2 L14.5 9.5 L22 12 L14.5 14.5 L12 22 L9.5 14.5 L2 12 L9.5 9.5 Z'
};
function appendMarkerIcon(group,type,kind) {
  group.append(svgEl('circle',{class:'marker-bg',r:kind==='stop'?17:14}));
  const glyph=svgEl('g',{class:'marker-symbol',transform:'translate(-12,-12)'});
  glyph.append(svgEl('path',{d:MARKER_PATHS[type]||MARKER_PATHS.house}));
  group.append(glyph);
}

const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

function svgEl(tag, attrs = {}, text = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, val] of Object.entries(attrs)) el.setAttribute(key, String(val));
  if (text !== null) el.textContent = text;
  return el;
}
function routeAt(fraction) {
  const target = clamp(fraction, 0, 1) * ROUTE_LENGTH;
  let i = 1;
  while (i < ROUTE_CUMULATIVE.length && ROUTE_CUMULATIVE[i] < target) i++;
  if (i === ROUTE_CUMULATIVE.length) i--;
  const a = ROUTE_POINTS[i-1], b = ROUTE_POINTS[i];
  const segment = ROUTE_CUMULATIVE[i] - ROUTE_CUMULATIVE[i-1];
  const t = segment ? (target - ROUTE_CUMULATIVE[i-1]) / segment : 0;
  return { x: a.x + t*(b.x-a.x), y: a.y + t*(b.y-a.y), index: i };
}
function routeUntil(fraction) {
  const pos = routeAt(fraction);
  const points = ROUTE_POINTS.slice(0, pos.index).map(p => `${p.x},${p.y}`);
  points.push(`${pos.x},${pos.y}`);
  return points.join(' ');
}
function toKilometers(state, config) {
  if (!state || state.state === 'unavailable' || state.state === 'unknown') return null;
  const num = Number(state.state);
  if (!Number.isFinite(num)) return null;
  const unit = String(config.unit || state.attributes?.unit_of_measurement || 'km').toLowerCase().trim();
  if (['km', 'kilometer', 'kilometre'].includes(unit)) return num;
  if (['m', 'meter', 'metre'].includes(unit)) return num / 1000;
  if (['mi', 'mile', 'miles'].includes(unit)) return num * 1.609344;
  return null; // Steps and other non-distance units are not acceptable.
}
function textEl(tag, className, value) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = value;
  return el;
}

class MittelerdeKarte extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._people = [];
    this._selected = 0;
    this._includeReturn = true;
    this._layers = {background:true,route:true,progress:true,stops:true,places:false,labels:true,avatars:true};
    this._view = { x: 260, y: 300, w: 2350, h: 1330 };
    this._pointers = new Map();
    this._pinchDistance = null;
    this._editing = false;
    this._visiblePeople = new Set();
    this._userChangedVisibility = false;
    this._menuOpen = false;
  }
  setConfig(config) {
    if (!config) throw new Error('mittelerde-karte: Konfiguration fehlt.');
    this._config = config;
    this._people = Array.isArray(config.personen) ? config.personen : [];
    this._visiblePeople=new Set(this._people.map((_,i)=>i));
    this._userChangedVisibility=false;
    this._totalKm = Number(config.gesamt_km) > 0 ? Number(config.gesamt_km) : DEFAULT_TOTAL_KM;
    this._outboundKm = DOOM_ANCHOR.km * this._totalKm / DEFAULT_TOTAL_KM;
    this._includeReturn = config.rueckreise !== false;
    this._activeTotalKm = this._includeReturn ? this._totalKm : this._outboundKm;
    if (config.ebenen && typeof config.ebenen === 'object') {
      for(const [k,v] of Object.entries(config.ebenen))if(k in this._layers)this._layers[k]=Boolean(v);
    }
    this._selected = 0;
    this._calibration = this._prepareCalibration(config.stationen_km || {});
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    if (this._map) this._update();
  }
  get includeReturn(){return this._includeReturn;}
  get visibleLayers(){return {...this._layers};}
  get activeTotalKm(){return this._activeTotalKm;}
  setJourneyMode(yes) {
    this._includeReturn=Boolean(yes);
    this._activeTotalKm=this._includeReturn?this._totalKm:this._outboundKm;
    if(this._modeInput)this._modeInput.checked=this._includeReturn;
    if(this._map){this._applyLayers();this._update();}
    this.dispatchEvent(new CustomEvent('journey-mode-change',{detail:{includeReturn:this._includeReturn,totalKm:this._activeTotalKm}}));
  }
  setLayer(name,visible) {
    if(!(name in this._layers))throw new Error(`Unbekannte Kartenebene: ${name}`);
    this._layers[name]=Boolean(visible);
    if(this._map)this._applyLayers();
    this.dispatchEvent(new CustomEvent('layer-visibility-change',{detail:{name,visible:this._layers[name]}}));
  }

  _personInfo(p,i){
    const state=p.person_entity?this._hass?.states?.[p.person_entity]:null;
    const name=state?.attributes?.friendly_name || p.name || (p.person_entity?p.person_entity.split('.')[1]:`Person ${i+1}`);
    const candidate=state?.attributes?.entity_picture || p.avatar || '';
    const avatar=typeof candidate==='string' && (/^\/(?!\/)/.test(candidate) || /^https?:\/\//i.test(candidate) || /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(candidate)) ? candidate : '';
    return {name,avatar};
  }
  _initials(name){
    const words=String(name).trim().split(/\s+/);
    return words.length>1?(words[0][0]+words.at(-1)[0]).toUpperCase():String(name).slice(0,2).toUpperCase();
  }
  _toggleMenu(open){
    this._menuOpen=Boolean(open);
    if(!this._drawer)return;
    this._drawer.hidden=!this._menuOpen;
    this._scrim.hidden=!this._menuOpen;
    this._menuButton.setAttribute('aria-expanded',String(this._menuOpen));
  }

  _applyLayers(){
    if(!this._map)return;
    this._backgroundImage.style.display=this._layers.background?'':'none';
    for(const [phase,g] of Object.entries(this._routeGroups)) {
      g.style.display=this._layers.route && (['outbound','anduin','outbound-rest'].includes(phase)||this._includeReturn)?'':'none';
    }
    this._progressPolyline.style.display=this._layers.progress?'':'none';
    this._avatarGroup.style.display=this._layers.avatars?'':'none';
    this._poiGroup.style.display=this._layers.places?'':'none';
    this._stopMarkers.style.display=this._layers.stops?'':'none';
    const last=this._includeReturn ? ROUTE_POINTS.length-1 : DOOM_ANCHOR.pathIndex;
    this._stopMarkers.querySelectorAll('.stop').forEach(g=>{g.style.display=Number(g.dataset.pathIndex)<=last?'':'none';});
    this._map.classList.toggle('labels-hidden',!this._layers.labels);
    if(this._modeInput)this._modeInput.checked=this._includeReturn;
  }
  // Verified long-stage distance anchors (Eowyn Challenge) with explicitly provisional
  // 150+100 km segments for Frodo's rescue and journey to Minas Tirith.
  // Individual unknown intermediate stops use proportional *path interpolation*, not invented measurements.
  _prepareCalibration(overrides) {
    const multiplier = this._totalKm / DEFAULT_TOTAL_KM;
    const anchors = DISTANCE_ANCHORS.map(a => ({km:a.km * multiplier,px:ROUTE_CUMULATIVE[a.pathIndex]}));
    for (const [id,value] of Object.entries(overrides)) {
      const stop=STOPS.find(s=>s.id===id);
      if(!stop) throw new Error(`Unbekannte Station in stationen_km: ${id}`);
      const km=Number(value);
      if(!Number.isFinite(km) || km<0 || km>this._totalKm)throw new Error(`Ungültiger Kilometerwert für Station ${id}`);
      const px=ROUTE_CUMULATIVE[stop.pathIndex];
      const existing=anchors.find(a=>a.px===px);
      if(existing)existing.km=km;
      else anchors.push({km,px});
    }
    anchors.sort((a,b)=>a.px-b.px);
    for(let i=1;i<anchors.length;i++) {
      if(anchors[i].km<=anchors[i-1].km)throw new Error('Kilometeranker müssen entlang des Weges streng ansteigen.');
    }
    return anchors;
  }
  _positionFraction(km) {
    const amount = clamp(km, 0, this._totalKm);
    const anchors = this._calibration;
    let i = 1;
    while (i < anchors.length - 1 && anchors[i].km < amount) i++;
    const a = anchors[i-1], b = anchors[i];
    return (a.px + (amount - a.km) / (b.km - a.km) * (b.px - a.px)) / ROUTE_LENGTH;
  }
  getCardSize() { return 8; }
  static getStubConfig() {
    return { gesamt_km: DEFAULT_TOTAL_KM, rueckreise:true, personen:[] };
  }
  static getConfigElement(){return document.createElement('mittelerde-karte-editor');}
  _render() {
    const s = this.shadowRoot;
    s.replaceChildren();
    const style = document.createElement('style');
    style.textContent = `
      :host{display:block;color:var(--primary-text-color,#332919);font-family:system-ui,sans-serif}
      ha-card{display:block;overflow:hidden;background:#dfc99f;border-radius:var(--ha-card-border-radius,14px);position:relative}
      .top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 13px;background:#263a32;color:#f5e8c8}
      h2{font:700 18px Georgia,serif;margin:0}.top-sub{font-size:11px;color:#d3c49d}
      .actions{display:flex;gap:6px;align-items:center}.btn{border:1px solid #a38a5d;border-radius:8px;background:#f4e3bf;color:#44321f;padding:7px 10px;font:700 13px system-ui;cursor:pointer}
      .btn:hover{background:#fff0cd}.btn:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #4f94cb;outline-offset:2px}
      .menu-toggle{font-size:14px;background:#b98b4f;color:#211b17;border-color:#e8c48a;white-space:nowrap}
      .map-wrap{position:relative;background:#d6bc8d}
      svg.map{display:block;width:100%;height:clamp(360px,57vw,710px);touch-action:none;user-select:none;cursor:grab}
      svg.map.dragging{cursor:grabbing}
      .route{fill:none;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;opacity:.88;pointer-events:none}
      .route-hin{stroke:#704934;stroke-dasharray:10 7}.route-boot{stroke:#236583;stroke-dasharray:3 7;stroke-width:6}.route-nach{stroke:#58778a;stroke-dasharray:6 6}.route-heim{stroke:#496c4b;stroke-dasharray:10 7}.route-ende{stroke:#795884;stroke-dasharray:5 7}
      .progress{fill:none;stroke:#c65829;stroke-width:6;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke;pointer-events:none}
      .stop .marker-bg{fill:#f7e5c1;stroke:#72502f;stroke-width:2.7;vector-effect:non-scaling-stroke}
      .stop:hover .marker-bg,.stop.active .marker-bg{fill:#ffd28e;stroke:#4e2812}.place .marker-bg{fill:#e9f1e6;stroke:#496852;stroke-width:2.1;vector-effect:non-scaling-stroke}.place:hover .marker-bg{fill:#b9dfcc}
      .marker-symbol{fill:none;stroke:#553923;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}.place .marker-symbol{stroke:#265647;stroke-width:2.35}
      .stop.phase-abschied .marker-bg{stroke:#785285}.stop.phase-rueckreise .marker-bg{stroke:#507357}.stop.phase-nachspiel .marker-bg{stroke:#507588}
      .stop,.place,.avatar{cursor:pointer}.marker-label{font:700 21px Georgia,serif;fill:#392516;stroke:#f8e5bf;stroke-width:3.6px;paint-order:stroke;stroke-linejoin:round;pointer-events:none}.labels-hidden .marker-label{display:none}
      .avatar{filter:drop-shadow(0 5px 4px #30231899)}.avatar .pin-shape{stroke:#fff4d5;stroke-width:3;vector-effect:non-scaling-stroke}.avatar .portrait-frame{stroke:#e4c993;stroke-width:3;fill:#ead0a0}.avatar .portrait-text{font:800 18px Georgia,serif;fill:#ffefcf;text-anchor:middle;dominant-baseline:central;paint-order:stroke;stroke:#4e392e;stroke-width:1;pointer-events:none}
      .avatar .pin-name{fill:#fff0c9;stroke:#563c24;stroke-width:2;paint-order:stroke;font:700 20px Georgia,serif;text-anchor:middle;pointer-events:none}
      .hud{position:absolute;bottom:12px;left:12px;z-index:3;background:#24372fe8;border:1px solid #c6a777aa;color:#f7e8ca;border-radius:10px;padding:10px 13px;box-shadow:0 5px 18px #0004;min-width:180px;max-width:min(350px,calc(100% - 25px));pointer-events:none}
      .hud-title{font:700 15px Georgia,serif}.hud-text{font-size:12px;color:#e8d4b6;margin-top:4px}.bar{height:5px;background:#7c7765;border-radius:10px;margin-top:7px;overflow:hidden}.bar-inner{height:100%;background:#d8a260;width:0}
      .popover{position:absolute;bottom:12px;right:12px;z-index:4;background:#f7edcf;color:#42311d;padding:12px 36px 12px 13px;border:2px solid #b3915c;border-radius:10px;max-width:330px;box-shadow:0 7px 25px #0006;line-height:1.5;font-size:13px}
      .popover[hidden]{display:none}.popover strong{display:block;font:700 16px Georgia,serif}.popover button{position:absolute;top:5px;right:6px;cursor:pointer;border:0;background:transparent;font-size:22px;color:#4c3521}
      .scrim{position:absolute;inset:0;z-index:5;background:#0006}.scrim[hidden]{display:none}
      .drawer{position:absolute;z-index:6;top:0;right:0;bottom:0;width:min(375px,95%);overflow:auto;background:#263730;color:#f1dfbc;box-shadow:-7px 0 22px #1a140a6b;padding:17px 17px 22px;box-sizing:border-box}
      .drawer[hidden]{display:none}.drawer h3{font:700 19px Georgia,serif;margin:0}.drawer-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
      .drawer h4{margin:19px 0 9px;font:700 15px Georgia,serif;color:#f9e9c6;border-bottom:1px solid #8b805a;padding-bottom:7px}
      .drawer small,.hint{font-size:11px;color:#c6bba3;line-height:1.5}
      .row-check{display:flex;align-items:flex-start;gap:10px;font-size:13px;line-height:1.5;margin:9px 0;cursor:pointer}.row-check input{accent-color:#c99a59;width:16px;height:16px;flex-shrink:0}
      .layers-list{display:grid;grid-template-columns:1fr 1fr;gap:4px 8px}.layers-list .row-check{font-size:12px;margin:5px 0}
      .person-row{margin:9px 0;padding:10px;border:1px solid #71806c;border-radius:9px;background:#32473e}
      .person-heading{display:flex;align-items:center;justify-content:space-between;gap:7px}.person-heading label{display:flex;align-items:center;gap:8px;font-weight:700;cursor:pointer;font-size:13px}
      .mini-avatar{width:29px;height:29px;border-radius:50%;border:2px solid #e4cca0;background:#916a42;color:#fff3da;display:grid;place-items:center;font:700 12px Georgia,serif;overflow:hidden}.mini-avatar img{width:100%;height:100%;object-fit:cover}
      .km-caption{font-size:11px;color:#e6d2ad;margin-top:5px}.range{width:100%;accent-color:#c99a59;cursor:pointer}.number{width:104px;padding:6px;border:1px solid #9b8969;border-radius:6px;background:#f7eccf;color:#3d2b1f;font:inherit;font-size:13px}
      .manual-edit{margin-top:9px;display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-size:12px}.manual-edit[hidden]{display:none}.manual-edit .message{font-size:11px;line-height:1.45;color:#f8c589;width:100%}
      .credits{font-size:10px;padding:5px 11px;background:#263a32;color:#d6c69f}.credits a{color:inherit}
      @media(max-width:600px){.top{padding:8px}.top h2{font-size:15px}.btn{padding:6px 8px}.top-sub{font-size:10px}svg.map{height:500px}.hud{bottom:8px;left:8px}}
    `;
    s.append(style);
    const card = document.createElement('ha-card');
    const header=document.createElement('div');header.className='top';
    const heading=document.createElement('div');heading.append(textEl('h2','',this._config.titel||'Auf Frodos Spuren'));
    this._subtitle=textEl('div','top-sub','Frodos Reise durch Mittelerde');heading.append(this._subtitle);
    const actions=document.createElement('div');actions.className='actions';
    for(const [caption,title,handler] of [['−','Herauszoomen',()=>this._zoom(1.25)],['+','Hineinzoomen',()=>this._zoom(.8)],['⛶','Karte zurücksetzen',()=>{this._view={x:260,y:300,w:2350,h:1330};this._setView();}]]){
      const button=textEl('button','btn',caption);button.title=title;button.type='button';button.addEventListener('click',handler);actions.append(button);
    }
    this._menuButton=textEl('button','btn menu-toggle','☰ Menü');this._menuButton.type='button';this._menuButton.setAttribute('aria-expanded','false');
    this._menuButton.addEventListener('click',()=>this._toggleMenu(!this._menuOpen));actions.append(this._menuButton);
    header.append(heading,actions);card.append(header);
    const wrap=document.createElement('div');wrap.className='map-wrap';
    const svg=svgEl('svg',{class:'map',viewBox:'260 300 2350 1330',preserveAspectRatio:'xMidYMid meet',role:'img','aria-label':'Interaktive Karte von Frodos Reise'});
    const img=svgEl('image',{href:this._config.karte || DEFAULT_MAP_URL,x:0,y:0,width:3072,height:2048});
    svg.append(img);this._backgroundImage=img;
    img.addEventListener('error', () => {
      if (this._imageError) return;
      this._imageError = textEl('div','image-error','Das Kartenbild konnte nicht geladen werden. Prüfe den Pfad zur Datei „karte.jpg“.');
      this._imageError.style.cssText='position:absolute;top:10px;left:10px;right:10px;padding:12px;background:#fff8df;color:#752b22;border-radius:6px;border:2px solid #aa5643;font-weight:700';
      wrap.append(this._imageError);
    });
    const milestone=id=>STOPS.find(s=>s.id===id).pathIndex;
    this._routeGroups={};
    const drawSection=(start,end,className,phase)=>{
      const g=svgEl('polyline',{class:`route ${className}`,points:ROUTE_POINTS.slice(start,end+1).map(p=>`${p.x},${p.y}`).join(' ')});
      svg.append(g);this._routeGroups[phase]=g;
    };
    drawSection(0,milestone('caras-galadhon'),'route-hin','outbound');
    drawSection(milestone('caras-galadhon'),milestone('argonath'),'route-boot','anduin');
    drawSection(milestone('argonath'),milestone('mount-doom'),'route-hin','outbound-rest');
    drawSection(milestone('mount-doom'),milestone('minas-tirith-return'),'route-nach','rescue');
    drawSection(milestone('minas-tirith-return'),milestone('hobbiton-return'),'route-heim','return');
    drawSection(milestone('hobbiton-return'),ROUTE_POINTS.length-1,'route-ende','farewell');
    this._progressPolyline=svgEl('polyline',{class:'progress'}); svg.append(this._progressPolyline);
    this._poiGroup=svgEl('g',{'aria-label':'Weitere Orte'});
    const overlapsStop=place=>STOPS.some(stop=>Math.hypot(place.x-stop.x,place.y-stop.y)<16);
    for (const place of PLACES) {
      if(overlapsStop(place))continue;
      const g=svgEl('g',{class:'place',transform:`translate(${place.x},${place.y})`,role:'button',tabindex:'0'});
      appendMarkerIcon(g,place.markerType,'place');
      g.append(svgEl('title',{},place.name));
      if(place.tier==='t1'||place.id==='grey-havens')g.append(svgEl('text',{class:'marker-label',x:22,y:6},place.name));
      const onSelect=(e)=>{e.stopPropagation();this._choosePlace(place.name,place.x,place.y);};
      g.addEventListener('click',onSelect);g.addEventListener('keydown',e=>{if(e.key==='Enter')onSelect(e);});
      this._poiGroup.append(g);
    }
    svg.append(this._poiGroup);
    this._stopMarkers=svgEl('g',{'aria-label':'Stationen'});
    for (const stop of STOPS) {
      const g=svgEl('g',{class:`stop phase-${stop.phase}`,transform:`translate(${stop.x},${stop.y})`,role:'button',tabindex:'0'});
      g.dataset.pathIndex=String(stop.pathIndex);
      appendMarkerIcon(g,stop.markerType,'stop');
      if(IMPORTANT_STOPS.has(stop.id))g.append(svgEl('text',{class:'marker-label',x:24,y:6},stop.name));
      g.append(svgEl('title',{},`${stop.name} · ${stop.description}`));
      const onSelect=(e)=>{e.stopPropagation();this._chooseStop(stop);};
      g.addEventListener('click',onSelect);g.addEventListener('keydown',e=>{if(e.key==='Enter')onSelect(e);});
      this._stopMarkers.append(g);
    }
    svg.append(this._stopMarkers);
    this._avatarGroup=svgEl('g',{'aria-label':'Haushaltsmitglieder'});svg.append(this._avatarGroup);
    wrap.append(svg);
    this._map=svg;
    this._configureGestures();

    this._hud=document.createElement('div');this._hud.className='hud';this._hud.setAttribute('aria-live','polite');
    this._hudTitle=textEl('div','hud-title','');this._hudText=textEl('div','hud-text','');
    const progressBar=document.createElement('div');progressBar.className='bar';this._barInner=document.createElement('div');this._barInner.className='bar-inner';progressBar.append(this._barInner);
    this._hud.append(this._hudTitle,this._hudText,progressBar);wrap.append(this._hud);
    this._popup=document.createElement('div');this._popup.className='popover';this._popup.hidden=true;
    const closePopup=textEl('button','','×');closePopup.type='button';closePopup.title='Beschreibung schließen';closePopup.addEventListener('click',()=>{this._popup.hidden=true;});
    this._detail=document.createElement('div');this._popup.append(closePopup,this._detail);wrap.append(this._popup);
    this._scrim=document.createElement('div');this._scrim.className='scrim';this._scrim.hidden=true;this._scrim.addEventListener('click',()=>this._toggleMenu(false));wrap.append(this._scrim);
    this._drawer=document.createElement('aside');this._drawer.className='drawer';this._drawer.hidden=true;
    this._drawer.setAttribute('aria-label','Einstellungen zur Mittelerde-Karte');
    const drawerHead=document.createElement('div');drawerHead.className='drawer-head';drawerHead.append(textEl('h3','','Kartenmenü'));
    const closeMenu=textEl('button','btn','Schließen ×');closeMenu.type='button';closeMenu.addEventListener('click',()=>this._toggleMenu(false));drawerHead.append(closeMenu);this._drawer.append(drawerHead);
    this._drawer.append(textEl('h4','','Reiseumfang'));
    const mode=document.createElement('label');mode.className='row-check';this._modeInput=document.createElement('input');this._modeInput.type='checkbox';this._modeInput.checked=this._includeReturn;
    this._modeInput.addEventListener('change',()=>this.setJourneyMode(this._modeInput.checked));mode.append(this._modeInput,document.createTextNode('Rückreise und Graue Anfurten einbeziehen'));this._drawer.append(mode);
    this._drawer.append(textEl('h4','','Kartenebenen'));
    const layersList=document.createElement('div');layersList.className='layers-list';
    const layerLabels={background:'Kartenbild',route:'Reisewege',progress:'Zurückgelegter Weg',stops:'Reisestationen',places:'Weitere Orte',labels:'Ortsnamen',avatars:'Personen-Pins'};
    for(const [key,label] of Object.entries(layerLabels)){
      const row=document.createElement('label');row.className='row-check';const input=document.createElement('input');input.type='checkbox';input.checked=this._layers[key];
      input.addEventListener('change',()=>this.setLayer(key,input.checked));row.append(input,document.createTextNode(label));layersList.append(row);
    }
    this._drawer.append(layersList,textEl('h4','','Haushaltsmitglieder'));
    this._peopleContainer=document.createElement('div');this._drawer.append(this._peopleContainer);
    this._drawer.append(textEl('small','','In Home Assistant werden Namen und Profilbilder automatisch von den ausgewählten Personen übernommen. Personen und Kilometerquellen ordnest du im Dashboard-Karteneditor zu.'));
    this._manualEdit=document.createElement('div');this._manualEdit.className='manual-edit';
    const editLabel=textEl('label','','Kilometerstand korrigieren');this._manualInput=document.createElement('input');this._manualInput.type='number';this._manualInput.step='0.1';this._manualInput.min='0';
    const saveBtn=textEl('button','btn','Speichern');saveBtn.type='button';saveBtn.addEventListener('click',()=>this._saveManual());
    this._manualInput.addEventListener('keydown',e=>{if(e.key==='Enter')this._saveManual();});
    this._editMessage=textEl('span','message','');this._editMessage.setAttribute('role','status');
    this._manualEdit.append(editLabel,this._manualInput,textEl('span','','km'),saveBtn,this._editMessage);this._drawer.append(this._manualEdit);
    wrap.append(this._drawer);
    this.shadowRoot.addEventListener('keydown',e=>{if(e.key==='Escape'){this._toggleMenu(false);this._popup.hidden=true;}});
    card.append(wrap);
    const attribution=document.createElement('div');attribution.className='credits';
    attribution.append(document.createTextNode(COPYRIGHT+' · '));
    const a=document.createElement('a');a.href=SOURCE;a.target='_blank';a.rel='noopener noreferrer';a.textContent='Quelle';attribution.append(a);
    attribution.append(document.createTextNode(' · Home-Assistant-Reisekarte'));
    card.append(attribution);s.append(card);
    this._applyLayers();
    this._update();
  }
  _distance(person) {
    // sensor = automatically accumulated kilometers, correction = persistent manual adjustment.
    // The correction is stored in a separate input_number helper, never written to Health Connect.
    const raw = this._hass?.states?.[person.entity];
    const base = toKilometers(raw, person);
    // A value helper may be used directly as the source OR as a correction,
    // but adding it to itself would double the distance.
    const distinctCorrection = person.korrektur_entity && person.korrektur_entity !== person.entity;
    const correction = distinctCorrection ?
      toKilometers(this._hass?.states?.[person.korrektur_entity], {unit:'km'}) : null;
    const demo = Number.isFinite(Number(person.demo_km)) ? Number(person.demo_km) : null;
    if (base===null && correction===null) return raw ? null : demo;
    return Math.max(0, (base??0) + (correction??0) + (Number(person.start_offset_km)||0));
  }
  async _saveManual() {
    const person=this._people[this._selected];
    const text=this._manualInput.value.trim().replace(',','.');
    const target=Number(text);
    if (!text || !Number.isFinite(target) || target<0) {
      this._editMessage.textContent='Bitte einen gültigen, nicht negativen Kilometerstand eingeben.';
      return;
    }
    const distinctCorrection = person.korrektur_entity && person.korrektur_entity !== person.entity;
    const helper=distinctCorrection ? person.korrektur_entity : (person.entity?.startsWith('input_number.') ? person.entity : null);
    if(!helper || !this._hass?.callService) {
      this._editMessage.textContent='Kein beschreibbarer Home-Assistant-Zahlhelfer konfiguriert.';
      return;
    }
    let value=target;
    if (distinctCorrection) {
      const base=toKilometers(this._hass?.states?.[person.entity], person) ?? 0;
      value=target-base-(Number(person.start_offset_km)||0);
    } else {
      const rawUnit=String(person.unit || this._hass?.states?.[person.entity]?.attributes?.unit_of_measurement || 'km').toLowerCase();
      if(rawUnit==='m') value=target*1000;
      else if (['mi','mile','miles'].includes(rawUnit)) value=target/1.609344;
      value-=Number(person.start_offset_km)||0;
    }
    try {
      await this._hass.callService('input_number','set_value',{entity_id:helper,value:Math.round(value*1000)/1000});
      this._editMessage.textContent='Korrektur gespeichert. Warte auf die Aktualisierung von Home Assistant.';
    } catch(error) {
      this._editMessage.textContent=`Speichern fehlgeschlagen: ${error?.message||error}`;
    }
  }
  _update() {
    if(!this._map)return;
    this._avatarGroup.replaceChildren();
    const focused=this.shadowRoot.activeElement;
    const preserveSlider=Boolean(this._config.demo_mode && focused && this._peopleContainer.contains(focused) && (focused.classList.contains('demo-range')||focused.classList.contains('demo-number')));
    if(!preserveSlider)this._peopleContainer.replaceChildren();
    if(this._selected>=this._people.length) this._selected=0;
    const selected=this._people[this._selected];
    let selectedDistance=null;
    let selectedName='';
    this._people.forEach((p,i)=>{
      const {name,avatar}=this._personInfo(p,i);
      const km=this._distance(p);
      const color=/^#[0-9a-fA-F]{3,8}$/.test(p.farbe||'')?p.farbe:['#9b5436','#346e73','#795e96','#96733b'][i%4];
      const initials=this._initials(name);
      const visibleKm=km===null?null:Math.min(km,this._activeTotalKm);
      if(km!==null && this._visiblePeople.has(i)){
        const pos=routeAt(this._positionFraction(visibleKm));
        const group=svgEl('g',{class:'avatar',transform:`translate(${pos.x},${pos.y})`,role:'button',tabindex:'0'});
        const artwork=svgEl('g',{class:'pin-art',transform:'translate(0,-42)'});
        group.append(artwork);
        artwork.append(svgEl('path',{class:'pin-shape',fill:color,d:'M0 42 C-9 28 -30 4 -30 -16 A30 30 0 1 1 30 -16 C30 4 9 28 0 42Z'}));
        artwork.append(svgEl('circle',{class:'portrait-frame',cx:0,cy:-16,r:23}));
        if(avatar){
          const clipId=`avatar-portrait-${i}`;
          const defs=svgEl('defs');const clip=svgEl('clipPath',{id:clipId});clip.append(svgEl('circle',{cx:0,cy:-16,r:21}));defs.append(clip);artwork.append(defs);
          artwork.append(svgEl('image',{href:avatar,x:-21,y:-37,width:42,height:42,'clip-path':`url(#${clipId})`,'preserveAspectRatio':'xMidYMid slice'}));
        }else artwork.append(svgEl('text',{class:'portrait-text',x:0,y:-15},initials));
        if(i===this._selected)artwork.append(svgEl('text',{class:'pin-name',x:0,y:-55},name));
        group.append(svgEl('title',{},`${name}: ${km.toLocaleString('de-AT',{maximumFractionDigits:1})} km`));
        const choose=e=>{e.stopPropagation();this._selected=i;this._popup.hidden=true;this._update();};
        group.addEventListener('click',choose);group.addEventListener('keydown',e=>{if(e.key==='Enter')choose(e);});
        this._avatarGroup.append(group);
      }
      if(preserveSlider){
        const existing=this._peopleContainer.querySelector(`[data-person-index=\"${i}\"]`);
        if(existing){
          const caption=existing.querySelector('.km-caption');
          if(caption)caption.textContent=km===null?'Noch keine Kilometerquelle eingerichtet':`${km.toLocaleString('de-AT',{maximumFractionDigits:1})} km zurückgelegt`;
          const num=existing.querySelector('.demo-number');const rng=existing.querySelector('.demo-range');
          if(num&&num!==focused)num.value=String(Math.round(Math.min(km??0,this._activeTotalKm)*10)/10);
          if(rng&&rng!==focused)rng.value=String(Math.min(km??0,this._activeTotalKm));
        }
        if(i===this._selected){selectedDistance=km;selectedName=name;}
        return;
      }
      const item=document.createElement('div');item.className='person-row';item.dataset.personIndex=String(i);
      const header=document.createElement('div');header.className='person-heading';
      const label=document.createElement('label');const toggle=document.createElement('input');toggle.type='checkbox';toggle.checked=this._visiblePeople.has(i);
      toggle.addEventListener('change',()=>{if(toggle.checked)this._visiblePeople.add(i);else this._visiblePeople.delete(i);this._userChangedVisibility=true;this._update();this.dispatchEvent(new CustomEvent('person-visibility-change',{detail:{visible:[...this._visiblePeople]}}));});
      const portrait=textEl('span','mini-avatar',avatar?'':initials);if(avatar){const img=document.createElement('img');img.src=avatar;img.alt='';portrait.append(img);}
      label.append(toggle,portrait,document.createTextNode(name));header.append(label);
      const chooseBtn=textEl('button','btn',this._selected===i?'Ausgewählt':'Auswählen');chooseBtn.type='button';chooseBtn.addEventListener('click',()=>{this._selected=i;this._update();});header.append(chooseBtn);
      item.append(header,textEl('div','km-caption',km===null?'Noch keine Kilometerquelle eingerichtet':`${km.toLocaleString('de-AT',{maximumFractionDigits:1})} km zurückgelegt`));
      if(this._config.demo_mode){
        const range=document.createElement('input');range.className='range demo-range';range.type='range';range.min='0';range.max=String(this._activeTotalKm);range.step='0.1';range.value=String(Math.min(km??0,this._activeTotalKm));range.setAttribute('aria-label',`${name} Kilometer-Slider`);
        const number=document.createElement('input');number.className='number demo-number';number.type='number';number.min='0';number.max=String(this._activeTotalKm);number.step='0.1';number.value=String(Math.round(Math.min(km??0,this._activeTotalKm)*10)/10);number.setAttribute('aria-label',`${name} Kilometer eingeben`);
        const emit=v=>{const value=Number(String(v).replace(',','.'));if(!Number.isFinite(value))return;this.dispatchEvent(new CustomEvent('demo-distance-change',{detail:{index:i,km:Math.round(clamp(value,0,this._activeTotalKm)*10)/10}}));};
        range.addEventListener('input',()=>emit(range.value));range.addEventListener('change',()=>{range.blur();this._update();});number.addEventListener('change',()=>{emit(number.value);number.blur();this._update();});
        const line=document.createElement('div');line.style.cssText='display:flex;align-items:center;gap:8px';line.append(number,textEl('span','','km'));item.append(range,line);
      }
      this._peopleContainer.append(item);
      if(i===this._selected){selectedDistance=km;selectedName=name;}
    });
    const effective=selectedDistance===null?null:Math.min(selectedDistance,this._activeTotalKm);
    const progress=effective===null?0:clamp(effective/this._activeTotalKm,0,1);
    this._subtitle.textContent=this._includeReturn?'Hobbingen → Schicksalsberg → Graue Anfurten':'Hobbingen → Schicksalsberg';
    this._progressPolyline.setAttribute('points',routeUntil(this._positionFraction(effective??0)));
    this._barInner.style.width=`${progress*100}%`;
    this._hudTitle.textContent=selected?selectedName:'Noch keine Person ausgewählt';
    this._hudText.textContent=selectedDistance===null?'Bitte Person und Kilometerquelle im Karteneditor auswählen':`${selectedDistance.toLocaleString('de-AT',{maximumFractionDigits:1})} km · ${Math.round(progress*100)} % der ${this._includeReturn?'gesamten Reise':'Hinreise'}`;
    this._manualEdit.hidden=Boolean(!selected||this._config.demo_mode||(!selected.korrektur_entity&&!selected.entity?.startsWith('input_number.')));
    if(selected && this.shadowRoot.activeElement!==this._manualInput)this._manualInput.value=selectedDistance===null?'':String(Math.round(selectedDistance*10)/10);
  }
  _chooseStop(stop){
    this._detail.replaceChildren();
    this._detail.append(textEl('strong','',stop.name));
    if(stop.date)this._detail.append(textEl('div','',stop.date));
    this._detail.append(textEl('div','',stop.description));
    this._popup.hidden=false;
    this._stopMarkers.querySelectorAll('g.stop').forEach(g=>g.classList.toggle('active',Number(g.dataset.pathIndex)===stop.pathIndex));
  }
  _choosePlace(name){
    this._detail.replaceChildren();this._detail.append(textEl('strong','',name));
    this._popup.hidden=false;
  }
  _setView(){
    this._view.w=clamp(this._view.w,280,3400);
    this._view.h=clamp(this._view.h,190,2260);
    this._view.x=clamp(this._view.x,-200,3072-this._view.w+200);
    this._view.y=clamp(this._view.y,-200,2048-this._view.h+200);
    this._map.setAttribute('viewBox',`${this._view.x} ${this._view.y} ${this._view.w} ${this._view.h}`);
  }
  _zoom(factor,clientX=null,clientY=null){
    if(!this._map)return;
    const center=clientX===null?{x:this._view.x+this._view.w/2,y:this._view.y+this._view.h/2}:this._mapCoords(clientX,clientY);
    const oldW=this._view.w,oldH=this._view.h;
    const newW=clamp(oldW*factor,280,3400),newH=clamp(oldH*factor,190,2260);
    this._view.x=center.x-(center.x-this._view.x)*newW/oldW;
    this._view.y=center.y-(center.y-this._view.y)*newH/oldH;
    this._view.w=newW;this._view.h=newH;this._setView();
  }
  _mapCoords(x,y){
    const pt=this._map.createSVGPoint();pt.x=x;pt.y=y;
    const m=this._map.getScreenCTM();
    return m?pt.matrixTransform(m.inverse()):{x:this._view.x+this._view.w/2,y:this._view.y+this._view.h/2};
  }
  _configureGestures(){
    const svg=this._map;
    svg.addEventListener('wheel',e=>{e.preventDefault();this._zoom(e.deltaY>0?1.17:.85,e.clientX,e.clientY);},{passive:false});
    svg.addEventListener('pointerdown',e=>{
      if(e.button!==0 && e.pointerType==='mouse')return;
      svg.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      svg.classList.add('dragging');
      if(this._pointers.size===2) this._pinchDistance=this._pairDistance();
    });
    svg.addEventListener('pointermove',e=>{
      if(!this._pointers.has(e.pointerId))return;
      const old=this._pointers.get(e.pointerId);
      const before=this._mapCoords(old.x,old.y);
      this._pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this._pointers.size===1){
        const after=this._mapCoords(e.clientX,e.clientY);
        this._view.x+=before.x-after.x;this._view.y+=before.y-after.y;this._setView();
      }else if(this._pointers.size===2){
        const d=this._pairDistance();
        if(this._pinchDistance) {
          const points=[...this._pointers.values()];
          const midpoint={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2};
          this._zoom(this._pinchDistance/d,midpoint.x,midpoint.y);
        }
        this._pinchDistance=d;
      }
    });
    const up=e=>{this._pointers.delete(e.pointerId);this._pinchDistance=this._pointers.size===2?this._pairDistance():null;if(!this._pointers.size)svg.classList.remove('dragging');};
    svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);
  }
  _pairDistance(){
    const p=[...this._pointers.values()];
    return p.length<2?null:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
  }
}

// Home Assistant dashboard visual editor: picks registered person entities and their distance sources.
class MittelerdeKarteEditor extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._config={personen:[]};}
  setConfig(config){this._config=structuredClone(config||{personen:[]});this._render();}
  set hass(hass){this._hass=hass;this._render();}
  _emit(){this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true}));}
  _render(){
    const root=this.shadowRoot;root.replaceChildren();
    const style=document.createElement('style');style.textContent=`:host{display:block;font:13px system-ui;color:var(--primary-text-color)}h3{font-size:15px}label{display:block;margin:10px 0}select,input{font:inherit;max-width:100%;padding:5px;border:1px solid #969696;border-radius:5px;background:var(--card-background-color,#fff);color:inherit}select{min-width:190px;width:100%}.group{padding:12px;margin:10px 0;border:1px solid var(--divider-color,#aaa);border-radius:10px}small{opacity:.8}input[type=checkbox]{margin-right:8px}label span{display:block;font-size:12px;margin-bottom:4px}`;root.append(style);
    root.append(textEl('h3','','Personen für Frodos Reise'));
    root.append(textEl('small','','Wähle registrierte Home-Assistant-Personen und ordne jeder Person den kumulierten Kilometerstand zu. Name und Profilbild übernimmt die Karte automatisch.'));
    const ids=Object.keys(this._hass?.states||{}).filter(k=>k.startsWith('person.')).sort();
    const active=this._config.personen||[];
    for(const p of active)if(p.person_entity&&!ids.includes(p.person_entity))ids.push(p.person_entity);
    if(!ids.length){root.append(textEl('p','','Noch keine person.*-Entitäten verfügbar. Lege unter Einstellungen → Personen zuerst Personen an.'));return;}
    const candidates=Object.keys(this._hass?.states||{}).filter(k=>k.startsWith('sensor.')||k.startsWith('input_number.')).sort();
    const numbers=Object.keys(this._hass?.states||{}).filter(k=>k.startsWith('input_number.')).sort();
    const select=(name,choices,current,callback)=>{
      const label=document.createElement('label');label.append(textEl('span','',name));
      const input=document.createElement('select');for(const [id,title] of choices){const option=document.createElement('option');option.value=id;option.textContent=title;input.append(option);}
      input.value=current||'';input.addEventListener('change',()=>callback(input.value));label.append(input);return label;
    };
    ids.forEach(personEntity=>{
      const existing=active.find(p=>p.person_entity===personEntity);
      const state=this._hass?.states?.[personEntity];
      const group=document.createElement('div');group.className='group';
      const label=document.createElement('label');const checked=document.createElement('input');checked.type='checkbox';checked.checked=Boolean(existing);
      label.append(checked,document.createTextNode(state?.attributes?.friendly_name||personEntity));group.append(label);
      const details=document.createElement('div');details.hidden=!existing;group.append(details);
      const setField=(key,value)=>{
        const entry=(this._config.personen||[]).find(p=>p.person_entity===personEntity);if(!entry)return;
        if(key==='korrektur_entity' && value && value===entry.entity)return;
        entry[key]=value;
        // Changing the base sensor to the former correction helper must not
        // retain a duplicate correction in the saved card configuration.
        if(key==='entity' && entry.korrektur_entity===value){
          entry.korrektur_entity='';
          this._emit();this._render();return;
        }
        this._emit();
      };
      checked.addEventListener('change',()=>{
        if(checked.checked){this._config.personen=[...(this._config.personen||[]),{person_entity:personEntity,entity:''}];}
        else this._config.personen=(this._config.personen||[]).filter(p=>p.person_entity!==personEntity);
        this._emit();this._render();
      });
      if(existing){
        const shown=curr=>curr?curr.replace(/^[^.]+\\./,'')+' ('+curr+')':'– nicht zugeordnet –';
        const available=[['','– Kilometerquelle auswählen –'],...candidates.map(id=>[id,this._hass?.states?.[id]?.attributes?.friendly_name?`${this._hass.states[id].attributes.friendly_name} (${id})`:id])];
        if(existing.entity&&!candidates.includes(existing.entity))available.push([existing.entity,existing.entity]);
        details.append(select('Kumulierter Distanzsensor oder Kilometer-Helfer',available,existing.entity,v=>setField('entity',v)));
        const validCorrections=numbers.filter(id=>id!==existing.entity);
        const corrections=[['','– Keine manuelle Korrektur –'],...validCorrections.map(id=>[id,id])];
        if(existing.korrektur_entity && existing.korrektur_entity!==existing.entity && !validCorrections.includes(existing.korrektur_entity))corrections.push([existing.korrektur_entity,existing.korrektur_entity]);
        details.append(select('Korrektur-Helfer (optional)',corrections,existing.korrektur_entity===existing.entity?'':existing.korrektur_entity,v=>setField('korrektur_entity',v)));
        if(existing.korrektur_entity && existing.korrektur_entity===existing.entity){
          const warning=textEl('small','','Dieser Helfer ist doppelt zugeordnet. Er wird nur einmal gezählt.');
          warning.style.color='#b46e28';details.append(warning);
          const fix=textEl('button','','Doppelte Zuordnung entfernen');fix.type='button';fix.style.marginTop='5px';
          fix.addEventListener('click',()=>{setField('korrektur_entity','');this._render();});
          details.append(fix);
        }
        if(!existing.entity)details.append(textEl('small','','Ohne Distanzquelle erscheint noch kein Pin.'));
      }
      root.append(group);
    });
    const mode=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=this._config.rueckreise!==false;
    check.addEventListener('change',()=>{this._config.rueckreise=check.checked;this._emit();});mode.append(check,document.createTextNode('Rückreise standardmäßig einbeziehen'));root.append(mode);
  }
}
if(!customElements.get('mittelerde-karte-editor'))customElements.define('mittelerde-karte-editor',MittelerdeKarteEditor);

if (!customElements.get('mittelerde-karte')) customElements.define('mittelerde-karte',MittelerdeKarte);
window.customCards = window.customCards || [];
if (!window.customCards.some(c=>c.type==='mittelerde-karte'))
  window.customCards.push({type:'mittelerde-karte',name:'Mittelerde-Reisekarte',description:'Frodos Reise mit Distanzsensoren der Haushaltsmitglieder'});
