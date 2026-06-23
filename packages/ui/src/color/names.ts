// Nearest-color naming for the Brand Palette Generator.
//
// Dataset = the W3C/CSS extended color keywords (public-domain standard names), so
// nothing licensed ships. nearestColorName() returns the closest keyword by squared
// RGB distance, formatted for display (e.g. "Medium Sea Green").

import { hexToRgb } from './convert'

// [keyword, hex] — the 140 CSS extended color keywords (deduped on color value).
const CSS_COLORS: [string, string][] = [
  ['black', '#000000'], ['navy', '#000080'], ['darkblue', '#00008B'], ['mediumblue', '#0000CD'],
  ['blue', '#0000FF'], ['darkgreen', '#006400'], ['green', '#008000'], ['teal', '#008080'],
  ['darkcyan', '#008B8B'], ['deepskyblue', '#00BFFF'], ['darkturquoise', '#00CED1'],
  ['mediumspringgreen', '#00FA9A'], ['lime', '#00FF00'], ['springgreen', '#00FF7F'],
  ['aqua', '#00FFFF'], ['cyan', '#00FFFF'], ['midnightblue', '#191970'], ['dodgerblue', '#1E90FF'],
  ['lightseagreen', '#20B2AA'], ['forestgreen', '#228B22'], ['seagreen', '#2E8B57'],
  ['darkslategray', '#2F4F4F'], ['limegreen', '#32CD32'], ['mediumseagreen', '#3CB371'],
  ['turquoise', '#40E0D0'], ['royalblue', '#4169E1'], ['steelblue', '#4682B4'],
  ['darkslateblue', '#483D8B'], ['mediumturquoise', '#48D1CC'], ['indigo', '#4B0082'],
  ['darkolivegreen', '#556B2F'], ['cadetblue', '#5F9EA0'], ['cornflowerblue', '#6495ED'],
  ['mediumaquamarine', '#66CDAA'], ['dimgray', '#696969'], ['slateblue', '#6A5ACD'],
  ['olivedrab', '#6B8E23'], ['slategray', '#708090'], ['lightslategray', '#778899'],
  ['mediumslateblue', '#7B68EE'], ['lawngreen', '#7CFC00'], ['chartreuse', '#7FFF00'],
  ['aquamarine', '#7FFFD4'], ['maroon', '#800000'], ['purple', '#800080'], ['olive', '#808000'],
  ['gray', '#808080'], ['skyblue', '#87CEEB'], ['lightskyblue', '#87CEFA'], ['blueviolet', '#8A2BE2'],
  ['darkred', '#8B0000'], ['darkmagenta', '#8B008B'], ['saddlebrown', '#8B4513'],
  ['darkseagreen', '#8FBC8F'], ['lightgreen', '#90EE90'], ['mediumpurple', '#9370DB'],
  ['darkviolet', '#9400D3'], ['palegreen', '#98FB98'], ['darkorchid', '#9932CC'],
  ['yellowgreen', '#9ACD32'], ['sienna', '#A0522D'], ['brown', '#A52A2A'], ['darkgray', '#A9A9A9'],
  ['lightblue', '#ADD8E6'], ['greenyellow', '#ADFF2F'], ['paleturquoise', '#AFEEEE'],
  ['lightsteelblue', '#B0C4DE'], ['powderblue', '#B0E0E6'], ['firebrick', '#B22222'],
  ['darkgoldenrod', '#B8860B'], ['mediumorchid', '#BA55D3'], ['rosybrown', '#BC8F8F'],
  ['darkkhaki', '#BDB76B'], ['silver', '#C0C0C0'], ['mediumvioletred', '#C71585'],
  ['indianred', '#CD5C5C'], ['peru', '#CD853F'], ['chocolate', '#D2691E'], ['tan', '#D2B48C'],
  ['lightgray', '#D3D3D3'], ['thistle', '#D8BFD8'], ['orchid', '#DA70D6'], ['goldenrod', '#DAA520'],
  ['palevioletred', '#DB7093'], ['crimson', '#DC143C'], ['gainsboro', '#DCDCDC'], ['plum', '#DDA0DD'],
  ['burlywood', '#DEB887'], ['lightcyan', '#E0FFFF'], ['lavender', '#E6E6FA'], ['darksalmon', '#E9967A'],
  ['violet', '#EE82EE'], ['palegoldenrod', '#EEE8AA'], ['lightcoral', '#F08080'], ['khaki', '#F0E68C'],
  ['aliceblue', '#F0F8FF'], ['honeydew', '#F0FFF0'], ['azure', '#F0FFFF'], ['sandybrown', '#F4A460'],
  ['wheat', '#F5DEB3'], ['beige', '#F5F5DC'], ['whitesmoke', '#F5F5F5'], ['mintcream', '#F5FFFA'],
  ['ghostwhite', '#F8F8FF'], ['salmon', '#FA8072'], ['antiquewhite', '#FAEBD7'], ['linen', '#FAF0E6'],
  ['lightgoldenrodyellow', '#FAFAD2'], ['oldlace', '#FDF5E6'], ['red', '#FF0000'],
  ['fuchsia', '#FF00FF'], ['magenta', '#FF00FF'], ['deeppink', '#FF1493'], ['orangered', '#FF4500'],
  ['tomato', '#FF6347'], ['hotpink', '#FF69B4'], ['coral', '#FF7F50'], ['darkorange', '#FF8C00'],
  ['lightsalmon', '#FFA07A'], ['orange', '#FFA500'], ['lightpink', '#FFB6C1'], ['pink', '#FFC0CB'],
  ['gold', '#FFD700'], ['peachpuff', '#FFDAB9'], ['navajowhite', '#FFDEAD'], ['moccasin', '#FFE4B5'],
  ['bisque', '#FFE4C4'], ['mistyrose', '#FFE4E1'], ['blanchedalmond', '#FFEBCD'], ['papayawhip', '#FFEFD5'],
  ['lavenderblush', '#FFF0F5'], ['seashell', '#FFF5EE'], ['cornsilk', '#FFF8DC'], ['lemonchiffon', '#FFFACD'],
  ['floralwhite', '#FFFAF0'], ['snow', '#FFFAFA'], ['yellow', '#FFFF00'], ['lightyellow', '#FFFFE0'],
  ['ivory', '#FFFFF0'], ['white', '#FFFFFF'],
]

// Precompute RGB tuples once.
const CATALOG = CSS_COLORS.map(([name, hex]) => ({ name, ...hexToRgb(hex) }))

function titleCase(name: string): string {
  // Insert spaces before known multi-word boundaries by matching the longest keywords
  // is overkill; the CSS keywords are lowercase concatenations — just capitalize.
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Closest CSS color keyword to a hex value (squared RGB distance), display-formatted. */
export function nearestColorName(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  let best = CATALOG[0] ?? { name: 'color', r: 0, g: 0, b: 0 }
  let bestD = Infinity
  for (const c of CATALOG) {
    const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  return titleCase(best.name)
}
