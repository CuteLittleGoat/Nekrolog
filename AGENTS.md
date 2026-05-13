## 1. Analizy niezwiązane bezpośrednio ze zmianą kodu

Jeżeli polecenie użytkownika nie dotyczy zmiany kodu, tylko analizy, należy zapisać wnioski w folderze:

- `Analizy`

Dla każdej analizy należy utworzyć nowy plik o nazwie adekwatnej do tematu analizy.

Nazwa pliku powinna jasno wskazywać, czego dotyczy analiza.

Przykład:

```text
Analizy/audyt-datavault-parser-xlsx.md
```

---

## 2. Kontekst promptu w plikach analitycznych

Jeżeli zapisywany jest plik z wynikami analizy, należy uwzględnić w nim pełen prompt użytkownika. Bez skracania.

Celem jest zachowanie kontekstu odpowiedzi i umożliwienie zrozumienia, dlaczego dana analiza została wykonana.

Plik analityczny powinien zawierać przynajmniej:

- datę analizy;
- temat analizy;
- oryginalny pełny prompt użytkownika;
- zakres analizy;
- wnioski;
- rekomendacje;
- ewentualne ryzyka;
- ewentualne następne kroki.

---

## 3. Folder `Analizy` a dokumentacja użytkowa i techniczna

Folderu `Analizy` nie należy uwzględniać w dokumentacjach i instrukcjach modułów.

Nie należy opisywać folderu `Analizy` w:

- `README.md`;
- `Documentation.md`;
- instrukcjach użytkownika;
- dokumentacji odtworzeniowej modułów.

Wyjątek: można odwołać się do konkretnej analizy tylko wtedy, gdy użytkownik wyraźnie o to poprosi albo gdy analiza jest częścią wykonywanego zadania.

---

## 4. Zmiany kodu wykonywane na podstawie pliku analitycznego

Jeżeli polecenie użytkownika dotyczy zmiany kodu na podstawie pliku z analizą, po realizacji zadania należy zaktualizować ten plik analityczny.

Do pliku należy dopisać sekcję opisującą wszystkie wykonane zmiany w kodzie.

Sekcja musi zawierać:

- nazwę zmienionego pliku;
- numer linii lub możliwie dokładną lokalizację;
- opis stanu przed zmianą;
- opis stanu po zmianie.

Format zapisu:

````markdown
## Zmiany wykonane w kodzie

### Plik: `Second/app.js`

Lokalizacja: linia 24

Było:

```js
return false;
```

Jest:

```js
return true;
```
````

Jeżeli numer linii nie jest stabilny albo nie można go jednoznacznie ustalić, należy podać najbliższą nazwę funkcji, selektora lub sekcji kodu.

---
