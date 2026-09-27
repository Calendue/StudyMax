import assert from 'node:assert/strict'
import { dismissBackLayer, registerBackLayer } from '../src/lib/backLayers.ts'
const closed: string[] = []
assert.equal(dismissBackLayer(), false)
const removeScreen = registerBackLayer(() => closed.push('practice'))
const removeSheet = registerBackLayer(() => closed.push('course'), 100)
const removeLateScreen = registerBackLayer(() => closed.push('peek'))
assert.equal(dismissBackLayer(), true)
assert.deepEqual(closed, ['course'], 'a sheet closes before a later-mounted screen')
const removeNested = registerBackLayer(() => closed.push('confirm'), 100)
dismissBackLayer()
assert.equal(closed.at(-1), 'confirm', 'the last opened sheet closes first')
removeNested(); removeNested(); removeSheet(); removeLateScreen()
dismissBackLayer()
assert.equal(closed.at(-1), 'practice', 'practice back becomes available after the sheet closes')
removeScreen()
assert.equal(dismissBackLayer(), false, 'unmount leaves normal navigation available')
console.log('back layers: all checks passed')
