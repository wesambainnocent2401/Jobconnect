# JobConnect

JobConnect is a job-matching website for job seekers and employers. The current project uses HTML, CSS and browser-side JavaScript, with Appwrite for account and database services.

## Project structure

```text
jobconnect/
├── public/                 # Website files served to visitors
│   ├── index.html
│   ├── register.html
│   ├── jobseeker.html
│   ├── employer.html
│   ├── job-details.html
│   ├── my-jobs.html
│   ├── script.js
│   ├── style.css
│   └── logo.svg
├── server.js               # Small Node.js static-file server
├── package.json
└── README.md
```

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm start
```

Open <http://localhost:3000> in your browser. The health-check endpoint is <http://localhost:3000/api/health>.

## Appwrite setup

The frontend currently connects to Appwrite directly. In `public/script.js`, review the Appwrite endpoint, project ID, database ID, and table IDs. Create the corresponding Appwrite project/database/tables and configure their attributes and permissions to match the fields used by the application. Do not put Appwrite API keys or other server secrets in browser JavaScript.

## Important project status

The supplied source files link to `login.html`, `employer-dashboard.html`, and `my-application.html`, but those page files were not included in the uploaded project. Those destinations need to be added before the related navigation and workflows can work. This archive preserves the supplied project files rather than fabricating those missing screens.

The included Node.js server only serves static website files and provides `/api/health`; it is not an API backend for job or account data. Data/authentication are currently handled by the Appwrite browser SDK in `public/script.js`.

## Deploying

For a Node.js host, deploy the repository and use `npm start` as the start command. Ensure the host supplies the `PORT` environment variable. For GitHub Pages, this Node.js server will not run; publish the `public/` directory as a static site instead, and configure the Appwrite project to allow your deployed domain.
