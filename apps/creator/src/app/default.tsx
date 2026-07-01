// Parallel-route fallback (App Router). Without a root `default.tsx`, Next logs
// "No default component was found for a parallel route rendered on this page.
// Falling back to nearest NotFound boundary." whenever a page calls notFound()
// (e.g. the Design Studio canvas when a product/die-cut can't be resolved).
// Render the same 404 UI as not-found.tsx so the fallback is intentional + quiet.
export { default } from './not-found'
