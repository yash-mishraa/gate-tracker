# GATE Preparation Tracker

A comprehensive, production-ready GATE exam tracking application designed to help students optimize their preparation. Features include a global calendar, PYQ accuracy tracking, syllabus velocity projection, dynamic revision queues, and advanced productivity insights.

## Features
- **Intelligent Dashboard**: Calculates exam readiness & projects syllabus completion date.
- **Smart Revision Planner**: Global priority queue for 1, 3, 7, 15, and 30-day staggered revisions.
- **PYQ Tracking System**: Isolated tracking for Previous Year Questions accuracy per topic.
- **Dynamic Calendar**: Monthly visual grid plotting study sessions, completed topics, and mock tests.
- **Distraction-Free Focus**: High-contrast, full-screen Pomodoro lock-in mode.
- **Advanced Analytics**: Mathematically isolates your weakest subject and identifies peak productivity hours.

---

## Local Development

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

1. **Clone the repository:**
   ```bash
   git clone <your-github-repo-url>
   cd "gate tracker"
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the local development server:**
   ```bash
   npm run dev
   ```

4. *(Optional)* Set up environment variables by copying `.env.example` to `.env`.

---

## Production Build

To test the optimized production build locally:

1. Compile the project:
   ```bash
   npm run build
   ```
2. Serve the compiled build:
   ```bash
   npm start
   ```

---

## Deployment Instructions

This project is configured out-of-the-box for zero-config deployment to major hosting platforms. **Vercel** is highly recommended for optimal performance with Vite.

### Step 1: Push to GitHub
1. Create a new repository on [GitHub](https://github.com/).
2. Push your code:
   ```bash
   git add .
   git commit -m "Initial commit for production"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

### Step 2: Deploy to Vercel (Recommended)
`vercel.json` is already configured to handle history API fallback routing.
1. Sign in to [Vercel](https://vercel.com/) with your GitHub account.
2. Click **Add New Project**.
3. Import your `gate tracker` GitHub repository.
4. Leave all settings as default (Framework Preset: `Vite`, Build Command: `npm run build`, Output Dir: `dist`).
5. Click **Deploy**.

### Alternative: Deploy to Netlify
`netlify.toml` is already configured for builds and routing.
1. Sign in to [Netlify](https://www.netlify.com/).
2. Click **Add new site** > **Import an existing project**.
3. Connect your GitHub and select the repository.
4. The build settings will automatically populate from `netlify.toml`.
5. Click **Deploy site**.

### Alternative: Render / Railway
When deploying to Render or Railway via GitHub, use the following configuration manually if it doesn't auto-detect:
- **Build Command:** `npm run build`
- **Output / Publish Directory:** `dist`
- *(Note: Ensure you configure a rewrite rule mapping `/*` to `/index.html` in their respective routing dashboards to support SPA navigation).*
