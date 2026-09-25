import { useOutletContext } from 'react-router-dom';
import type { LayoutContext } from '../layouts/MainLayout';

/** Lets pages (Dashboard) read the search box that lives in MainLayout's header. */
export function useLayoutContext() {
  return useOutletContext<LayoutContext>();
}
