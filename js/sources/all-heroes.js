/*
 * Every hero the app knows (DEVLOG #41): the official list (js/sources/official-heroes.js) plus heroes only the
 * Fribbels dataset has (js/sources/fribbels-data.js; the official record site's list lags behind new releases).
 * Not a merge: each entry keeps its own `source` ('official' / 'fribbels-data'). Load after both and js/roster.js.
 *   RTASources.allHeroes   -> [{ code, name, element, role, grade, source }]
 *   RTASources.extraHeroes -> only the 'fribbels-data' ones
 */
(function (root) {
  const S = root.RTASources || {};
  const R = root.RTARoster;
  if (!R || !S.officialSnapshot) return;
  const stats = (S.fribbelsSnapshot && S.fribbelsSnapshot.stats) || {};
  S.extraHeroes = R.extraHeroes(S.officialSnapshot.heroes, stats);
  S.allHeroes = [...S.officialSnapshot.heroes, ...S.extraHeroes];
  R.useAssetRepoFor(S.extraHeroes.map((h) => h.code)); // their icons come from the community asset repository
})(typeof window !== 'undefined' ? window : globalThis);
