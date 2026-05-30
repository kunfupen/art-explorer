# Art Explorer

An Express-powered art discovery app for searching museum collections, viewing artwork details, saving favorites, and exploring museum locations on a map.

Live app: https://art-explorer-721957825009.us-central1.run.app/

## Features

- Search artworks from The Metropolitan Museum of Art and Harvard Art Museums.
- Filter results by source and image availability.
- View artwork details including title, artist, date, medium, dimensions, department, and museum.
- Open artist biography summaries from Wikipedia.
- Browse related works by artist.
- Save and manage favorites in the browser.
- View museum location details with an interactive Leaflet map.
- Includes server-side normalization, retry handling, pagination, and response caching.

## Project Structure

```text
.
├── server.js
├── package.json
├── package-lock.json
├── Dockerfile
├── public/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── api.js
│       ├── app.js
│       ├── favorites.js
│       └── map.js
└── README.md
```

## Tech Stack

- Node.js
- Express
- JavaScript
- HTML/CSS
- Bootstrap
- Leaflet
- Met Museum Collection API
- Harvard Art Museums API
- Wikipedia REST API
- Wikidata API
- Docker

## Environment Variables

Create a `.env` file locally with:

```text
HARVARD_API_KEY=your_harvard_api_key
PORT=8080
```

`HARVARD_API_KEY` enables Harvard Art Museums results. The Met Museum API does not require a key.

## Run Locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:8080
```

## Docker

```bash
docker build -t art-explorer .
docker run --env-file .env -p 8080:8080 art-explorer
```
