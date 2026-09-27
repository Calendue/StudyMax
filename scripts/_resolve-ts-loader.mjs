// A resolution hook for running scripts directly with plain Node (--experimental-strip-types).
//
// api/*.ts and, since docs/BayMax, the src/ files they import (src/lib/plan.ts, src/data/programs/*,
// etc.) use ".js"-suffixed relative imports — required so Vercel's deployed output (each .ts file
// transpiled 1:1 to a same-named .js file, without rewriting import specifiers) can resolve them at
// runtime. Vite handles ".js" specifiers pointing at ".ts" source fine on its own, but plain Node's
// ESM resolver does not, so any script that transitively imports one of those files needs this.
//
// Usage: node --experimental-strip-types --experimental-loader ./scripts/_resolve-ts-loader.mjs <script>
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (specifier.endsWith('.js') && (specifier.startsWith('.') || specifier.startsWith('/'))) {
      return nextResolve(specifier.slice(0, -3) + '.ts', context)
    }
    throw err
  }
}
