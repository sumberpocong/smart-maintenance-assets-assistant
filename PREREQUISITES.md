# Prerequisites

To develop, run, and deploy the Smart Maintenance Assets Assistant, you need to install the following tools:

## Core Development Tools

### 1. Node.js & npm
Needed to run the application locally, manage dependencies, and build the frontend.
- **Recommended Version**: Node.js 20.x or later.
- **Download**: [nodejs.org](https://nodejs.org/)

### 2. Git
Used for version control and required for some deployment processes.
- **Download**: [git-scm.com](https://git-scm.com/)

## Containerization & Deployment

### 3. Docker
Required to build and test the container image locally as specified in the `Dockerfile`.
- **Download**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Windows/Mac)

### 4. Google Cloud SDK (gcloud CLI)
Necessary to deploy the application to Google Cloud Run and interact with GCP services like Firestore.
- **Download**: [cloud.google.com/sdk/docs/install](https://cloud.google.com/sdk/docs/install)
- **Post-Installation**: Run `gcloud auth login` and `gcloud auth configure-docker`.

## Environment Configuration

### GEMINI_API_KEY
You will need an API key from Google AI Studio to use the AI features (Asset scanning, cost prediction).
- **Get Key**: [aistudio.google.com](https://aistudio.google.com/app/apikey)

### Google Cloud Project
You must have an active Google Cloud project with billing enabled to use Cloud Run and Firestore.
- **Console**: [console.cloud.google.com](https://console.cloud.google.com/)
