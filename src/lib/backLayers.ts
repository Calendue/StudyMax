// Transient UI closes before screen navigation. A sheet wins over its screen's local view;
// equally ranked layers close in the order they opened, including nested sheets.
type BackLayer = { close: () => void; priority: number }
const layers: BackLayer[] = []

export function registerBackLayer(close: () => void, priority = 0): () => void {
  const layer = { close, priority }
  layers.push(layer)
  return () => {
    const index = layers.indexOf(layer)
    if (index >= 0) layers.splice(index, 1)
  }
}

export function dismissBackLayer(): boolean {
  let top: BackLayer | undefined
  for (const layer of layers) if (!top || layer.priority >= top.priority) top = layer
  if (!top) return false
  top.close()
  return true
}
