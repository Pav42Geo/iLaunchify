// Golden self-test for the prompt engine. Run via:
//   tsc --module commonjs ... prompt.test.ts && node prompt.test.js
import { assemblePrompt } from './prompt'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}

export function runPromptSelfTest(): void {
  const out = assemblePrompt(
    {
      productDescriptor: 'box of stroopwafel cookies',
      brandName: 'Mood Cookies',
      styleTags: ['Warm', 'Minimal', 'warm'], // dup → collapses
      elementTags: ['Liquid Swirls'],
      colorTags: ['Warm Tones'],
      brandPalette: ['#FF2E63', 'not-a-hex', '#B5FF3D'],
      substrateLabel: 'kraft carton',
      packagingTypeLabel: 'flip-top mailer box',
      referencePhrases: ['artisanal caramel drizzle'],
    },
    ['Nutrition Facts panel', 'Ingredient list'],
  )

  // 1. Subject + brand present.
  assert(out.prompt.includes('box of stroopwafel cookies'), 'subject in prompt')
  assert(out.prompt.includes('Mood Cookies'), 'brand in prompt')

  // 2. De-dup + ordering: "Warm, Minimal" (first-seen, no second "warm").
  assert(out.prompt.includes('Style: Warm, Minimal.'), 'styles de-duped + ordered')

  // 3. Valid hex kept, invalid dropped.
  assert(out.prompt.includes('#FF2E63') && out.prompt.includes('#B5FF3D'), 'valid hex kept')
  assert(!out.prompt.includes('not-a-hex'), 'invalid hex dropped')

  // 4. Substrate + structure + reference woven in.
  assert(out.prompt.includes('kraft carton'), 'substrate in prompt')
  assert(out.prompt.includes('flip-top mailer box'), 'packaging type in prompt')
  assert(out.prompt.includes('artisanal caramel drizzle'), 'reference phrase in prompt')

  // 5. Negative prompt suppresses the truth layer + names reserved zones.
  assert(out.negativePrompt.includes('text'), 'neg suppresses text')
  assert(out.negativePrompt.includes('barcode'), 'neg suppresses barcode')
  assert(out.negativePrompt.includes('nutrition facts panel'), 'neg suppresses facts')
  assert(/Nutrition Facts panel/.test(out.negativePrompt), 'neg names reserved zone')

  // 6. Determinism: identical input → byte-identical output.
  const again = assemblePrompt(
    { productDescriptor: 'box of stroopwafel cookies', brandName: 'Mood Cookies', styleTags: ['Warm', 'Minimal', 'warm'], elementTags: ['Liquid Swirls'], colorTags: ['Warm Tones'], brandPalette: ['#FF2E63', 'not-a-hex', '#B5FF3D'], substrateLabel: 'kraft carton', packagingTypeLabel: 'flip-top mailer box', referencePhrases: ['artisanal caramel drizzle'] },
    ['Nutrition Facts panel', 'Ingredient list'],
  )
  assert(again.prompt === out.prompt && again.negativePrompt === out.negativePrompt, 'deterministic')

  // 7. Minimal input: subject only → still a valid, non-empty prompt + neg.
  const min = assemblePrompt({ productDescriptor: 'pouch of trail mix' })
  assert(min.prompt.includes('pouch of trail mix') && min.prompt.length > 20, 'minimal prompt ok')
  assert(min.negativePrompt.length > 0, 'minimal neg ok')
  assert(!/Style:/.test(min.prompt), 'no empty Style clause when no styles')

  console.log('Prompt golden: PASS')
}

runPromptSelfTest()
