# Template del fucile in inglese

`docs/cardboard-blaster-template.pdf` è generato da `docs/laser-tag-fucile-template.pdf` (fatto con ReportLab): si sostituiscono solo i testi e i disegni restano identici. Le traduzioni sono in `en.py`.

Se cambi il PDF italiano, rigenera quello inglese. Serve Chrome, per misurare la larghezza dei testi in Helvetica e tenere centrate o allineate a destra le etichette:

```sh
cd scripts/template-en
python3 -I measure.py ../../docs/laser-tag-fucile-template.pdf /tmp/m
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --dump-dom file:///tmp/m.html | sed -e 's/<[^>]*>//g' > /tmp/w.json
python3 -I translate.py ../../docs/laser-tag-fucile-template.pdf ../../docs/cardboard-blaster-template.pdf /tmp/m.json /tmp/w.json
```
