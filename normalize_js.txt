export function normalizeSpaces(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function stripSpPrefix(s) {
  return normalizeSpaces(s.replace(/^śp\.?\s+/i, ""));
}

export function makePhraseVariants(lines) {
  const out = new Set();

  for (const raw of lines) {
    const base = normalizeSpaces(raw);
    if (!base) continue;

    const noSp = stripSpPrefix(base);
    const withSp = `Śp. ${noSp}`;

    // Podstawowe warianty
    out.add(noSp);
    out.add(withSp);

    // Zamiana kolejności dla 2-3 tokenów (np. Imię Nazwisko / Nazwisko Imię)
    const toks = noSp.split(" ").filter(Boolean);
    if (toks.length === 2) {
      out.add(`${toks[1]} ${toks[0]}`);
      out.add(`Śp. ${toks[1]} ${toks[0]}`);
    }
    if (toks.length === 3) {
      // proste permutacje: (A B C) -> (B A C), (C A B), (C B A)
      out.add(`${toks[1]} ${toks[0]} ${toks[2]}`);
      out.add(`${toks[2]} ${toks[0]} ${toks[1]}`);
      out.add(`${toks[2]} ${toks[1]} ${toks[0]}`);
      out.add(`Śp. ${toks[1]} ${toks[0]} ${toks[2]}`);
      out.add(`Śp. ${toks[2]} ${toks[0]} ${toks[1]}`);
      out.add(`Śp. ${toks[2]} ${toks[1]} ${toks[0]}`);
    }

    // Wariacje łącznik/spacja (dla nazwisk złożonych)
    // np. "Kowalski-Nowak" <-> "Kowalski Nowak"
    const hyphenToSpace = noSp.replace(/-/g, " ");
    const spaceToHyphen = noSp.replace(/\s+/g, "-");
    if (hyphenToSpace !== noSp) {
      out.add(hyphenToSpace);
      out.add(`Śp. ${hyphenToSpace}`);
    }
    if (spaceToHyphen !== noSp) {
      out.add(spaceToHyphen);
      out.add(`Śp. ${spaceToHyphen}`);
    }
  }

  return [...out].map(s => normalizeSpaces(s)).filter(Boolean);
}

export function textMatchesAny(text, phrases) {
  const t = (text ?? "").toLowerCase();
  for (const p of phrases) {
    const pp = (p ?? "").toLowerCase();
    if (!pp) continue;
    if (t.includes(pp)) return true;
  }
  return false;
}
