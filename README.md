# Wasif Ullah — Personal Academic Website

A minimalist, dark academic website: plain HTML, CSS and vanilla JavaScript.
No build step, no frameworks, no backend. Ready for free hosting on GitHub Pages.

## Structure

```
.
├── index.html            # Home — hero, live scheduling simulation, selected work, about
├── research.html         # Research areas + complete publications list
├── software.html         # Code and computational tools
├── teaching.html         # Teaching experience and interests
├── about.html            # Biography, education, experience, skills
├── publications.html     # Redirect → research.html (kept so old links work)
├── selected-work.html    # Redirect → software.html (kept so old links work)
├── contact.html          # Redirect → index.html (kept so old links work)
├── css/
│   └── style.css         # All styles (single file, design tokens at the top)
├── js/
│   ├── main.js           # Footer year
│   └── simulation.js     # Live job-shop simulation + GP fitness panel (home page)
└── assets/
    ├── profile.jpg           # Your photograph
    ├── fig-dispatching.svg   # Figure: dynamic job shop Gantt (research page)
    ├── fig-convergence.svg   # Figure: metaheuristic convergence (research page)
    └── fig-taxonomy.svg      # Figure: AI-for-scheduling taxonomy (research page)
```

## Updating content

- **Photo** — replace `assets/profile.jpg` with a new portrait (a 4:5 crop works best)
  and keep the same file name.
- **Publications** — edit `research.html`; each entry is an `<article class="item">`
  block. Duplicate an existing block and change the text.
- **Simulation** — the home-page simulation is purely illustrative; parameters
  (machines, speed, window) are constants at the top of `js/simulation.js`.
- **Colours and fonts** — CSS custom properties at the top of `css/style.css`.

## Deploy on GitHub Pages (free)

1. Open your existing repository (the one serving this site).
2. Upload **all files in this folder** to the repository root, replacing the old
   files (`index.html` must be in the root). Delete any old files that no longer
   exist here — **except** keep nothing else; the redirect pages replace them.
3. The site updates automatically within a few minutes.

No other configuration is needed — there is nothing to install or build.

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```
