# Analiza: widoczność blokady duplikatów graczy w wersji PC

## Prompt użytkownika
> W kilku miejscach aplikacji (np. Gry admina, gry użytkowników, kalkulator) istnieje funkcjonalność blokująca wpisanie dwa razy tego samego gracza. Działa to prawidłowo. Jednak popraw wyswietlanie. Obecnie w wersji na PC nie ma różnicy między graczem, którego mogę dodać a który jest zablokowany do wyboru. W wersji mobilnej jest to lepiej widoczne poprzez szary kolor (screen na załączniku). Przeprowadź analizę jak poprawić widoczność w wersji na PC. Czy można ukrywać na liście wyboru graczy, którzy już raz zostali dodani?

---

## 1) Wnioski z analizy problemu UX

Z opisu i zrzutu wynika, że logika blokowania duplikatów działa, ale na desktopie brakuje wyraźnych sygnałów wizualnych stanu „niedostępny”.

Na PC użytkownik zwykle korzysta z myszy i „skanuje” listę szybciej niż na mobile. Jeśli różnica jest subtelna (np. tylko lekko przygaszony kolor), elementy dostępne i zablokowane wyglądają prawie identycznie. To zwiększa liczbę nieudanych kliknięć i spowalnia wybór.

## 2) Rekomendowane poprawki widoczności (PC)

### A. Wyraźniejszy stan „disabled” (podstawa)
Dla zablokowanych graczy warto zastosować **jednocześnie**:
1. ciemniejszy/szary kolor tekstu,
2. niższy kontrast ikony wyboru,
3. `cursor: not-allowed`,
4. obniżenie `opacity` całego wiersza (np. 0.45–0.6),
5. etykietę tekstową typu „Już dodany”.

To najprostsza i najbezpieczniejsza poprawa, bo nie zmienia logiki, a znacząco zwiększa czytelność.

### B. Rozdzielenie listy na sekcje
W desktopie dobrze sprawdza się podział:
- **Dostępni**
- **Już dodani**

Dzięki temu użytkownik od razu wie, które pozycje są aktywne. Sekcja „Już dodani” może być zwinięta domyślnie.

### C. Tooltip / podpowiedź po najechaniu
Dla zablokowanego wiersza tooltip:
- „Ten gracz został już dodany w tej grze”.

To redukuje niepewność „dlaczego nie mogę kliknąć”.

### D. Spójność mobile/desktop
Warto przenieść mobilny wzorzec szarości 1:1 na desktop i dopiero go wzmocnić dodatkowymi sygnałami (badge, cursor, tooltip).

## 3) Czy ukrywać już dodanych graczy?

### Krótka odpowiedź
**Tak, można — ale najlepiej jako opcja, nie sztywna reguła.**

### Zalety ukrywania
- krótsza lista,
- szybszy wybór,
- mniej „pustych” kliknięć,
- szczególnie dobre przy długich listach graczy.

### Wady ukrywania
- użytkownik może nie wiedzieć, czy gracz „zniknął”, czy nie istnieje,
- trudniej szybko zweryfikować, kto już jest dodany,
- może rodzić pytania „dlaczego nie widzę gracza X”.

### Najlepszy kompromis UX
Dodać przełącznik w UI:
- `Ukryj już dodanych` (domyślnie: **włączone** na desktopie przy długich listach),
- plus licznik: `Ukryto: 3` i akcja `Pokaż wszystkich`.

Wtedy użytkownik dostaje porządek i jednocześnie pełną kontrolę.

## 4) Proponowany standard dla wszystkich miejsc (Gry admina, gry użytkowników, kalkulator)

Wspólne zasady komponentu wyboru gracza:
1. Jedna centralna funkcja wyznaczająca status: `available | already_added`.
2. Jedna wspólna warstwa stylowania dla desktop/mobile.
3. Jedna opcja filtrowania `hideAlreadyAdded`.
4. Jedna treść komunikatu pomocniczego (tooltip/badge).

To ograniczy niespójności między modułami i uprości utrzymanie.

## 5) Rekomendacja wdrożeniowa (kolejność)

1. **Etap 1 (szybki efekt):** wzmocnić styl `disabled` na desktopie (kolor + opacity + cursor + badge).
2. **Etap 2:** dodać przełącznik `Ukryj już dodanych`.
3. **Etap 3:** ujednolicić komponent wyboru graczy we wszystkich ekranach.
4. **Etap 4:** sprawdzić dostępność (kontrast, nawigacja klawiaturą, ARIA dla pozycji zablokowanych).

## 6) Dodatkowa uwaga techniczna

W tym repozytorium nie odnalazłem kodu ekranów „Gry admina / gry użytkowników / kalkulator” ani widoku z napisem „Wybierz gracza”, więc analiza ma charakter UX + implementacyjnych wytycznych niezależnych od frameworka. Po wskazaniu właściwego repo lub ścieżek komponentów można przygotować konkretny patch kodu.
