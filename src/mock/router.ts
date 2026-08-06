/**
 * Preview-only `react-router-dom` shim: identical API, but browser history is
 * swapped for HASH history so the single-file app works when served from any
 * path (file://…/index.html or an Artifact URL), not just the site root.
 * Re-exports from the core `react-router` package to avoid aliasing itself.
 */
export {
  NavLink,
  Outlet,
  RouterProvider,
  useLocation,
  useNavigate,
  useSearchParams,
  createHashRouter as createBrowserRouter,
} from 'react-router'
