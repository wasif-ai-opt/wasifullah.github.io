# Wasif Ullah — Personal Academic Website

A minimalist, dependency-free academic website: plain HTML, CSS and a few lines of
vanilla JavaScript. No build step, no frameworks, no backend. Ready for free hosting
on GitHub Pages.

## Structure

```
.
├── index.html            # Home
├── research.html         # PhD research: motivation, objectives, methodology
├── selected-work.html    # Projects and technical work (template entries)
├── publications.html     # Publications list (with citation template)
├── about.html            # Biography, education, experience
├── teaching.html         # Teaching experience and interests
├── contact.html          # Email, academic profiles, address
├── css/
│   └── style.css         # All styles (single file)
├── js/
│   └── main.js           # Footer year only
└── assets/
    └── profile.svg       # Placeholder portrait — replace with your photo
```

## Before publishing, personalise these placeholders

1. **Photo** — replace `assets/profile.svg` with your photograph (a square or
   portrait crop, e.g. `profile.jpg`) and update the `<img src>` in `index.html`.
2. **Contact page** (`contact.html`) — add your University of Glasgow email
   (then turn it into a `mailto:` link), Google Scholar URL, ORCID iD and LinkedIn URL.
3. **About page** (`about.html`) — fill in the bracketed `[Add ...]` fields for
   years, courses and industrial training details.
4. **Publications** (`publications.html`) — keep entries up to date; a citation
   template is included in an HTML comment.
5. **Selected Work** (`selected-work.html`) — replace the template entries with your
   real projects and add repository links when public.

## Deploy on GitHub Pages (free)

1. Create a GitHub repository named `<your-username>.github.io`
   (or any repository name for a project page).
2. Upload **all files in this folder** to the repository root
   (`index.html` must be in the root).
3. In the repository: **Settings → Pages → Build and deployment**, choose
   **Deploy from a branch**, select `main` and `/ (root)`, then save.
4. Your site will be available at `https://<your-username>.github.io/`
   within a few minutes.

No other configuration is needed — there is nothing to install or build.

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Editing tips

- Navigation is plain HTML repeated in each page header; if you rename a page,
  update it in all files.
- Colours and fonts are defined as CSS variables at the top of `css/style.css`.
- The active page is marked with `aria-current="page"` in the navigation.
