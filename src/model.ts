import { createContext, useContext } from 'react'
import type { Model } from './App.tsx'

// App owns every piece of state; screens read it from here instead of through two dozen props.
export const ModelContext = createContext<Model | null>(null)

export function useModel(): Model {
  const model = useContext(ModelContext)
  if (!model) throw new Error('useModel outside ModelContext')
  return model
}
