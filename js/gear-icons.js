/* Original SVG icons for gear slots and sets (drawn for Epic 7 Engine; not game art). window.E7GearIcons */
(function () {
  'use strict';

  const INK = '#0a0b10';   // dark outline
  const GINK = '#3a2206';  // outline for gold parts

  /* ---- slot icons: viewBox 0 0 64 64, transparent background ----
     Tokens in the body: @S steel, @D dark steel, @G gold, @R red gem. Gradient ids are prefixed per icon. */
  function slotSvg(key, body) {
    const p = 'e7g-' + key + '-';
    const defs =
      '<defs>' +
      '<linearGradient id="' + p + 's" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f99b8"/><stop offset=".35" stop-color="#3d4259"/><stop offset="1" stop-color="#12131c"/></linearGradient>' +
      '<linearGradient id="' + p + 'd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f68"/><stop offset="1" stop-color="#0d0e15"/></linearGradient>' +
      '<linearGradient id="' + p + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".45" stop-color="#e0a437"/><stop offset="1" stop-color="#7d4a10"/></linearGradient>' +
      '<radialGradient id="' + p + 'r" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb0a0"/><stop offset=".4" stop-color="#e3223a"/><stop offset="1" stop-color="#5c0614"/></radialGradient>' +
      '</defs>';
    const b = body
      .replace(/@S/g, 'url(#' + p + 's)').replace(/@D/g, 'url(#' + p + 'd)')
      .replace(/@G/g, 'url(#' + p + 'g)').replace(/@R/g, 'url(#' + p + 'r)');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">' + defs +
      '<g stroke-linejoin="round" stroke-linecap="round">' + b + '</g></svg>';
  }

  const SLOTS = {
    Weapon: slotSvg('weapon',
      '<g transform="rotate(45 32 32)">' +
      '<path d="M27.5 32 L21.5 28.5 L27.7 39.5Z M36.5 32 L42.5 28.5 L36.3 39.5Z" fill="@D" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="M32 0 L37.5 11 L36.5 41 L27.5 41 L26.5 11Z" fill="@S" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M32 1.8 L27.4 11 L28.3 40.4 L32 40.4Z" fill="#fff" opacity=".28"/>' +
      '<path d="M32 12 L33.7 15.5 L33.3 37 L30.7 37 L30.3 15.5Z" fill="@R"/>' +
      '<path d="M14.5 37.5 Q23 44 32 41 Q41 44 49.5 37.5 Q48.5 49 37 47.6 L27 47.6 Q15.5 49 14.5 37.5Z" fill="@G" stroke="' + GINK + '" stroke-width="1"/>' +
      '<circle cx="32" cy="44.4" r="2.4" fill="@R" stroke="' + GINK + '" stroke-width=".7"/>' +
      '<rect x="29.2" y="47.6" width="5.6" height="10.4" fill="@D" stroke="' + INK + '" stroke-width=".9"/>' +
      '<path d="M29.4 50.4 H34.6 M29.4 53 H34.6 M29.4 55.6 H34.6" stroke="#d9a033" stroke-width="1"/>' +
      '<path d="M32 56.6 L36.2 60.6 L32 64.6 L27.8 60.6Z" fill="@G" stroke="' + GINK + '" stroke-width=".9"/>' +
      '</g>'),

    Helmet: slotSvg('helmet',
      '<path d="M18 28 Q3 26 4 5 Q9 17 22 17Z M46 28 Q61 26 60 5 Q55 17 42 17Z" fill="@G" stroke="' + GINK + '" stroke-width="1"/>' +
      '<path d="M7.5 17 L11.5 15.2 M10 22.5 L15 19.6 M56.5 17 L52.5 15.2 M54 22.5 L49 19.6" stroke="' + GINK + '" stroke-width="1" opacity=".7"/>' +
      '<path d="M13 36 Q12 12 32 11 Q52 12 51 36 L50 46 Q47 54 40 58 L38.5 46.5 L32 51 L25.5 46.5 L24 58 Q17 54 14 46Z" fill="@S" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M17 30 Q17 17 28.5 13.8" fill="none" stroke="#fff" stroke-width="1.5" opacity=".5"/>' +
      '<path d="M17.5 29.5 L30 34.5 L30 40 L17.5 36.5Z M46.5 29.5 L34 34.5 L34 40 L46.5 36.5Z" fill="#05050a"/>' +
      '<path d="M19.5 32.3 L28.6 35.8 L28.6 37.8 L19.5 35.3Z M44.5 32.3 L35.4 35.8 L35.4 37.8 L44.5 35.3Z" fill="#ff5a4a"/>' +
      '<path d="M18.5 41.5 L23 43 M18.8 45 L22.6 46.4 M45.5 41.5 L41 43 M45.2 45 L41.4 46.4" stroke="#05050a" stroke-width="1.1" opacity=".8"/>' +
      '<path d="M14.2 46.5 Q17 53.5 23.8 57.2 M49.8 46.5 Q47 53.5 40.2 57.2" fill="none" stroke="#e0a437" stroke-width="1.5"/>' +
      '<path d="M29.4 5.5 L34.6 5.5 L34.1 31 L32 35.5 L29.9 31Z" fill="@G" stroke="' + GINK + '" stroke-width=".9"/>' +
      '<path d="M32 14.5 L35.2 19.5 L32 24.5 L28.8 19.5Z" fill="@R" stroke="' + GINK + '" stroke-width=".7"/>'),

    Armor: slotSvg('armor',
      '<path d="M9 18 L4.5 3.5 L18 12.5Z M55 18 L59.5 3.5 L46 12.5Z" fill="@S" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="M23.5 13.5 Q10 11.5 4.5 25.5 L11 24 L8.8 33 L16 28.5 L19.5 32 Q23.5 23 23.5 13.5Z M40.5 13.5 Q54 11.5 59.5 25.5 L53 24 L55.2 33 L48 28.5 L44.5 32 Q40.5 23 40.5 13.5Z" fill="@D" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M22 15.6 Q12 14.6 7.4 23 M42 15.6 Q52 14.6 56.6 23" fill="none" stroke="#e0a437" stroke-width="1.5"/>' +
      '<path d="M22 13 L32 19 L42 13 L46 23 L42.5 35 L45.5 51 L37 54 L32 61.5 L27 54 L18.5 51 L21.5 35 L18 23Z" fill="@S" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M20 23 L23 16.5 M22.8 36 L20.6 49.6" fill="none" stroke="#fff" stroke-width="1.3" opacity=".45"/>' +
      '<path d="M32 38 V60 M21.6 35 L32 40 L42.4 35 M20.4 43.5 L32 48.5 L43.6 43.5" fill="none" stroke="#05050a" stroke-width="1.1" opacity=".75"/>' +
      '<path d="M22 13 L32 19 L42 13 L40.3 20 L32 26 L23.7 20Z" fill="@G" stroke="' + GINK + '" stroke-width=".9"/>' +
      '<path d="M32 26.5 L37 32.5 L32 38.5 L27 32.5Z" fill="@R" stroke="#f1c869" stroke-width="1.3"/>' +
      '<path d="M18.8 50.8 L27 53.8 L32 61 L37 53.8 L45.2 50.8" fill="none" stroke="#e0a437" stroke-width="1.7"/>'),

    Necklace: slotSvg('necklace',
      '<path d="M11 5 Q9.5 34 32 40.5 Q54.5 34 53 5" fill="none" stroke="' + GINK + '" stroke-width="4.6"/>' +
      '<path d="M11 5 Q9.5 34 32 40.5 Q54.5 34 53 5" fill="none" stroke="@G" stroke-width="2.9" stroke-dasharray="2.7 1.7" stroke-linecap="butt"/>' +
      '<circle cx="13.6" cy="25" r="3" fill="@R" stroke="#f1c869" stroke-width="1.1"/>' +
      '<circle cx="50.4" cy="25" r="3" fill="@R" stroke="#f1c869" stroke-width="1.1"/>' +
      '<path d="M25 41 L10.5 35.5 L15.5 46.5 L24 50.5Z M39 41 L53.5 35.5 L48.5 46.5 L40 50.5Z" fill="@S" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M32 33 L44 46 L32 63 L20 46Z" fill="@G" stroke="' + GINK + '" stroke-width="1.1"/>' +
      '<path d="M32 38 L40 46.2 L32 57.8 L24 46.2Z" fill="@R" stroke="' + GINK + '" stroke-width=".7"/>' +
      '<path d="M32 38 L35.2 46.2 L32 57.8 L28.8 46.2Z" fill="#fff" opacity=".2"/>' +
      '<path d="M24.6 46.2 H39.4" stroke="#fff" stroke-width=".8" opacity=".4"/>' +
      '<path d="M27.5 44 L31 40.4" stroke="#fff" stroke-width="1.2" opacity=".7"/>'),

    Ring: slotSvg('ring',
      '<circle cx="32" cy="40" r="16.5" fill="none" stroke="' + INK + '" stroke-width="10"/>' +
      '<circle cx="32" cy="40" r="16.5" fill="none" stroke="@S" stroke-width="7.8"/>' +
      '<circle cx="32" cy="40" r="20.2" fill="none" stroke="@G" stroke-width="1.4"/>' +
      '<circle cx="32" cy="40" r="12.8" fill="none" stroke="@G" stroke-width="1.2"/>' +
      '<path d="M17.2 47 A16.5 16.5 0 0 0 29 56.2" fill="none" stroke="#fff" stroke-width="1.5" opacity=".5"/>' +
      '<circle cx="15.6" cy="38" r="1.7" fill="@G"/><circle cx="48.4" cy="38" r="1.7" fill="@G"/>' +
      '<circle cx="32" cy="56.5" r="1.9" fill="@R" stroke="#f1c869" stroke-width=".8"/>' +
      '<path d="M21 27 L12.5 13 L27 20Z M43 27 L51.5 13 L37 20Z" fill="@D" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M32 3 L44 10.5 L44 23.5 L32 31 L20 23.5 L20 10.5Z" fill="@G" stroke="' + GINK + '" stroke-width="1.1"/>' +
      '<path d="M32 7 L40.6 12.4 L40.6 21.6 L32 27 L23.4 21.6 L23.4 12.4Z" fill="@R" stroke="' + GINK + '" stroke-width=".7"/>' +
      '<path d="M32 7 L36.4 13.6 L32 17 L27.6 13.6Z" fill="#fff" opacity=".4"/>' +
      '<path d="M23.4 12.4 L27.6 13.6 M40.6 12.4 L36.4 13.6 M32 17 V27" stroke="#fff" stroke-width=".7" opacity=".3"/>'),

    Boots: slotSvg('boots',
      '<path d="M21 12 L9 2 L13 14 L7.5 13 L20 25Z" fill="@D" stroke="' + INK + '" stroke-width="1.1"/>' +
      '<path d="M19 9 L39 6 L38 30 Q39 37 49 41 Q58 44.5 58 52 L58 55.5 L17 55.5 L18.5 40Z" fill="@S" stroke="' + INK + '" stroke-width="1.2"/>' +
      '<path d="M21.3 17 L20.6 37" stroke="#fff" stroke-width="1.4" opacity=".5"/>' +
      '<path d="M18.9 35.5 L32.5 38.5 M18.4 41.5 Q31 42 41 47 M18 47.5 Q30 48 38 51.5" fill="none" stroke="#05050a" stroke-width="1.1" opacity=".75"/>' +
      '<path d="M46 40 Q58 44 58 52 L58 55.5 L46.5 55.5 Q51 48 46 40Z" fill="@G" stroke="' + GINK + '" stroke-width="1"/>' +
      '<path d="M28 15 L38.3 13.4 L37.6 31 L31 36.5Z" fill="@D" stroke="' + INK + '" stroke-width=".9"/>' +
      '<path d="M33.6 17.5 L36.3 21.6 L33.6 25.7 L30.9 21.6Z" fill="@R" stroke="#f1c869" stroke-width=".9"/>' +
      '<path d="M17.3 8.4 L40.7 4.8 L40.7 12.6 L17.3 16.2Z" fill="@G" stroke="' + GINK + '" stroke-width="1"/>' +
      '<path d="M16 55 H59 V58.2 Q59 60.2 57 60.2 H31.5 L29.5 57.6 L27.5 60.2 H17.5 Q16 60.2 16 58.7Z" fill="#191a25" stroke="' + INK + '" stroke-width="1"/>' +
      '<path d="M17 55.3 H58" stroke="#e0a437" stroke-width="1" opacity=".8"/>')
  };

  /* ---- set emblems: viewBox 0 0 32 32, gold rim + navy fill + symbol ----
     Tokens in the body: @F cream-to-gold symbol fill, @N navy (for cut-outs). */
  const NAVY = '#101a3d';
  function setSvg(key, body) {
    const p = 'e7s-' + key + '-';
    const defs =
      '<defs>' +
      '<linearGradient id="' + p + 'rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3bf"/><stop offset=".5" stop-color="#d99a2e"/><stop offset="1" stop-color="#7a4a10"/></linearGradient>' +
      '<radialGradient id="' + p + 'bg" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#2b3f86"/><stop offset=".6" stop-color="#131d47"/><stop offset="1" stop-color="#090d24"/></radialGradient>' +
      '<linearGradient id="' + p + 'f" gradientUnits="userSpaceOnUse" x1="0" y1="6" x2="0" y2="27"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#ffeebc"/><stop offset="1" stop-color="#f0bd55"/></linearGradient>' +
      '</defs>';
    const b = body.replace(/@F/g, 'url(#' + p + 'f)').replace(/@N/g, NAVY);
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">' + defs +
      '<circle cx="16" cy="16" r="15.6" fill="#1c1205"/>' +
      '<circle cx="16" cy="16" r="14.8" fill="url(#' + p + 'rim)"/>' +
      '<circle cx="16" cy="16" r="12.3" fill="url(#' + p + 'bg)" stroke="#070a1a" stroke-width=".9"/>' +
      '<g stroke-linejoin="round" stroke-linecap="round">' + b + '</g></svg>';
  }

  const SWORD = '<path d="M16 5.5 L18.4 9.5 L18 19 L14 19 L13.6 9.5Z M10.4 19 H21.6 V21.4 H10.4Z M14.9 21.4 H17.1 V25 H14.9Z"/><circle cx="16" cy="26" r="1.7"/>';
  const HEART = 'M16 25.5 Q6.5 19 6.5 13 A4.9 4.9 0 0 1 16 11 A4.9 4.9 0 0 1 25.5 13 Q25.5 19 16 25.5Z';
  const SHIELD = 'M16 6 L24 8.8 V15.5 Q24 22.5 16 26.5 Q8 22.5 8 15.5 V8.8Z';

  const SETS = {
    SpeedSet: setSvg('speed',
      '<path d="M6.5 20.5 Q11 8.5 25.5 8 Q22.5 10.2 21.6 12.2 L24.6 12.4 Q21.6 15 19.4 15.8 L22.4 16.8 Q18.4 20.2 14.4 20.2 L16.6 22 Q11 23.6 6.5 20.5Z" fill="@F"/>' +
      '<path d="M9.5 19.5 Q13 13.5 19.5 11.4" fill="none" stroke="@N" stroke-width=".9" opacity=".6"/>' +
      '<path d="M7 24.6 H13.5" stroke="@F" stroke-width="1.5"/>'),
    AttackSet: setSvg('attack', '<g fill="@F">' + SWORD + '</g><path d="M16 9.5 V18" stroke="@N" stroke-width=".8" opacity=".55"/>'),
    DestructionSet: setSvg('destruction',
      '<path d="M17.5 5 L11.5 14.5 L15.6 15.4 L11 27 L21.2 14.8 L17 13.9 L21.5 5Z" fill="@F"/>' +
      '<path d="M7.5 9.5 L10.5 12 M6.5 17 H9.6 M24.5 22.5 L21.8 20.4 M25.5 15.5 H22.6" stroke="@F" stroke-width="1.6"/>'),
    LifestealSet: setSvg('lifesteal',
      '<path d="M16 5.5 Q23 14.2 23 19.2 A7 7 0 0 1 9 19.2 Q9 14.2 16 5.5Z" fill="#e8364f" stroke="@F" stroke-width="1.5"/>' +
      '<path d="M12.6 19.5 A3.6 3.6 0 0 0 15.4 23" fill="none" stroke="#fff" stroke-width="1.3" opacity=".85"/>'),
    CounterSet: setSvg('counter',
      '<path d="M9.2 22.5 Q6.5 9.5 16.5 8 Q24.6 7.6 24.4 14.6 Q24 20.4 17.6 19.8 Q13.4 19 14.6 15.2 Q15.8 12.6 18.6 13.8" fill="none" stroke="@F" stroke-width="2.7"/>' +
      '<path d="M6.6 21 L9.6 25.8 L12.6 20.6Z" fill="@F"/>'),
    RageSet: setSvg('rage',
      '<path d="M11 13 Q5.5 11.5 6.5 5.5 Q8.8 9.2 13 10Z M21 13 Q26.500 11.5 25.5 5.5 Q23.2 9.200 19 10Z" fill="@F"/>' +
      '<path d="M16 9.5 A6.6 6.2 0 0 1 22.6 15.700 Q22.6 18.800 20.4 20 V24.5 H11.600 V20 Q9.400 18.800 9.400 15.700 A6.6 6.2 0 0 1 16 9.500Z" fill="@F"/>' +
      '<path d="M11.4 15 L14.800 16.200 L14.200 18.600 L11.800 18Z M20.6 15 L17.2 16.200 L17.8 18.600 L20.200 18Z" fill="@N"/>' +
      '<path d="M14.4 22 V24.500 M17.6 22 V24.500 M16 19.400 V20.800" stroke="@N" stroke-width="1"/>'),
    RevengeSet: setSvg('revenge',
      '<g fill="@F"><g transform="rotate(40 16 16) translate(1.6 1.4) scale(.9)">' + SWORD + '</g>' +
      '<g transform="rotate(-40 16 16) translate(1.6 1.4) scale(.9)" stroke="@N" stroke-width=".7">' + SWORD + '</g></g>'),
    InjurySet: setSvg('injury',
      '<path d="' + HEART + '" fill="#d9a9ff" stroke="@F" stroke-width="1"/>' +
      '<path d="M17 9.800 L13.600 14 L17.800 16.400 L14.400 20 L16.200 25.500" fill="none" stroke="@N" stroke-width="2"/>'),
    HealthSet: setSvg('health',
      '<path d="' + HEART + '" fill="@F"/>' +
      '<path d="M16 13.200 V20 M12.600 16.600 H19.400" stroke="#d8324a" stroke-width="2.4" stroke-linecap="butt"/>'),
    DefenseSet: setSvg('defense',
      '<path d="' + SHIELD + '" fill="@F"/>' +
      '<path d="M16 8.300 L21.800 10.300 V15.500 Q21.800 20.800 16 24Z" fill="@N" opacity=".55"/>'),
    CriticalSet: setSvg('critical',
      '<path d="M16 4.500 L18 12.200 L23.800 8.200 L19.800 14 L27.500 16 L19.800 18 L23.800 23.800 L18 19.800 L16 27.500 L14 19.800 L8.200 23.800 L12.200 18 L4.500 16 L12.200 14 L8.200 8.200 L14 12.200Z" fill="@F"/>' +
      '<circle cx="16" cy="16" r="2" fill="@N"/>'),
    HitSet: setSvg('hit',
      '<circle cx="16" cy="16" r="7.2" fill="none" stroke="@F" stroke-width="2.2"/>' +
      '<circle cx="16" cy="16" r="2.6" fill="#ff5a4a" stroke="@F" stroke-width="1"/>' +
      '<path d="M16 5 V10 M16 22 V27 M5 16 H10 M22 16 H27" stroke="@F" stroke-width="2"/>'),
    ResistSet: setSvg('resist',
      '<path d="M16 5.500 L25 10.700 V21.300 L16 26.500 L7 21.300 V10.700Z" fill="none" stroke="@F" stroke-width="2.200"/>' +
      '<path d="M16 11 L20.400 13.500 V18.500 L16 21 L11.600 18.500 V13.500Z" fill="@F"/>'),
    UnitySet: setSvg('unity',
      '<circle cx="12.300" cy="16" r="5.600" fill="none" stroke="@F" stroke-width="2.400"/>' +
      '<circle cx="19.700" cy="16" r="5.600" fill="none" stroke="@F" stroke-width="2.400"/>' +
      '<path d="M16 11.800 A5.600 5.600 0 0 1 16 20.200" fill="none" stroke="@N" stroke-width=".9"/>'),
    ImmunitySet: setSvg('immunity',
      '<path d="' + SHIELD + '" fill="@F"/>' +
      '<path d="M16 10 V22 M11.200 14.600 H20.800" stroke="@N" stroke-width="3" stroke-linecap="butt"/>'),
    PenetrationSet: setSvg('penetration',
      '<g transform="rotate(45 16 16)"><path d="M16 2.500 L20.200 11.500 L17.200 14 V28 H14.800 V14 L11.800 11.500Z" fill="@F"/>' +
      '<path d="M6.500 18.200 H13 M19 18.200 H25.500" stroke="@F" stroke-width="2.600" stroke-linecap="butt"/></g>'),
    ProtectionSet: setSvg('protection',
      '<path d="M6.800 22 A9.200 10.500 0 0 1 25.200 22" fill="none" stroke="@F" stroke-width="2.400"/>' +
      '<path d="M5.500 23.200 H26.500" stroke="@F" stroke-width="2.400"/>' +
      '<path d="M16 13.500 L19 17.300 L16 21 L13 17.300Z" fill="@F"/>'),
    TorrentSet: setSvg('torrent',
      '<path d="M5.800 15.500 Q8 9 13.500 9.500 Q19.500 10.500 18.500 15 Q17.500 17.600 15 16.200" fill="none" stroke="@F" stroke-width="2.500"/>' +
      '<path d="M18.500 15 Q21.500 17.500 26.200 14.500" fill="none" stroke="@F" stroke-width="2.500"/>' +
      '<path d="M6.500 21.800 Q9.700 18.800 13 21.800 T19.500 21.800 T25.500 21.300" fill="none" stroke="@F" stroke-width="2.300"/>'),
    ReversalSet: setSvg('reversal',
      '<path d="M8.500 14.500 A7.800 7.800 0 0 1 22.500 11.200 M23.500 17.500 A7.800 7.800 0 0 1 9.500 20.800" fill="none" stroke="@F" stroke-width="2.500" stroke-linecap="butt"/>' +
      '<path d="M25.800 7.200 L24.800 14.600 L18.400 11.600Z M6.200 24.800 L7.200 17.400 L13.600 20.400Z" fill="@F"/>'),
    RiposteSet: setSvg('riposte',
      '<g fill="@F" transform="rotate(-40 16 16) translate(1.6 2.4) scale(.9)">' + SWORD + '</g>' +
      '<path d="M8 8.500 Q19 10.500 24.500 22.500" fill="none" stroke="@F" stroke-width="1.800"/>' +
      '<path d="M22 5.500 L23 8 L25.500 9 L23 10 L22 12.500 L21 10 L18.500 9 L21 8Z" fill="#fff"/>'),
    PursuitSet: setSvg('pursuit',
      '<path d="M6.500 10.500 L11.500 16 L6.500 21.500 H9.700 L14.700 16 L9.700 10.500Z M12.500 9 L18.800 16 L12.500 23 H16.200 L22.500 16 L16.200 9Z" fill="@F"/>' +
      '<path d="M20 9 L26.300 16 L20 23 H21.700 L28 16 L21.700 9Z" fill="@F" transform="translate(-1.200 0)"/>'),
    WarfareSet: setSvg('warfare',
      '<path d="M10.500 5.500 V26.500" stroke="@F" stroke-width="2.200"/>' +
      '<path d="M11.600 7.500 H25 L21.300 12.300 L25 17 H11.600Z" fill="#e8364f" stroke="@F" stroke-width="1.400"/>' +
      '<circle cx="10.500" cy="5.600" r="1.700" fill="@F"/>'),
    WeakeningSet: setSvg('weakening',
      '<path d="M7 10.500 Q18.500 9 19.500 19" fill="none" stroke="@F" stroke-width="2.800" stroke-linecap="butt"/>' +
      '<path d="M14 18 H25 L19.500 25.500Z" fill="@F"/>' +
      '<path d="M7.500 16 V21 M11 18.500 V23.500" stroke="@F" stroke-width="1.500" opacity=".75"/>'),
    FervorSet: setSvg('fervor',
      '<path d="M16.500 4.500 Q23.500 11.500 23.500 18.500 A7.500 7.500 0 0 1 8.500 18.500 Q8.500 14.500 11.800 11.500 Q12 15 14 15.500 Q13.500 9.500 16.500 4.500Z" fill="#ff8a2a" stroke="@F" stroke-width="1.300"/>' +
      '<path d="M16.300 15.500 Q19.800 19 19.800 21.300 A3.800 3.800 0 0 1 12.200 21.300 Q12.200 19.300 14.300 17.800 Q15 19.500 16 19.300 Q15.500 17.300 16.300 15.500Z" fill="#fff3c4"/>')
  };

  window.E7GearIcons = { SLOTS, SETS, slot: (g) => SLOTS[g] || '', set: (s) => SETS[s] || '' };
})();
