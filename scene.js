/* =========================================================================
   THE BALLPARK — shared by both game modes.

   The view is from behind home plate, the way a batter sees the field.
   Everything here is presentational, so it is hidden from screen readers
   and ignores clicks (see scene.css).

   Caribbean winter-league ball at golden hour: an open-air park, artificial
   turf with clay cutouts only at the bases, and the home club — the
   Cotorras de San Juan — in teal, gold and cream.

   The viewBox is a panoramic 1200x800 anchored to the BOTTOM
   ("xMidYMax slice"). That combination matters: the full height always
   fits, so sky-to-home-plate survives on any screen, and only the far
   edges of the field crop away on narrow phones.

   Kept as one string in one file so Classic and Tiered Timed Pitch draw the
   same park. The coordinates in here are hand-tuned against both modes'
   layouts — the signage safe band, the base positions, where the fielders
   stand — so a second copy would drift without anyone noticing.

   Injected rather than loaded via <object> or <use href="...">: the runners
   and the base state are toggled by CSS class from the host page, which
   only works when the SVG lives in the same document.
   ========================================================================= */

/* -------------------------------------------------------------------------
   PIXEL HELPERS

   The park is drawn 16-bit: flat rects, a fixed palette, and dithering
   instead of gradients. Nothing here is an asset — same constraint that
   made the sounds synthesised — so the repeated detail is generated once,
   at module load, into the one static string the scene has always been.
   No part of it is rebuilt per frame.

   PIX is the grid everything snaps to. Dither cells are one PIX square, so
   a band edge reads as a checkerboard rather than a line.
   ------------------------------------------------------------------------- */
const PIX = 4;

// Deterministic, so the crowd and the tufts are in the same places every
// load and a screenshot test is not measuring Math.random().
function seeded(seed) {
  let n = seed >>> 0;
  return () => {
    n = (n * 1664525 + 1013904223) >>> 0;
    return n / 4294967296;
  };
}

const px = (x, y, w, h, fill) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;

/* A checkerboard of PIX squares in `fill`, covering the box. Two rows of it
   between two flat bands is what replaces a gradient: the eye blends it at
   any size the park is drawn, and it stays hard-edged when it is scaled up.
   `phase` flips which squares are filled, so stacked rows alternate. */
function dither(x, y, w, h, fill, phase = 0) {
  let out = '';
  for (let row = 0; row < h / PIX; row++) {
    for (let col = 0; col < w / PIX; col++) {
      if ((row + col + phase) % 2) continue;
      out += px(x + col * PIX, y + row * PIX, PIX, PIX, fill);
    }
  }
  return out;
}

// A band edge: two dithered rows, the upper sparser than the lower, so the
// transition has a direction rather than reading as a seam.
function bandEdge(y, top, bottom) {
  return dither(0, y, 1200, PIX, bottom, 0) +
         dither(0, y + PIX, 1200, PIX, bottom, 1) +
         dither(0, y + PIX, 1200, PIX, top, 0);
}

/* Two staggered rows of heads over a dark base. Staggering is what stops a
   crowd of squares reading as a grid: the second row sits half a cell over
   and half a cell down. */
function crowd(y, height, seed) {
  const rand = seeded(seed);
  const shirts = ['#E8DCC0', '#2E8C9E', '#F2A73B', '#B8401F', '#9FB3AE', '#F4EDE0'];
  let out = '';
  for (let row = 0; row * PIX * 3 < height; row++) {
    const oy = y + row * PIX * 3;
    const ox = (row % 2) * PIX;
    for (let col = 0; col * PIX * 2 < 1200; col++) {
      if (rand() < 0.22) continue;           // gaps: nobody sells out every seat
      out += px(ox + col * PIX * 2, oy, PIX, PIX, shirts[(rand() * shirts.length) | 0]);
    }
  }
  return out;
}

/* Mow stripes, as flat wedges fanning from the infield with a dithered
   column down each edge. Drawn as vertical bands clipped to the turf box
   rather than as true wedges: at this scale the difference is invisible and
   a rect is a rect is a pixel. */
function mowStripes(y, height, light, dark) {
  let out = '';
  const w = 96;
  for (let i = 0; i * w < 1300; i++) {
    const x = -50 + i * w;
    out += px(x, y, w, height, i % 2 ? light : dark);
    out += dither(x, y, PIX * 3, height, i % 2 ? dark : light, i % 2);
  }
  return out;
}

// Scattered lighter tufts. Sparse, never on the infield dirt, and never
// bright enough to compete with anything that moves.
function tufts(seed, count, box, fill) {
  const rand = seeded(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = Math.round((box.x + rand() * box.w) / PIX) * PIX;
    const y = Math.round((box.y + rand() * box.h) / PIX) * PIX;
    out += px(x, y, PIX * (rand() < 0.3 ? 2 : 1), PIX, fill);
  }
  return out;
}

/* A blocky stepped mound or home circle: three shades, lit on top, base in
   the middle, shadow along the bottom. Built as rows of decreasing width so
   the silhouette steps rather than curves. */
function steppedCircle(cx, cy, rx, ry, lit, base, shade) {
  let out = '';
  const rows = Math.max(2, Math.round((ry * 2) / PIX));
  for (let i = 0; i < rows; i++) {
    const t = (i + 0.5) / rows;                       // 0 top .. 1 bottom
    const w = Math.round((rx * 2 * Math.sqrt(1 - Math.pow(2 * t - 1, 2))) / PIX) * PIX;
    if (w <= 0) continue;
    const y = Math.round((cy - ry + i * PIX) / PIX) * PIX;
    const fill = t < 0.34 ? lit : t > 0.74 ? shade : base;
    out += px(Math.round((cx - w / 2) / PIX) * PIX, y, w, PIX, fill);
  }
  return out;
}

const BALLPARK_SVG = String.raw`
    <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMax meet"
         shape-rendering="crispEdges"
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Golden hour: dusky blue overhead falling through rose into
             a hot band right at the stadium rim. -->
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"    stop-color="#17375F"/>
          <stop offset="0.30" stop-color="#3E6E93"/>
          <stop offset="0.55" stop-color="#95799B"/>
          <stop offset="0.76" stop-color="#E08A55"/>
          <stop offset="0.92" stop-color="#F9B65C"/>
          <stop offset="1"    stop-color="#FFD98A"/>
        </linearGradient>

        <!-- The sun itself, sitting low behind the third-base stands -->
        <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0"    stop-color="#FFF3CE" stop-opacity="0.98"/>
          <stop offset="0.28" stop-color="#FFD98A" stop-opacity="0.75"/>
          <stop offset="0.62" stop-color="#F79B4C" stop-opacity="0.32"/>
          <stop offset="1"    stop-color="#E8763C" stop-opacity="0"/>
        </radialGradient>

        <!-- Falloff for the tower lamps -->
        <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0"    stop-color="#FFF0BE" stop-opacity="0.55"/>
          <stop offset="0.35" stop-color="#FFE08A" stop-opacity="0.22"/>
          <stop offset="1"    stop-color="#FFD070" stop-opacity="0"/>
        </radialGradient>

        <!-- Haze sitting on the horizon line -->
        <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#FFC985" stop-opacity="0"/>
          <stop offset="1" stop-color="#FFC985" stop-opacity="0.55"/>
        </linearGradient>

        <!-- Warm key light raking across the whole scene from the left -->
        <radialGradient id="warmth" cx="0.24" cy="0.42" r="0.85">
          <stop offset="0"   stop-color="#FFC46B" stop-opacity="0.30"/>
          <stop offset="0.5" stop-color="#FF9A4A" stop-opacity="0.12"/>
          <stop offset="1"   stop-color="#B3502A" stop-opacity="0"/>
        </radialGradient>

        <!-- Corners fall off, the way a broadcast lens vignettes -->
        <radialGradient id="vignette" cx="0.5" cy="0.62" r="0.78">
          <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
          <stop offset="1"    stop-color="#04180C" stop-opacity="0.42"/>
        </radialGradient>

        <!-- Turf: lit from the left, deepening toward the far corners -->
        <linearGradient id="turf" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0"   stop-color="#3AAE63"/>
          <stop offset="0.45" stop-color="#2E9B57"/>
          <stop offset="1"   stop-color="#1F7742"/>
        </linearGradient>

        <!-- Clay, lighter where the light hits it -->
        <radialGradient id="clay" cx="0.42" cy="0.35" r="0.75">
          <stop offset="0" stop-color="#D8823F"/>
          <stop offset="0.6" stop-color="#C4662F"/>
          <stop offset="1" stop-color="#9E4A20"/>
        </radialGradient>

        <!-- Seat decks. Two tones so the bowl has some depth. -->
        <linearGradient id="deckShade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#06222F" stop-opacity="0.55"/>
          <stop offset="0.45" stop-color="#06222F" stop-opacity="0.12"/>
          <stop offset="1" stop-color="#06222F" stop-opacity="0.42"/>
        </linearGradient>

        <!-- Three crowd layers at different scales and colors. Stacking
             them is what turns a pattern into a packed house. -->
        <pattern id="crowdA" width="8" height="6" patternUnits="userSpaceOnUse">
          <circle cx="2"   cy="1.8" r="1.7" fill="#FBE9CF" opacity="0.55"/>
          <circle cx="6"   cy="4.4" r="1.6" fill="#F6C79A" opacity="0.45"/>
        </pattern>
        <pattern id="crowdB" width="13" height="9" patternUnits="userSpaceOnUse">
          <circle cx="3"  cy="6.5" r="1.9" fill="#1B5C74" opacity="0.55"/>
          <circle cx="9"  cy="2.5" r="1.9" fill="#C4472B" opacity="0.5"/>
          <circle cx="11.5" cy="7"  r="1.5" fill="#F2A73B" opacity="0.5"/>
        </pattern>
        <pattern id="crowdC" width="19" height="14" patternUnits="userSpaceOnUse">
          <circle cx="5"  cy="4"  r="2.1" fill="#0E4C5C" opacity="0.45"/>
          <circle cx="14" cy="10" r="2.1" fill="#F4EDE0" opacity="0.4"/>
          <circle cx="16" cy="3"  r="1.6" fill="#8CC63F" opacity="0.35"/>
        </pattern>

        <!-- Fine speckle for the clay, so it isn't a flat slab -->
        <pattern id="grit" width="22" height="22" patternUnits="userSpaceOnUse">
          <circle cx="4"  cy="6"  r="1.5" fill="#8E4519" opacity="0.16"/>
          <circle cx="15" cy="3"  r="1.1" fill="#F0A263" opacity="0.14"/>
          <circle cx="9"  cy="16" r="1.7" fill="#8E4519" opacity="0.13"/>
          <circle cx="19" cy="13" r="1.2" fill="#F0A263" opacity="0.12"/>
        </pattern>

        <!-- A runner, reused at each base. Built as a jointed figure rather
             than a block: hip-knee-foot legs so the crouch is real geometry,
             shoulders wider than the waist, bent arms, and a batting helmet.
             Drawn small — these are up the field, behind the batter. -->
        <g id="runnerFig">
          <rect x="-12" y="-1" width="24" height="4" fill="#0A3D24" opacity="0.34"/>
          <g stroke="#F4EDE0" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M-4,-14.4 L-8,-7.4 L-10.5,0"/>
          <path d="M4,-14.4 L8,-7.4 L10.5,0"/>
          </g>
          <g fill="#0E4C5C">
          <ellipse cx="-10.9" cy="0.5" rx="3.2" ry="1.8"/>
          <ellipse cx="10.9" cy="0.5" rx="3.2" ry="1.8"/>
          </g>
          <path d="M-7.5,-25.8 Q0,-28.6 7.5,-25.8 L5,-13.9 Q0,-12.2 -5,-13.9 Z" fill="#F4EDE0"/>
          <path d="M-7.5,-25.8 Q0,-28.6 7.5,-25.8 L7.1,-23.4 Q0,-26.2 -7.1,-23.4 Z" fill="#0E4C5C"/>
          <g stroke="#F4EDE0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M-6.8,-24.6 L-11.4,-19.4 L-10.2,-12.8"/>
          <path d="M6.8,-24.6 L11.2,-19.8 L9.6,-13.4"/>
          </g>
          <circle cx="0.4" cy="-30.8" r="5" fill="#EBCBA6"/>
          <path d="M-5.6,-30.2 A6,6 0 0 1 6.4,-30.2 Z" fill="#0E4C5C"/>
          <ellipse cx="0.4" cy="-30.4" rx="6" ry="1.4" fill="#0E4C5C"/>
          <path d="M-5,-30.2 q-1.5,2.8 0.5,4.3 q1.9,0.4 2.4,-1.5 Z" fill="#0E4C5C"/>
          <!-- Lit from the left: a shade down the right edge of the figure,
               and a flat shadow on the grass under it. Both sit inside the
               figure's existing extents, so nothing about where a runner is
               measured to be has moved. -->
          <g fill="#0A2A33" opacity="0.34">
            <rect x="4" y="-26" width="4" height="13"/>
            <rect x="7" y="-15" width="4" height="15"/>
            <rect x="2" y="-31" width="4" height="5"/>
          </g>
        </g>

        <!-- A fielder, reused at every position and scaled by depth. Road
             greys, so the defense reads as the visiting club against the
             Cotorras' home whites the batter and runners wear.

             Posed in the set position: feet wide and planted, knees flexed
             through a hip-knee-foot chain, torso pitched forward with the
             shoulders carrying wider than the waist, glove arm bent low and
             out front, throwing arm cocked back. -->
        <g id="fielderFig">
          <rect x="-14" y="-0.5" width="28" height="4" fill="#0A3D24" opacity="0.34"/>
          <g stroke="#B9C2C0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M-4.5,-15.8 L-8.6,-8 L-11,0"/>
          <path d="M4.5,-15.8 L8.6,-8 L11,0"/>
          </g>
          <g fill="#1D3A46">
          <ellipse cx="-11.4" cy="0.6" rx="3.4" ry="1.9"/>
          <ellipse cx="11.4" cy="0.6" rx="3.4" ry="1.9"/>
          </g>
          <path d="M-8,-28 Q0,-31 8,-28 L5.4,-15.4 Q0,-13.5 -5.4,-15.4 Z" fill="#B9C2C0"/>
          <path d="M-8,-28 Q0,-31 8,-28 L7.6,-25.3 Q0,-28.3 -7.6,-25.3 Z" fill="#1D3A46"/>
          <g stroke="#B9C2C0" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M-7,-26.4 L-12,-20.4 L-12.6,-13"/>
          <path d="M7,-26.4 L11.6,-21.8 L9,-15.4"/>
          </g>
          <circle cx="0.4" cy="-33.4" r="5.4" fill="#E8C9A6"/>
          <path d="M-5.2,-33.4 A5.6,5.6 0 0 1 6,-33.4 Z" fill="#1D3A46"/>
          <ellipse cx="0.4" cy="-33" rx="6.1" ry="1.5" fill="#1D3A46"/>
          <circle cx="-13.3" cy="-11.5" r="4.9" fill="#8A5A2B"/>
          <!-- Right-edge shade, same light direction as the mound and the
               home circle: from the left and slightly above. -->
          <g fill="#0F2630" opacity="0.32">
            <rect x="4" y="-28" width="4" height="14"/>
            <rect x="7.5" y="-16" width="4" height="16"/>
            <rect x="2" y="-34" width="4" height="6"/>
          </g>
        </g>

        <!-- One palm, reused across the stadium rim at different sizes -->
        <g id="palm">
          <path d="M0,0 C-3,-24 -5,-44 -2,-64 L4,-64 C5,-44 4,-24 6,0 Z"/>
          <g transform="translate(1,-64)">
            <ellipse rx="24" ry="6" transform="rotate(-15) translate(-20,-2)"/>
            <ellipse rx="24" ry="6" transform="rotate(19)  translate(20,-2)"/>
            <ellipse rx="20" ry="6" transform="rotate(-54) translate(-15,-4)"/>
            <ellipse rx="20" ry="6" transform="rotate(57)  translate(15,-4)"/>
            <ellipse rx="8"  ry="10" cy="-6"/>
          </g>
        </g>
      </defs>

      <!-- ================= SKY =================
           Three flat bands, not a gradient. The transitions are two rows of
           dithered PIX squares, which is how a 16-bit palette fakes a ramp
           and the only way this holds up when the park is scaled to a
           desktop width. -->
      <rect width="1200" height="152" fill="#17375F"/>
      <rect y="152" width="1200" height="118" fill="#7C4A6E"/>
      <rect y="270" width="1200" height="114" fill="#DB7F4E"/>
      ${bandEdge(144, '#17375F', '#7C4A6E')}
      ${bandEdge(262, '#7C4A6E', '#DB7F4E')}

      <!-- Clouds as flat bars, stepped rather than streaked -->
      <g fill="#8A5A7C">
        <rect x="128" y="84"  width="344" height="8"/>
        <rect x="164" y="76"  width="212" height="8"/>
        <rect x="820" y="60"  width="280" height="8"/>
      </g>
      <g fill="#C9708A">
        <rect x="636" y="140" width="408" height="8"/>
        <rect x="700" y="132" width="216" height="8"/>
        <rect x="72"  y="168" width="368" height="8"/>
      </g>
      <g fill="#F6C08A">
        <rect x="148" y="180" width="304" height="8"/>
        <rect x="700" y="156" width="308" height="8"/>
        <rect x="476" y="204" width="248" height="8"/>
      </g>

      <!-- The sun, low and mostly behind the stands. Stepped, so it is a
           shape in the palette rather than a light source. -->
      ${steppedCircle(108, 196, 44, 44, '#FFF8E4', '#FFE9A8', '#F6C08A')}

      <!-- ================= LIGHT TOWERS ================= -->
      <g fill="#12455A">
        <rect x="118" y="118" width="6" height="145"/>
        <rect x="398" y="100" width="6" height="163"/>
        <rect x="798" y="100" width="6" height="163"/>
        <rect x="1078" y="118" width="6" height="145"/>
      </g>
      <g fill="#1B5C74">
        <rect x="98"   y="102" width="46" height="22" rx="3"/>
        <rect x="378"  y="84"  width="46" height="22" rx="3"/>
        <rect x="778"  y="84"  width="46" height="22" rx="3"/>
        <rect x="1058" y="102" width="46" height="22" rx="3"/>
      </g>
      <!-- Lamps lit against the dusk -->
      <g fill="#FFF3CE">
        <circle cx="109" cy="113" r="3.4"/><circle cx="121" cy="113" r="3.4"/><circle cx="133" cy="113" r="3.4"/>
        <circle cx="389" cy="95"  r="3.4"/><circle cx="401" cy="95"  r="3.4"/><circle cx="413" cy="95"  r="3.4"/>
        <circle cx="789" cy="95"  r="3.4"/><circle cx="801" cy="95"  r="3.4"/><circle cx="813" cy="95"  r="3.4"/>
        <circle cx="1069" cy="113" r="3.4"/><circle cx="1081" cy="113" r="3.4"/><circle cx="1093" cy="113" r="3.4"/>
      </g>
      <g fill="url(#lampGlow)">
        <circle cx="121" cy="113" r="52"/><circle cx="401" cy="95" r="52"/>
        <circle cx="801" cy="95"  r="52"/><circle cx="1081" cy="113" r="52"/>
      </g>

      <!-- ================= PALMS above the rim ================= -->
      <g fill="#0A3526" opacity="0.92">
        <use href="#palm" transform="translate(52,238) scale(0.72)"/>
        <use href="#palm" transform="translate(188,241) scale(0.6)"/>
        <use href="#palm" transform="translate(600,236) scale(0.52)"/>
        <use href="#palm" transform="translate(1000,240) scale(0.66)"/>
        <use href="#palm" transform="translate(1148,237) scale(0.78)"/>
      </g>

      <!-- ================= THE BOWL =================
           Deeper decks than before, three crowd layers stacked, aisles
           and section breaks cut through them, then a shading pass. -->

      <!-- roof / facade -->
      <rect y="206" width="1200" height="8" fill="#0B3B4C"/>
      <rect y="206" width="1200" height="4" fill="#F2A73B"/>

      <!-- upper deck: dark bowl, two staggered rows of heads over it -->
      <rect y="214" width="1200" height="78" fill="#0A2E3C"/>
      ${crowd(220, 68, 12345)}

      <!-- deck divider / press level -->
      <rect y="292" width="1200" height="8" fill="#08313F"/>
      <rect y="292" width="1200" height="4" fill="#1B5C74"/>

      <!-- lower deck: closer, so the heads sit on a warmer base -->
      <rect y="300" width="1200" height="44" fill="#123A47"/>
      ${crowd(304, 36, 99887)}

      <!-- aisles cutting down through both decks, snapped to the grid -->
      <g fill="#062632">
        <rect x="68"   y="214" width="4" height="130"/>
        <rect x="208"  y="214" width="4" height="130"/>
        <rect x="348"  y="214" width="4" height="130"/>
        <rect x="488"  y="214" width="4" height="130"/>
        <rect x="628"  y="214" width="4" height="130"/>
        <rect x="768"  y="214" width="4" height="130"/>
        <rect x="908"  y="214" width="4" height="130"/>
        <rect x="1048" y="214" width="4" height="130"/>
        <rect x="1160" y="214" width="4" height="130"/>
      </g>

      <!-- ================= OUTFIELD WALL =================
           Four flat parts, top to bottom: a chalk rail, the padded body,
           the panel seams, and the shadow the pad throws onto the track. -->
      <rect y="344" width="1200" height="4"  fill="#F4EDE0"/>
      <rect y="348" width="1200" height="4"  fill="#F2A73B"/>
      <rect y="352" width="1200" height="28" fill="#0E4C5C"/>
      <g fill="#0A3B47">
        <rect x="148"  y="352" width="4" height="28"/>
        <rect x="298"  y="352" width="4" height="28"/>
        <rect x="448"  y="352" width="4" height="28"/>
        <rect x="598"  y="352" width="4" height="28"/>
        <rect x="748"  y="352" width="4" height="28"/>
        <rect x="898"  y="352" width="4" height="28"/>
        <rect x="1048" y="352" width="4" height="28"/>
      </g>
      <rect y="380" width="1200" height="4" fill="#072B34"/>

      <!-- Wall signage on its own backing panel, so it reads as painted
           signage rather than floating letters. Both this and the video
           board sit inside the horizontal band that survives cropping on
           any window >= 900px; below that they hide entirely (see the
           media query in style.css) rather than render half cut off. -->
      <g id="wall-sign" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
        <rect x="885" y="354" width="110" height="26" rx="3" fill="#F4EDE0" opacity="0.94"/>
        <text x="940" y="373" text-anchor="middle" font-size="12" font-weight="800"
              letter-spacing="1.6" fill="#0E4C5C">SAN JUAN</text>
      </g>

      <!-- Foul poles where the lines meet the wall -->
      <g fill="#F2C744">
        <rect x="166" y="250" width="7" height="150"/>
        <rect x="1027" y="250" width="7" height="150"/>
      </g>

      <!-- ================= THE FIELD =================
           Base turf, mow stripes over it, a dithered column down each stripe
           edge, then sparse tufts. The stripes are held to two shades a few
           steps apart: this is the surface the ball crosses, and every step
           of contrast spent here is a step taken away from reading it. -->
      <rect y="384" width="1200" height="416" fill="#2A6539"/>
      ${mowStripes(412, 388, '#317343', '#255B33')}
      ${tufts(4242, 90, { x: 0, y: 430, w: 1200, h: 360 }, '#3A8050')}

      <!-- Warning track hugging the wall, with a dithered inside edge -->
      <rect y="384" width="1200" height="28" fill="#B45C2A"/>
      <rect y="384" width="1200" height="4"  fill="#C97A45"/>
      ${dither(0, 408, 1200, PIX, '#B45C2A', 0)}
      ${tufts(777, 40, { x: 0, y: 388, w: 1200, h: 20 }, '#A04E24')}

      <!-- Foul lines running out to the poles -->
      <g stroke="#F7EFDF" stroke-width="3" opacity="0.85" fill="none">
        <path d="M600,726 L170,398"/>
        <path d="M600,726 L1030,398"/>
      </g>

      <!-- Base cutouts and the mound, stepped in three shades: lit across
           the top, clay through the middle, shadow along the bottom edge.
           Same light direction as every sprite in the park — from the left
           and slightly above. -->
      ${steppedCircle(600, 590, 66, 23, '#C97A45', '#B45C2A', '#8E4519')}
      ${steppedCircle(600, 465, 38, 14, '#C97A45', '#B45C2A', '#8E4519')}
      ${steppedCircle(330, 520, 40, 15, '#C97A45', '#B45C2A', '#8E4519')}
      ${steppedCircle(870, 520, 40, 15, '#C97A45', '#B45C2A', '#8E4519')}
      <g fill="#FBF6EA">
        <rect id="rubber"     x="592" y="584" width="17" height="5" rx="1"/>
        <rect id="bag-second" x="593" y="460" width="15" height="8" rx="1"/>
        <rect id="bag-third"  x="323" y="515" width="15" height="8" rx="1"/>
        <rect id="bag-first"  x="863" y="515" width="15" height="8" rx="1"/>
      </g>

      <!-- ================= THE DEFENSE =================
           Static and decorative for now — no fielding logic behind any of
           them. Scale falls off with depth, matching the runner figures:
           outfielders smallest, the pitcher largest of the nine.

           Depth reads bottom-of-frame = closest. Outfielders sit between
           the warning track and second base; the infielders play behind
           their bags; the pitcher stands on the rubber. First and third
           play off the line, which also keeps them clear of the runners
           holding those bags. -->
      <g id="fielders">
        <use href="#fielderFig" id="fielder-lf" class="fielder" transform="translate(300,440) scale(0.68)"/>
        <use href="#fielderFig" id="fielder-cf" class="fielder" transform="translate(600,424) scale(0.66)"/>
        <use href="#fielderFig" id="fielder-rf" class="fielder" transform="translate(900,440) scale(0.68)"/>
        <use href="#fielderFig" id="fielder-ss" class="fielder" transform="translate(480,480) scale(0.8)"/>
        <use href="#fielderFig" id="fielder-2b" class="fielder" transform="translate(720,480) scale(0.8)"/>
        <use href="#fielderFig" id="fielder-3b" class="fielder" transform="translate(410,505) scale(0.85)"/>
        <use href="#fielderFig" id="fielder-1b" class="fielder" transform="translate(790,505) scale(0.85)"/>
        <use href="#fielderFig" id="fielder-p"  class="fielder" transform="translate(600,584) scale(1.05)"/>
      </g>

      <!-- Runners. app.js toggles the "on" class on each group as the base
           state changes; the CSS fades them in. Third base is on our left,
           first on our right, the way it looks from behind home plate. -->
      <g class="runner" id="runner-third">
        <ellipse cx="330" cy="520" rx="34" ry="14" fill="#F6C445" opacity="0.45"/>
        <use href="#runnerFig" transform="translate(298,523)"/>
      </g>
      <g class="runner" id="runner-second">
        <ellipse cx="600" cy="465" rx="32" ry="13" fill="#F6C445" opacity="0.45"/>
        <use href="#runnerFig" transform="translate(626,468)"/>
      </g>
      <g class="runner" id="runner-first">
        <ellipse cx="870" cy="520" rx="34" ry="14" fill="#F6C445" opacity="0.45"/>
        <use href="#runnerFig" transform="translate(902,523)"/>
      </g>

      <!-- ================= FOREGROUND: home plate ================= -->
      ${steppedCircle(600, 730, 268, 80, '#C97A45', '#B45C2A', '#8E4519')}
      <!-- scuffed arc where batters dig in, as flat blocks -->
      <g fill="#9E5322">
        <rect x="436" y="736" width="72" height="4"/>
        <rect x="508" y="728" width="60" height="4"/>
        <rect x="568" y="724" width="64" height="4"/>
        <rect x="632" y="728" width="60" height="4"/>
        <rect x="692" y="736" width="72" height="4"/>
      </g>
      <g stroke="#F7EFDF" stroke-width="2.5" fill="none" opacity="0.7">
        <path d="M484,700 L576,700 L562,772 L464,772 Z"/>
        <path d="M624,700 L716,700 L738,772 L642,772 Z"/>
      </g>
      <polygon id="home-plate-bag" points="588,716 612,716 612,726 600,735 588,726" fill="#FBF6EA"/>

      <!-- ================= THE BATTER =================
           Cotorras home whites: cream uniform, teal trim, gold accents.
           Right-handed, so he stands in the third-base box, on our left,
           seen from behind.

           Loaded rather than standing: a wide base with the weight sunk
           into a bent back leg, the front leg braced straighter, the torso
           coiled over the hips, and the back elbow carried high with the
           hands back by the rear shoulder — the position a hitter is in
           when the pitch is on its way.

           Only the near arm is drawn in full, with the far one showing as a
           forearm by the hands. From behind that is what you actually see:
           two full arms across the chest read as a sash, not limbs. -->
      <g>
        <!-- long golden-hour shadow, thrown away from the low sun -->
        <ellipse cx="596" cy="774" rx="86" ry="13" fill="#7A3A14"
                 opacity="0.32" transform="rotate(-5 596 774)"/>

        <!-- legs: hip -> knee -> foot. The back leg carries the weight, so
             it bends deeper than the braced front leg. -->
        <g stroke="#F4EDE0" stroke-width="21" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M509,702 L497,736 L494,766"/>
          <path d="M533,702 L547,734 L551,766"/>
        </g>
        <g stroke="#0E4C5C" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"
           fill="none" opacity="0.75">
          <path d="M500,704 L487,736 L485,764"/>
          <path d="M542,704 L556,734 L559,764"/>
        </g>
        <ellipse cx="492" cy="770" rx="17" ry="7" fill="#12313B" transform="rotate(-8 492 770)"/>
        <ellipse cx="553" cy="770" rx="17" ry="7" fill="#12313B" transform="rotate(6 553 770)"/>

        <!-- jersey: shoulders turned in over a narrower waist -->
        <path d="M491,654 Q521,643 553,656 L552,700 Q520,712 489,700 Z" fill="#F4EDE0"/>
        <path d="M491,654 Q521,643 553,656 L554,668 Q521,655 490,666 Z" fill="#0E4C5C"/>
        <path d="M490,666 Q521,655 554,668 L554,672 Q521,659 490,670 Z" fill="#F2A73B"/>
        <text x="519" y="695" text-anchor="middle"
              font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
              font-size="26" font-weight="800" fill="#0E4C5C"
              stroke="#F2A73B" stroke-width="1.1">21</text>

        <!-- arms: the back elbow rides high, both hands together behind the
             rear shoulder -->
        <g stroke="#F4EDE0" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M499,660 L509,641 L549,642"/>
        </g>
        <g stroke="#E8DECA" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M539,656 L550,648 L552,643"/>
        </g>
        <circle cx="554" cy="642" r="9" fill="#12313B"/>

        <!-- bat, cocked back over the shoulder -->
        <path d="M553,640 L617,549" stroke="#C98A4B" stroke-width="10" stroke-linecap="round"/>
        <path d="M551,645 L561,630" stroke="#8A5A2B" stroke-width="12" stroke-linecap="round"/>

        <!-- helmet, seen from behind, ear flap on the near side, club mark
             in gold on the back -->
        <ellipse cx="519" cy="636" rx="20" ry="18" fill="#0E4C5C"/>
        <path d="M501,638 Q496,649 504,655 Q512,656 514,647 Z" fill="#0E4C5C"/>
        <path d="M499,631 Q519,622 539,631 Q519,626 499,631 Z" fill="#F2A73B" opacity="0.9"/>
        <text x="520" y="643" text-anchor="middle"
              font-family="system-ui, sans-serif" font-size="13" font-weight="800"
              fill="#F2A73B">SJ</text>
      </g>

      <!-- Catcher, crouched behind the plate. He is nearer the camera than
           anyone, so he is the largest figure on the field.

           A real squat rather than a block: thighs splayed wide off the
           hips, shins dropping to planted feet, shin guards strapped over
           them, the chest protector's back panel above, and the mitt up and
           out to the glove side. Grey with dark gear, so the shape still
           reads at a glance instead of going to a single dark mass. -->
      <g id="fielder-c" class="fielder" transform="translate(632,802) scale(1.15)">
        <ellipse rx="46" ry="11" fill="#7A3A14" opacity="0.3"/>

        <!-- thighs splayed out from the hips, then shins down to the feet -->
        <g stroke="#B9C2C0" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M-9,-38 L-29,-22 L-26,-5"/>
          <path d="M9,-38 L29,-22 L26,-5"/>
        </g>
        <!-- shin guards strapped over the shins -->
        <g stroke="#1D3A46" stroke-width="11" stroke-linecap="round" fill="none">
          <path d="M-29,-21 L-26,-6"/>
          <path d="M29,-21 L26,-6"/>
        </g>
        <g fill="#1D3A46">
          <ellipse cx="-26" cy="-2" rx="9" ry="4"/>
          <ellipse cx="26" cy="-2" rx="9" ry="4"/>
        </g>

        <!-- back panel of the chest protector, over the shoulders -->
        <path d="M-21,-36 q21,-11 42,0 l2,10 q-23,9 -46,0 Z" fill="#B9C2C0"/>
        <path d="M-23,-52 q23,-13 46,0 l-1,14 q-22,-10 -44,0 Z" fill="#1D3A46"/>
        <path d="M-16,-50 l3,16 M16,-50 l-3,16" stroke="#B9C2C0" stroke-width="3"
              opacity="0.5" fill="none"/>

        <!-- mask and helmet -->
        <ellipse cy="-62" rx="14" ry="12" fill="#243A44"/>
        <path d="M-14,-62 q14,-8 28,0 q-14,-4 -28,0 Z" fill="#8CC63F" opacity="0.5"/>

        <!-- mitt, up and out on the glove side -->
        <g stroke="#B9C2C0" stroke-width="9" stroke-linecap="round" fill="none">
          <path d="M-19,-44 L-31,-40"/>
        </g>
        <circle cx="-37" cy="-40" r="11" fill="#8A5A2B"/>
        <path d="M-45,-45 q8,-3 15,2" stroke="#6E4522" stroke-width="2.6" fill="none"/>
      </g>

      <!-- ================= LIGHT PASS ================= -->
      <rect width="1200" height="800" fill="url(#warmth)"/>
      <rect width="1200" height="800" fill="url(#vignette)"/>

      <!-- ================= SCOREBUG =================
           A broadcast-style scoreboard mounted on the outfield wall, driven
           by real game state: the home line is state.runs, and the inning
           and out count come straight from state as well. app.js fills the
           numbers in renderScoreboard().

           The visiting line is a fixed placeholder — there is no opposing
           side in the game yet. There is no balls/strikes field because the
           game tracks no count; the field is omitted rather than faked.

           Sits inside the horizontal band that survives cropping on any
           window >= 900px; below that it hides (see style.css).

           Drawn after the scene's light pass: an LED board emits its own
           light, so the golden-hour wash must not tint it brown. -->
      <g id="scorebug" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">
        <rect x="202" y="262" width="116" height="82" rx="4" fill="#02070A"/>
        <rect x="204" y="264" width="112" height="78" rx="3" fill="#0A1519"/>

        <!-- visiting line -->
        <rect x="204" y="264" width="5" height="24" fill="#8A9296"/>
        <text x="217" y="281" font-size="11" font-weight="700" letter-spacing="0.7"
              fill="#C3CDCB">VIS</text>
        <text id="board-away-runs" x="308" y="282" text-anchor="end"
              font-size="14" font-weight="800" fill="#FFFFFF">0</text>

        <path d="M204,288 H316" stroke="#26363D" stroke-width="1"/>

        <!-- home line, lit because they are the side at bat -->
        <rect x="204" y="289" width="112" height="24" fill="#13252B"/>
        <rect x="204" y="289" width="5" height="24" fill="#F2A73B"/>
        <text x="217" y="306" font-size="11" font-weight="700" letter-spacing="0.7"
              fill="#FFFFFF">SJU</text>
        <text id="board-home-runs" x="308" y="307" text-anchor="end"
              font-size="14" font-weight="800" fill="#F2A73B">0</text>

        <!-- status strip: half-inning and outs -->
        <rect x="204" y="314" width="112" height="28" fill="#02070A"/>
        <!-- a down arrow: the home side bats in the bottom half -->
        <polygon points="213,322 222,322 217.5,330" fill="#F2A73B"/>
        <text id="board-inning" x="228" y="331" font-size="11" font-weight="700"
              fill="#E4EBE9">1</text>
        <text id="board-outs" x="308" y="331" text-anchor="end" font-size="11"
              font-weight="700" fill="#E4EBE9">0 OUT</text>
      </g>

    </svg>
`;

// Fill the mount point. Runs at load, before the mode scripts build their
// element tables, so #runner-first and friends already exist by then.
function mountScene(id) {
  const host = document.getElementById(id || 'scene-mount');
  if (host) host.innerHTML = BALLPARK_SVG;
}

mountScene();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BALLPARK_SVG, mountScene };
}
