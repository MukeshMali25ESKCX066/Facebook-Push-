# PageCrew

PageCrew is organized as a small frontend/backend project:

- `frontend/public/` contains the production frontend build and static pages.
- `backend/` contains the compiled Node.js API and its package manifest.
- `serve-pagecrew.py` serves the frontend on port 5173 and proxies `/api/*` to the backend on port 4000.

## Run locally

1. In `backend/`, install dependencies with `npm install` if needed, then run `npm start`.
2. In a separate terminal at the project root, run `python serve-pagecrew.py`.
3. Open <http://127.0.0.1:5173>.

Configure local secrets and service settings in `backend/.env`. Do not commit that file.

This checkout contains the built frontend and compiled backend output; the original frontend and backend source files are not included.
