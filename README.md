# Budżet domowy — PWA

Aplikacja na telefon i tablet do wpisywania wydatków i przychodów prosto do arkusza Google „Budżet 20xx”.
Arkusz pozostaje źródłem prawdy: aplikacja dopisuje kwoty do odpowiedniej komórki dnia
(np. `=137,06+20`), więc wszystkie formuły, podsumowania i zakładka CAŁY ROK działają tak jak dotąd.

```
PWA (telefon/tablet) ──HTTPS──▶ Apps Script Web App (powiązany z arkuszem) ──▶ Budżet 20xx
  kolejka offline (IndexedDB)       token domowy + LockService
```

## Co robi aplikacja

- **Dodaj**: kwota → kategoria (ostatnio używane na górze, wyszukiwarka) → data → opis. Działa też offline: wpis czeka w kolejce i wysyła się po odzyskaniu sieci.
- **Miesiąc**: przychody, wydatki, ile zostało, średnio dziennie, realizacja per grupa kategorii.
- **Historia**: wpisy dodane z aplikacji, z informacją kto je dodał, oraz możliwość cofnięcia.
- **Konta**: STAN KONT na koniec miesiąca z edycją kwot.

Każdy wpis z aplikacji:
1. dopisuje kwotę do komórki `[zakładka miesiąca, wiersz kategorii, kolumna dnia]`,
2. dodaje notatkę do komórki (`kwota – osoba – opis`),
3. trafia do nowej zakładki **Transakcje**, która służy jako log, historia i podstawa do cofania wpisów.

## Wdrożenie (jednorazowo, ok. 10 minut)

> Najpierw przetestuj wszystko na **kopii** arkusza (Plik → Utwórz kopię).

### 1. Backend: Apps Script
1. Otwórz arkusz → **Rozszerzenia → Apps Script**.
2. Utwórz dwa pliki skryptu, **Core** i **Code**, i wklej do nich zawartość
   [apps-script/Core.js](apps-script/Core.js) oraz [apps-script/Code.js](apps-script/Code.js).
3. Ustawienia projektu (⚙) → zaznacz „Pokaż plik manifestu appsscript.json” i wklej
   [apps-script/appsscript.json](apps-script/appsscript.json).
4. Ustawienia projektu → **Właściwości skryptu** → dodaj `TOKEN` z długim losowym ciągiem znaków
   (np. wygenerowanym menedżerem haseł). To wspólne hasło domowników.
5. **Wdróż → Nowe wdrożenie → Aplikacja internetowa**:
   - Wykonaj jako: **Ja**
   - Kto ma dostęp: **Każdy**
6. Zatwierdź uprawnienia i skopiuj URL kończący się na `/exec`.

Szybki test:
```bash
curl -L "https://script.google.com/macros/s/XXX/exec?action=ping&token=TWOJ_TOKEN"
# {"ok":true,"data":{"year":2026}}
```

Po zmianie kodu: **Wdróż → Zarządzaj wdrożeniami → Edytuj → Nowa wersja**. Dzięki temu URL zostaje ten sam.

Alternatywnie zamiast kopiowania możesz użyć [clasp](https://github.com/google/clasp): `clasp clone <scriptId>` w katalogu `apps-script/`, a potem `clasp push`.

### Przypomnienia e-mail (opcjonalnie)
Codziennie o 22:00 skrypt wysyła e-mail z podsumowaniem dnia i miesiąca oraz przyciskiem otwierającym aplikację.
1. W Apps Script dodaj plik skryptu **Reminders** z zawartością [apps-script/Reminders.js](apps-script/Reminders.js) i zapisz.
2. Wybierz funkcję `setupReminders` na liście u góry edytora i kliknij **Uruchom**. Zatwierdź uprawnienia (wysyłanie e-maili).
3. Opcjonalnie w Właściwościach skryptu dodaj `REMINDER_EMAILS` (adresy oddzielone przecinkami; domyślnie właściciel skryptu).

Aby wyłączyć przypomnienia, uruchom `removeReminders`. Ponowne wdrażanie aplikacji internetowej nie jest potrzebne.

### 2. Frontend: GitHub Pages
1. Utwórz repozytorium na GitHubie i wypchnij ten katalog (`main`).
2. Settings → Pages → Source: **GitHub Actions**.
3. Workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) zbuduje aplikację i ją opublikuje.
   Adres będzie postaci `https://<login>.github.io/<repo>/`.

W kodzie nie ma żadnych sekretów. URL skryptu i token wpisuje się na każdym urządzeniu w Ustawieniach aplikacji.

### 3. Telefony i tablety
1. Otwórz adres aplikacji → **Ustawienia** → wklej URL `/exec`, token i swoje imię → „Zapisz i sprawdź połączenie”.
2. Zainstaluj aplikację:
   - Android (Chrome): menu ⋮ → „Zainstaluj aplikację”
   - iPhone/iPad (Safari): Udostępnij → „Do ekranu początkowego”

## Rozwój lokalny

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # testy logiki zapisu do komórek i parsowania arkusza (apps-script/Core.js)
npm run build
```

## API (Apps Script)

Każde żądanie zawiera `token`. GET używa parametrów zapytania, POST wysyła body JSON z `Content-Type: text/plain`.

| Akcja | Metoda | Parametry | Opis |
|---|---|---|---|
| `ping` | GET | — | Test połączenia, zwraca rok arkusza |
| `categories` | GET | `m` | Grupy i kategorie (z zakładki miesiąca) |
| `month` | GET | `m` | Podsumowanie i plan/realizacja per kategoria |
| `history` | GET | `m` | Wpisy z zakładki Transakcje |
| `accounts` | GET | `m` | STAN KONT dla miesiąca (oraz poprzedniego, do porównania) |
| `add` | POST | `type, group, category, amount, date, note, person, clientId` | Dopisuje kwotę; ponowne wysłanie tego samego `clientId` nie dubluje wpisu |
| `delete` | POST | `clientId` | Cofa wpis |
| `setAccount` | POST | `m, section, name, value` | Ustawia stan konta |

## Ograniczenia

- Aplikacja zakłada układ szablonu z jakoszczedzacpieniadze.pl: kategorie w kolumnie B, dni od kolumny I,
  nagłówki grup z numerami dni 1–31. Zmiana nazw i dodawanie kategorii w arkuszu są w porządku; aplikacja wczytuje je na nowo.
- Jeśli komórka dnia zawiera tekst (np. „DO TĄD”), aplikacja jej nie nadpisze i pokaże błąd.
- Na nowy rok: skopiuj arkusz, w kopii dodaj skrypt i wdróż go, a potem zmień URL w Ustawieniach.
