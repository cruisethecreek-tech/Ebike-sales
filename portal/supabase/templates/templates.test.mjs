import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

// Supabase renders these with Go's html/template, which refuses a double
// quote inside a double-quoted attribute (font-family: "Trebuchet MS" in a
// style="..."). The refusal is a 500 on every sign-in email, so nobody can
// sign in until the template is fixed in the dashboard.
const dir = new URL('.', import.meta.url)

for (const name of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  test(`${name}: no double quotes nested inside an attribute`, () => {
    const html = readFileSync(new URL(name, dir), 'utf8')
    for (const tag of html.match(/<[a-zA-Z][^>]*>/g) ?? []) {
      // Strip well-formed name="value" pairs; any quote left over is stray.
      const rest = tag.replace(/\s[\w:-]+="[^"]*"/g, '').replace(/\s[\w:-]+='[^']*'/g, '')
      assert.ok(!rest.includes('"'), `stray quote in ${tag.slice(0, 80)}`)
    }
  })
}
