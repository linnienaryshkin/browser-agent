import { createContext, useContext } from 'react';
import type { ModelId } from './types';

export const ModelContext = createContext<ModelId>('claude-haiku-4-5');

export function useModel(): ModelId {
  return useContext(ModelContext);
}
