# Mittelerde-Reisekarte für Home Assistant — v0.6.1

Interaktive Karte von Frodos Reise mit Personen-Pins, eigener Reisestrecke für jedes Haushaltsmitglied, Distanzsensoren, manueller Kilometerkorrektur und einer optionalen Rückreise zu den Grauen Anfurten.

**HACS-Kategorie:** Dashboard. **Laufzeit:** ausschließlich im Home-Assistant-Frontend; kein HACS-Abhängigkeit zur Laufzeit, kein eigener Webserver, kein HACS-Backend-Modul, keine Cloud-Anbindung für die Strecke.

## HACS-Installation

Dieses Verzeichnis ist der **Inhalt eines GitHub-Repositories namens exakt `mittelerde-karte`**. Ein ZIP auf deinem Rechner allein kann HACS nicht installieren. Erst nach Veröffentlichung in einem öffentlichen GitHub-Repository kann die Weboberfläche es als benutzerdefiniertes Repository beziehen.

1. Repository unter GitHub als `mittelerde-karte` veröffentlichen; **alle Dateien und Ordner** auf die oberste Ebene des Repositories übernehmen, insbesondere `hacs.json`, `README.md` und `dist/`. GitHub-Repositorybeschreibung und Topics z. B. `home-assistant`, `hacs`, `dashboard`, `lovelace` eintragen.
2. In Home Assistant HACS öffnen → Menü `⋮` → **Benutzerdefinierte Repositories** → die **echte** GitHub-URL dieses Repositories eingeben → Kategorie **Dashboard** → Hinzufügen.
3. **Mittelerde-Reisekarte** in HACS herunterladen. Die installierten Laufzeitdateien kommen aus `dist/` und landen in `/config/www/community/mittelerde-karte/`. Bei Dashboard-Ressourcen im Speichermodus registriert HACS die JavaScript-Ressource in der Regel selbst.
4. Dashboard bearbeiten → **Karte hinzufügen** → **Mittelerde-Reisekarte** wählen. Bei Bedarf die Dashboard-Seite neu laden. Der visuelle Editor zeigt verfügbare `person.*`-Entitäten und Distanzsensoren.
5. Nur falls die Karte nicht angezeigt wird: Einstellungen → Dashboards → Menü `⋮` → **Ressourcen** prüfen. Die Ressource muss vom Typ **JavaScript-Modul** sein und mit `/hacsfiles/mittelerde-karte/mittelerde-karte.js` beginnen. Nicht zusätzlich einen zweiten Ressourcen-Eintrag anlegen, wenn HACS sie schon hinzugefügt hat. Bei YAML-gesteuerten Ressourcen ggf. manuell konfigurieren.

### Updates

Bei neuen Versionen nach einem veröffentlichten **GitHub Release** (nicht nur Tag) zeigt HACS Updates an, die im Webinterface heruntergeladen werden können. HACS übernimmt Dateien in `dist/` gemeinsam. Die Karte lädt ihr `karte.jpg` aus demselben HACS-Verzeichnis wie ihr JavaScript. Anschließend Browser-Cache / Dashboard neu laden, falls nötig.

### Manuelle Dashboard-Konfiguration (nur bei Bedarf)

```yaml
type: custom:mittelerde-karte
titel: Auf Frodos Spuren
rueckreise: true
personen: []
```

Der visuelle Karteneditor ist der empfohlene Weg: Er lässt registrierte Personen auswählen und ordnet ihnen eine **kumulierte** Distanzquelle (km / m / mi) zu. Anzeigename und Profilbild kommen aus `person.*`, nicht aus zusätzlichen lokalen Einstellungen. Ohne Distanzquelle erscheint für die entsprechende Person noch kein Pin.

Für manuell pflegbare Distanzen einen Home-Assistant-`input_number`-Helfer als Kilometerzähler anlegen und in der Karte zuordnen. Optional einen **separaten Korrekturhelfer** verwenden, der auch negative Werte zulässt:

```yaml
personen:
  - person_entity: person.beispiel
    entity: sensor.aufgezeichnete_gps_kilometer_gesamt
    korrektur_entity: input_number.kilometer_korrektur
```

Die Karte bildet dann `Basis + Korrektur` ab, ohne den Sensorwert zu überschreiben. **Wichtig:** Bei einem `input_number.*` als direkter Kilometerquelle keinen zusätzlichen Korrektur-Helfer mit derselben Entität auswählen. Identische Entitäten werden höchstens einmal gezählt. **Wichtig:** Die Health-Connect-Tagesdistanz setzt sich täglich zurück und ist kein kumulierter Kilometerzähler. Die automatische, verlustfreie Langzeitaggregation bleibt ein separates Arbeitspaket.

## Bedienung

- Rechts oben **☰ Menü**: Reisende auswählen, Personensichtbarkeit, Slider (nur Demo), Kilometerkorrektur (Home Assistant), Reiseumfang und Ebenen.
- Nur Hinreise: bis zum Schicksalsberg. Mit Rückreise: über Minas Tirith, Rohan, Bruchtal und das Auenland bis zu den Grauen Anfurten.
- Die unteren **Spitzen** der Personen-Pins zeigen nun auf die tatsächlichen interpolierten Routenkoordinaten. Die Porträts schweben bewusst oberhalb der Linie.
- Orte anklicken: Kurzbeschreibung. Keine technischen Interpolationshinweise in den Tooltips.

## Offline-Demo

`demo/demo.html` lässt sich direkt lokal im Browser öffnen und enthält Karte, Code und Daten in einer HTML-Datei. Regler bewegen drei Testpersonen, ohne Home Assistant. Erneut erzeugen mit `python make_demo.py`.

## Entwicklerstruktur

```text
mittelerde-karte/                 ← GitHub-Repository MUSS so heißen
├── hacs.json
├── README.md
├── dist/                       ← HACS installiert diesen Ordner
│   ├── mittelerde-karte.js     ← namensgleicher Einstiegspunkt
│   ├── reise-daten.js          ← relativer ES-Modul-Import
│   └── karte.jpg               ← über import.meta.url aufgelöst
├── src/                        ← bearbeitbare JS-Dateien
│   ├── mittelerde-karte.js
│   └── reise-daten.js
├── demo/
│   └── demo.html
├── demo.template.html
├── make_demo.py
└── tests/
```

Nach Bearbeiten von `src/*.js` die Dateien erneut nach `dist/` kopieren; `make_demo.py` anschließend ausführen.

## Daten, Rechte und Einschränkungen

- Hintergrundkarte: [mapmiddleearth.com](https://mapmiddleearth.com/de/download), nach den Angaben der Quelle **CC BY-NC 4.0**, Attribution in der Karte. Vor öffentlicher Veröffentlichung die Lizenz und etwaige Weitergabebedingungen erneut prüfen; die Bildnutzung ist nichtkommerziell.
- Frodos Route enthält redaktionell nachgezeichnete Abschnitte, keine vermessenen GPS-Daten. Die Bootsfahrt auf dem Anduin ist separat dargestellt.
- Hinreise ca. **2.863 km**, vollständige Reise derzeit ca. **6.104 km**. Insbesondere die 250-km-Annahme für die nicht zu Fuß zurückgelegte Überbrückung nach dem Schicksalsberg ist **provisorisch**.
- Der Stand der Berechnungsdaten ist eine Demo: kilometergenau dargestellte Zwischenstationen sind nicht automatisch literarisch belegte Streckendistanzen.
- Die Personenzuordnung in der Karten-Konfiguration gilt für alle Betrachter mit Zugriff auf dieses Dashboard. Authentisierte Home-Assistant-Browser liefern `entity_picture` direkt; der Offline-Test verwendet Initialen.
- Browser-Funktionstest und simulierte Home-Assistant-Entitäten vorhanden; **noch keine echte Installation in einer Home-Assistant-Instanz und kein HACS-Download von GitHub getestet**.
